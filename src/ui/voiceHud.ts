import type { VoiceStatus } from '../net/voice';

type VoiceHudHandlers = {
  onMic: () => void;
  onDeaf: () => void;
};

export class VoiceHud {
  private readonly mic = document.querySelector('#mic-pill');
  private readonly deaf = document.querySelector('#deaf-pill');

  constructor(handlers: VoiceHudHandlers) {
    this.mic?.addEventListener('click', () => handlers.onMic());
    this.deaf?.addEventListener('click', () => handlers.onDeaf());
  }

  render(state: { status: VoiceStatus; muted: boolean; deaf: boolean; speaking: boolean }): void {
    if (this.mic instanceof HTMLElement) {
      this.mic.classList.toggle('pill-muted', state.status !== 'live' || state.muted);
      this.mic.classList.toggle('pill-live', state.status === 'live' && !state.muted);
      if (state.status === 'off') this.mic.textContent = 'voz off';
      else if (state.status === 'connecting') this.mic.textContent = 'voz…';
      else if (state.muted) this.mic.textContent = 'mic mudo';
      else if (state.speaking) this.mic.textContent = 'falando';
      else this.mic.textContent = 'mic';
    }
    if (this.deaf instanceof HTMLElement) {
      this.deaf.classList.toggle('pill-muted', state.deaf || state.status !== 'live');
      this.deaf.textContent = state.deaf ? 'sem som' : 'som';
    }
  }
}
