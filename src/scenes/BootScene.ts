import Phaser from 'phaser';
import { characterSheetFiles } from '../character/catalog';
import { loadPaperImages, paperDebug, paperSourceDataUrl } from '../character/paperDoll';
import { createWorldTextures } from '../world/textures';
import { TILESET_FILES, installTilesetTextures } from '../world/tileset';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const width = this.scale.width || 1280;
    const height = this.scale.height || 720;
    const cx = width / 2;
    const cy = height / 2;

    this.add
      .text(cx, cy - 28, 'Entrando no escritório…', {
        fontFamily: 'Avenir Next, Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#e8ecf4',
      })
      .setOrigin(0.5);

    this.add.rectangle(cx, cy, 260, 10, 0x273049).setOrigin(0.5);
    const fill = this.add.rectangle(cx - 130, cy, 0, 10, 0x7c9cff).setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      fill.width = 260 * value;
    });

    for (const file of characterSheetFiles()) {
      this.load.image(file.key, file.url);
    }
    for (const file of TILESET_FILES) {
      this.load.image(file.key, file.url);
    }
  }

  async create(): Promise<void> {
    await loadPaperImages(characterSheetFiles());
    installTilesetTextures(this);
    createWorldTextures(this);
    const debugWindow = window as unknown as {
      __paperDebug?: typeof paperDebug;
      __paperSource?: typeof paperSourceDataUrl;
    };
    debugWindow.__paperDebug = paperDebug;
    debugWindow.__paperSource = paperSourceDataUrl;
    this.scene.start('office');
  }
}
