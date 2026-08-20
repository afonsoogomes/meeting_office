import { GENERATED_CATALOG } from '../../../src/world/furnitureData';

const EXTRA_IDS = new Set([
  'plant',
  'plant-fern',
  'counter',
  'stove',
  'sink',
  'fridge',
  'tv',
  'arcade',
  'arcade-junimo',
]);

const CATALOG_IDS = new Set([...EXTRA_IDS, ...GENERATED_CATALOG.map((item) => item.id)]);

export function isCatalogItem(item: string): boolean {
  return CATALOG_IDS.has(item);
}
