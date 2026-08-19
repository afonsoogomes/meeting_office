import Phaser from 'phaser';
import { Character } from '../character/Character';
import { loadAvatar, loadPresenceId } from '../character/appearance';
import { PresenceClient, type PresenceStatus } from '../net/presence';
import { VoiceClient } from '../net/voice';
import type { FurniturePlacement, Peer, Pose, TvScreen } from '../../shared/protocol';
import { BuilderPanel } from '../ui/builder';
import { RoomChat } from '../ui/chat';
import { Hud } from '../ui/hud';
import { TvPanel } from '../ui/tvPanel';
import { TvScreens } from '../ui/tvScreens';
import { VoiceHud } from '../ui/voiceHud';
import { BuildGhost } from '../world/buildMode';
import { COLLEAGUES, colleagueWorld } from '../world/colleagues';
import {
  canPlace,
  CATALOG,
  drawFurniture,
  furnitureAt,
  nextFacing,
  type FurniturePlace,
} from '../world/furniture';
import { drawHouse } from '../world/house';
import {
  isNearSeat,
  listSeats,
  nearestSeat,
  seatAt,
  sitAnchor,
  type Seat,
} from '../world/interact';
import {
  MAP_COLS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  SPAWN,
  TILE_SIZE,
  blockWalkable,
  createFloorGrid,
  createGroundGrid,
  defaultFurniture,
  getBuiltHouse,
  initialFurniture,
  isWalkable,
  roomAt,
  saveOfficeFurniture,
  tileToWorld,
  worldToTile,
  type TileId,
} from '../world/layout';
import { findPath, type TilePos } from '../world/path';
import { distanceToPlace, isNearTv, listTvs, nearestTv, tvAt, type TvSpot } from '../world/tv';
import type { VoicePlace } from '../audio/spatial';

type KeyMap = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  E: Phaser.Input.Keyboard.Key;
  G: Phaser.Input.Keyboard.Key;
  C: Phaser.Input.Keyboard.Key;
  F: Phaser.Input.Keyboard.Key;
  R: Phaser.Input.Keyboard.Key;
  X: Phaser.Input.Keyboard.Key;
};

const ARRIVE = 4;
const POSE_MS = 80;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4.5;
const ZOOM_DEFAULT = 1.5;
const ZOOM_DESIGN_WIDTH = 1280;
const ZOOM_DESIGN_HEIGHT = 720;
const ZOOM_SENSITIVITY = 0.0014;
const ZOOM_FOLLOW = 14;

function snapZoom(zoom: number): number {
  return Math.round(zoom * TILE_SIZE) / TILE_SIZE;
}

function viewZoom(width: number, height: number): number {
  const scale = Math.min(width / ZOOM_DESIGN_WIDTH, height / ZOOM_DESIGN_HEIGHT);
  return Phaser.Math.Clamp(ZOOM_DEFAULT * scale, ZOOM_MIN, ZOOM_MAX);
}

function nextZoom(current: number, deltaY: number): number {
  return Phaser.Math.Clamp(current * Math.exp(-deltaY * ZOOM_SENSITIVITY), ZOOM_MIN, ZOOM_MAX);
}

function allowTypingInFields(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): () => void {
  const manager = keyboard.manager;
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      manager.preventDefault = false;
    }
  };
  const onFocusOut = () => {
    manager.preventDefault = true;
  };
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    manager.preventDefault = true;
  };
}

