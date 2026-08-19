import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { OfficeSpec } from '../../../shared/office';
import type { FurniturePlacement } from '../../../shared/protocol';
import type { SeedFurniture } from '../../../shared/office-default';

export type OfficeRow = {
  id: string;
  slug: string;
  name: string;
  spec: OfficeSpec;
};

@Injectable()
export class OfficeRepository {
  private readonly db: Database.Database;
  private readonly selectOffice: Database.Statement;
  private readonly insertOffice: Database.Statement;
  private readonly listFurniture: Database.Statement;
  private readonly insertFurniture: Database.Statement;
  private readonly getFurniture: Database.Statement;
  private readonly updateFurniture: Database.Statement;
  private readonly deleteFurniture: Database.Statement;
  private readonly deleteAllFurniture: Database.Statement;
  private readonly countFurniture: Database.Statement;
  private readonly maxSort: Database.Statement;

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

    this.selectOffice = this.db.prepare('SELECT id, slug, name, spec FROM offices WHERE slug = ?');
    this.insertOffice = this.db.prepare('INSERT INTO offices (id, slug, name, spec) VALUES (?, ?, ?, ?)');
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
  }

  findBySlug(slug: string): OfficeRow | null {
    const row = this.selectOffice.get(slug) as
      | { id: string; slug: string; name: string; spec: string }
      | undefined;
    if (!row) return null;
    try {
      return { id: row.id, slug: row.slug, name: row.name, spec: JSON.parse(row.spec) as OfficeSpec };
    } catch {
      return null;
    }
  }

  createOffice(slug: string, name: string, spec: OfficeSpec): OfficeRow {
    const id = randomUUID();
    this.insertOffice.run(id, slug, name, JSON.stringify(spec));
    return { id, slug, name, spec };
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
}

function resolveDbPath(): string {
  const fromEnv = process.env.OFFICE_DB_PATH;
  if (fromEnv && fromEnv.length > 0) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(process.cwd(), 'data', 'office.db');
}
