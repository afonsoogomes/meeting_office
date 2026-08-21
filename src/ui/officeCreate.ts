import { parseOfficeName, parseOfficeSlug, slugFromName } from '../../shared/office';
import { createOffice } from '../net/office';
import { goToOffice } from '../net/route';

export type CreateOfficeOptions = {
  title: string;
  copy: string;
  slug?: string | null;
};

export function promptCreateOffice(options: CreateOfficeOptions): Promise<void> {
  const gate = document.querySelector('#office-create');
  const form = document.querySelector('#office-create-form');
  const title = document.querySelector('#office-create-title');
  const copy = document.querySelector('#office-create-copy');
  const name = document.querySelector('#office-create-name');
  const slug = document.querySelector('#office-create-slug');
  const error = document.querySelector('#office-create-error');
  const cancel = document.querySelector('#office-create-cancel');
  if (
    !(gate instanceof HTMLElement) ||
    !(form instanceof HTMLFormElement) ||
    !(title instanceof HTMLElement) ||
    !(copy instanceof HTMLElement) ||
    !(name instanceof HTMLInputElement) ||
    !(slug instanceof HTMLInputElement) ||
    !(error instanceof HTMLElement) ||
    !(cancel instanceof HTMLButtonElement)
  ) {
    throw new Error('Office create markup missing');
  }

  title.textContent = options.title;
  copy.textContent = options.copy;
  name.value = '';
  slug.value = options.slug ?? '';
  let slugTouched = Boolean(options.slug);
  error.textContent = '';
  error.classList.add('hidden');
  gate.classList.remove('hidden');
  name.focus();

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      form.removeEventListener('submit', onSubmit);
      name.removeEventListener('input', onName);
      slug.removeEventListener('input', onSlug);
      cancel.removeEventListener('click', onCancel);
    };

    const onName = (): void => {
      if (slugTouched) return;
      slug.value = slugFromName(name.value);
    };

    const onSlug = (): void => {
      slugTouched = slug.value.trim().length > 0;
    };

    const onCancel = (): void => {
      cleanup();
      gate.classList.add('hidden');
      reject(new Error('cancelled'));
    };

    const onSubmit = (event: Event): void => {
      event.preventDefault();
      const parsedName = parseOfficeName(name.value);
      const parsedSlug = parseOfficeSlug(slug.value.trim().toLowerCase());
      if (!parsedName) {
        name.setCustomValidity('Digite pelo menos 2 letras');
        name.reportValidity();
        return;
      }
      name.setCustomValidity('');
      if (!parsedSlug) {
        slug.setCustomValidity('Use letras minúsculas, números e hífen');
        slug.reportValidity();
        return;
      }
      slug.setCustomValidity('');
      error.classList.add('hidden');
      const button = form.querySelector('button[type="submit"]');
      if (button instanceof HTMLButtonElement) button.disabled = true;
      void createOffice(parsedName, parsedSlug)
        .then((office) => {
          cleanup();
          goToOffice(office.slug);
          resolve();
        })
        .catch((err: unknown) => {
          if (button instanceof HTMLButtonElement) button.disabled = false;
          error.textContent = err instanceof Error ? err.message : 'Não deu para criar.';
          error.classList.remove('hidden');
        });
    };

    form.addEventListener('submit', onSubmit);
    name.addEventListener('input', onName);
    slug.addEventListener('input', onSlug);
    cancel.addEventListener('click', onCancel);
  });
}