export class OfficeScene extends Phaser.Scene {
  private player!: Character;
  private colleagues: Character[] = [];
  private remotes = new Map<string, Character>();
  private presence!: PresenceClient;
  private voice!: VoiceClient;
  private voiceHud!: VoiceHud;
  private presenceStatus: PresenceStatus = 'offline';
  private localGuestId = '';
  private lastPoseAt = 0;
  private lastPoseJson = '';
  private hud!: Hud;
  private chat!: RoomChat;
  private builder!: BuilderPanel;
  private tvPanel!: TvPanel;
  private tvScreens!: TvScreens;
  private ghost!: BuildGhost;
  private keys!: KeyMap;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastRoom = '';
  private walkable: boolean[][] = [];
  private floor: boolean[][] = [];
  private furniture: FurniturePlace[] = [];
  private furnitureImages: Phaser.GameObjects.Image[] = [];
  private hover!: Phaser.GameObjects.Image;
  private path: TilePos[] = [];
  private lastGood = { x: 0, y: 0 };
  private seats: Seat[] = [];
  private tvs: TvSpot[] = [];
  private netTvs = new Map<string, string>();
  private seated: Seat | null = null;
  private pendingSeat: Seat | null = null;
  private pendingTv: TvSpot | null = null;
  private usePrompt!: Phaser.GameObjects.Text;
  private zoomTarget = ZOOM_DEFAULT;

  constructor() {
    super('office');
  }

  create(): void {
    const avatar = loadAvatar();
    this.localGuestId = loadPresenceId();
    this.hud = new Hud(avatar, {
      onAppearance: (appearance) => {
        this.player.setAppearance(appearance);
        this.presence.sendMeta(this.player.displayName, appearance);
      },
      onName: (name) => {
        this.player.setName(name);
        this.presence.sendMeta(this.player.displayName, this.player.appearance);
      },
    });
    this.voiceHud = new VoiceHud({
      onMic: () => {
        void this.voice.unlock();
        void this.voice.toggleMute();
      },
      onDeaf: () => this.voice.toggleDeaf(),
    });
    this.voice = new VoiceClient(() => this.refreshVoiceHud());
    this.voice.prepare(this.localGuestId, avatar.name);
    this.chat = new RoomChat((text) => this.sendChat(text));
    this.builder = new BuilderPanel({
      onSelect: (id) => this.ghost.setItem(id),
      onReset: () => this.resetFurniture(),
      onClose: () => this.setBuildMode(false),
    });
    this.tvScreens = new TvScreens();
    this.tvPanel = new TvPanel({
      onPlay: (tv, videoId) => this.playTv(tv, videoId),
      onStop: (tv) => this.stopTv(tv),
    });

    const grid = createGroundGrid();
    this.floor = createFloorGrid();
    this.furniture = initialFurniture();
    this.walkable = this.makeWalkable(grid);
    drawHouse(this, getBuiltHouse());

    this.hover = this.add.image(0, 0, 'tile-hover').setOrigin(0.5, 0.5).setDepth(2).setVisible(false);
    this.redrawFurniture(false);
    this.ghost = new BuildGhost(this);
    this.builder.fillIcons(this);
    this.usePrompt = this.add
      .text(0, 0, '', {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '11px',
        color: '#f7f3ea',
        stroke: '#1a1410',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(10000)
      .setVisible(false);

    const spawn = SPAWN;
    this.player = new Character(this, spawn.x, spawn.y, {
      appearance: avatar.appearance,
      name: avatar.name,
      proof: true,
    });
    this.lastGood = { x: spawn.x, y: spawn.y };

    for (const npc of COLLEAGUES) {
      const point = colleagueWorld(npc);
      const character = new Character(this, point.x, point.y, {
        appearance: npc.appearance,
        name: npc.name,
      });
      this.colleagues.push(character);
    }

    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.player.root.body.setCollideWorldBounds(true);
    this.player.root.body.checkCollision.none = true;
    for (const npc of this.colleagues) {
      npc.root.body.setImmovable(true);
      npc.root.body.checkCollision.none = true;
    }

    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.startFollow(this.player.root, false, 0.14, 0.14);
    this.fitCamera(this.scale.width, this.scale.height);
    this.zoomTarget = viewZoom(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(this.zoomTarget);
    this.cameras.main.roundPixels = true;
    this.cameras.main.fadeIn(350, 5, 3, 4);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard plugin missing');
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys('W,A,S,D,E,G,C,F,R,X') as KeyMap;
    this.input.mouse?.disableContextMenu();
    const unbindFields = allowTypingInFields(keyboard);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      void this.voice.unlock();
      if (this.hud.isTyping()) return;
      if (this.builder.isOpen()) {
        if (pointer.rightButtonDown()) this.rotateAtPointer();
        else if (pointer.leftButtonDown()) this.placeAtPointer();
        return;
      }
      if (!pointer.leftButtonDown()) return;
      this.clickTile(pointer);
    });

    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _over: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        if (this.builder.isOpen()) {
          this.ghost.rotate(deltaY > 0 ? 1 : -1);
          return;
        }
        this.zoomTarget = nextZoom(this.zoomTarget, deltaY);
      },
    );

