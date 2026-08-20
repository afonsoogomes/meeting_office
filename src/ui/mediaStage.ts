import type Phaser from 'phaser';
import type { MediaTile } from '../net/voice';
import { worldToCanvas } from '../world/tv';

export type MediaAnchor = {
  x: number;
  y: number;
  name: string;
  visible: boolean;
};

type Wrapper = {
  root: HTMLDivElement;
  video: HTMLVideoElement;
  label: HTMLSpanElement;
};

const CAMERA = { w: 80, h: 80 };
const SCREEN = { w: 256, h: 144 };

export class MediaStage {
  private readonly root: HTMLElement;
  private readonly wrappers = new Map<string, Wrapper>();

  constructor() {
    const root = document.querySelector('#media-stage');
    if (!(root instanceof HTMLElement)) throw new Error('media stage markup missing');
    this.root = root;
  }

  tick(scene: Phaser.Scene, tiles: MediaTile[], anchors: Map<string, MediaAnchor>): void {
    const live = new Set<string>();
    const sharing = new Set<string>();
    for (const tile of tiles) {
      if (tile.kind === 'screen') sharing.add(tile.guestId);
    }

    for (const tile of tiles) {
      const key = `${tile.guestId}|${tile.kind}`;
      live.add(key);
      const anchor = anchors.get(tile.guestId);
      const wrapper = this.ensure(key, tile);
      if (!anchor || !anchor.visible) {
        wrapper.root.style.display = 'none';
        continue;
      }
      const size = tile.kind === 'screen' ? SCREEN : CAMERA;
      const lift = tile.kind === 'screen' ? 118 : sharing.has(tile.guestId) ? 52 : 78;
      const point = worldToCanvas(scene, anchor.x, anchor.y - lift);
      wrapper.root.style.display = 'block';
      wrapper.root.style.width = `${size.w}px`;
      wrapper.root.style.height = `${size.h}px`;
      wrapper.root.style.left = `${Math.round(point.x - size.w / 2)}px`;
      wrapper.root.style.top = `${Math.round(point.y - size.h)}px`;
      wrapper.label.textContent = tile.kind === 'screen' ? `Tela · ${anchor.name}` : '';
      wrapper.label.style.display = tile.kind === 'screen' ? 'block' : 'none';
      wrapper.video.classList.toggle('media-mirror', tile.kind === 'camera' && tile.local);
    }

    for (const key of [...this.wrappers.keys()]) {
      if (live.has(key)) continue;
      this.wrappers.get(key)?.root.remove();
      this.wrappers.delete(key);
    }
  }

  private ensure(key: string, tile: MediaTile): Wrapper {
    const existing = this.wrappers.get(key);
    if (existing) {
      if (existing.video !== tile.element) {
        existing.video.remove();
        existing.root.prepend(tile.element);
        existing.video = tile.element;
      }
      return existing;
    }
    const root = document.createElement('div');
    root.className = `media-tile media-tile-${tile.kind}`;
    root.prepend(tile.element);
    const label = document.createElement('span');
    label.className = 'media-tile-label';
    root.append(label);
    this.root.append(root);
    const wrapper = { root, video: tile.element, label };
    this.wrappers.set(key, wrapper);
    return wrapper;
  }
}
