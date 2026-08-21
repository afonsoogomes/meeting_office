import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { OfficeSpec, OfficeSummary, OfficeTemplate } from '../../../shared/office';
import { sanitizeNpcPlacement, type ChannelMessage, type ChannelSummary, type FurniturePlacement, type NpcPlacement } from '../../../shared/protocol';
import type { SeedFurniture } from '../../../shared/office-default';

export type OfficeRow = {
  id: string;
  slug: string;
  name: string;
  spec: OfficeSpec;
  template: OfficeTemplate;
};

@Injectable()
export class OfficeRepository {
  private readonly db: Database.Database;
  private readonly selectOffice: Database.Statement;
  private readonly selectOffices: Database.Statement;
  private readonly insertOffice: Database.Statement;
  private readonly updateOffice: Database.Statement;
  private readonly countOffices: Database.Statement;
  private readonly listFurniture: Database.Statement;
  private readonly insertFurniture: Database.Statement;
  private readonly getFurniture: Database.Statement;
  private readonly updateFurniture: Database.Statement;
  private readonly deleteFurniture: Database.Statement;
  private readonly deleteAllFurniture: Database.Statement;
  private readonly countFurniture: Database.Statement;
  private readonly maxSort: Database.Statement;

  private readonly listNpcs: Database.Statement;
  private readonly insertNpc: Database.Statement;
  private readonly getNpc: Database.Statement;
  private readonly updateNpc: Database.Statement;
  private readonly deleteNpc: Database.Statement;
  private readonly countNpcs: Database.Statement;
  private readonly maxNpcSort: Database.Statement;
  private readonly listChannels: Database.Statement;
  private readonly insertChannel: Database.Statement;
  private readonly getChannel: Database.Statement;
  private readonly updateChannel: Database.Statement;
  private readonly deleteChannel: Database.Statement;
  private readonly countChannels: Database.Statement;
  private readonly maxChannelSort: Database.Statement;
  private readonly listMessages: Database.Statement;
  private readonly insertMessage: Database.Statement;
  private readonly pruneMessages: Database.Statement;

