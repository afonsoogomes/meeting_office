import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Load repo `.env` so Nest sees the same Docker host ports as compose. */
export function loadRootEnv(): void {
  const candidates = [join(process.cwd(), '.env'), join(process.cwd(), '..', '.env')];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    return;
  }
}

export function envPort(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}
