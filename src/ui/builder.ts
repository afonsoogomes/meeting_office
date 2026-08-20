import type Phaser from 'phaser';
import {
  CATALOG_GROUPS,
  catalogInGroup,
  spriteFor,
  type FurnitureGroup,
  type FurnitureKind,
} from '../world/furniture';

export type BuilderHandlers = {
  onSelect: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
};

export class BuilderPanel {
  private readonly panel = document.querySelector('#builder')!;
  private readonly catalogEl = document.querySelector('#builder-catalog')!;
  private readonly groupsEl = document.querySelector('#builder-groups')!;
  private readonly searchEl = document.querySelector('#builder-search') as HTMLInputElement;
  private readonly hintsEl = document.querySelector('#help-hints');
  private selected = 'chair';
  private group: FurnitureGroup | 'all' = 'seat';
  private scene: Phaser.Scene | null = null;
  private readonly iconUrls = new Map<string, string>();
  private readonly handlers: BuilderHandlers;

  constructor(handlers: BuilderHandlers) {
    this.handlers = handlers;
    this.setHints(false);

    document.querySelector('#close-builder')?.addEventListener('click', () => {
      this.handlers.onClose();
    });
    document.querySelector('#reset-furniture')?.addEventListener('click', () => {
      this.handlers.onReset();
    });
    this.searchEl.addEventListener('input', () => this.renderCatalog());
  }

  fillIcons(scene: Phaser.Scene): void {
    this.scene = scene;
    this.groupsEl.replaceChildren();
    for (const group of CATALOG_GROUPS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalog-group';
      button.textContent = group.label;
      button.dataset.group = group.id;
      button.addEventListener('click', () => {
        this.group = group.id;
        this.syncGroups();
        this.renderCatalog();
      });
      this.groupsEl.append(button);
    }
    this.syncGroups();
    this.renderCatalog();
  }

  select(id: string): void {
    this.selected = id;
    this.syncSelected();
    this.handlers.onSelect(id);
  }

  selectedId(): string {
    return this.selected;
  }

  isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  setOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    this.setHints(open);
    if (open) this.renderCatalog();
  }

  private renderCatalog(): void {
    if (!this.scene) return;
    const items = catalogInGroup(this.searchEl.value.trim() ? 'all' : this.group, this.searchEl.value);
    this.catalogEl.replaceChildren();
    for (const kind of items) {
      this.catalogEl.append(this.makeButton(kind));
    }
    this.syncSelected();
  }

  private makeButton(kind: FurnitureKind): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-item';
    button.title = kind.label;
    button.dataset.id = kind.id;

    const img = document.createElement('img');
    img.alt = kind.label;
    img.src = this.iconUrl(kind.id);
    img.width = 48;
    img.height = 48;

    const caption = document.createElement('span');
    caption.textContent = kind.label;

    button.append(img, caption);
    button.addEventListener('click', () => this.select(kind.id));
    return button;
  }

  private iconUrl(id: string): string {
    const cached = this.iconUrls.get(id);
    if (cached) return cached;
    if (!this.scene) return '';
    const url = catalogIconUrl(this.scene, id);
    this.iconUrls.set(id, url);
    return url;
  }

  private syncGroups(): void {
    for (const button of this.groupsEl.querySelectorAll<HTMLButtonElement>('.catalog-group')) {
      button.classList.toggle('selected', button.dataset.group === this.group);
    }
  }

  private syncSelected(): void {
    for (const button of this.catalogEl.querySelectorAll<HTMLButtonElement>('.catalog-item')) {
      button.classList.toggle('selected', button.dataset.id === this.selected);
    }
  }

  private setHints(building: boolean): void {
    if (!(this.hintsEl instanceof HTMLElement)) return;
    this.hintsEl.replaceChildren();
    const hints = building
      ? [
          ['F / Esc', 'sair'],
          ['clique', 'colocar'],
          ['R / scroll', 'girar'],
          ['botão direito', 'girar peça'],
          ['X', 'apagar'],
        ]
      : [
          ['clique', 'andar'],
          ['WASD / setas', 'andar'],
          ['Shift', 'correr'],
          ['E', 'sentar / TV / fliperama'],
          ['G', 'acenar'],
          ['C', 'avatar'],
          ['F', 'móveis'],
          ['Enter', 'falar'],
          ['M', 'mic'],
          ['V', 'câmera'],
          ['K', 'ouvir'],
          ['scroll', 'zoom'],
        ];
    for (const [key, label] of hints) {
      const span = document.createElement('span');
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      span.append(kbd, ` ${label}`);
      this.hintsEl.append(span);
    }
  }
}

function catalogIconUrl(scene: Phaser.Scene, item: string): string {
  const { key, flipX } = spriteFor({ item, col: 0, row: 0 });
  const texture = scene.textures.get(key);
  const frame = texture.get();
  const src = texture.getSourceImage() as CanvasImageSource;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, frame.width);
  canvas.height = Math.max(1, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  if (flipX) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
