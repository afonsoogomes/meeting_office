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
  stopWatch: HTMLButtonElement | null;
};

const CAMERA = { w: 80, h: 80 };
const SCREEN = { w: 256, h: 144 };

type MediaStageHandlers = {
  onExpand?: () => void;
  onStopWatch?: (guestId: string) => void;
};

export class MediaStage {
  private readonly root: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayCopy: HTMLElement;
  private readonly wrappers = new Map<string, Wrapper>();
  private expanded: string | null = null;
  private pendingExpand: string | null = null;

  constructor(private readonly handlers: MediaStageHandlers = {}) {
    const root = document.querySelector('#media-stage');
    const overlay = document.querySelector('#screen-overlay');
    const stage = document.querySelector('#screen-stage-video');
    const overlayTitle = document.querySelector('#screen-overlay-title');
    const overlayCopy = document.querySelector('#screen-overlay-copy');
    if (
      !(root instanceof HTMLElement) ||
      !(overlay instanceof HTMLElement) ||
      !(stage instanceof HTMLElement) ||
      !(overlayTitle instanceof HTMLElement) ||
      !(overlayCopy instanceof HTMLElement)
    ) {
      throw new Error('media stage markup missing');
    }
    this.root = root;
    this.overlay = overlay;
    this.stage = stage;
    this.overlayTitle = overlayTitle;
    this.overlayCopy = overlayCopy;
    document.querySelector('#screen-overlay-leave')?.addEventListener('click', () => this.collapse());
  }

  isExpanded(): boolean {
    return this.expanded !== null;
  }

  isScreenExpanded(): boolean {
    return isScreenKey(this.expanded);
  }

  collapse(): boolean {
    if (!this.expanded) return false;
    this.setExpanded(null);
    return true;
  }

  expandScreenOf(guestId: string): void {
    this.pendingExpand = `${guestId}|screen`;
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
      if (expanded && tile.kind === 'screen') {
        wrapper.root.style.display = 'none';
        this.mountOverlay(tile, anchor?.name ?? '');
        continue;
      }

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
        wrapper.label.textContent = name;
        wrapper.label.style.display = name ? 'block' : 'none';
        wrapper.video.classList.toggle('media-mirror', tile.kind === 'camera' && tile.local);
        continue;
      }

      this.parkVideo(wrapper, tile);
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
      if (this.expanded === key) this.setExpanded(null);
      this.wrappers.get(key)?.root.remove();
      this.wrappers.delete(key);
    }

    if (this.pendingExpand && live.has(this.pendingExpand)) {
      this.setExpanded(this.pendingExpand);
      this.pendingExpand = null;
    }
  }

  private setExpanded(key: string | null): void {
    if (this.expanded === key) return;
    if (isScreenKey(this.expanded)) this.releaseOverlay();
    this.expanded = key;
    const screen = isScreenKey(key);
    this.root.classList.toggle('has-expanded', key !== null && !screen);
    this.overlay.classList.toggle('hidden', !screen);
    document.body.classList.toggle('screen-open', screen);
    if (key) this.handlers.onExpand?.();
  }

  private toggleExpanded(key: string): void {
    this.setExpanded(this.expanded === key ? null : key);
  }

  private mountOverlay(tile: MediaTile, name: string): void {
    if (!this.stage.contains(tile.element)) {
      this.stage.replaceChildren(tile.element);
    }
    this.overlayTitle.textContent = 'Tela';
    this.overlayCopy.textContent = tile.local ? 'A sua tela' : name || 'Alguém';
  }

  private releaseOverlay(): void {
    const video = this.stage.querySelector('video');
    const wrapper = this.expanded ? this.wrappers.get(this.expanded) : null;
    if (video instanceof HTMLVideoElement && wrapper) {
      wrapper.root.prepend(video);
      wrapper.video = video;
    }
    this.stage.replaceChildren();
  }

  private parkVideo(wrapper: Wrapper, tile: MediaTile): void {
    if (wrapper.video === tile.element && wrapper.root.contains(tile.element)) return;
    if (this.stage.contains(tile.element)) return;
    tile.element.remove();
    wrapper.root.prepend(tile.element);
    wrapper.video = tile.element;
  }

  private ensure(key: string, tile: MediaTile): Wrapper {
    const existing = this.wrappers.get(key);
    if (existing) {
      if (existing.video !== tile.element && !this.stage.contains(tile.element)) {
        existing.video.remove();
        existing.root.prepend(tile.element);
        existing.video = tile.element;
      }
      return existing;
    }

    const root = document.createElement('div');
    root.className = `media-tile media-tile-${tile.kind}`;
    if (!this.stage.contains(tile.element)) root.prepend(tile.element);

    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'media-expand';
    expand.innerHTML = EXPAND_ICON;
    expand.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleExpanded(key);
    });

    let stopWatch: HTMLButtonElement | null = null;
    if (tile.kind === 'screen' && !tile.local) {
      stopWatch = document.createElement('button');
      stopWatch.type = 'button';
      stopWatch.className = 'media-stop-watch';
      stopWatch.textContent = 'Parar';
      stopWatch.title = 'Parar de assistir';
      stopWatch.addEventListener('click', (event) => {
        event.stopPropagation();
        if (this.expanded === key) this.setExpanded(null);
        this.handlers.onStopWatch?.(tile.guestId);
      });
      root.append(stopWatch);
    }

    const label = document.createElement('span');
    label.className = 'media-tile-label';
    root.append(expand, label);
    this.root.append(root);

    const wrapper: Wrapper = { root, video: tile.element, label, expand, stopWatch };
    this.wrappers.set(key, wrapper);
    return wrapper;
  }
}

function isScreenKey(key: string | null): boolean {
  return typeof key === 'string' && key.endsWith('|screen');
}
