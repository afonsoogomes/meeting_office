import type Phaser from 'phaser';
import { mountYouTubePlayer, type TvAudioState, type YouTubeHandle } from '../media/youtubePlayer';
import { tvId, tvScreenWorld, worldToCanvas, type TvSpot } from '../world/tv';
import type { FurniturePlace } from '../world/furniture';
import { EXPAND_ICON } from './expandIcon';

const PLAYER_W = 320;
const PLAYER_H = 180;

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
  mount: number;
  playerWidth: number;
  playerHeight: number;
};

export class TvScreens {
  private readonly root: HTMLElement;
  private playing = new Map<string, Playing>();
  private audio: TvAudioState = { muted: true, volume: 80 };
  private expanded: string | null = null;

  constructor(private readonly handlers: TvScreensHandlers = {}) {
    const root = document.querySelector('#tv-screens');
    if (!(root instanceof HTMLElement)) throw new Error('TV screens markup missing');
    this.root = root;
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
    existing?.clip.remove();

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

    clip.append(frame, expand, label);
    this.root.append(clip);

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
    current.clip.remove();
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
    for (const current of this.playing.values()) current.clip.style.display = 'none';
  }

  tick(scene: Phaser.Scene): void {
    for (const current of this.playing.values()) {
      const expanded = this.expanded === current.tvId;
      current.clip.classList.toggle('tv-screen-expanded', expanded);
      this.syncExpandButton(current);
      current.label.style.display = expanded ? 'block' : 'none';

      if (expanded) {
        current.clip.style.display = 'block';
        current.clip.style.left = '';
        current.clip.style.top = '';
        current.clip.style.width = '';
        current.clip.style.height = '';
        current.frame.style.transform = '';
        this.fitPlayer(current, current.clip.clientWidth, current.clip.clientHeight);
        continue;
      }

      const screen = tvScreenWorld(current.place);
      if (!screen) {
        current.clip.style.display = 'none';
        continue;
      }
      const topLeft = worldToCanvas(scene, screen.x, screen.y);
      const bottomRight = worldToCanvas(scene, screen.x + screen.w, screen.y + screen.h);
      const width = Math.max(8, bottomRight.x - topLeft.x);
      const height = Math.max(6, bottomRight.y - topLeft.y);
      current.clip.style.display = 'block';
      current.clip.style.left = `${topLeft.x}px`;
      current.clip.style.top = `${topLeft.y}px`;
      current.clip.style.width = `${width}px`;
      current.clip.style.height = `${height}px`;
      current.frame.style.transform = `scale(${width / PLAYER_W}, ${height / PLAYER_H})`;
      this.fitPlayer(current, PLAYER_W, PLAYER_H);
    }
  }

  private toggleExpanded(id: string): void {
    this.setExpanded(this.expanded === id ? null : id);
  }

  private setExpanded(id: string | null): void {
    this.expanded = id;
    this.root.classList.toggle('has-expanded', id !== null);
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
