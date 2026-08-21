import type { NpcPlacement } from '../../shared/protocol';
import { tileToWorld } from './layout';

export function npcWorld(npc: Pick<NpcPlacement, 'col' | 'row'>): { x: number; y: number } {
  return tileToWorld(npc.col, npc.row);
}

export function npcSpeechMs(line: string): number {
  if (line.length === 0) return 0;
  return Math.min(6000, Math.max(2200, 900 + line.length * 70));
}
