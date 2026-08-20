import Phaser from 'phaser';
import { Character } from '../character/Character';
import { loadAvatar, loadPresenceId } from '../character/appearance';
import { PresenceClient, type PresenceStatus } from '../net/presence';
import {
  cancelGameSession,
  createGameSession,
  fetchGameCatalog,
  fetchGameSessions,
  fetchPlayConfig,
  finishGameSession,
  joinGameSession,
  leaveGameSession,
  markGameConnected,
  startGameSession,
  readyGameSession,
  reportNetplayRoom,
  watchGameSession,
  GamesApiError,
} from '../net/games';
import type { GameCatalogItem, GameSessionView } from '../../shared/game-session';
import { isActiveSession } from '../../shared/game-session';
import { VoiceClient } from '../net/voice';
import type { FurniturePlacement, Peer, Pose, TvScreen } from '../../shared/protocol';
import { BuilderPanel } from '../ui/builder';
import { RoomChat } from '../ui/chat';
import { Hud } from '../ui/hud';
import { TvAudioHud } from '../ui/tvAudio';
import { ArcadePanel } from '../ui/arcadePanel';
import { ArcadeOverlay } from '../ui/arcadeOverlay';
import { TvPanel } from '../ui/tvPanel';
import { TvScreens } from '../ui/tvScreens';
import { VoiceHud } from '../ui/voiceHud';
import { MediaStage } from '../ui/mediaStage';
import { BuildGhost } from '../world/buildMode';
import { COLLEAGUES, colleagueWorld } from '../world/colleagues';
import {
  canPlace,
  CATALOG,
  drawFurniture,
  furnitureAt,
  liftWallHangings,
  nextFacing,
  snapWallPlace,
  type FurniturePlace,
} from '../world/furniture';
import { drawHouse } from '../world/house';
import {
  claimSeat,
  isNearSeat,
  listSeats,
  nearestSeat,
  occupiedSeatIds,
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
  createWallGrid,
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
import {
  arcadeAt,
  isNearArcade,
  listArcades,
  nearestArcade,
  type ArcadeSpot,
} from '../world/arcade';
import { distanceToPlace, isNearTv, listTvs, nearestTv, tvAt, type TvSpot } from '../world/tv';
import type { VoicePlace } from '../audio/spatial';

type KeyMap = {
  E: Phaser.Input.Keyboard.Key;
  G: Phaser.Input.Keyboard.Key;
  C: Phaser.Input.Keyboard.Key;
  F: Phaser.Input.Keyboard.Key;
  R: Phaser.Input.Keyboard.Key;
  X: Phaser.Input.Keyboard.Key;
  V: Phaser.Input.Keyboard.Key;
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
  private mediaStage!: MediaStage;
  private presenceStatus: PresenceStatus = 'offline';
  private localGuestId = '';
  private lastPoseAt = 0;
  private lastPoseJson = '';
  private hud!: Hud;
  private chat!: RoomChat;
  private builder!: BuilderPanel;
  private tvPanel!: TvPanel;
  private arcadePanel!: ArcadePanel;
  private arcadeOverlay!: ArcadeOverlay;
  private tvScreens!: TvScreens;
  private tvAudio!: TvAudioHud;
  private ghost!: BuildGhost;
  private keys!: KeyMap;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walkable: boolean[][] = [];
  private floor: boolean[][] = [];
  private wall: boolean[][] = [];
  private furniture: FurniturePlace[] = [];
  private furnitureImages: Phaser.GameObjects.Image[] = [];
  private hover!: Phaser.GameObjects.Image;
  private path: TilePos[] = [];
  private lastGood = { x: 0, y: 0 };
  private seats: Seat[] = [];
  private tvs: TvSpot[] = [];
  private arcades: ArcadeSpot[] = [];
  private netTvs = new Map<string, string>();
  private seated: Seat | null = null;
  private pendingSeat: Seat | null = null;
  private pendingTv: TvSpot | null = null;
  private pendingArcade: ArcadeSpot | null = null;
  private gameSession: GameSessionView | null = null;
  private gameSessions: GameSessionView[] = [];
  private gameCatalog: GameCatalogItem[] = [];
  private playPoll = 0;
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
      onCamera: () => {
        void this.voice.unlock();
        void this.voice.toggleCamera();
      },
      onShare: () => {
        void this.voice.unlock();
        void this.voice.toggleScreenShare();
      },
    });
    this.voice = new VoiceClient(() => this.refreshVoiceHud());
    this.voice.prepare(this.localGuestId, avatar.name);
    this.mediaStage = new MediaStage();
    this.chat = new RoomChat((text) => this.sendChat(text));
    this.builder = new BuilderPanel({
      onSelect: (id) => this.ghost.setItem(id),
      onReset: () => this.resetFurniture(),
      onClose: () => this.setBuildMode(false),
    });
    this.tvScreens = new TvScreens();
    this.tvAudio = new TvAudioHud({
      onChange: (audio) => this.tvScreens.setAudio(audio),
    });
    this.tvScreens.setAudio(this.tvAudio.state());
    this.tvPanel = new TvPanel({
      onPlay: (tv, videoId) => this.playTv(tv, videoId),
      onStop: (tv) => this.stopTv(tv),
    });
    this.arcadePanel = new ArcadePanel({
      onCreate: (gameId) => void this.createArcadeSession(gameId),
      onJoin: (sessionId) => void this.joinArcadeSession(sessionId),
      onWatch: (sessionId) => void this.watchArcadeSession(sessionId),
      onReady: () => void this.readyArcadeSession(),
      onStart: () => void this.startArcadeSession(),
      onOpenEmulator: () => void this.openArcadeEmulator(),
      onLeave: () => void this.leaveArcadeSession(),
      onCancel: () => void this.cancelArcadeSession(),
    });
    this.arcadeOverlay = new ArcadeOverlay({
      onRoom: (roomId) => void this.publishNetplayRoom(roomId),
      onPlaying: () => void this.markArcadeConnected(),
      onLeave: () => void this.exitArcadeOverlay(),
      onNeedRoom: () => void this.refreshPlayConfig(),
    });

    const grid = createGroundGrid();
    this.floor = createFloorGrid();
    this.wall = createWallGrid();
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
    this.keys = keyboard.addKeys('E,G,C,F,R,X,V') as KeyMap;
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
      if (this.hud.closeHelp()) return;
      if (this.mediaStage.collapse()) return;
      if (this.arcadeOverlay.isOpen()) {
        void this.exitArcadeOverlay();
        return;
      }
      if (this.arcadePanel.isOpen()) {
        this.arcadePanel.setOpen(false);
        return;
      }
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
    keyboard.on('keydown-V', () => {
      if (this.hud.isTyping()) return;
      void this.voice.unlock();
      void this.voice.toggleCamera();
    });
    keyboard.on('keydown-BACKSPACE', (event: KeyboardEvent) => {
      if (!this.builder.isOpen() || this.hud.isTyping()) return;
      event.preventDefault();
      this.deleteAtPointer();
    });

    this.presence = new PresenceClient({
      onWelcome: (peers, tvs, furniture, games) => {
        this.clearRemotes();
        for (const peer of peers) this.upsertRemote(peer);
        this.replaceTvs(tvs);
        this.replaceSharedFurniture(furniture);
        this.applyGameSessions(games);
      },
      onJoin: (peer) => {
        this.upsertRemote(peer);
      },
      onLeave: (guestId) => {
        this.removeRemote(guestId);
      },
      onState: (guestId, pose) => this.applyRemoteState(guestId, pose),
      onMeta: (guestId, name, appearance) => {
        const remote = this.remotes.get(guestId);
        if (!remote) return;
        remote.setName(name);
        remote.setAppearance(appearance);
      },
      onChat: (guestId, name, text) => this.hearChat(guestId, name, text),
      onTv: (tvId, platform, videoId) => this.applyNetworkTv(tvId, platform, videoId),
      onFurniture: (places) => this.replaceSharedFurniture(places),
      onGame: (sessions) => this.applyGameSessions(sessions),
      onStatus: (status) => {
        this.presenceStatus = status;
        if (status === 'offline') this.clearRemotes();
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
      this.stopPlayPoll();
      this.arcadeOverlay.close();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.presence.disconnect();
      this.voice.disconnect();
      this.stopPlayPoll();
      this.arcadeOverlay.close();
    });
  }

  update(time: number, delta: number): void {
    this.tickZoom(delta);
    this.updateHover();
    this.updateUsePrompt();
    if (this.builder.isOpen()) this.tvScreens.hide();
    else this.tvScreens.tick(this);

    if (this.arcadeOverlay.isOpen()) {
      this.player.move(0, 0, time);
      this.player.syncPosition();
      this.flushPose();
      this.tickVoice();
      for (const remote of this.remotes.values()) remote.tickRemote(time, delta);
      for (const npc of this.colleagues) npc.syncPosition();
      return;
    }

    const held = this.readMove();
    const running = this.isRunning();
    if (held) {
      this.path = [];
      this.pendingSeat = null;
      this.pendingTv = null;
      this.pendingArcade = null;
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
        this.arcadePanel.setOpen(false);
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
      this.arcadePanel.setOpen(false);
      this.hud.setCustomizerOpen(false);
      this.path = [];
      this.pendingSeat = null;
      this.pendingTv = null;
      this.pendingArcade = null;
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
    return snapWallPlace(this.ghost.draft(tile.col, tile.row), this.wall);
  }

  private validDraft(draft: FurniturePlace, skip?: FurniturePlace): boolean {
    return canPlace(this.floor, this.furniture, draft, {
      skip,
      occupied: this.occupants(),
      wall: this.wall,
    });
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
    this.furniture = liftWallHangings(this.furniture, this.wall);
    this.redrawFurniture();
  }

  private replaceSharedFurniture(places: FurniturePlacement[]): void {
    this.furniture = liftWallHangings(
      places
        .filter((place) => CATALOG[place.item])
        .map((place) => ({
          id: place.id,
          item: place.item,
          col: place.col,
          row: place.row,
          facing: place.facing,
        })),
      this.wall,
    );
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
    this.arcades = listArcades(this.furniture, this.walkable);
    this.tvScreens.prune(this.furniture);
    for (const [id, videoId] of this.netTvs) {
      if (!this.tvScreens.has(id)) this.showTv(id, videoId);
    }
    this.tvAudio.setActive(this.tvScreens.size() > 0);
    this.rebindSeats();
    if (persist) saveOfficeFurniture(this.furniture);
  }

  private rebindSeats(): void {
    if (this.seated) {
      const next = this.seats.find((seat) => seat.id === this.seated?.id);
      if (next) this.seated = next;
      else this.standUp();
    }
    if (this.pendingSeat) {
      const next = this.seats.find((seat) => seat.id === this.pendingSeat?.id);
      this.pendingSeat = next ?? null;
    }
  }

  private takenSeatIds(): Set<string> {
    const occupants: Array<{ x: number; y: number }> = [];
    for (const remote of this.remotes.values()) {
      if (remote.sitting) occupants.push({ x: remote.root.x, y: remote.root.y });
    }
    return occupiedSeatIds(this.seats, occupants);
  }

  private pickSeat(preferred: Seat): Seat | null {
    return claimSeat(
      preferred,
      this.seats,
      this.takenSeatIds(),
      worldToTile(this.player.root.x, this.player.root.y),
    );
  }

  private isRunning(): boolean {
    return !this.hud.isTyping() && this.cursors.shift.isDown;
  }

  private readMove(): { x: number; y: number } | null {
    if (this.hud.isTyping()) return null;
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown) x -= 1;
    if (this.cursors.right.isDown) x += 1;
    if (this.cursors.up.isDown) y -= 1;
    if (this.cursors.down.isDown) y += 1;
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
    if (this.builder.isOpen() || this.tvPanel.isOpen() || this.arcadePanel.isOpen() || this.arcadeOverlay.isOpen()) {
      this.usePrompt.setVisible(false);
      return;
    }
    if (this.seated) {
      this.showPrompt('E  Levantar');
      return;
    }
    const nearby = this.nearestUse();
    if (nearby?.kind === 'seat') {
      if (!this.pickSeat(nearby.seat)) {
        this.showPrompt(`Lotado · ${nearby.seat.label}`);
        return;
      }
      const verb = nearby.seat.use === 'sleep' ? 'Deitar' : 'Sentar';
      this.showPrompt(`E  ${verb} · ${nearby.seat.label}`);
      return;
    }
    if (nearby?.kind === 'tv') {
      this.showPrompt(`E  Assistir · ${nearby.tv.label}`);
      return;
    }
    if (nearby?.kind === 'arcade') {
      this.showPrompt(`E  Jogar · ${nearby.arcade.label}`);
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

  private nearestUse():
    | { kind: 'seat'; seat: Seat }
    | { kind: 'tv'; tv: TvSpot }
    | { kind: 'arcade'; arcade: ArcadeSpot }
    | null {
    const tile = worldToTile(this.player.root.x, this.player.root.y);
    const options: Array<
      | { kind: 'seat'; seat: Seat; dist: number }
      | { kind: 'tv'; tv: TvSpot; dist: number }
      | { kind: 'arcade'; arcade: ArcadeSpot; dist: number }
    > = [];
    const seat = nearestSeat(this.seats, tile);
    if (seat) options.push({ kind: 'seat', seat, dist: distanceToPlace(tile, seat.place) });
    const tv = nearestTv(this.tvs, tile);
    if (tv) options.push({ kind: 'tv', tv, dist: distanceToPlace(tile, tv.place) });
    const arcade = nearestArcade(this.arcades, tile);
    if (arcade) options.push({ kind: 'arcade', arcade, dist: distanceToPlace(tile, arcade.place) });
    options.sort((a, b) => a.dist - b.dist);
    const best = options[0];
    if (!best) return null;
    if (best.kind === 'seat') return { kind: 'seat', seat: best.seat };
    if (best.kind === 'tv') return { kind: 'tv', tv: best.tv };
    return { kind: 'arcade', arcade: best.arcade };
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
    if (this.arcadePanel.isOpen()) {
      this.arcadePanel.setOpen(false);
      return;
    }
    const nearby = this.nearestUse();
    if (nearby?.kind === 'seat') this.useSeat(nearby.seat);
    else if (nearby?.kind === 'tv') this.useTv(nearby.tv);
    else if (nearby?.kind === 'arcade') this.useArcade(nearby.arcade);
  }

  private useSeat(seat: Seat): void {
    const target = this.pickSeat(seat);
    if (!target) return;
    if (this.seated?.id === target.id) return;

    this.pendingTv = null;
    this.pendingArcade = null;
    this.tvPanel.setOpen(false);
    this.arcadePanel.setOpen(false);

    if (this.seated?.placeKey === target.placeKey) {
      this.sitOn(target);
      return;
    }
    if (this.seated) this.standUp();

    const start = worldToTile(this.player.root.x, this.player.root.y);
    if (isNearSeat(start, target)) {
      this.sitOn(target);
      return;
    }

    const path = findPath(start, target.approach, this.walkable);
    if (!path || path.length === 0) return;

    const next = path[0].col === start.col && path[0].row === start.row ? path.slice(1) : path;
    this.pendingSeat = target;
    this.path = next;
    if (this.path.length === 0) this.sitOn(target);
  }

  private useTv(tv: TvSpot): void {
    this.pendingSeat = null;
    this.pendingArcade = null;
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

  private useArcade(arcade: ArcadeSpot): void {
    this.pendingSeat = null;
    this.pendingTv = null;
    const start = worldToTile(this.player.root.x, this.player.root.y);
    if (isNearArcade(start, arcade)) {
      void this.openArcade(arcade);
      return;
    }
    const path = findPath(start, arcade.approach, this.walkable);
    if (!path || path.length === 0) return;
    const next = path[0].col === start.col && path[0].row === start.row ? path.slice(1) : path;
    this.pendingArcade = arcade;
    this.path = next;
    if (this.path.length === 0) void this.openArcade(arcade);
  }

  private openTv(tv: TvSpot): void {
    this.pendingSeat = null;
    this.pendingTv = null;
    this.pendingArcade = null;
    this.path = [];
    this.setBuildMode(false);
    this.hud.setCustomizerOpen(false);
    this.arcadePanel.setOpen(false);
    this.tvPanel.open(tv);
  }

  private playTv(tv: TvSpot, videoId: string): void {
    this.netTvs.set(tv.id, videoId);
    this.tvAudio.unmuteIntent();
    this.tvScreens.play(tv, videoId);
    this.tvAudio.setActive(true);
    this.presence.sendTv(tv.id, 'youtube', videoId);
  }

  private stopTv(tv: TvSpot): void {
    this.netTvs.delete(tv.id);
    this.tvScreens.stop(tv.id);
    this.tvAudio.setActive(this.tvScreens.size() > 0);
    this.presence.sendTv(tv.id, null, null);
  }

  private replaceTvs(tvs: TvScreen[]): void {
    this.netTvs.clear();
    this.tvScreens.stopAll();
    for (const screen of tvs) this.applyNetworkTv(screen.tvId, screen.platform, screen.videoId);
    this.tvAudio.setActive(this.tvScreens.size() > 0);
  }

  private applyNetworkTv(
    tvId: string,
    platform: TvScreen['platform'] | null,
    videoId: string | null,
  ): void {
    if (!platform || !videoId) {
      this.netTvs.delete(tvId);
      this.tvScreens.stop(tvId);
      this.tvAudio.setActive(this.tvScreens.size() > 0);
      return;
    }
    this.netTvs.set(tvId, videoId);
    this.showTv(tvId, videoId);
  }

  private showTv(tvId: string, videoId: string): void {
    const spot = this.tvs.find((tv) => tv.id === tvId);
    if (!spot) return;
    this.tvScreens.play(spot, videoId);
    this.tvAudio.setActive(true);
  }

  private sitOn(seat: Seat): void {
    const target = this.pickSeat(seat);
    this.pendingSeat = null;
    this.pendingTv = null;
    this.pendingArcade = null;
    this.path = [];
    if (!target) return;
    this.seated = target;
    const anchor = sitAnchor(target);
    if (target.use === 'sleep') {
      this.player.sleep('right', anchor.x, anchor.y, anchor.depthBias);
    } else {
      this.player.sit(target.facing, anchor.x, anchor.y, anchor.depthBias);
    }
    this.flushPose(true);
  }

  private standUp(): void {
    const seat = this.seated;
    this.seated = null;
    this.pendingSeat = null;
    this.pendingTv = null;
    this.pendingArcade = null;
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
    const clickedArcade = arcadeAt(this.arcades, goal.col, goal.row);
    if (this.seated && clickedSeat?.id === this.seated.id) return;
    if (clickedArcade) {
      if (this.seated) this.standUp();
      this.useArcade(clickedArcade);
      return;
    }
    if (clickedTv) {
      if (this.seated) this.standUp();
      this.useTv(clickedTv);
      return;
    }
    if (clickedSeat) {
      this.useSeat(clickedSeat);
      return;
    }

    if (this.seated) this.standUp();
    const start = worldToTile(this.player.root.x, this.player.root.y);
    const path = findPath(start, goal, this.walkable);
    if (!path || path.length === 0) {
      this.path = [];
      return;
    }

    const next = path[0].col === start.col && path[0].row === start.row ? path.slice(1) : path;
    this.pendingSeat = null;
    this.pendingTv = null;
    this.pendingArcade = null;
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
        if (this.pendingArcade) {
          void this.openArcade(this.pendingArcade);
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

  private refreshVoiceHud(): void {
    this.voiceHud.render({
      status: this.voice.getStatus(),
      muted: this.voice.isMicMuted(),
      deaf: this.voice.isDeaf(),
      speaking: this.voice.isSpeaking(this.localGuestId),
      camera: this.voice.isCameraEnabled(),
      screen: this.voice.isScreenShareEnabled(),
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
    this.player.setMicMuted(this.voice.isRemoteMuted(this.localGuestId));
    this.voice.tick(places);
    this.mediaStage.tick(this, this.voice.listTiles(), this.mediaAnchors(places));
  }

  private mediaAnchors(places: Map<string, VoicePlace>): Map<string, { x: number; y: number; name: string; visible: boolean }> {
    const local = places.get(this.localGuestId);
    const anchors = new Map<string, { x: number; y: number; name: string; visible: boolean }>();
    if (!local) return anchors;
    anchors.set(this.localGuestId, {
      x: this.player.root.x,
      y: this.player.root.y,
      name: this.player.displayName,
      visible: true,
    });
    for (const [guestId, remote] of this.remotes) {
      const place = places.get(guestId);
      if (!place) continue;
      anchors.set(guestId, {
        x: remote.root.x,
        y: remote.root.y,
        name: remote.displayName,
        visible: place.roomId === local.roomId,
      });
    }
    return anchors;
  }

  private applyGameSessions(sessions: GameSessionView[]): void {
    this.gameSessions = sessions.filter((session) => isActiveSession(session.status));
    this.syncArcadeSession();
  }

  private upsertGameSession(session: GameSessionView | null): void {
    if (!session) {
      this.syncArcadeSession();
      return;
    }
    if (!isActiveSession(session.status)) {
      this.gameSessions = this.gameSessions.filter((item) => item.id !== session.id);
    } else {
      const index = this.gameSessions.findIndex((item) => item.id === session.id);
      if (index >= 0) this.gameSessions[index] = session;
      else this.gameSessions.push(session);
    }
    this.syncArcadeSession();
  }

  private syncArcadeSession(): void {
    this.gameSession =
      this.gameSessions.find((session) => session.players.some((player) => player.guestId === this.localGuestId)) ??
      null;
    this.arcadePanel.setSessions(this.gameSessions, this.gameSession);
    if (!this.gameSession && this.arcadeOverlay.isOpen()) this.arcadeOverlay.close();
    if (this.arcadeOverlay.isOpen() && this.gameSession) void this.refreshPlayConfig();
  }

  private async openArcade(_arcade: ArcadeSpot): Promise<void> {
    this.pendingArcade = null;
    this.path = [];
    this.setBuildMode(false);
    this.hud.setCustomizerOpen(false);
    this.tvPanel.setOpen(false);
    this.arcadePanel.setBusy(true);
    this.arcadePanel.setError('');
    try {
      this.gameCatalog = await fetchGameCatalog();
      this.applyGameSessions(await fetchGameSessions());
      this.arcadePanel.open(this.localGuestId, this.gameCatalog, this.gameSessions, this.gameSession);
    } catch (error) {
      this.arcadePanel.open(this.localGuestId, this.gameCatalog, this.gameSessions, this.gameSession);
      this.arcadePanel.setError(errorMessage(error));
    } finally {
      this.arcadePanel.setBusy(false);
    }
  }

  private async createArcadeSession(gameId: string): Promise<void> {
    await this.runArcadeAction(() => createGameSession(this.localGuestId, this.player.displayName, gameId));
  }

  private async joinArcadeSession(sessionId: string): Promise<void> {
    await this.runArcadeAction(() => joinGameSession(sessionId, this.localGuestId, this.player.displayName));
  }

  private async watchArcadeSession(sessionId: string): Promise<void> {
    await this.runArcadeAction(() => watchGameSession(sessionId, this.localGuestId, this.player.displayName));
  }

  private async readyArcadeSession(): Promise<void> {
    if (!this.gameSession) return;
    await this.runArcadeAction(() => readyGameSession(this.gameSession!.id, this.localGuestId));
  }

  private async startArcadeSession(): Promise<void> {
    if (!this.gameSession) return;
    await this.runArcadeAction(() => startGameSession(this.gameSession!.id, this.localGuestId));
  }

  private async leaveArcadeSession(): Promise<void> {
    if (!this.gameSession) {
      this.arcadePanel.setOpen(false);
      return;
    }
    await this.runArcadeAction(async () => {
      const next = await leaveGameSession(this.gameSession!.id, this.localGuestId);
      this.arcadeOverlay.close();
      this.stopPlayPoll();
      return next;
    });
    this.arcadePanel.setOpen(false);
  }

  private async cancelArcadeSession(): Promise<void> {
    if (!this.gameSession) return;
    await this.runArcadeAction(() => cancelGameSession(this.gameSession!.id, this.localGuestId));
    this.arcadeOverlay.close();
    this.arcadePanel.setOpen(false);
  }

  private async exitArcadeOverlay(): Promise<void> {
    const session = this.gameSession;
    this.arcadeOverlay.close();
    this.stopPlayPoll();
    if (!session) return;
    const host = session.hostGuestId === this.localGuestId;
    try {
      if (host && (session.status === 'playing' || session.status === 'starting')) {
        this.upsertGameSession(await finishGameSession(session.id, this.localGuestId));
      } else {
        this.upsertGameSession(await leaveGameSession(session.id, this.localGuestId));
      }
    } catch (error) {
      this.arcadePanel.setError(errorMessage(error));
    }
  }

  private async openArcadeEmulator(): Promise<void> {
    if (!this.gameSession) return;
    this.arcadePanel.setBusy(true);
    this.arcadePanel.setError('');
    try {
      const config = await fetchPlayConfig(this.gameSession.id, this.localGuestId);
      this.arcadePanel.setOpen(false);
      if (this.arcadeOverlay.isOpen()) this.arcadeOverlay.update(config);
      else this.arcadeOverlay.open(config);
      this.startPlayPoll();
    } catch (error) {
      this.arcadePanel.setError(errorMessage(error));
    } finally {
      this.arcadePanel.setBusy(false);
    }
  }

  private async publishNetplayRoom(roomId: string): Promise<void> {
    if (!this.gameSession) return;
    try {
      this.upsertGameSession(await reportNetplayRoom(this.gameSession.id, this.localGuestId, roomId));
    } catch (error) {
      this.arcadePanel.setError(errorMessage(error));
    }
  }

  private async markArcadeConnected(): Promise<void> {
    if (!this.gameSession) return;
    try {
      this.upsertGameSession(await markGameConnected(this.gameSession.id, this.localGuestId));
    } catch {
      /* o WS já atualiza o lobby */
    }
  }

  private async refreshPlayConfig(): Promise<void> {
    if (!this.gameSession || !this.arcadeOverlay.isOpen()) return;
    try {
      const config = await fetchPlayConfig(this.gameSession.id, this.localGuestId);
      this.arcadeOverlay.update(config);
    } catch {
      /* ainda sem sala Netplay */
    }
  }

  private async runArcadeAction(action: () => Promise<GameSessionView | null>): Promise<void> {
    this.arcadePanel.setBusy(true);
    this.arcadePanel.setError('');
    try {
      this.upsertGameSession(await action());
    } catch (error) {
      this.arcadePanel.setError(errorMessage(error));
    } finally {
      this.arcadePanel.setBusy(false);
    }
  }

  private startPlayPoll(): void {
    this.stopPlayPoll();
    this.playPoll = window.setInterval(() => void this.refreshPlayConfig(), 800);
  }

  private stopPlayPoll(): void {
    if (this.playPoll) window.clearInterval(this.playPoll);
    this.playPoll = 0;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof GamesApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não deu para falar com o servidor de jogos.';
}
