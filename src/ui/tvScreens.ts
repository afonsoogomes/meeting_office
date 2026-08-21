import type Phaser from 'phaser';
import { mountYouTubePlayer, type TvAudioState, type YouTubeHandle } from '../media/youtubePlayer';
import { furnitureOrigin, type FurniturePlace } from '../world/furniture';
import { tvId, tvScreenWorld, worldToCanvas, type TvSpot } from '../world/tv';
import { EXPAND_ICON } from './expandIcon';

const PLAYER_W = 320;
const PLAYER_H = 180;
/** Crop YouTube title/logo by scaling the iframe past the glass. */
const OVERSCAN = 1.18;

type TvScreensHandlers = {
  onExpand?: () => void;
};

type Playing = {
  tvId: string;
  videoId: string;
  place: FurniturePlace;
  clip: HTMLDivElement;
  frame: HTMLElement;
  expand: HTMLButtonElement;
  label: HTMLSpanElement;
  handle: YouTubeHandle | null;
  hole: Phaser.GameObjects.Graphics | null;
  mount: number;
  playerWidth: number;
  playerHeight: number;
};

export class TvScreens {
  private readonly root: HTMLElement;
  private readonly chrome: HTMLElement;
  private playing = new Map<string, Playing>();
  private audio: TvAudioState = { muted: true, volume: 80 };
  private expanded: string | null = null;

  constructor(private readonly handlers: TvScreensHandlers = {}) {
    const root = document.querySelector('#tv-screens');
    if (!(root instanceof HTMLElement)) throw new Error('TV screens markup missing');
    this.root = root;

    let chrome: HTMLElement;
    const existing = document.querySelector('#tv-chrome');
    if (existing instanceof HTMLElement) {
      chrome = existing;
    } else {
      chrome = document.createElement('div');
      chrome.id = 'tv-chrome';
      chrome.setAttribute('aria-hidden', 'true');
      root.after(chrome);
    }
    this.chrome = chrome;
  }

  has(id: string): boolean {
    return this.playing.has(id);
  }

  size(): number {
    return this.playing.size;
  }

  isExpanded(): boolean {
    return this.expanded !== null;
  }

  collapse(): boolean {
    if (!this.expanded) return false;
    this.setExpanded(null);
    return true;
  }

  setAudio(audio: TvAudioState): void {
    this.audio = { ...audio };
    for (const current of this.playing.values()) current.handle?.applyAudio(this.audio);
  }

  stopAll(): void {
    for (const id of [...this.playing.keys()]) this.stop(id);
  }

