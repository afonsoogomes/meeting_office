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
    name: 'Rafa',
    line: 'O stand-up já começou?',
    col: 10,
    row: 8,
    appearance: { skin: 2, skinColor: 5, hair: 4, hairColor: 0, shirt: 14, shirtColor: 0, pants: 7, pantsColor: 0, hat: 0, accessory: 3 },
  },
  {
    name: 'Nina',
    line: 'Tem bolo no lounge.',
    col: 11,
    row: 25,
    appearance: { skin: 1, skinColor: 2, hair: 18, hairColor: 6, shirt: 27, shirtColor: 5, pants: 11, pantsColor: 0, hat: 8, accessory: 0 },
  },
  {
    name: 'Caio',
    line: 'Essa sala é reservada.',
    col: 33,
    row: 11,
    appearance: { skin: 0, skinColor: 6, hair: 9, hairColor: 2, shirt: 41, shirtColor: 1, pants: 16, pantsColor: 9, hat: 0, accessory: 5 },
  },
];

export function colleagueWorld(npc: Colleague): { x: number; y: number } {
  return tileToWorld(npc.col, npc.row);
}
