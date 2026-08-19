import {
  cycleSlot,
  randomAppearance,
  saveAvatar,
  type Appearance,
  type SavedAvatar,
} from '../character/appearance';
import { CATALOG, type CatalogSlot } from '../character/catalog';
import type { PresenceStatus } from '../net/presence';

type HudHandlers = {
  onAppearance: (appearance: Appearance) => void;
  onName: (name: string) => void;
};

const SLOT_ORDER: CatalogSlot[] = ['skin', 'hair', 'hairColor', 'shirt', 'pants', 'hat', 'accessory'];

export class Hud {
  private readonly roomPill = document.querySelector('#room-pill')!;
  private readonly presencePill = document.querySelector('#presence-pill')!;
  private readonly panel = document.querySelector('#customizer')!;
  private readonly nameInput = document.querySelector('#name-input') as HTMLInputElement;
  private avatar: SavedAvatar;
  private readonly handlers: HudHandlers;

  constructor(avatar: SavedAvatar, handlers: HudHandlers) {
    this.avatar = avatar;
    this.handlers = handlers;
    this.nameInput.value = avatar.name;

    const root = document.querySelector('#layer-controls')!;
    root.replaceChildren();

    for (const slot of SLOT_ORDER) {
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

      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = '›';
      next.addEventListener('click', () => this.cycle(slot, 1));

      stepper.append(prev, next);
      row.append(label, stepper);
      root.append(row);
    }

    const randomize = document.querySelector('#randomize') as HTMLButtonElement | null;
    if (randomize) {
      randomize.hidden = false;
      randomize.onclick = () => {
        this.avatar = { ...this.avatar, appearance: randomAppearance() };
        this.handlers.onAppearance(this.avatar.appearance);
        saveAvatar(this.avatar);
      };
    }

    document.querySelector('#close-customizer')?.addEventListener('click', () => {
      this.setCustomizerOpen(false);
    });

    this.nameInput.addEventListener('input', () => {
      this.avatar = { ...this.avatar, name: this.nameInput.value };
      handlers.onName(this.avatar.name);
      saveAvatar(this.avatar);
    });
  }

  setRoom(name: string): void {
    this.roomPill.textContent = name;
  }

  setPresence(status: PresenceStatus, people: number): void {
    if (status === 'connecting') {
      this.presencePill.textContent = 'entrando…';
      this.presencePill.classList.add('pill-muted');
      return;
    }
    if (status !== 'online') {
      this.presencePill.textContent = 'sozinho';
      this.presencePill.classList.add('pill-muted');
      return;
    }
    this.presencePill.classList.toggle('pill-muted', people <= 1);
    this.presencePill.textContent = people <= 1 ? 'só você' : `${people} no escritório`;
  }

  toggleCustomizer(): void {
    this.setCustomizerOpen(this.panel.classList.contains('hidden'));
  }

  setCustomizerOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    if (open) this.nameInput.focus();
  }

  isTyping(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  }

  private cycle(slot: CatalogSlot, step: 1 | -1): void {
    this.avatar = { ...this.avatar, appearance: cycleSlot(this.avatar.appearance, slot, step) };
    this.handlers.onAppearance(this.avatar.appearance);
    saveAvatar(this.avatar);
  }
}
