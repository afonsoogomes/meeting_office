import type { Appearance } from '../character/appearance';
import { tileToWorld } from './layout';

export type Colleague = {
  name: string;
  line: string;
  col: number;
  row: number;
  appearance: Appearance;
};

export const COLLEAGUES: Colleague[] = [
  {
    name: 'Ana',
    line: 'Stand-up em 5 min?',
    col: 10,
    row: 8,
    appearance: { skin: 1, hair: 6, hairColor: 1, shirt: 3, pants: 4, hat: 0, accessory: 2 },
  },
  {
    name: 'Bruno',
    line: 'Bora um café?',
    col: 11,
    row: 25,
    appearance: { skin: 0, hair: 1, hairColor: 0, shirt: 5, pants: 2, hat: 0, accessory: 0 },
  },
  {
    name: 'Carla',
    line: 'Fecha a porta, por favor.',
    col: 33,
    row: 11,
    appearance: { skin: 1, hair: 12, hairColor: 3, shirt: 8, pants: 1, hat: 4, accessory: 0 },
  },
];

export function colleagueWorld(npc: Colleague): { x: number; y: number } {
  return tileToWorld(npc.col, npc.row);
}
