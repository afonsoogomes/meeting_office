import {
  cycleSlot,
  randomAppearance,
  saveAvatar,
  setSlot,
  type Appearance,
  type Direction,
  type SavedAvatar,
} from '../character/appearance';
import { CATALOG, type CatalogSlot } from '../character/catalog';
import { paintAvatarPreview } from '../character/paperDoll';
import { CLOTHES_COLORS, colorCss, HAIR_COLORS, SKIN_TONES } from '../character/sheets';

type HudHandlers = {
  onAppearance: (appearance: Appearance) => void;
  onName: (name: string) => void;
};

const COLOR_SLOTS = ['skinColor', 'hairColor', 'shirtColor', 'pantsColor'] as const;
const PIECE_SLOTS: CatalogSlot[] = ['skin', 'hair', 'shirt', 'pants', 'hat', 'accessory'];
const FACINGS: Direction[] = ['down', 'right', 'up', 'left'];

type ColorSlot = (typeof COLOR_SLOTS)[number];

const SWATCHES: Record<ColorSlot, Array<[number, number, number]>> = {
  skinColor: SKIN_TONES,
  hairColor: HAIR_COLORS,
  shirtColor: CLOTHES_COLORS,
  pantsColor: CLOTHES_COLORS,
};

export class Hud {
  private readonly panel = document.querySelector('#customizer')!;
  private readonly nameInput = document.querySelector('#name-input') as HTMLInputElement;
  private readonly preview = document.querySelector('#avatar-preview') as HTMLCanvasElement | null;
  private readonly colorRoot = document.querySelector('#color-controls');
  private readonly pieceRoot = document.querySelector('#layer-controls');
  private readonly helpBtn = document.querySelector('#help-btn');
  private readonly helpPanel = document.querySelector('#help-panel');
  private readonly helpWrap = document.querySelector('.dock-slot-right');
  private readonly pieceValue = new Map<CatalogSlot, HTMLElement>();
  private readonly swatchButtons = new Map<ColorSlot, HTMLButtonElement[]>();
  private avatar: SavedAvatar;
  private previewFacing: Direction = 'down';
  private readonly handlers: HudHandlers;