  constructor() {
    const dbPath = resolveDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS offices (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        spec TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS furniture (
        id TEXT PRIMARY KEY,
        office_id TEXT NOT NULL,
        item TEXT NOT NULL,
        col INTEGER NOT NULL,
        row INTEGER NOT NULL,
        facing TEXT,
        sort INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_furniture_office ON furniture(office_id);
    `);
    this.ensureTemplateColumn();
    this.ensureNpcsTable();
    this.ensureChannelsTable();

    this.selectOffice = this.db.prepare('SELECT id, slug, name, spec, template FROM offices WHERE slug = ?');
    this.selectOffices = this.db.prepare('SELECT slug, name FROM offices ORDER BY name COLLATE NOCASE, slug');
    this.insertOffice = this.db.prepare(
      'INSERT INTO offices (id, slug, name, spec, template) VALUES (?, ?, ?, ?, ?)',
    );
    this.updateOffice = this.db.prepare(
      `UPDATE offices SET slug = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
    );
    this.countOffices = this.db.prepare('SELECT COUNT(*) AS n FROM offices');
    this.listFurniture = this.db.prepare(
      'SELECT id, item, col, row, facing FROM furniture WHERE office_id = ? ORDER BY sort, id',
    );
    this.insertFurniture = this.db.prepare(
      'INSERT INTO furniture (id, office_id, item, col, row, facing, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    this.getFurniture = this.db.prepare(
      'SELECT id, item, col, row, facing FROM furniture WHERE id = ? AND office_id = ?',
    );
    this.updateFurniture = this.db.prepare(
      'UPDATE furniture SET col = ?, row = ?, facing = ? WHERE id = ? AND office_id = ?',
    );
    this.deleteFurniture = this.db.prepare('DELETE FROM furniture WHERE id = ? AND office_id = ?');
    this.deleteAllFurniture = this.db.prepare('DELETE FROM furniture WHERE office_id = ?');
    this.countFurniture = this.db.prepare('SELECT COUNT(*) AS n FROM furniture WHERE office_id = ?');
    this.maxSort = this.db.prepare('SELECT COALESCE(MAX(sort), -1) AS n FROM furniture WHERE office_id = ?');
    this.listNpcs = this.db.prepare(
      'SELECT id, name, line, appearance, col, row, facing FROM npcs WHERE office_id = ? ORDER BY sort, id',
    );
    this.insertNpc = this.db.prepare(
      'INSERT INTO npcs (id, office_id, name, line, appearance, col, row, facing, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    this.getNpc = this.db.prepare(
      'SELECT id, name, line, appearance, col, row, facing FROM npcs WHERE id = ? AND office_id = ?',
    );
    this.updateNpc = this.db.prepare(
      'UPDATE npcs SET name = ?, line = ?, appearance = ?, col = ?, row = ?, facing = ? WHERE id = ? AND office_id = ?',
    );
    this.deleteNpc = this.db.prepare('DELETE FROM npcs WHERE id = ? AND office_id = ?');
    this.countNpcs = this.db.prepare('SELECT COUNT(*) AS n FROM npcs WHERE office_id = ?');
    this.maxNpcSort = this.db.prepare('SELECT COALESCE(MAX(sort), -1) AS n FROM npcs WHERE office_id = ?');
    this.listChannels = this.db.prepare(`
      SELECT
        c.id,
        c.name,
        (
          SELECT m.text FROM channel_messages m
          WHERE m.channel_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_text,
        (
          SELECT m.name FROM channel_messages m
          WHERE m.channel_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_name,
        (
          SELECT m.created_at FROM channel_messages m
          WHERE m.channel_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_at
      FROM channels c
      WHERE c.office_id = ?
      ORDER BY c.sort, c.id
    `);
    this.insertChannel = this.db.prepare(
      'INSERT INTO channels (id, office_id, name, sort, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    this.getChannel = this.db.prepare('SELECT id, name FROM channels WHERE id = ? AND office_id = ?');
    this.updateChannel = this.db.prepare('UPDATE channels SET name = ? WHERE id = ? AND office_id = ?');
    this.deleteChannel = this.db.prepare('DELETE FROM channels WHERE id = ? AND office_id = ?');
    this.countChannels = this.db.prepare('SELECT COUNT(*) AS n FROM channels WHERE office_id = ?');
    this.maxChannelSort = this.db.prepare('SELECT COALESCE(MAX(sort), -1) AS n FROM channels WHERE office_id = ?');
    this.listMessages = this.db.prepare(
      'SELECT id, guest_id, name, text, created_at FROM channel_messages WHERE channel_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    );
    this.insertMessage = this.db.prepare(
      'INSERT INTO channel_messages (id, channel_id, guest_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    this.pruneMessages = this.db.prepare(`
      DELETE FROM channel_messages
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM channel_messages
          WHERE channel_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT -1 OFFSET ?
        )
      )
    `);
  }

  count(): number {
    const row = this.countOffices.get() as { n: number };
    return row.n;
  }

  listSummaries(): OfficeSummary[] {
    return this.selectOffices.all() as OfficeSummary[];
  }

  findBySlug(slug: string): OfficeRow | null {
    const row = this.selectOffice.get(slug) as
      | { id: string; slug: string; name: string; spec: string; template: string }
      | undefined;
    if (!row) return null;
    try {
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        spec: JSON.parse(row.spec) as OfficeSpec,
        template: row.template === 'default' ? 'default' : 'blank',
      };
    } catch {
      return null;
    }
  }

  createOffice(slug: string, name: string, spec: OfficeSpec, template: OfficeTemplate = 'blank'): OfficeRow {
    const id = randomUUID();
    this.insertOffice.run(id, slug, name, JSON.stringify(spec), template);
    return { id, slug, name, spec, template };
  }

  renameOffice(id: string, slug: string, name: string): boolean {
    const result = this.updateOffice.run(slug, name, id);
    return result.changes > 0;
  }

  furnitureOf(officeId: string): FurniturePlacement[] {
    const rows = this.listFurniture.all(officeId) as Array<{
      id: string;
      item: string;
      col: number;
      row: number;
      facing: string | null;
    }>;
    return rows.map((row) => {
      const place: FurniturePlacement = { id: row.id, item: row.item, col: row.col, row: row.row };
      if (row.facing === 'down' || row.facing === 'up' || row.facing === 'left' || row.facing === 'right') {
        place.facing = row.facing;
      }
      return place;
    });
  }

  furnitureCount(officeId: string): number {
    const row = this.countFurniture.get(officeId) as { n: number };
    return row.n;
  }

  getPlace(officeId: string, id: string): FurniturePlacement | null {
    const row = this.getFurniture.get(id, officeId) as
      | { id: string; item: string; col: number; row: number; facing: string | null }
      | undefined;
    if (!row) return null;
    const place: FurniturePlacement = { id: row.id, item: row.item, col: row.col, row: row.row };
    if (row.facing === 'down' || row.facing === 'up' || row.facing === 'left' || row.facing === 'right') {
      place.facing = row.facing;
    }
    return place;
  }

  addPlace(officeId: string, seed: SeedFurniture): FurniturePlacement {
    const id = randomUUID();
    const sortRow = this.maxSort.get(officeId) as { n: number };
    const sort = sortRow.n + 1;
    this.insertFurniture.run(id, officeId, seed.item, seed.col, seed.row, seed.facing ?? null, sort);
    return seed.facing
      ? { id, item: seed.item, col: seed.col, row: seed.row, facing: seed.facing }
      : { id, item: seed.item, col: seed.col, row: seed.row };
  }

  replacePlace(
    officeId: string,
    id: string,
    col: number,
    row: number,
    facing: FurniturePlacement['facing'],
  ): boolean {
    const result = this.updateFurniture.run(col, row, facing ?? null, id, officeId);
    return result.changes > 0;
  }

  removePlace(officeId: string, id: string): boolean {
    const result = this.deleteFurniture.run(id, officeId);
    return result.changes > 0;
  }

  replaceAllFurniture(officeId: string, places: SeedFurniture[]): FurniturePlacement[] {
    const apply = this.db.transaction(() => {
      this.deleteAllFurniture.run(officeId);
      const next: FurniturePlacement[] = [];
      places.forEach((place, sort) => {
        const id = randomUUID();
        this.insertFurniture.run(id, officeId, place.item, place.col, place.row, place.facing ?? null, sort);
        next.push(
          place.facing
            ? { id, item: place.item, col: place.col, row: place.row, facing: place.facing }
            : { id, item: place.item, col: place.col, row: place.row },
        );
      });
      return next;
    });
    return apply();
  }

  npcsOf(officeId: string): NpcPlacement[] {
    const rows = this.listNpcs.all(officeId) as Array<{
      id: string;
      name: string;
      line: string;
      appearance: string;
      col: number;
      row: number;
      facing: string | null;
    }>;
    return rows.flatMap((row) => {
      const npc = this.rowToNpc(row);
      return npc ? [npc] : [];
    });
  }

  npcCount(officeId: string): number {
    const row = this.countNpcs.get(officeId) as { n: number };
    return row.n;
  }

  getNpcPlace(officeId: string, id: string): NpcPlacement | null {
    const row = this.getNpc.get(id, officeId) as
      | {
          id: string;
          name: string;
          line: string;
          appearance: string;
          col: number;
          row: number;
          facing: string | null;
        }
      | undefined;
    return row ? this.rowToNpc(row) : null;
  }

  addNpc(officeId: string, seed: Omit<NpcPlacement, 'id'>): NpcPlacement {
    const id = randomUUID();
    const sortRow = this.maxNpcSort.get(officeId) as { n: number };
    const sort = sortRow.n + 1;
    this.insertNpc.run(
      id,
      officeId,
      seed.name,
      seed.line,
      JSON.stringify(seed.appearance),
      seed.col,
      seed.row,
      seed.facing,
      sort,
    );
    return { id, ...seed };
  }

  replaceNpc(officeId: string, npc: NpcPlacement): boolean {
    const result = this.updateNpc.run(
      npc.name,
      npc.line,
      JSON.stringify(npc.appearance),
      npc.col,
      npc.row,
      npc.facing,
      npc.id,
      officeId,
    );
    return result.changes > 0;
  }

  removeNpc(officeId: string, id: string): boolean {
    const result = this.deleteNpc.run(id, officeId);
    return result.changes > 0;
  }

  channelsOf(officeId: string): ChannelSummary[] {
    const rows = this.listChannels.all(officeId) as Array<{
      id: string;
      name: string;
      last_text: string | null;
      last_name: string | null;
      last_at: number | null;
    }>;
    return rows.map((row) => {
      const channel: ChannelSummary = { id: row.id, name: row.name };
      if (row.last_text) channel.lastText = row.last_text;
      if (row.last_name) channel.lastName = row.last_name;
      if (typeof row.last_at === 'number') channel.lastAt = row.last_at;
      return channel;
    });
  }

  channelCount(officeId: string): number {
    const row = this.countChannels.get(officeId) as { n: number };
    return row.n;
  }

  getChannelPlace(officeId: string, id: string): { id: string; name: string } | null {
    const row = this.getChannel.get(id, officeId) as { id: string; name: string } | undefined;
    return row ?? null;
  }

  addChannel(officeId: string, name: string): ChannelSummary {
    const id = randomUUID();
    const sortRow = this.maxChannelSort.get(officeId) as { n: number };
    this.insertChannel.run(id, officeId, name, sortRow.n + 1, Date.now());
    return { id, name };
  }

  renameChannel(officeId: string, id: string, name: string): boolean {
    const result = this.updateChannel.run(name, id, officeId);
    return result.changes > 0;
  }

  removeChannel(officeId: string, id: string): boolean {
    const result = this.deleteChannel.run(id, officeId);
    return result.changes > 0;
  }

  messagesOf(channelId: string, limit: number): ChannelMessage[] {
    const rows = this.listMessages.all(channelId, limit) as Array<{
      id: string;
      guest_id: string;
      name: string;
      text: string;
      created_at: number;
    }>;
    return rows
      .map((row) => ({
        id: row.id,
        guestId: row.guest_id,
        name: row.name,
        text: row.text,
        at: row.created_at,
      }))
      .reverse();
  }

  addMessage(
    channelId: string,
    guestId: string,
    name: string,
    text: string,
    storeMax: number,
  ): ChannelMessage {
    const id = randomUUID();
    const at = Date.now();
    this.insertMessage.run(id, channelId, guestId, name, text, at);
    this.pruneMessages.run(channelId, storeMax);
    return { id, guestId, name, text, at };
  }

  private rowToNpc(row: {
    id: string;
    name: string;
    line: string;
    appearance: string;
    col: number;
    row: number;
    facing: string | null;
  }): NpcPlacement | null {
    let appearance: NpcPlacement['appearance'];
    try {
      appearance = JSON.parse(row.appearance) as NpcPlacement['appearance'];
    } catch {
      return null;
    }
    return sanitizeNpcPlacement({
      id: row.id,
      name: row.name,
      line: row.line,
      appearance,
      col: row.col,
      row: row.row,
      facing: row.facing,
    });
  }

  private ensureNpcsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS npcs (
        id TEXT PRIMARY KEY,
        office_id TEXT NOT NULL,
        name TEXT NOT NULL,
        line TEXT NOT NULL DEFAULT '',
        appearance TEXT NOT NULL,
        col INTEGER NOT NULL,
        row INTEGER NOT NULL,
        facing TEXT NOT NULL DEFAULT 'down',
        sort INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_npcs_office ON npcs(office_id);
    `);
  }

  private ensureChannelsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        office_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS channel_messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        guest_id TEXT NOT NULL,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_channels_office ON channels(office_id);
      CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id, created_at);
    `);
  }

  private ensureTemplateColumn(): void {
    const columns = this.db.pragma('table_info(offices)') as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'template')) {
      this.db.exec(`ALTER TABLE offices ADD COLUMN template TEXT NOT NULL DEFAULT 'blank'`);
    }
    this.db.exec(`UPDATE offices SET template = 'default' WHERE slug = 'default' AND template = 'blank'`);
  }
}

function resolveDbPath(): string {
  const fromEnv = process.env.OFFICE_DB_PATH;
  if (fromEnv && fromEnv.length > 0) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(process.cwd(), 'data', 'office.db');
}
