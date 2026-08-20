import type Phaser from 'phaser';
import type { MediaTile } from '../net/voice';
import { worldToCanvas } from '../world/tv';
import { EXPAND_ICON } from './expandIcon';

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
  expand: HTMLButtonElement;
};

const CAMERA = { w: 80, h: 80 };
const SCREEN = { w: 256, h: 144 };

type MediaStageHandlers = {
  onExpand?: () => void;
};

export class MediaStage {
  private readonly root: HTMLElement;
  private readonly wrappers = new Map<string, Wrapper>();
  private expanded: string | null = null;

  constructor(private readonly handlers: MediaStageHandlers = {}) {
    const root = document.querySelector('#media-stage');
    if (!(root instanceof HTMLElement)) throw new Error('media stage markup missing');
    this.root = root;
  }

  isExpanded(): boolean {
    return this.expanded !== null;
  }

  collapse(): boolean {
    if (!this.expanded) return false;
    this.setExpanded(null);
    return true;
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
      const expanded = this.expanded === key;
      const visible = Boolean(anchor && (anchor.visible || expanded));
      if (!visible) {
        wrapper.root.style.display = 'none';
        continue;
      }

      const name = anchor?.name ?? '';
      wrapper.root.style.display = 'block';
      wrapper.root.classList.toggle('media-tile-expanded', expanded);
      wrapper.expand.setAttribute('aria-pressed', expanded ? 'true' : 'false');
      wrapper.expand.setAttribute('aria-label', expanded ? 'Recolher' : 'Expandir');
      wrapper.expand.title = expanded ? 'Recolher' : 'Expandir';

      if (expanded) {
        wrapper.root.style.left = '';
        wrapper.root.style.top = '';
        wrapper.root.style.width = '';
        wrapper.root.style.height = '';
        wrapper.label.textContent = tile.kind === 'screen' ? `Tela · ${name}` : name;
        wrapper.label.style.display = name ? 'block' : 'none';
        wrapper.video.classList.toggle('media-mirror', tile.kind === 'camera' && tile.local);
        continue;
      }

      const size = tile.kind === 'screen' ? SCREEN : CAMERA;
      const lift = tile.kind === 'screen' ? 118 : sharing.has(tile.guestId) ? 52 : 78;
      const point = worldToCanvas(scene, anchor!.x, anchor!.y - lift);
      wrapper.root.style.width = `${size.w}px`;
      wrapper.root.style.height = `${size.h}px`;
      wrapper.root.style.left = `${Math.round(point.x - size.w / 2)}px`;
      wrapper.root.style.top = `${Math.round(point.y - size.h)}px`;
      wrapper.label.textContent = tile.kind === 'screen' ? `Tela · ${name}` : '';
      wrapper.label.style.display = tile.kind === 'screen' ? 'block' : 'none';
      wrapper.video.classList.toggle('media-mirror', tile.kind === 'camera' && tile.local);
    }

    for (const key of [...this.wrappers.keys()]) {
      if (live.has(key)) continue;
      this.wrappers.get(key)?.root.remove();
      this.wrappers.delete(key);
      if (this.expanded === key) this.setExpanded(null);
    }
  }

  private setExpanded(key: string | null): void {
    this.expanded = key;
    this.root.classList.toggle('has-expanded', key !== null);
    if (key) this.handlers.onExpand?.();
  }

  private toggleExpanded(key: string): void {
    this.setExpanded(this.expanded === key ? null : key);
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

    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'media-expand';
    expand.innerHTML = EXPAND_ICON;
    expand.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleExpanded(key);
    });

    const label = document.createElement('span');
    label.className = 'media-tile-label';
    root.append(expand, label);
    this.root.append(root);

    const wrapper: Wrapper = { root, video: tile.element, label, expand };
    this.wrappers.set(key, wrapper);
    return wrapper;
  }
}
