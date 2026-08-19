import Phaser from 'phaser';
import type { Pose } from '../../shared/protocol';
import { FRAME_H, FRAME_W, paintPaperDoll, paintProofStrip } from './paperDoll';
import type { Action, Appearance, Direction } from './appearance';
import { facingFromScreen } from './appearance';
import { poseStep, WAVE_MS } from './catalog';

const SCALE = 2;
const WALK_SPEED = 140;
const RUN_SPEED = 250;
const FEET_Y = 37;
const NAME_OFFSET = 64;
const SPEECH_OFFSET = 82;

let nextCanvasId = 1;

type CharacterOptions = {
  appearance: Appearance;
  name: string;
  proof?: boolean;
};

export class Character {
  readonly root: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  readonly view: Phaser.GameObjects.Container;
  readonly nameLabel: Phaser.GameObjects.Text;
  readonly speech: Phaser.GameObjects.Text;
  appearance: Appearance;
  facing: Direction = 'down';
  action: Action = 'idle';
  displayName: string;
  sitting = false;
  speaking = false;
  micMuted = false;

  private readonly proof: boolean;
  private readonly canvasKey: string;
  private readonly canvasEl: HTMLCanvasElement;
  private readonly canvasTexture: Phaser.Textures.CanvasTexture;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private waveUntil = 0;
  private step = 0;
  private depthBias = 0;
  private remoteTarget: { x: number; y: number } | null = null;
  private readonly voiceRing: Phaser.GameObjects.Ellipse;
  private readonly micBadge: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, options: CharacterOptions) {
    this.scene = scene;
    this.appearance = options.appearance;
    this.displayName = options.name;
    this.proof = options.proof === true;

    this.root = scene.physics.add.sprite(x, y, 'origin-dot');
    this.root.setVisible(false);
    this.root.setOrigin(0.5, 1);
    this.root.body.setSize(12, 8);
    this.root.body.setOffset(-6, -8);
    this.root.body.setCollideWorldBounds(true);

    this.view = scene.add.container(x, y);

    const shadow = scene.add.graphics();
    drawPixelShadow(shadow);
    this.view.add(shadow);

    this.canvasKey = `avatar-canvas-${nextCanvasId}`;
    nextCanvasId += 1;
    this.canvasEl = document.createElement('canvas');
    this.canvasEl.width = FRAME_W;
    this.canvasEl.height = FRAME_H;
    const texture = scene.textures.addCanvas(this.canvasKey, this.canvasEl);
    if (!texture) throw new Error(`Could not create canvas texture ${this.canvasKey}`);
    this.canvasTexture = texture;

    this.sprite = scene.add.image(0, 0, this.canvasKey);
    this.sprite.setOrigin(0.5, FEET_Y / FRAME_H);
    this.view.add(this.sprite);
    this.view.setScale(SCALE);

    this.nameLabel = scene.add
      .text(x, y - NAME_OFFSET, this.displayName, {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '10px',
        color: '#f7f3ea',
        stroke: '#1a1410',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setResolution(2);

    this.voiceRing = scene.add
      .ellipse(x, y - 18, 36, 16, 0x7c9cff, 0.4)
      .setVisible(false)
      .setDepth(0);

    this.micBadge = scene.add
      .text(x, y - NAME_OFFSET + 12, 'mudo', {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '8px',
        color: '#c9b8a8',
        stroke: '#1a1410',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setResolution(2)
      .setVisible(false);

    this.speech = scene.add
      .text(x, y - SPEECH_OFFSET, '', {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '10px',
        color: '#2a221c',
        backgroundColor: '#f7f3ea',
        padding: { x: 6, y: 4 },
        wordWrap: { width: 160 },
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(false);

    this.redraw();
  }

  setName(name: string): void {
    this.displayName = name.trim() || 'Você';
    this.nameLabel.setText(this.displayName);
  }

  setAppearance(appearance: Appearance): void {
    this.appearance = appearance;
    this.redraw();
  }

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking;
  }

  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    this.micBadge.setVisible(muted);
  }

  snapshot(): Pose {
    return {
      x: this.root.x,
      y: this.root.y,
      facing: this.facing,
      action: this.action,
      step: this.step,
      depthBias: this.depthBias,
    };
  }

  applyRemote(pose: Pose, time: number): void {
    this.remoteTarget = { x: pose.x, y: pose.y };
    this.facing = pose.facing;
    this.action = pose.action;
    this.step = pose.step;
    this.depthBias = pose.depthBias;
    this.sitting = pose.action === 'sit' || pose.action === 'sleep';
    this.waveUntil = pose.action === 'wave' ? time + WAVE_MS : 0;
    this.root.setVelocity(0, 0);
    if (this.sitting) this.root.setPosition(pose.x, pose.y);
    this.redraw();
  }

  tickRemote(time: number, delta: number): void {
    if (this.remoteTarget) {
      if (this.sitting) {
        this.root.setPosition(this.remoteTarget.x, this.remoteTarget.y);
      } else {
        const t = 1 - Math.exp(-14 * (delta / 1000));
        this.root.x += (this.remoteTarget.x - this.root.x) * t;
        this.root.y += (this.remoteTarget.y - this.root.y) * t;
      }
      this.root.setVelocity(0, 0);
    }

    if (this.action === 'walk' || this.action === 'run') {
      const nextStep = poseStep(this.action, this.facing, time);
      if (nextStep === this.step) return;
      this.step = nextStep;
      this.redraw();
      return;
    }

    if (this.action !== 'wave' || time >= this.waveUntil) return;
    const nextStep = poseStep('wave', this.facing, time - (this.waveUntil - WAVE_MS));
    if (nextStep === this.step) return;
    this.step = nextStep;
    this.redraw();
  }

  wave(): void {
    if (this.sitting) return;
    this.waveUntil = this.scene.time.now + WAVE_MS;
    this.action = 'wave';
    this.step = 0;
    this.redraw();
  }

  say(line: string, duration = 1600): void {
    this.speech.setText(line).setVisible(true);
    this.scene.time.delayedCall(duration, () => {
      if (this.speech.text === line) this.speech.setVisible(false);
    });
  }

  sit(facing: Direction, x: number, y: number, depthBias = 0): void {
    this.occupy('sit', facing, x, y, depthBias);
  }

  sleep(facing: Direction, x: number, y: number, depthBias = 0): void {
    this.occupy('sleep', facing, x, y, depthBias);
  }

  private occupy(action: 'sit' | 'sleep', facing: Direction, x: number, y: number, depthBias: number): void {
    this.sitting = true;
    this.waveUntil = 0;
    this.facing = facing;
    this.action = action;
    this.step = 0;
    this.depthBias = depthBias;
    this.root.setVelocity(0, 0);
    this.root.setPosition(x, y);
    this.redraw();
  }

  stand(): void {
    if (!this.sitting) return;
    this.sitting = false;
    this.depthBias = 0;
    this.action = 'idle';
    this.step = 0;
    this.root.setVelocity(0, 0);
    this.redraw();
  }

  move(vx: number, vy: number, time: number, running = false): void {
    if (this.sitting) {
      this.root.setVelocity(0, 0);
      return;
    }
    const waving = time < this.waveUntil;
    const moving = vx !== 0 || vy !== 0;
    const nextAction: Action = moving ? (running ? 'run' : 'walk') : waving ? 'wave' : 'idle';
    const nextFacing = moving ? facingFromScreen(vx, vy) : this.facing;
    const waveElapsed = time - (this.waveUntil - WAVE_MS);
    const nextStep = moving
      ? poseStep(nextAction, nextFacing, time)
      : waving
        ? poseStep('wave', nextFacing, waveElapsed)
        : 0;
    const speed = nextAction === 'run' ? RUN_SPEED : WALK_SPEED;

    if (moving) {
      this.root.setVelocity(vx * speed, vy * speed);
      this.waveUntil = 0;
    } else {
      this.root.setVelocity(0, 0);
    }

    if (nextAction !== this.action || nextFacing !== this.facing || nextStep !== this.step) {
      this.action = nextAction;
      this.facing = nextFacing;
      this.step = nextStep;
      this.redraw();
    }
  }

  faceToward(target: Character): void {
    const nextFacing = facingFromScreen(target.root.x - this.root.x, target.root.y - this.root.y);
    if (this.action === 'talk' && this.facing === nextFacing) return;
    this.facing = nextFacing;
    this.action = 'talk';
    this.redraw();
  }

  idle(): void {
    if (this.sitting) return;
    if (this.scene.time.now < this.waveUntil) return;
    if (this.action === 'idle' && this.step === 0) return;
    this.action = 'idle';
    this.step = 0;
    this.root.setVelocity(0, 0);
    this.redraw();
  }

  distanceTo(other: Character): number {
    return Phaser.Math.Distance.Between(this.root.x, this.root.y, other.root.x, other.root.y);
  }

  syncPosition(): void {
    const { x, y } = this.root;
    const depth = y + this.depthBias;
    this.view.setPosition(x, y);
    this.view.setDepth(depth);
    this.root.setDepth(depth);
    this.nameLabel.setPosition(x, y - NAME_OFFSET).setDepth(depth + 1);
    this.micBadge.setPosition(x, y - NAME_OFFSET + 2).setDepth(depth + 1);
    this.speech.setPosition(x, y - SPEECH_OFFSET).setDepth(depth + 2);
    this.voiceRing.setPosition(x, y - 20).setDepth(depth - 1);
    if (this.speaking) {
      const pulse = 0.28 + 0.18 * Math.sin(this.scene.time.now / 130);
      this.voiceRing.setFillStyle(0x7c9cff, pulse).setVisible(true);
    } else {
      this.voiceRing.setVisible(false);
    }
  }

  destroy(): void {
    this.root.destroy();
    this.view.destroy();
    this.nameLabel.destroy();
    this.speech.destroy();
    this.voiceRing.destroy();
    this.micBadge.destroy();
    this.scene.textures.remove(this.canvasKey);
  }

  private redraw(): void {
    const ctx = this.canvasEl.getContext('2d');
    if (!ctx) return;

    paintPaperDoll(ctx, this.appearance, this.action, this.facing, this.step);
    this.canvasTexture.refresh();
    this.sprite.setTexture(this.canvasKey);
    this.sprite.setOrigin(0.5, FEET_Y / FRAME_H);
    this.sprite.setAngle(0);
    this.sprite.setPosition(0, 0);

    if (this.proof) paintProofStrip(this.appearance, this.action, this.facing, this.step);
  }
}

function drawPixelShadow(g: Phaser.GameObjects.Graphics): void {
  const rows: Array<[number, number, number]> = [
    [-4, -1, 8],
    [-5, 0, 10],
    [-4, 1, 8],
  ];
  g.fillStyle(0x000000, 0.35);
  for (const [x, y, w] of rows) {
    g.fillRect(x, y, w, 1);
  }
}