  constructor(avatar: SavedAvatar, handlers: HudHandlers) {
    this.avatar = avatar;
    this.handlers = handlers;
    this.nameInput.value = avatar.name;
    this.buildColors();
    this.buildPieces();

    const randomize = document.querySelector('#randomize') as HTMLButtonElement | null;
    if (randomize) {
      randomize.hidden = false;
      randomize.onclick = () => {
        this.commit({ ...this.avatar, appearance: randomAppearance() });
      };
    }

    document.querySelector('#close-customizer')?.addEventListener('click', () => {
      this.setCustomizerOpen(false);
    });
    document.querySelector('#avatar-preview-wrap')?.addEventListener('click', () => {
      const index = FACINGS.indexOf(this.previewFacing);
      this.previewFacing = FACINGS[(index + 1) % FACINGS.length];
      this.paintPreview();
    });

    this.nameInput.addEventListener('input', () => {
      this.avatar = { ...this.avatar, name: this.nameInput.value };
      handlers.onName(this.avatar.name);
      saveAvatar(this.avatar);
    });

    this.helpBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setHelpOpen(!this.isHelpOpen());
    });
    document.addEventListener('pointerdown', (event) => {
      if (!this.isHelpOpen()) return;
      if (this.helpWrap instanceof HTMLElement && this.helpWrap.contains(event.target as Node)) return;
      this.setHelpOpen(false);
    });

    this.refresh();
  }

  toggleCustomizer(): void {
    this.setCustomizerOpen(this.panel.classList.contains('hidden'));
  }

  setCustomizerOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    if (open) {
      this.setHelpOpen(false);
      this.refresh();
      this.nameInput.focus();
    }
  }

  isHelpOpen(): boolean {
    return this.helpPanel instanceof HTMLElement && !this.helpPanel.classList.contains('hidden');
  }

  closeHelp(): boolean {
    if (!this.isHelpOpen()) return false;
    this.setHelpOpen(false);
    return true;
  }

  private setHelpOpen(open: boolean): void {
    this.helpPanel?.classList.toggle('hidden', !open);
    this.helpBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  isTyping(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  }

  private buildColors(): void {
    const root = this.colorRoot;
    if (!root) return;
    root.replaceChildren();
    for (const slot of COLOR_SLOTS) {
      const row = document.createElement('div');
      row.className = 'swatch-row';
      const label = document.createElement('span');
      label.textContent = CATALOG[slot].label;
      const tray = document.createElement('div');
      tray.className = 'swatches';
      tray.setAttribute('role', 'listbox');
      tray.setAttribute('aria-label', CATALOG[slot].label);
      const buttons: HTMLButtonElement[] = [];
      SWATCHES[slot].forEach((rgb, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'swatch';
        button.style.background = colorCss(rgb);
        button.title = slotLabel(slot, index);
        button.setAttribute('aria-label', button.title);
        if (index === 0 && (slot === 'shirtColor' || slot === 'pantsColor')) {
          button.classList.add('swatch-original');
        }
        button.addEventListener('click', () => this.pick(slot, index));
        tray.append(button);
        buttons.push(button);
      });
      this.swatchButtons.set(slot, buttons);
      row.append(label, tray);
      root.append(row);
    }
  }

  private buildPieces(): void {
    const root = this.pieceRoot;
    if (!root) return;
    root.replaceChildren();
    for (const slot of PIECE_SLOTS) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      const label = document.createElement('span');
      label.textContent = CATALOG[slot].label;
      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.textContent = '‹';
      prev.setAttribute('aria-label', `Anterior: ${CATALOG[slot].label}`);
      prev.addEventListener('click', () => this.cycle(slot, -1));
      const value = document.createElement('span');
      value.className = 'stepper-value';
      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = '›';
      next.setAttribute('aria-label', `Seguinte: ${CATALOG[slot].label}`);
      next.addEventListener('click', () => this.cycle(slot, 1));
      stepper.append(prev, value, next);
      row.append(label, stepper);
      root.append(row);
      this.pieceValue.set(slot, value);
    }
  }

  private pick(slot: CatalogSlot, value: number): void {
    this.commit({ ...this.avatar, appearance: setSlot(this.avatar.appearance, slot, value) });
  }

  private cycle(slot: CatalogSlot, step: 1 | -1): void {
    this.commit({ ...this.avatar, appearance: cycleSlot(this.avatar.appearance, slot, step) });
  }

  private commit(avatar: SavedAvatar): void {
    this.avatar = avatar;
    this.handlers.onAppearance(this.avatar.appearance);
    saveAvatar(this.avatar);
    this.refresh();
  }

  private refresh(): void {
    const look = this.avatar.appearance;
    for (const slot of COLOR_SLOTS) {
      const buttons = this.swatchButtons.get(slot);
      if (!buttons) continue;
      buttons.forEach((button, index) => {
        const on = look[slot] === index;
        button.classList.toggle('selected', on);
        button.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    for (const slot of PIECE_SLOTS) {
      const value = this.pieceValue.get(slot);
      if (value) value.textContent = pieceLabel(slot, look[slot]);
    }
    this.paintPreview();
  }

  private paintPreview(): void {
    if (!this.preview) return;
    paintAvatarPreview(this.preview, this.avatar.appearance, this.previewFacing);
  }
}

function slotLabel(slot: CatalogSlot, index: number): string {
  if ((slot === 'skinColor' || slot === 'shirtColor' || slot === 'pantsColor') && index === 0) {
    return `${CATALOG[slot].label} original`;
  }
  return `${CATALOG[slot].label} ${index + 1}`;
}

function pieceLabel(slot: CatalogSlot, value: number): string {
  const spec = CATALOG[slot];
  if (spec.optional && value === 0) return 'nenhum';
  const current = spec.optional ? value : value + 1;
  const total = spec.optional ? spec.count : spec.count;
  return `${current}/${total}`;
}
