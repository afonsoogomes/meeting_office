import {
  cycleSlot,
  randomAppearance,
  setSlot,
  type Appearance,
  type Direction,
} from '../character/appearance';
import { CATALOG, type CatalogSlot } from '../character/catalog';
import { paintAvatarPreview } from '../character/paperDoll';
import { CLOTHES_COLORS, colorCss, HAIR_COLORS, SKIN_TONES } from '../character/sheets';
import { NAME_MAX, NPC_LINE_MAX, type Facing, type NpcPlacement } from '../../shared/protocol';

export type NpcDraft = {
  id?: string;
  name: string;
  line: string;
  appearance: Appearance;
  facing: Facing;
  col: number;
  row: number;
};

type NpcPanelHandlers = {
  onClose: () => void;
  onPlace: (draft: NpcDraft) => void;
  onSave: (draft: NpcDraft) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
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

export class NpcPanel {
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  private readonly form: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly lineInput: HTMLTextAreaElement;
  private readonly preview: HTMLCanvasElement;
  private readonly placeBtn: HTMLButtonElement;
  private readonly removeBtn: HTMLButtonElement;
  private readonly colorRoot: HTMLElement;
  private readonly pieceRoot: HTMLElement;
  private readonly pieceValue = new Map<CatalogSlot, HTMLElement>();
  private readonly swatchButtons = new Map<ColorSlot, HTMLButtonElement[]>();
  private readonly handlers: NpcPanelHandlers;
  private npcs: NpcPlacement[] = [];
  private draft: NpcDraft | null = null;
  private placing = false;
  private previewFacing: Direction = 'down';
  private saveTimer = 0;

  constructor(handlers: NpcPanelHandlers) {
    const panel = document.querySelector('#npc-panel');
    const list = document.querySelector('#npc-list');
    const form = document.querySelector('#npc-form');
    const empty = document.querySelector('#npc-empty');
    const nameInput = document.querySelector('#npc-name');
    const lineInput = document.querySelector('#npc-line');
    const preview = document.querySelector('#npc-preview');
    const placeBtn = document.querySelector('#npc-place');
    const removeBtn = document.querySelector('#npc-remove');
    const colorRoot = document.querySelector('#npc-color-controls');
    const pieceRoot = document.querySelector('#npc-layer-controls');
    if (
      !(panel instanceof HTMLElement) ||
      !(list instanceof HTMLElement) ||
      !(form instanceof HTMLElement) ||
      !(empty instanceof HTMLElement) ||
      !(nameInput instanceof HTMLInputElement) ||
      !(lineInput instanceof HTMLTextAreaElement) ||
      !(preview instanceof HTMLCanvasElement) ||
      !(placeBtn instanceof HTMLButtonElement) ||
      !(removeBtn instanceof HTMLButtonElement) ||
      !(colorRoot instanceof HTMLElement) ||
      !(pieceRoot instanceof HTMLElement)
    ) {
      throw new Error('NPC panel markup missing');
    }
    this.panel = panel;
    this.list = list;
    this.form = form;
    this.empty = empty;
    this.nameInput = nameInput;
    this.lineInput = lineInput;
    this.preview = preview;
    this.placeBtn = placeBtn;
    this.removeBtn = removeBtn;
    this.colorRoot = colorRoot;
    this.pieceRoot = pieceRoot;
    this.handlers = handlers;

    this.buildColors();
    this.buildPieces();

    document.querySelector('#close-npcs')?.addEventListener('click', () => this.handlers.onClose());
    document.querySelector('#npc-new')?.addEventListener('click', () => this.startNew());
    document.querySelector('#npc-random')?.addEventListener('click', () => {
      if (!this.draft) return;
      this.patch({ appearance: randomAppearance() }, true);
    });
    document.querySelector('#npc-preview-wrap')?.addEventListener('click', () => {
      const index = FACINGS.indexOf(this.previewFacing);
      this.previewFacing = FACINGS[(index + 1) % FACINGS.length];
      this.paintPreview();
    });
    this.nameInput.addEventListener('input', () => {
      this.patch({ name: this.nameInput.value.slice(0, NAME_MAX) }, true);
    });
    this.lineInput.addEventListener('input', () => {
      this.patch({ line: this.lineInput.value.slice(0, NPC_LINE_MAX) }, true);
    });
    this.placeBtn.addEventListener('click', () => {
      if (!this.draft) return;
      this.placing = true;
      this.syncPlaceButton();
      this.handlers.onPlace(this.draft);
    });
    this.removeBtn.addEventListener('click', () => {
      if (!this.draft?.id) return;
      this.handlers.onRemove(this.draft.id);
    });
  }

  isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  isPlacing(): boolean {
    return this.isOpen() && this.placing && this.draft !== null;
  }

  selectedId(): string | null {
    return this.draft?.id ?? null;
  }

  currentDraft(): NpcDraft | null {
    return this.draft ? { ...this.draft, appearance: { ...this.draft.appearance } } : null;
  }

  rotateFacing(): Facing | null {
    if (!this.draft) return null;
    const index = FACINGS.indexOf(this.draft.facing);
    const facing = FACINGS[(index + 1) % FACINGS.length];
    this.patch({ facing }, Boolean(this.draft.id));
    this.previewFacing = facing;
    this.paintPreview();
    return facing;
  }

  setOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    if (!open) {
      this.placing = false;
      this.syncPlaceButton();
      return;
    }
    this.renderList();
  }

  setNpcs(npcs: NpcPlacement[]): void {
    this.npcs = npcs;
    if (this.draft?.id && !npcs.some((npc) => npc.id === this.draft?.id)) {
      this.draft = null;
      this.placing = false;
    }
    if (this.draft?.id) {
      const live = npcs.find((npc) => npc.id === this.draft?.id);
      if (live && !this.placing) this.draft = fromPlacement(live);
    } else if (this.draft && !this.placing) {
      const spawned = npcs.find(
        (npc) => npc.col === this.draft?.col && npc.row === this.draft?.row && npc.name === this.draft?.name,
      );
      if (spawned) this.draft = fromPlacement(spawned);
    }
    this.renderList();
    this.syncForm();
  }

  edit(id: string): void {
    const npc = this.npcs.find((item) => item.id === id);
    if (!npc) return;
    this.draft = fromPlacement(npc);
    this.placing = false;
    this.previewFacing = npc.facing;
    this.handlers.onSelect(id);
    this.setOpen(true);
    this.syncForm();
    this.renderList();
  }

  placed(col: number, row: number): void {
    if (!this.draft) return;
    this.patch({ col, row }, false);
    this.placing = false;
    this.syncPlaceButton();
  }

  private startNew(): void {
    const appearance = randomAppearance();
    this.draft = {
      name: 'Colega',
      line: '',
      appearance,
      facing: 'down',
      col: 0,
      row: 0,
    };
    this.placing = true;
    this.previewFacing = 'down';
    this.handlers.onSelect(null);
    this.handlers.onPlace(this.draft);
    this.syncForm();
    this.renderList();
    this.nameInput.focus();
    this.nameInput.select();
  }

  private patch(next: Partial<NpcDraft>, persist: boolean): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, ...next };
    if (persist && this.draft.id) this.scheduleSave();
    this.syncForm();
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (this.draft?.id) this.handlers.onSave(this.draft);
    }, 180);
  }

  private renderList(): void {
    this.list.replaceChildren();
    this.empty.classList.toggle('hidden', this.npcs.length > 0);
    for (const npc of this.npcs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'npc-row';
      if (this.draft?.id === npc.id) button.classList.add('current');
      const name = document.createElement('strong');
      name.textContent = npc.name;
      const line = document.createElement('span');
      line.textContent = npc.line.length > 0 ? npc.line : 'sem frase';
      button.append(name, line);
      button.addEventListener('click', () => this.edit(npc.id));
      this.list.append(button);
    }
  }

  private syncForm(): void {
    const draft = this.draft;
    this.form.classList.toggle('hidden', !draft);
    if (!draft) {
      this.placing = false;
      return;
    }
    if (this.nameInput.value !== draft.name) this.nameInput.value = draft.name;
    if (this.lineInput.value !== draft.line) this.lineInput.value = draft.line;
    this.removeBtn.hidden = !draft.id;
    this.syncPlaceButton();
    this.refreshLook();
  }

  private syncPlaceButton(): void {
    if (!this.draft) return;
    if (this.placing) {
      this.placeBtn.textContent = 'Clique no chão…';
      this.placeBtn.disabled = true;
      return;
    }
    this.placeBtn.disabled = false;
    this.placeBtn.textContent = this.draft.id ? 'Mover no mapa' : 'Colocar no mapa';
  }

  private buildColors(): void {
    this.colorRoot.replaceChildren();
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
        button.title = `${CATALOG[slot].label} ${index + 1}`;
        if (index === 0 && (slot === 'shirtColor' || slot === 'pantsColor')) {
          button.classList.add('swatch-original');
        }
        button.addEventListener('click', () => {
          if (!this.draft) return;
          this.patch({ appearance: setSlot(this.draft.appearance, slot, index) }, true);
        });
        tray.append(button);
        buttons.push(button);
      });
      row.append(label, tray);
      this.colorRoot.append(row);
      this.swatchButtons.set(slot, buttons);
    }
  }

  private buildPieces(): void {
    this.pieceRoot.replaceChildren();
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
      prev.addEventListener('click', () => this.cycle(slot, -1));
      const value = document.createElement('span');
      value.className = 'stepper-value';
      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = '›';
      next.addEventListener('click', () => this.cycle(slot, 1));
      stepper.append(prev, value, next);
      row.append(label, stepper);
      this.pieceRoot.append(row);
      this.pieceValue.set(slot, value);
    }
  }

  private cycle(slot: CatalogSlot, step: 1 | -1): void {
    if (!this.draft) return;
    this.patch({ appearance: cycleSlot(this.draft.appearance, slot, step) }, true);
  }

  private refreshLook(): void {
    const look = this.draft?.appearance;
    if (!look) return;
    for (const slot of COLOR_SLOTS) {
      const buttons = this.swatchButtons.get(slot);
      if (!buttons) continue;
      buttons.forEach((button, index) => {
        const on = look[slot] === index;
        button.classList.toggle('selected', on);
      });
    }
    for (const slot of PIECE_SLOTS) {
      const value = this.pieceValue.get(slot);
      if (value) value.textContent = pieceLabel(slot, look[slot]);
    }
    this.paintPreview();
  }

  private paintPreview(): void {
    if (!this.draft) return;
    paintAvatarPreview(this.preview, this.draft.appearance, this.previewFacing);
  }
}

function fromPlacement(npc: NpcPlacement): NpcDraft {
  return {
    id: npc.id,
    name: npc.name,
    line: npc.line,
    appearance: { ...npc.appearance },
    facing: npc.facing,
    col: npc.col,
    row: npc.row,
  };
}

function pieceLabel(slot: CatalogSlot, value: number): string {
  const spec = CATALOG[slot];
  if (spec.optional && value === 0) return 'nenhum';
  const current = spec.optional ? value : value + 1;
  return `${current}/${spec.count}`;
}
