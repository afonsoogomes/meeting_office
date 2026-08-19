import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_OFFICE_SLUG,
  parseOfficeSlug,
  parseOfficeSpec,
  specFromHouse,
  type OfficeSnapshot,
  type OfficeSpec,
} from '../../../shared/office';
import { DEFAULT_OFFICE_FURNITURE, DEFAULT_OFFICE_NAME, DEFAULT_OFFICE_SPEC } from '../../../shared/office-default';
import { MAX_FURNITURE, type FurniturePlacement } from '../../../shared/protocol';
import { isCatalogItem } from './catalog';
import { OfficeRepository, type OfficeRow } from './office.repository';

@Injectable()
export class OfficeService implements OnModuleInit {
  constructor(@Inject(OfficeRepository) private readonly offices: OfficeRepository) {}

  onModuleInit(): void {
    this.ensureDefault();
    if (process.env.OFFICE_RESEED === '1') this.resetFurniture(DEFAULT_OFFICE_SLUG);
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
    return this.offices.replaceAllFurniture(office.id, DEFAULT_OFFICE_FURNITURE);
  }

  private ensureDefault(): void {
    if (this.offices.findBySlug(DEFAULT_OFFICE_SLUG)) return;
    const spec = parseOfficeSpec(specFromHouse(DEFAULT_OFFICE_SPEC));
    if (!spec) throw new Error('invalid default office seed');
    const office = this.offices.createOffice(DEFAULT_OFFICE_SLUG, DEFAULT_OFFICE_NAME, spec);
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
