import type { VoiceStatus } from '../net/voice';

type VoiceHudHandlers = {
  onMic: () => void;
  onDeaf: () => void;
  onCamera: () => void;
  onShare: () => void;
};

export class VoiceHud {
  private readonly mic = document.querySelector('#mic-pill');
  private readonly deaf = document.querySelector('#deaf-pill');
  private readonly camera = document.querySelector('#cam-pill');
  private readonly share = document.querySelector('#share-pill');

  constructor(handlers: VoiceHudHandlers) {
    this.mic?.addEventListener('click', () => handlers.onMic());
    this.deaf?.addEventListener('click', () => handlers.onDeaf());
    this.camera?.addEventListener('click', () => handlers.onCamera());
    this.share?.addEventListener('click', () => handlers.onShare());
  }

  render(state: {
    status: VoiceStatus;
    muted: boolean;
    deaf: boolean;
    speaking: boolean;
    camera: boolean;
    screen: boolean;
  }): void {
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
    if (this.camera instanceof HTMLElement) {
      this.camera.classList.toggle('pill-muted', !state.camera);
      this.camera.classList.toggle('pill-live', state.camera);
      this.camera.textContent = state.camera ? 'câmera on' : 'câmera';
    }
    if (this.share instanceof HTMLElement) {
      this.share.classList.toggle('pill-muted', !state.screen);
      this.share.classList.toggle('pill-live', state.screen);
      this.share.textContent = state.screen ? 'tela on' : 'tela';
    }
  }
}
