import { parseOfficeName, parseOfficeSlug, slugFromName, type OfficeSummary } from '../../shared/office';
import { fetchOffices, updateOffice } from '../net/office';
import { goToOffice, officeHref } from '../net/route';
import { currentOfficeName, currentOfficeSlug, setCurrentOfficeMeta } from '../world/layout';

type OfficesPanelHandlers = {
  onCreate: () => void;
  onClose: () => void;
};

export class OfficesPanel {
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly slug: HTMLInputElement;
  private readonly error: HTMLElement;
  private slugTouched = false;

  constructor(private readonly handlers: OfficesPanelHandlers) {
    const panel = document.querySelector('#offices-panel');
    const list = document.querySelector('#offices-list');
    const name = document.querySelector('#office-rename-name');
    const slug = document.querySelector('#office-rename-slug');
    const error = document.querySelector('#office-rename-error');
    if (
      !(panel instanceof HTMLElement) ||
      !(list instanceof HTMLElement) ||
      !(name instanceof HTMLInputElement) ||
      !(slug instanceof HTMLInputElement) ||
      !(error instanceof HTMLElement)
    ) {
      throw new Error('Offices panel markup missing');
    }
    this.panel = panel;
    this.list = list;
    this.name = name;
    this.slug = slug;
    this.error = error;

    document.querySelector('#close-offices')?.addEventListener('click', () => this.handlers.onClose());
    document.querySelector('#office-new')?.addEventListener('click', () => this.handlers.onCreate());
    document.querySelector('#office-rename-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.saveCurrent();
    });
    this.name.addEventListener('input', () => {
      if (!this.slugTouched) this.slug.value = slugFromName(this.name.value);
    });
    this.slug.addEventListener('input', () => {
      this.slugTouched = this.slug.value.trim().length > 0;
    });
  }

  isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  setOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    if (open) {
      this.syncCurrent();
      void this.refresh();
    }
  }

  private syncCurrent(): void {
    this.name.value = currentOfficeName();
    this.slug.value = currentOfficeSlug();
    this.slugTouched = true;
    this.error.textContent = '';
    this.error.classList.add('hidden');
  }

  private async refresh(): Promise<void> {
    const offices = await fetchOffices();
    this.render(offices);
  }

  private render(offices: OfficeSummary[]): void {
    const current = currentOfficeSlug();
    this.list.replaceChildren();
    for (const office of offices) {
      const link = document.createElement('a');
      link.className = 'office-link';
      link.href = officeHref(office.slug);
      if (office.slug === current) link.classList.add('current');
      link.innerHTML = `<strong>${escapeHtml(office.name)}</strong><span>/${office.slug}</span>`;
      this.list.append(link);
    }
    if (offices.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'panel-note';
      empty.textContent = 'Nenhum escritório ainda.';
      this.list.append(empty);
    }
  }

  private async saveCurrent(): Promise<void> {
    const name = parseOfficeName(this.name.value);
    const slug = parseOfficeSlug(this.slug.value.trim().toLowerCase());
    if (!name || !slug) {
      this.error.textContent = 'Nome ou slug inválido.';
      this.error.classList.remove('hidden');
      return;
    }
    try {
      const next = await updateOffice(currentOfficeSlug(), { name, slug });
      if (next.slug !== currentOfficeSlug()) {
        goToOffice(next.slug);
        return;
      }
      setCurrentOfficeMeta(next.slug, next.name);
      document.title = `${next.name} · Meeting Office`;
      this.error.classList.add('hidden');
      void this.refresh();
    } catch (err) {
      this.error.textContent = err instanceof Error ? err.message : 'Não deu para salvar.';
      this.error.classList.remove('hidden');
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
