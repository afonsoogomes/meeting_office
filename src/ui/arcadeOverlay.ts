import type { EmulatorSessionConfig } from '../../shared/game-session';

type ArcadeOverlayHandlers = {
  onRoom: (roomId: string) => void;
  onPlaying: () => void;
  onLeave: () => void;
  onNeedRoom: () => void;
};

export class ArcadeOverlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly slot: HTMLElement;
  private readonly frame: HTMLIFrameElement;
  private config: EmulatorSessionConfig | null = null;
  private readonly onWindowMessage = (event: MessageEvent) => this.onMessage(event);

  constructor(private readonly handlers: ArcadeOverlayHandlers) {
    const root = document.querySelector('#arcade-overlay');
    const title = document.querySelector('#arcade-overlay-title');
    const slot = document.querySelector('#arcade-overlay-slot');
    const frame = document.querySelector('#arcade-frame');
    if (
      !(root instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(slot instanceof HTMLElement) ||
      !(frame instanceof HTMLIFrameElement)
    ) {
      throw new Error('Arcade overlay markup missing');
    }
    this.root = root;
    this.title = title;
    this.slot = slot;
    this.frame = frame;
    document.querySelector('#arcade-overlay-leave')?.addEventListener('click', () => this.handlers.onLeave());
    window.addEventListener('message', this.onWindowMessage);
  }

  isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(config: EmulatorSessionConfig): void {
    this.config = config;
    this.title.textContent = config.gameName;
    this.slot.textContent =
      config.role === 'spectator'
        ? 'A assistir'
        : `Player ${config.playerNumber} · ${config.role === 'host' ? 'P1 (host Netplay)' : 'P2+'}`;
    this.root.classList.remove('hidden');
    this.frame.src = '/emulator/play.html';
  }

  update(config: EmulatorSessionConfig): void {
    this.config = config;
    this.slot.textContent =
      config.role === 'spectator'
        ? 'A assistir'
        : `Player ${config.playerNumber} · ${config.role === 'host' ? 'P1 (host Netplay)' : 'P2+'}`;
    this.post({ type: 'office-emulator-config', config });
  }

  close(): void {
    this.config = null;
    this.root.classList.add('hidden');
    this.frame.src = 'about:blank';
  }

  private onMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) return;
    if (event.source !== this.frame.contentWindow) return;
    const data = event.data as { type?: string; roomId?: string; index?: number; expected?: number; message?: string };
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'office-emulator-ready' && this.config) {
      this.post({ type: 'office-emulator-config', config: this.config });
      return;
    }
    if (data.type === 'office-emulator-need-room') {
      this.handlers.onNeedRoom();
      return;
    }
    if (data.type === 'office-emulator-room' && typeof data.roomId === 'string') {
      this.handlers.onRoom(data.roomId);
      return;
    }
    if (data.type === 'office-emulator-playing') {
      this.handlers.onPlaying();
      return;
    }
    if (data.type === 'office-emulator-slot' && typeof data.index === 'number') {
      if (typeof data.message === 'string' && data.message.length > 0) {
        this.slot.textContent = data.message;
        return;
      }
      const expected = typeof data.expected === 'number' ? data.expected : 0;
      const actual = data.index + 1;
      this.slot.textContent =
        data.index === expected ? `Player ${actual} no Netplay` : `Netplay slot ${actual} (esperado P${expected + 1})`;
    }
  }

  private post(message: unknown): void {
    this.frame.contentWindow?.postMessage(message, window.location.origin);
  }
}
