import type Phaser from 'phaser';
import { youtubeEmbedUrl } from '../media/youtube';
import { tvId, tvScreenWorld, worldToCanvas, type TvSpot } from '../world/tv';
import type { FurniturePlace } from '../world/furniture';

const PLAYER_W = 320;
const PLAYER_H = 180;

type Playing = {
  tvId: string;
  videoId: string;
  place: FurniturePlace;
  clip: HTMLDivElement;
  frame: HTMLIFrameElement;
  muted: boolean;
};

export class TvScreens {
  private readonly root: HTMLElement;
  private playing = new Map<string, Playing>();

  constructor() {
    const root = document.querySelector('#tv-screens');
    if (!(root instanceof HTMLElement)) throw new Error('TV screens markup missing');
    this.root = root;
  }

  has(id: string): boolean {
    return this.playing.has(id);
  }

  stopAll(): void {
    for (const id of [...this.playing.keys()]) this.stop(id);
  }

  play(spot: TvSpot, videoId: string, muted: boolean): void {
    const id = tvId(spot.place);
    const existing = this.playing.get(id);
    if (existing?.videoId === videoId && existing.muted === muted) return;
    existing?.clip.remove();

    const clip = document.createElement('div');
    clip.className = 'tv-screen';

    const frame = document.createElement('iframe');
    frame.className = 'tv-screen-player';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = youtubeEmbedUrl(videoId, muted);
    frame.title = 'TV';
    clip.append(frame);
    this.root.append(clip);
    this.playing.set(id, { tvId: id, videoId, place: spot.place, clip, frame, muted });
  }

  stop(id: string): void {
    const current = this.playing.get(id);
    if (!current) return;
    current.clip.remove();
    this.playing.delete(id);
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
    }
  }
}