    keyboard.on('keydown-ESC', () => {
      if (this.tvPanel.isOpen()) {
        this.tvPanel.setOpen(false);
        return;
      }
      if (this.hud.isTyping()) return;
      if (this.builder.isOpen()) this.setBuildMode(false);
      else this.hud.setCustomizerOpen(false);
    });

    keyboard.on('keydown-M', () => {
      if (this.hud.isTyping()) return;
      void this.voice.unlock();
      void this.voice.toggleMute();
    });
    keyboard.on('keydown-K', () => {
      if (this.hud.isTyping()) return;
      this.voice.toggleDeaf();
    });
    keyboard.on('keydown-BACKSPACE', (event: KeyboardEvent) => {
      if (!this.builder.isOpen() || this.hud.isTyping()) return;
      event.preventDefault();
      this.deleteAtPointer();
    });

    this.presence = new PresenceClient({
      onWelcome: (peers, tvs, furniture) => {
        this.clearRemotes();
        for (const peer of peers) this.upsertRemote(peer);
        this.replaceTvs(tvs);
        this.replaceSharedFurniture(furniture);
        this.refreshPresenceHud();
      },
      onJoin: (peer) => {
        this.upsertRemote(peer);
        this.refreshPresenceHud();
      },
      onLeave: (guestId) => {
        this.removeRemote(guestId);
        this.refreshPresenceHud();
      },
      onState: (guestId, pose) => this.applyRemoteState(guestId, pose),
      onMeta: (guestId, name, appearance) => {
        const remote = this.remotes.get(guestId);
        if (!remote) return;
        remote.setName(name);
        remote.setAppearance(appearance);
      },
      onChat: (guestId, name, text) => this.hearChat(guestId, name, text),
      onTv: (tvId, platform, videoId) => this.applyNetworkTv(tvId, platform, videoId, true),
      onFurniture: (places) => this.replaceSharedFurniture(places),
      onStatus: (status) => {
        this.presenceStatus = status;
        if (status === 'offline') this.clearRemotes();
        this.refreshPresenceHud();
      },
    });
    this.presence.connect({
      type: 'join',
      guestId: this.localGuestId,
      name: avatar.name,
      appearance: avatar.appearance,
      pose: this.player.snapshot(),
    });
    this.scale.on('resize', this.onGameResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onGameResize, this);
      unbindFields();
      this.presence.disconnect();
      this.voice.disconnect();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.presence.disconnect();
      this.voice.disconnect();
    });
  }

  update(time: number, delta: number): void {
    this.tickZoom(delta);
    this.updateHover();
    this.updateUsePrompt();
    if (this.builder.isOpen()) this.tvScreens.hide();
    else this.tvScreens.tick(this);

    const held = this.readMove();
    const running = this.isRunning();
    if (held) {
      this.path = [];
      this.pendingSeat = null;
      this.pendingTv = null;
      if (this.seated) this.standUp();
      this.player.move(held.x, held.y, time, running);
    } else if (this.seated) {
      this.player.move(0, 0, time);
    } else {
      this.followPath(time, running);
    }
    if (!this.seated) this.constrainPlayer();

    if (!this.hud.isTyping()) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.E) && !this.builder.isOpen()) this.tryUse();
      if (Phaser.Input.Keyboard.JustDown(this.keys.G)) {
        this.player.wave();
        this.flushPose(true);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.C)) {
        this.tvPanel.setOpen(false);
        this.setBuildMode(false);
        this.hud.toggleCustomizer();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.F)) {
        this.setBuildMode(!this.builder.isOpen());
      }
      if (this.builder.isOpen()) {
        if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.ghost.rotate();
        if (Phaser.Input.Keyboard.JustDown(this.keys.X)) this.deleteAtPointer();
      }
    }

    this.player.syncPosition();
    this.flushPose();
    this.tickVoice();
    for (const remote of this.remotes.values()) {
      remote.tickRemote(time, delta);
      remote.syncPosition();
    }

    for (let i = 0; i < this.colleagues.length; i += 1) {
      const npc = this.colleagues[i];
      const near = this.player.distanceTo(npc) < 48;
      if (near) {
        npc.faceToward(this.player);
        if (!npc.speech.visible) npc.say(COLLEAGUES[i].line);
      } else {
        npc.idle();
      }
      npc.syncPosition();
    }

    const room = roomAt(this.player.root.x, this.player.root.y);
    if (room.name !== this.lastRoom) {
      this.lastRoom = room.name;
      this.hud.setRoom(room.name);
    }
  }

  private onGameResize(
    gameSize: Phaser.Structs.Size,
    _baseSize: Phaser.Structs.Size,
    _displaySize: Phaser.Structs.Size,
    previousWidth: number,
    previousHeight: number,
  ): void {
    this.fitCamera(gameSize.width, gameSize.height);
    const previous = viewZoom(previousWidth, previousHeight);
    const next = viewZoom(gameSize.width, gameSize.height);
    if (previous > 0.001) this.zoomTarget *= next / previous;
    this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget, ZOOM_MIN, ZOOM_MAX);
  }

  private fitCamera(width: number, height: number): void {
    const cam = this.cameras.main;
    cam.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
  }

  private tickZoom(delta: number): void {
    const cam = this.cameras.main;
    const target = snapZoom(this.zoomTarget);
    const diff = target - cam.zoom;
    if (Math.abs(diff) < 0.0008) {
      if (cam.zoom !== target) cam.setZoom(target);
      return;
    }
    const t = 1 - Math.exp(-ZOOM_FOLLOW * (delta / 1000));
    cam.setZoom(cam.zoom + diff * t);
  }

  private setBuildMode(open: boolean): void {
    if (open === this.builder.isOpen()) {
      if (!open) this.ghost.hide();
      return;
    }
    this.builder.setOpen(open);
    if (open) {
      this.tvPanel.setOpen(false);
      this.hud.setCustomizerOpen(false);
      this.path = [];
      this.pendingSeat = null;
      this.pendingTv = null;
      this.hover.setVisible(false);
      this.ghost.setItem(this.builder.selectedId());
    } else {
      this.ghost.hide();
    }
  }

  private occupants(): Array<{ col: number; row: number }> {
    const people = [this.player, ...this.colleagues, ...this.remotes.values()];
    return people.map((who) => worldToTile(who.root.x, who.root.y));
  }

  private pointerDraft(): FurniturePlace {
    const tile = this.pointerTile(this.input.activePointer);
    return this.ghost.draft(tile.col, tile.row);
  }

  private validDraft(draft: FurniturePlace, skip?: FurniturePlace): boolean {
    return canPlace(this.floor, this.furniture, draft, { skip, occupied: this.occupants() });
  }

  private placeAtPointer(): void {
    const draft = this.pointerDraft();
    if (!this.validDraft(draft)) return;
    this.furniture.push(draft);
    this.redrawFurniture(!this.furnitureOnline());
    if (this.furnitureOnline()) {
      this.presence.sendFurnitureAdd(draft.item, draft.col, draft.row, draft.facing);
    }
  }

  private rotateAtPointer(): void {
    const tile = this.pointerTile(this.input.activePointer);
    const existing = furnitureAt(this.furniture, tile.col, tile.row);
    if (existing) {
      const previous = existing.facing;
      existing.facing = nextFacing(existing.facing);
      if (!this.validDraft(existing, existing)) {
        existing.facing = previous;
        return;
      }
      this.redrawFurniture(!this.furnitureOnline());
      if (this.furnitureOnline() && existing.id) {
        this.presence.sendFurnitureUpdate(existing.id, existing.col, existing.row, existing.facing);
      }
      return;
    }
    this.ghost.rotate();
  }

  private deleteAtPointer(): void {
    const tile = this.pointerTile(this.input.activePointer);
    const existing = furnitureAt(this.furniture, tile.col, tile.row);
    if (!existing) return;
    this.furniture = this.furniture.filter((place) => place !== existing);
    this.redrawFurniture(!this.furnitureOnline());
    if (this.furnitureOnline() && existing.id) {
      this.presence.sendFurnitureRemove(existing.id);
    }
  }

  private resetFurniture(): void {
    if (this.furnitureOnline()) {
      this.presence.sendFurnitureReset();
      return;
    }
    this.furniture = defaultFurniture();
    this.redrawFurniture();
  }

  private replaceSharedFurniture(places: FurniturePlacement[]): void {
    this.furniture = places
      .filter((place) => CATALOG[place.item])
      .map((place) => ({
        id: place.id,
        item: place.item,
        col: place.col,
        row: place.row,
        facing: place.facing,
      }));
    this.redrawFurniture(false);
  }

  private furnitureOnline(): boolean {
    return this.presenceStatus === 'online';
  }

  private redrawFurniture(persist = true): void {
    for (const image of this.furnitureImages) image.destroy();
    this.furnitureImages = drawFurniture(this, this.furniture);
    this.walkable = this.makeWalkable(createGroundGrid());
    this.seats = listSeats(this.furniture, this.walkable);
    this.tvs = listTvs(this.furniture, this.walkable);
    this.tvScreens.prune(this.furniture);
    for (const [id, videoId] of this.netTvs) {
      if (!this.tvScreens.has(id)) this.showTv(id, videoId, true);
    }
    if (this.seated && !this.seatStillExists()) this.standUp();
    if (persist) saveOfficeFurniture(this.furniture);
  }

  private seatStillExists(): boolean {
    if (!this.seated) return false;
    const place = this.seated.place;
    return this.furniture.some(
      (entry) =>
        entry === place ||
        (entry.item === place.item && entry.col === place.col && entry.row === place.row),
    );
  }

  private isRunning(): boolean {
    return !this.hud.isTyping() && this.cursors.shift.isDown;
  }

  private readMove(): { x: number; y: number } | null {
    if (this.hud.isTyping()) return null;
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;
    if (x === 0 && y === 0) return null;
    if (x !== 0 && y !== 0) x = 0;
    return { x, y };
  }

  private constrainPlayer(): void {
    const x = this.player.root.x;
    const y = this.player.root.y;
    if (this.isOpen(worldToTile(x, y))) {
      this.lastGood = { x, y };
      return;
    }

    if (this.isOpen(worldToTile(x, this.lastGood.y))) {
      this.player.root.setPosition(x, this.lastGood.y);
      this.lastGood = { x, y: this.lastGood.y };
      return;
    }

    if (this.isOpen(worldToTile(this.lastGood.x, y))) {
      this.player.root.setPosition(this.lastGood.x, y);
      this.lastGood = { x: this.lastGood.x, y };
      return;
    }

    this.player.root.setPosition(this.lastGood.x, this.lastGood.y);
    this.player.root.setVelocity(0, 0);
  }

  private makeWalkable(grid: TileId[][]): boolean[][] {
    const walkable = grid.map((row) => row.map((tile) => isWalkable(tile)));
    blockWalkable(walkable, this.furniture);
    return walkable;
  }

  private pointerTile(pointer: Phaser.Input.Pointer): TilePos {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return worldToTile(world.x, world.y);
  }

  private isOpen(tile: TilePos): boolean {
    return (
      tile.row >= 0 &&
      tile.col >= 0 &&
      tile.row < MAP_ROWS &&
      tile.col < MAP_COLS &&
      this.walkable[tile.row][tile.col]
    );
  }

  private updateHover(): void {
    if (this.builder.isOpen()) {
      this.hover.setVisible(false);
      const draft = this.pointerDraft();
      this.ghost.show(draft, this.validDraft(draft));
      this.game.canvas.style.cursor = 'pointer';
      return;
    }

    const tile = this.pointerTile(this.input.activePointer);
    const seat = seatAt(this.seats, tile.col, tile.row);
    const tv = tvAt(this.tvs, tile.col, tile.row);
    if (seat || tv || this.isOpen(tile)) {
      const { x, y } = tileToWorld(tile.col, tile.row);
      this.hover.setPosition(x, y).setVisible(true);
      this.game.canvas.style.cursor = 'pointer';
      return;
    }

    this.hover.setVisible(false);
    this.game.canvas.style.cursor = 'default';
  }

  private updateUsePrompt(): void {
    if (this.builder.isOpen() || this.tvPanel.isOpen()) {
      this.usePrompt.setVisible(false);
      return;
    }
    if (this.seated) {
      this.showPrompt('E  Levantar');
      return;
    }
    const nearby = this.nearestUse();
    if (nearby?.kind === 'seat') {
      const verb = nearby.seat.use === 'sleep' ? 'Deitar' : 'Sentar';
      this.showPrompt(`E  ${verb} · ${nearby.seat.label}`);
      return;
    }
    if (nearby?.kind === 'tv') {
      this.showPrompt(`E  Assistir · ${nearby.tv.label}`);
      return;
    }
    this.usePrompt.setVisible(false);
  }

  private showPrompt(text: string): void {
    this.usePrompt
      .setText(text)
      .setPosition(this.player.root.x, this.player.root.y - 72)
      .setVisible(true);
  }

  private nearestUse(): { kind: 'seat'; seat: Seat } | { kind: 'tv'; tv: TvSpot } | null {
    const tile = worldToTile(this.player.root.x, this.player.root.y);
    const seat = nearestSeat(this.seats, tile);
    const tv = nearestTv(this.tvs, tile);
    if (!seat) return tv ? { kind: 'tv', tv } : null;
    if (!tv) return { kind: 'seat', seat };
    return distanceToPlace(tile, tv.place) < distanceToPlace(tile, seat.place)
      ? { kind: 'tv', tv }
      : { kind: 'seat', seat };
  }

  private tryUse(): void {
    if (this.seated) {
      this.standUp();
      return;
    }
    if (this.tvPanel.isOpen()) {
      this.tvPanel.setOpen(false);
      return;
    }
    const nearby = this.nearestUse();
    if (nearby?.kind === 'seat') this.useSeat(nearby.seat);
    else if (nearby?.kind === 'tv') this.useTv(nearby.tv);
  }

  private useSeat(seat: Seat): void {
    if (this.seated?.id === seat.id) return;
    if (this.seated) this.standUp();
    this.pendingTv = null;
    this.tvPanel.setOpen(false);

    const start = worldToTile(this.player.root.x, this.player.root.y);
    if (isNearSeat(start, seat)) {
      this.sitOn(seat);
      return;
    }

    const path = findPath(start, seat.approach, this.walkable);
    if (!path || path.length === 0) return;

    const next = path[0].col === start.col && path[0].row === start.row ? path.slice(1) : path;
    this.pendingSeat = seat;
    this.path = next;
    if (this.path.length === 0) this.sitOn(seat);
  }

  private useTv(tv: TvSpot): void {
    this.pendingSeat = null;
    const start = worldToTile(this.player.root.x, this.player.root.y);
    if (isNearTv(start, tv)) {
      this.openTv(tv);
      return;
    }

    const path = findPath(start, tv.approach, this.walkable);
    if (!path || path.length === 0) return;

    const next = path[0].col === start.col && path[0].row === start.row ? path.slice(1) : path;
    this.pendingTv = tv;
    this.path = next;
    if (this.path.length === 0) this.openTv(tv);
  }

  private openTv(tv: TvSpot): void {
    this.pendingTv = null;
    this.path = [];
    this.setBuildMode(false);
    this.hud.setCustomizerOpen(false);
    this.tvPanel.open(tv);
  }

  private playTv(tv: TvSpot, videoId: string): void {
    this.netTvs.set(tv.id, videoId);
    this.tvScreens.play(tv, videoId, false);
    this.presence.sendTv(tv.id, 'youtube', videoId);
  }

  private stopTv(tv: TvSpot): void {
    this.netTvs.delete(tv.id);
    this.tvScreens.stop(tv.id);
    this.presence.sendTv(tv.id, null, null);
  }

  private replaceTvs(tvs: TvScreen[]): void {
    this.netTvs.clear();
    this.tvScreens.stopAll();
    for (const screen of tvs) this.applyNetworkTv(screen.tvId, screen.platform, screen.videoId, true);
  }

  private applyNetworkTv(
    tvId: string,
    platform: TvScreen['platform'] | null,
    videoId: string | null,
    muted: boolean,
  ): void {
    if (!platform || !videoId) {
      this.netTvs.delete(tvId);
      this.tvScreens.stop(tvId);
      return;
    }
    this.netTvs.set(tvId, videoId);
    this.showTv(tvId, videoId, muted);
  }

  private showTv(tvId: string, videoId: string, muted: boolean): void {
    const spot = this.tvs.find((tv) => tv.id === tvId);
    if (!spot) return;
    this.tvScreens.play(spot, videoId, muted);
  }

  private sitOn(seat: Seat): void {
    const anchor = sitAnchor(seat);
    this.pendingSeat = null;
    this.pendingTv = null;
    this.path = [];
    this.seated = seat;
    if (seat.use === 'sleep') {
      this.player.sleep('right', anchor.x, anchor.y, anchor.depthBias);
    } else {
      this.player.sit(seat.facing, anchor.x, anchor.y, anchor.depthBias);
    }
    this.flushPose(true);
  }

  private standUp(): void {
    const seat = this.seated;
    this.seated = null;
    this.pendingSeat = null;
    this.pendingTv = null;
    this.player.stand();
    if (!seat) return;
    const spot = this.isOpen(seat.approach)
      ? seat.approach
      : worldToTile(this.lastGood.x, this.lastGood.y);
    const { x, y } = tileToWorld(spot.col, spot.row);
    this.player.root.setPosition(x, y);
    this.lastGood = { x, y };
    this.flushPose(true);
  }

  private clickTile(pointer: Phaser.Input.Pointer): void {
    const goal = this.pointerTile(pointer);
    const clickedSeat = seatAt(this.seats, goal.col, goal.row);
    const clickedTv = tvAt(this.tvs, goal.col, goal.row);
    if (this.seated && clickedSeat?.id === this.seated.id) return;
    if (this.seated) this.standUp();
    if (clickedTv) {
      this.useTv(clickedTv);
      return;
    }
    if (clickedSeat) {
      this.useSeat(clickedSeat);
      return;
    }

    const start = worldToTile(this.player.root.x, this.player.root.y);
    const path = findPath(start, goal, this.walkable);
    if (!path || path.length === 0) {
      this.path = [];
      return;
    }

    const next = path[0].col === start.col && path[0].row === start.row ? path.slice(1) : path;
    this.pendingSeat = null;
    this.pendingTv = null;
    this.path = next;
  }

  private followPath(time: number, running: boolean): void {
    if (this.path.length === 0) {
      this.player.move(0, 0, time);
      return;
    }

    const target = tileToWorld(this.path[0].col, this.path[0].row);
    const dx = target.x - this.player.root.x;
    const dy = target.y - this.player.root.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= ARRIVE) {
      this.player.root.setPosition(target.x, target.y);
      this.path.shift();
      if (this.path.length === 0) {
        if (this.pendingSeat) {
          this.sitOn(this.pendingSeat);
          return;
        }
        if (this.pendingTv) {
          this.openTv(this.pendingTv);
          return;
        }
        this.player.move(0, 0, time);
      }
      return;
    }

    this.player.move(dx / dist, dy / dist, time, running);
  }

  private sendChat(text: string): void {
    this.presence.sendChat(text);
    this.hearChat(this.localGuestId, this.player.displayName, text);
  }

  private hearChat(guestId: string, name: string, text: string): void {
    this.chat.append(name, text);
    const who = guestId === this.localGuestId ? this.player : this.remotes.get(guestId);
    who?.say(text, Math.min(7000, 1600 + text.length * 70));
  }

  private flushPose(force = false): void {
    const pose = this.player.snapshot();
    this.presence.updateJoinPose(pose);
    const json = JSON.stringify(pose);
    const now = this.time.now;
    if (!force && now - this.lastPoseAt < POSE_MS) return;
    if (!force && json === this.lastPoseJson) return;
    this.lastPoseAt = now;
    this.lastPoseJson = json;
    this.presence.sendState(pose);
  }

  private applyRemoteState(guestId: string, pose: Pose): void {
    this.remotes.get(guestId)?.applyRemote(pose, this.time.now);
  }

  private upsertRemote(peer: Peer): void {
    if (peer.guestId === this.localGuestId) return;
    let remote = this.remotes.get(peer.guestId);
    if (!remote) {
      remote = new Character(this, peer.pose.x, peer.pose.y, {
        appearance: peer.appearance,
        name: peer.name,
      });
      remote.root.body.setImmovable(true);
      remote.root.body.checkCollision.none = true;
      this.remotes.set(peer.guestId, remote);
    } else {
      remote.setName(peer.name);
      remote.setAppearance(peer.appearance);
    }
    remote.applyRemote(peer.pose, this.time.now);
  }

  private removeRemote(guestId: string): void {
    const remote = this.remotes.get(guestId);
    if (!remote) return;
    remote.destroy();
    this.remotes.delete(guestId);
  }

  private clearRemotes(): void {
    for (const remote of this.remotes.values()) remote.destroy();
    this.remotes.clear();
  }

  private refreshPresenceHud(): void {
    this.hud.setPresence(this.presenceStatus, this.remotes.size + 1);
  }

  private refreshVoiceHud(): void {
    this.voiceHud.render({
      status: this.voice.getStatus(),
      muted: this.voice.isMicMuted(),
      deaf: this.voice.isDeaf(),
      speaking: this.voice.isSpeaking(this.localGuestId),
    });
  }

  private tickVoice(): void {
    const places = new Map<string, VoicePlace>();
    const selfRoom = roomAt(this.player.root.x, this.player.root.y);
    places.set(this.localGuestId, {
      x: this.player.root.x,
      y: this.player.root.y,
      roomId: selfRoom.id,
    });
    for (const [guestId, remote] of this.remotes) {
      const room = roomAt(remote.root.x, remote.root.y);
      places.set(guestId, { x: remote.root.x, y: remote.root.y, roomId: room.id });
      remote.setSpeaking(this.voice.isSpeaking(guestId));
      remote.setMicMuted(this.voice.isRemoteMuted(guestId));
    }
    this.player.setSpeaking(this.voice.isSpeaking(this.localGuestId));
    this.player.setMicMuted(this.voice.getStatus() === 'live' && this.voice.isMicMuted());
    this.voice.tick(places);
  }
}