  play(spot: TvSpot, videoId: string): void {
    const id = tvId(spot.place);
    const existing = this.playing.get(id);
    if (existing?.videoId === videoId) {
      existing.place = spot.place;
      existing.handle?.applyAudio(this.audio);
      return;
    }
    existing?.handle?.destroy();
    existing?.hole?.destroy();
    existing?.clip.remove();
    existing?.expand.remove();

    const clip = document.createElement('div');
    clip.className = 'tv-screen';
    const frame = document.createElement('div');
    frame.className = 'tv-screen-player';
    const mount = document.createElement('div');
    frame.append(mount);

    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'media-expand';
    expand.innerHTML = EXPAND_ICON;
    expand.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleExpanded(id);
    });

    const label = document.createElement('span');
    label.className = 'media-tile-label';
    label.textContent = 'TV';
    label.style.display = 'none';

    clip.append(frame, label);
    this.root.append(clip);
    this.chrome.append(expand);

    const token = (existing?.mount ?? 0) + 1;
    const current: Playing = {
      tvId: id,
      videoId,
      place: spot.place,
      clip,
      frame,
      expand,
      label,
      handle: null,
      hole: null,
      mount: token,
      playerWidth: PLAYER_W,
      playerHeight: PLAYER_H,
    };
    this.playing.set(id, current);
    this.syncExpandButton(current);

    void mountYouTubePlayer(mount, videoId, this.audio)
      .then((handle) => {
        const live = this.playing.get(id);
        if (!live || live.videoId !== videoId || live.mount !== token) {
          handle.destroy();
          return;
        }
        live.handle = handle;
        handle.applyAudio(this.audio);
        this.fitPlayer(live, live.playerWidth, live.playerHeight);
      })
      .catch(() => undefined);
  }

  stop(id: string): void {
    const current = this.playing.get(id);
    if (!current) return;
    current.mount += 1;
    current.handle?.destroy();
    current.hole?.destroy();
    current.clip.remove();
    current.expand.remove();
    this.playing.delete(id);
    if (this.expanded === id) this.setExpanded(null);
  }

  prune(places: FurniturePlace[]): void {
    const live = new Set(places.map((place) => tvId(place)));
    for (const id of [...this.playing.keys()]) {
      if (!live.has(id)) this.stop(id);
    }
    for (const current of this.playing.values()) {
      const place = places.find((entry) => tvId(entry) === current.tvId);
      if (place) current.place = place;
    }
  }

  hide(): void {
    for (const current of this.playing.values()) {
      current.clip.style.display = 'none';
      current.expand.style.display = 'none';
      current.hole?.clear();
    }
  }

  tick(scene: Phaser.Scene): void {
    const punch = canPunchCanvas(scene);
    this.root.classList.toggle('behind-canvas', punch);
    this.chrome.classList.toggle('has-expanded', this.expanded !== null);

    for (const current of this.playing.values()) {
      const expanded = this.expanded === current.tvId;
      current.clip.classList.toggle('tv-screen-expanded', expanded);
      this.syncExpandButton(current);
      current.label.style.display = expanded ? 'block' : 'none';

      if (expanded) {
        if (current.clip.parentElement !== this.chrome) this.chrome.append(current.clip);
        if (current.expand.parentElement !== current.clip) current.clip.append(current.expand);
        current.expand.style.left = '';
        current.expand.style.top = '';
        current.expand.style.right = '';
        current.clip.style.display = 'block';
        current.expand.style.display = '';
        current.clip.style.left = '';
        current.clip.style.top = '';
        current.clip.style.width = '';
        current.clip.style.height = '';
        current.frame.style.transform = '';
        current.hole?.clear();
        this.fitPlayer(current, current.clip.clientWidth, current.clip.clientHeight);
        continue;
      }

      if (current.clip.parentElement !== this.root) this.root.append(current.clip);
      if (current.expand.parentElement !== this.chrome) this.chrome.append(current.expand);

      const screen = tvScreenWorld(current.place);
      if (!screen) {
        current.clip.style.display = 'none';
        current.expand.style.display = 'none';
        current.hole?.clear();
        continue;
      }
      const topLeft = worldToCanvas(scene, screen.x, screen.y);
      const bottomRight = worldToCanvas(scene, screen.x + screen.w, screen.y + screen.h);
      const width = Math.max(8, bottomRight.x - topLeft.x);
      const height = Math.max(6, bottomRight.y - topLeft.y);
      current.clip.style.display = 'block';
      current.expand.style.display = '';
      current.clip.style.left = `${topLeft.x}px`;
      current.clip.style.top = `${topLeft.y}px`;
      current.clip.style.width = `${width}px`;
      current.clip.style.height = `${height}px`;
      current.expand.style.right = 'auto';
      current.expand.style.left = `${topLeft.x + width - 34}px`;
      current.expand.style.top = `${topLeft.y + 6}px`;
      const scaleX = (width / PLAYER_W) * OVERSCAN;
      const scaleY = (height / PLAYER_H) * OVERSCAN;
      const ox = (width - PLAYER_W * scaleX) / 2;
      const oy = (height - PLAYER_H * scaleY) / 2;
      current.frame.style.transform = `translate(${ox}px, ${oy}px) scale(${scaleX}, ${scaleY})`;
      this.fitPlayer(current, PLAYER_W, PLAYER_H);
      this.syncHole(scene, current, screen, punch);
    }
  }

  private syncHole(
    scene: Phaser.Scene,
    current: Playing,
    screen: { x: number; y: number; w: number; h: number },
    punch: boolean,
  ): void {
    if (!punch) {
      current.hole?.clear();
      return;
    }
    if (!current.hole || !current.hole.active) {
      current.hole = scene.add.graphics().setBlendMode('ERASE');
    }
    current.hole.setDepth(furnitureOrigin(current.place).y + 0.25);
    current.hole.clear();
    current.hole.fillStyle(0x000000, 1);
    current.hole.fillRect(screen.x, screen.y, screen.w, screen.h);
  }

  private toggleExpanded(id: string): void {
    this.setExpanded(this.expanded === id ? null : id);
  }

  private setExpanded(id: string | null): void {
    this.expanded = id;
    this.root.classList.toggle('has-expanded', id !== null);
    this.chrome.classList.toggle('has-expanded', id !== null);
    if (id) this.handlers.onExpand?.();
  }

  private syncExpandButton(current: Playing): void {
    const expanded = this.expanded === current.tvId;
    current.expand.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    current.expand.setAttribute('aria-label', expanded ? 'Recolher' : 'Expandir');
    current.expand.title = expanded ? 'Recolher' : 'Expandir';
  }

  private fitPlayer(current: Playing, width: number, height: number): void {
    const nextW = Math.max(1, Math.round(width));
    const nextH = Math.max(1, Math.round(height));
    if (nextW < 8 || nextH < 8) return;
    if (current.playerWidth === nextW && current.playerHeight === nextH) return;
    current.playerWidth = nextW;
    current.playerHeight = nextH;
    current.handle?.setSize(nextW, nextH);
  }
}

function canPunchCanvas(scene: Phaser.Scene): boolean {
  const renderer = scene.game.renderer as { gameContext?: CanvasRenderingContext2D };
  return typeof renderer.gameContext?.fillRect === 'function';
}
