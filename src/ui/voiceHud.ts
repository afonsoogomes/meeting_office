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
    const live = state.status === 'live';
    const micOff = state.status !== 'live' || state.muted;
    const micLabel =
      state.status === 'connecting'
        ? 'Conectando microfone…'
        : micOff
          ? 'Microfone mudo'
          : state.speaking
            ? 'Microfone ligado, falando'
            : 'Microfone ligado';

    setCallButton(this.mic, {
      off: micOff,
      busy: state.status === 'connecting',
      speaking: live && !state.muted && state.speaking,
      pressed: live && !state.muted,
      label: micLabel,
      title: 'Microfone (M)',
    });
    setCallButton(this.deaf, {
      off: state.deaf,
      pressed: state.deaf,
      label: state.deaf ? 'Som desligado' : 'Ouvir',
      title: 'Ouvir (K)',
    });
    setCallButton(this.camera, {
      off: !state.camera,
      pressed: state.camera,
      label: state.camera ? 'Câmera ligada' : 'Câmera desligada',
      title: 'Câmera (V)',
    });
    setCallButton(this.share, {
      off: false,
      on: state.screen,
      pressed: state.screen,
      label: state.screen ? 'Parar de compartilhar a tela' : 'Compartilhar tela',
      title: 'Compartilhar tela',
    });
  }
}

function setCallButton(
  node: Element | null,
  state: {
    off: boolean;
    on?: boolean;
    busy?: boolean;
    speaking?: boolean;
    pressed: boolean;
    label: string;
    title: string;
  },
): void {
  if (!(node instanceof HTMLElement)) return;
  node.classList.toggle('is-off', state.off);
  node.classList.toggle('is-on', state.on === true);
  node.classList.toggle('is-busy', state.busy === true);
  node.classList.toggle('is-speaking', state.speaking === true);
  node.setAttribute('aria-pressed', state.pressed ? 'true' : 'false');
  node.setAttribute('aria-label', state.label);
  node.title = `${state.title} — ${state.label}`;
}
