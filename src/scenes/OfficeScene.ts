import Phaser from 'phaser';
import { Character } from '../character/Character';
import { loadAvatar } from '../character/appearance';
import { BuilderPanel } from '../ui/builder';
import { Hud } from '../ui/hud';
import { BuildGhost } from '../world/buildMode';
import { COLLEAGUES, colleagueWorld } from '../world/colleagues';
import {
  blockWalkable,
  canPlace,
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
  createFloorGrid,
  createGroundGrid,
  defaultFurniture,
  getBuiltHouse,
  isWalkable,
  loadOfficeFurniture,
  roomAt,
  saveOfficeFurniture,
  tileToWorld,
  worldToTile,
  type TileId,
} from '../world/layout';
import { findPath, type TilePos } from '../world/path';

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
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 3;
const ZOOM_DEFAULT = 1.5;
const ZOOM_SENSITIVITY = 0.0014;
const ZOOM_FOLLOW = 14;

function snapZoom(zoom: number): number {
  return Math.round(zoom * TILE_SIZE) / TILE_SIZE;
}

function nextZoom(current: number, deltaY: number): number {
  return Phaser.Math.Clamp(current * Math.exp(-deltaY * ZOOM_SENSITIVITY), ZOOM_MIN, ZOOM_MAX);
}

export class OfficeScene extends Phaser.Scene {
  private player!: Character;
  private colleagues: Character[] = [];
  private hud!: Hud;
  private builder!: BuilderPanel;
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
  private seated: Seat | null = null;
  private pendingSeat: Seat | null = null;
  private usePrompt!: Phaser.GameObjects.Text;
  private zoomTarget = ZOOM_DEFAULT;

  constructor() {
    super('office');
  }

  create(): void {
    const avatar = loadAvatar();
    this.hud = new Hud(avatar, {
      onAppearance: (appearance) => this.player.setAppearance(appearance),
      onName: (name) => this.player.setName(name),
    });
    this.builder = new BuilderPanel({
      onSelect: (id) => this.ghost.setItem(id),
      onReset: () => this.resetFurniture(),
      onClose: () => this.setBuildMode(false),
    });

    const grid = createGroundGrid();
    this.floor = createFloorGrid();
    this.furniture = loadOfficeFurniture();
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
    this.zoomTarget = ZOOM_DEFAULT;
    this.cameras.main.setZoom(this.zoomTarget);
    this.cameras.main.roundPixels = true;
    this.cameras.main.fadeIn(350, 5, 3, 4);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard plugin missing');
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys('W,A,S,D,E,G,C,F,R,X') as KeyMap;
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
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
      if (this.hud.isTyping()) return;
      if (this.builder.isOpen()) this.setBuildMode(false);
      else this.hud.setCustomizerOpen(false);
    });

    keyboard.on('keydown-BACKSPACE', (event: KeyboardEvent) => {
      if (!this.builder.isOpen() || this.hud.isTyping()) return;
      event.preventDefault();
      this.deleteAtPointer();
    });
  }

  update(time: number, delta: number): void {
    this.tickZoom(delta);
    this.updateHover();
    this.updateUsePrompt();

    const held = this.readMove();
    const running = this.isRunning();
    if (held) {
      this.path = [];
      this.pendingSeat = null;
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
      if (Phaser.Input.Keyboard.JustDown(this.keys.G)) this.player.wave();
      if (Phaser.Input.Keyboard.JustDown(this.keys.C)) {
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
      this.hud.setCustomizerOpen(false);
      this.path = [];
      this.pendingSeat = null;
      this.hover.setVisible(false);
      this.ghost.setItem(this.builder.selectedId());
    } else {
      this.ghost.hide();
    }
  }

  private occupants(): Array<{ col: number; row: number }> {
    const people = [this.player, ...this.colleagues];
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
    this.redrawFurniture();
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
      this.redrawFurniture();
      return;
    }
    this.ghost.rotate();
  }

  private deleteAtPointer(): void {
    const tile = this.pointerTile(this.input.activePointer);
    const existing = furnitureAt(this.furniture, tile.col, tile.row);
    if (!existing) return;
    this.furniture = this.furniture.filter((place) => place !== existing);
    this.redrawFurniture();
  }

  private resetFurniture(): void {
    this.furniture = defaultFurniture();
    this.redrawFurniture();
  }

  private redrawFurniture(persist = true): void {
    for (const image of this.furnitureImages) image.destroy();
    this.furnitureImages = drawFurniture(this, this.furniture);
    this.walkable = this.makeWalkable(createGroundGrid());
    this.seats = listSeats(this.furniture, this.walkable);
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
    if (seat || this.isOpen(tile)) {
      const { x, y } = tileToWorld(tile.col, tile.row);
      this.hover.setPosition(x, y).setVisible(true);
      this.game.canvas.style.cursor = 'pointer';
      return;
    }

    this.hover.setVisible(false);
    this.game.canvas.style.cursor = 'default';
  }

  private updateUsePrompt(): void {
    if (this.builder.isOpen()) {
      this.usePrompt.setVisible(false);
      return;
    }
    const tile = worldToTile(this.player.root.x, this.player.root.y);
    if (this.seated) {
      this.showPrompt('E  Levantar');
      return;
    }
    const seat = nearestSeat(this.seats, tile);
    if (seat) {
      const verb = seat.use === 'sleep' ? 'Deitar' : 'Sentar';
      this.showPrompt(`E  ${verb} · ${seat.label}`);
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

  private tryUse(): void {
    if (this.seated) {
      this.standUp();
      return;
    }
    const tile = worldToTile(this.player.root.x, this.player.root.y);
    const seat = nearestSeat(this.seats, tile);
    if (seat) this.useSeat(seat);
  }

  private useSeat(seat: Seat): void {
    if (this.seated?.id === seat.id) return;
    if (this.seated) this.standUp();

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

  private sitOn(seat: Seat): void {
    const anchor = sitAnchor(seat);
    this.pendingSeat = null;
    this.path = [];
    this.seated = seat;
    if (seat.use === 'sleep') {
      this.player.sleep('right', anchor.x, anchor.y, anchor.depthBias);
      return;
    }
    this.player.sit(seat.facing, anchor.x, anchor.y, anchor.depthBias);
  }

  private standUp(): void {
    const seat = this.seated;
    this.seated = null;
    this.pendingSeat = null;
    this.player.stand();
    if (!seat) return;
    const spot = this.isOpen(seat.approach)
      ? seat.approach
      : worldToTile(this.lastGood.x, this.lastGood.y);
    const { x, y } = tileToWorld(spot.col, spot.row);
    this.player.root.setPosition(x, y);
    this.lastGood = { x, y };
  }

  private clickTile(pointer: Phaser.Input.Pointer): void {
    const goal = this.pointerTile(pointer);
    const clickedSeat = seatAt(this.seats, goal.col, goal.row);
    if (this.seated && clickedSeat?.id === this.seated.id) return;
    if (this.seated) this.standUp();
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
        this.player.move(0, 0, time);
      }
      return;
    }

    this.player.move(dx / dist, dy / dist, time, running);
  }
}
