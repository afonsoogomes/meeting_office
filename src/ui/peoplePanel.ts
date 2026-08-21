export type PersonVolume = {
  guestId: string;
  name: string;
  speaking: boolean;
  volume: number;
};

type PeoplePanelHandlers = {
  onVolume: (guestId: string, volume: number) => void;
  onClose: () => void;
};

export class PeoplePanel {
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly previous = new Map<string, number>();
  private ids = '';
  private focusId: string | null = null;

  constructor(private readonly handlers: PeoplePanelHandlers) {
    const panel = document.querySelector('#people-panel');
    const list = document.querySelector('#people-list');
    const empty = document.querySelector('#people-empty');
    if (!(panel instanceof HTMLElement) || !(list instanceof HTMLElement) || !(empty instanceof HTMLElement)) {
      throw new Error('People panel markup missing');
    }
    this.panel = panel;
    this.list = list;
    this.empty = empty;
    document.querySelector('#close-people')?.addEventListener('click', () => this.handlers.onClose());
  }

  isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  setOpen(open: boolean, focusId?: string): void {
    this.panel.classList.toggle('hidden', !open);
    if (open) {
      this.focusId = focusId ?? this.focusId;
      this.revealFocus();
    } else {
      this.focusId = null;
    }
  }

  focusPerson(guestId: string): void {
    this.focusId = guestId;
    if (!this.isOpen()) this.setOpen(true, guestId);
    else this.revealFocus();
  }

  sync(people: PersonVolume[]): void {
    const ids = people.map((person) => person.guestId).join(',');
    if (ids !== this.ids) {
      this.ids = ids;
      this.rebuild(people);
      return;
    }
    for (const person of people) this.refreshRow(person);
  }

  private rebuild(people: PersonVolume[]): void {
    this.rows.clear();
    this.list.replaceChildren();
    this.empty.classList.toggle('hidden', people.length > 0);
    for (const person of people) {
      const row = this.makeRow(person);
      this.rows.set(person.guestId, row);
      this.list.append(row);
    }
    this.revealFocus();
  }

  private makeRow(person: PersonVolume): HTMLElement {
    const row = document.createElement('div');
    row.className = 'people-row';
    row.dataset.guestId = person.guestId;

    const name = document.createElement('p');
    name.className = 'people-name';

    const mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'people-mute';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.className = 'people-slider';
    slider.setAttribute('aria-label', `Volume de ${person.name}`);

    const level = document.createElement('span');
    level.className = 'people-level';

    slider.addEventListener('input', () => {
      const volume = Number(slider.value) / 100;
      if (volume > 0) this.previous.set(person.guestId, volume);
      this.handlers.onVolume(person.guestId, volume);
    });
    mute.addEventListener('click', () => {
      const current = Number(slider.value) / 100;
      const next = current > 0 ? 0 : (this.previous.get(person.guestId) ?? 1);
      if (current > 0) this.previous.set(person.guestId, current);
      this.handlers.onVolume(person.guestId, next);
    });

    row.append(name, mute, slider, level);
    this.paintRow(row, person);
    return row;
  }

  private refreshRow(person: PersonVolume): void {
    const row = this.rows.get(person.guestId);
    if (row) this.paintRow(row, person);
  }

  private paintRow(row: HTMLElement, person: PersonVolume): void {
    const name = row.querySelector('.people-name');
    const mute = row.querySelector('.people-mute');
    const slider = row.querySelector('.people-slider');
    const level = row.querySelector('.people-level');
    if (name) name.textContent = person.name;
    row.classList.toggle('is-speaking', person.speaking);
    row.classList.toggle('is-quiet', person.volume <= 0);
    row.classList.toggle('is-focus', this.focusId === person.guestId);
    if (mute instanceof HTMLButtonElement) {
      const quiet = person.volume <= 0;
      mute.textContent = quiet ? 'Som' : 'Mudo';
      mute.setAttribute('aria-pressed', quiet ? 'true' : 'false');
      mute.title = quiet ? 'Voltar a ouvir' : 'Mudo só pra você';
    }
    if (slider instanceof HTMLInputElement && document.activeElement !== slider) {
      slider.value = String(Math.round(person.volume * 100));
      slider.setAttribute('aria-label', `Volume de ${person.name}`);
    }
    if (level) {
      const shown =
        slider instanceof HTMLInputElement && document.activeElement === slider
          ? Number(slider.value)
          : Math.round(person.volume * 100);
      level.textContent = `${shown}%`;
    }
  }

  private revealFocus(): void {
    if (!this.focusId) return;
    const row = this.rows.get(this.focusId);
    if (!(row instanceof HTMLElement)) return;
    for (const item of this.rows.values()) item.classList.toggle('is-focus', item === row);
    row.scrollIntoView({ block: 'nearest' });
  }
}
