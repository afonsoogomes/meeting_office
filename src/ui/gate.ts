import { needsName, saveAvatar, type SavedAvatar } from '../character/appearance';

const MIN_NAME = 2;

export function promptName(avatar: SavedAvatar): Promise<SavedAvatar> {
  const gate = document.querySelector('#gate');
  const form = document.querySelector('#gate-form');
  const input = document.querySelector('#gate-name');
  if (!(gate instanceof HTMLElement) || !(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
    throw new Error('Name gate markup missing');
  }

  gate.classList.remove('hidden');
  input.value = needsName(avatar) ? '' : avatar.name;
  input.focus();

  return new Promise((resolve) => {
    const onSubmit = (event: Event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name.length < MIN_NAME) {
        input.setCustomValidity('Digite pelo menos 2 letras');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      form.removeEventListener('submit', onSubmit);
      const next = { ...avatar, name };
      saveAvatar(next);
      gate.classList.add('hidden');
      resolve(next);
    };
    form.addEventListener('submit', onSubmit);
  });
}
