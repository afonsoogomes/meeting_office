import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  parseOfficeName,
  parseOfficeSlug,
  parseOfficeSpec,
  specFromHouse,
  type OfficeSnapshot,
  type OfficeSpec,
  type OfficeSummary,
} from '../../../shared/office';
import { DEFAULT_OFFICE_FURNITURE, DEFAULT_OFFICE_NAME, DEFAULT_OFFICE_SPEC } from '../../../shared/office-default';
import { DEFAULT_OFFICE_SLUG, MAX_FURNITURE, type FurniturePlacement } from '../../../shared/protocol';
import { isCatalogItem } from './catalog';
import { OfficeRepository, type OfficeRow } from './office.repository';

@Injectable()
export class OfficeService implements OnModuleInit {
  constructor(@Inject(OfficeRepository) private readonly offices: OfficeRepository) {}

  onModuleInit(): void {
    this.ensureDefault();
    if (process.env.OFFICE_RESEED === '1') this.resetFurniture(DEFAULT_OFFICE_SLUG);
  }

  list(): OfficeSummary[] {
    return this.offices.listSummaries();
  }

  snapshot(slug: string): OfficeSnapshot | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    return {
      slug: office.slug,
      name: office.name,
      spec: office.spec,
      furniture: this.offices.furnitureOf(office.id).filter((place) => isCatalogItem(place.item)),
    };
  }

  create(input: { name: unknown; slug: unknown }): OfficeSnapshot {
    const name = parseOfficeName(input.name);
    const slug = parseOfficeSlug(input.slug);
    if (!name || !slug) {
      throw new BadRequestException({ error: 'INVALID_OFFICE', message: 'Nome ou slug inválido.' });
    }
    if (this.offices.findBySlug(slug)) {
      throw new ConflictException({ error: 'SLUG_TAKEN', message: 'Esse slug já está em uso.' });
    }
    const spec = parseOfficeSpec(specFromHouse(DEFAULT_OFFICE_SPEC));
    if (!spec) throw new Error('invalid default office seed');
    const office = this.offices.createOffice(slug, name, spec, 'blank');
    return { slug: office.slug, name: office.name, spec: office.spec, furniture: [] };
  }

  rename(currentSlug: string, input: { name?: unknown; slug?: unknown }): OfficeSnapshot {
    const office = this.requireOffice(currentSlug);
    if (!office) throw new NotFoundException();
    const name = input.name === undefined ? office.name : parseOfficeName(input.name);
    const slug = input.slug === undefined ? office.slug : parseOfficeSlug(input.slug);
    if (!name || !slug) {
      throw new BadRequestException({ error: 'INVALID_OFFICE', message: 'Nome ou slug inválido.' });
    }
    if (slug !== office.slug && this.offices.findBySlug(slug)) {
      throw new ConflictException({ error: 'SLUG_TAKEN', message: 'Esse slug já está em uso.' });
    }
    this.offices.renameOffice(office.id, slug, name);
    const next = this.snapshot(slug);
    if (!next) throw new NotFoundException();
    return next;
  }

  listFurniture(slug: string): FurniturePlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    return this.offices.furnitureOf(office.id).filter((place) => isCatalogItem(place.item));
  }

  addFurniture(
    slug: string,
    draft: { item: string; col: number; row: number; facing?: FurniturePlacement['facing'] },
  ): FurniturePlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!isCatalogItem(draft.item)) return null;
    if (!inBounds(office.spec, draft.col, draft.row)) return null;
    if (this.offices.furnitureCount(office.id) >= MAX_FURNITURE) return null;
    this.offices.addPlace(office.id, draft);
    return this.offices.furnitureOf(office.id);
  }

  updateFurniture(
    slug: string,
    id: string,
    patch: { col: number; row: number; facing?: FurniturePlacement['facing'] },
  ): FurniturePlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    const current = this.offices.getPlace(office.id, id);
    if (!current) return null;
    if (!inBounds(office.spec, patch.col, patch.row)) return null;
    if (!this.offices.replacePlace(office.id, id, patch.col, patch.row, patch.facing)) return null;
    return this.offices.furnitureOf(office.id);
  }

  removeFurniture(slug: string, id: string): FurniturePlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!this.offices.removePlace(office.id, id)) return null;
    return this.offices.furnitureOf(office.id);
  }

  resetFurniture(slug: string): FurniturePlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    const seed = office.template === 'default' ? DEFAULT_OFFICE_FURNITURE : [];
    return this.offices.replaceAllFurniture(office.id, seed);
  }

  exists(slug: string): boolean {
    return this.requireOffice(slug) !== null;
  }

  private ensureDefault(): void {
    if (this.offices.count() > 0) return;
    const spec = parseOfficeSpec(specFromHouse(DEFAULT_OFFICE_SPEC));
    if (!spec) throw new Error('invalid default office seed');
    const office = this.offices.createOffice(DEFAULT_OFFICE_SLUG, DEFAULT_OFFICE_NAME, spec, 'default');
    this.offices.replaceAllFurniture(office.id, DEFAULT_OFFICE_FURNITURE);
  }

  private requireOffice(slug: string): OfficeRow | null {
    const clean = parseOfficeSlug(slug);
    if (!clean) return null;
    const office = this.offices.findBySlug(clean);
    if (!office) return null;
    const spec = parseOfficeSpec(office.spec);
    if (!spec) return null;
    return { ...office, spec };
  }
}

function inBounds(spec: OfficeSpec, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < spec.mapCols && row < spec.mapRows;
}
