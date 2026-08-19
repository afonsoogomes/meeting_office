import { CHAT_MAX, sanitizeChat } from '../../shared/protocol';

const LOG_CAP = 40;

export class RoomChat {
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private lastAt = 0;

  constructor(onSend: (text: string) => void) {
    const log = document.querySelector('#chat-log');
    const form = document.querySelector('#chat-form');
    const input = document.querySelector('#chat-input');
    if (!(log instanceof HTMLElement) || !(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
      throw new Error('Chat markup missing');
    }
    this.log = log;
    this.input = input;
    this.input.maxLength = CHAT_MAX;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = sanitizeChat(this.input.value);
      if (!text) return;
      const now = performance.now();
      if (now - this.lastAt < 400) return;
      this.lastAt = now;
      this.input.value = '';
      this.input.blur();
      onSend(text);
    });

    this.input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      this.input.blur();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.repeat || event.isComposing) return;
      if (event.target === this.input) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      this.input.focus();
    });
  }

  append(name: string, text: string): void {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const who = document.createElement('strong');
    who.textContent = name;
    line.append(who, document.createTextNode(` ${text}`));
    this.log.append(line);
    while (this.log.childElementCount > LOG_CAP) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}
