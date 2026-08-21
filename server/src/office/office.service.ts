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
import { DEFAULT_OFFICE_SLUG, MAX_FURNITURE, MAX_NPCS, MAX_CHANNELS, CHANNEL_HISTORY, CHANNEL_STORE_MAX, type ChannelMessage, type ChannelSummary, type FurniturePlacement, type NpcPlacement } from '../../../shared/protocol';
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
      npcs: this.offices.npcsOf(office.id),
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
    return { slug: office.slug, name: office.name, spec: office.spec, furniture: [], npcs: [] };
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

  listNpcs(slug: string): NpcPlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    return this.offices.npcsOf(office.id);
  }

  addNpc(slug: string, draft: Omit<NpcPlacement, 'id'>): NpcPlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!inBounds(office.spec, draft.col, draft.row)) return null;
    if (this.offices.npcCount(office.id) >= MAX_NPCS) return null;
    this.offices.addNpc(office.id, draft);
    return this.offices.npcsOf(office.id);
  }

  updateNpc(slug: string, npc: NpcPlacement): NpcPlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!this.offices.getNpcPlace(office.id, npc.id)) return null;
    if (!inBounds(office.spec, npc.col, npc.row)) return null;
    if (!this.offices.replaceNpc(office.id, npc)) return null;
    return this.offices.npcsOf(office.id);
  }

  removeNpc(slug: string, id: string): NpcPlacement[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!this.offices.removeNpc(office.id, id)) return null;
    return this.offices.npcsOf(office.id);
  }

  listChannels(slug: string): ChannelSummary[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    return this.offices.channelsOf(office.id);
  }

  addChannel(slug: string, name: string): ChannelSummary[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (this.offices.channelCount(office.id) >= MAX_CHANNELS) return null;
    this.offices.addChannel(office.id, name);
    return this.offices.channelsOf(office.id);
  }

  renameChannel(slug: string, id: string, name: string): ChannelSummary[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!this.offices.renameChannel(office.id, id, name)) return null;
    return this.offices.channelsOf(office.id);
  }

  removeChannel(slug: string, id: string): ChannelSummary[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!this.offices.removeChannel(office.id, id)) return null;
    return this.offices.channelsOf(office.id);
  }

  listChannelMessages(slug: string, channelId: string): ChannelMessage[] | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!this.offices.getChannelPlace(office.id, channelId)) return null;
    return this.offices.messagesOf(channelId, CHANNEL_HISTORY);
  }

  addChannelMessage(
    slug: string,
    channelId: string,
    guestId: string,
    name: string,
    text: string,
  ): { channels: ChannelSummary[]; message: ChannelMessage } | null {
    const office = this.requireOffice(slug);
    if (!office) return null;
    if (!this.offices.getChannelPlace(office.id, channelId)) return null;
    const message = this.offices.addMessage(channelId, guestId, name, text, CHANNEL_STORE_MAX);
    return { channels: this.offices.channelsOf(office.id), message };
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
