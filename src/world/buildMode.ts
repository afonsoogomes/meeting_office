import type Phaser from 'phaser';
import { TILE_SIZE } from './constants';
import {
  footprintCells,
  furnitureOrigin,
  nextFacing,
  spriteAnchor,
  spriteFor,
  type FurnitureFacing,
  type FurniturePlace,
} from './furniture';

/** Semi-transparent preview that follows the pointer while placing furniture. */
export class BuildGhost {
  item = 'chair';
  facing: FurnitureFacing = 'down';

  private readonly image: Phaser.GameObjects.Image;
  private readonly marks: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.marks = scene.add.graphics().setDepth(19990).setVisible(false);
    this.image = scene.add
      .image(0, 0, 'chair')
      .setOrigin(0.5, 1)
      .setDepth(20000)
      .setAlpha(0.88)
      .setVisible(false);
  }

  setItem(id: string): void {
    if (this.item !== id) this.facing = 'down';
    this.item = id;
  }

  rotate(step = 1): void {
    this.facing = nextFacing(this.facing, step);
  }

  draft(col: number, row: number): FurniturePlace {
    return { item: this.item, col, row, facing: this.facing };
  }

  show(draft: FurniturePlace, valid: boolean): void {
    const { x, y } = furnitureOrigin(draft);
    const { key, flipX } = spriteFor(draft);
    const origin = spriteAnchor(draft, key);
    this.image.setTexture(key).setFlipX(flipX).setOrigin(origin.x, origin.y).setPosition(x, y).setVisible(true);
    this.image.setTint(valid ? 0xffffff : 0xff6b5a);

    this.marks.clear();
    this.marks.fillStyle(valid ? 0x3dcc7a : 0xe05a4d, 0.28);
    this.marks.lineStyle(1, valid ? 0x8ef0b0 : 0xff9a8c, 0.9);
    for (const cell of footprintCells(draft)) {
      const left = cell.col * TILE_SIZE + 1;
      const top = cell.row * TILE_SIZE + 1;
      this.marks.fillRect(left, top, TILE_SIZE - 2, TILE_SIZE - 2);
      this.marks.strokeRect(left, top, TILE_SIZE - 2, TILE_SIZE - 2);
    }
    this.marks.setVisible(true);
  }

  hide(): void {
    this.image.setVisible(false);
    this.marks.clear();
    this.marks.setVisible(false);
  }

  destroy(): void {
    this.image.destroy();
    this.marks.destroy();
  }
}
