import {
  isActiveSession,
  isWatchReady,
  seatedPlayers,
  spectatorMembers,
  type GameCatalogItem,
  type GameSessionView,
} from '../../shared/game-session';

type ArcadePanelHandlers = {
  onCreate: (gameId: string) => void;
  onJoin: (sessionId: string) => void;
  onWatch: (sessionId: string) => void;
  onReady: () => void;
  onStart: () => void;
  onOpenEmulator: () => void;
  onLeave: () => void;
  onCancel: () => void;
};

export class ArcadePanel {
  private readonly panel: HTMLElement;
  private readonly note: HTMLElement;
  private readonly gamesEl: HTMLElement;
  private readonly roomsEl: HTMLElement;
  private readonly playersEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly createBtn: HTMLButtonElement;
  private readonly readyBtn: HTMLButtonElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private catalog: GameCatalogItem[] = [];
  private sessions: GameSessionView[] = [];
  private session: GameSessionView | null = null;
  private guestId = '';
  private selectedGameId = '';
  private busy = false;

  constructor(private readonly handlers: ArcadePanelHandlers) {
    const panel = document.querySelector('#arcade-panel');
    const note = document.querySelector('#arcade-note');
    const gamesEl = document.querySelector('#arcade-games');
    const roomsEl = document.querySelector('#arcade-rooms');
    const playersEl = document.querySelector('#arcade-players');
    const errorEl = document.querySelector('#arcade-error');
    const createBtn = document.querySelector('#arcade-create');
    const readyBtn = document.querySelector('#arcade-ready');
    const startBtn = document.querySelector('#arcade-start');
    const playBtn = document.querySelector('#arcade-play');
    const leaveBtn = document.querySelector('#arcade-leave-lobby');
    const cancelBtn = document.querySelector('#arcade-cancel');
    if (
      !(panel instanceof HTMLElement) ||
      !(note instanceof HTMLElement) ||
      !(gamesEl instanceof HTMLElement) ||
      !(roomsEl instanceof HTMLElement) ||
      !(playersEl instanceof HTMLElement) ||
      !(errorEl instanceof HTMLElement) ||
      !(createBtn instanceof HTMLButtonElement) ||
      !(readyBtn instanceof HTMLButtonElement) ||
      !(startBtn instanceof HTMLButtonElement) ||
      !(playBtn instanceof HTMLButtonElement) ||
      !(leaveBtn instanceof HTMLButtonElement) ||
      !(cancelBtn instanceof HTMLButtonElement)
    ) {
      throw new Error('Arcade panel markup missing');
    }
    this.panel = panel;
    this.note = note;
    this.gamesEl = gamesEl;
    this.roomsEl = roomsEl;
    this.playersEl = playersEl;
    this.errorEl = errorEl;
    this.createBtn = createBtn;
    this.readyBtn = readyBtn;
    this.startBtn = startBtn;
    this.playBtn = playBtn;
    this.leaveBtn = leaveBtn;
    this.cancelBtn = cancelBtn;

    createBtn.addEventListener('click', () => {
      if (!this.selectedGameId) {
        this.setError('Escolhe um jogo SNES com ROM no servidor.');
        return;
      }
      this.handlers.onCreate(this.selectedGameId);
    });
    readyBtn.addEventListener('click', () => this.handlers.onReady());
    startBtn.addEventListener('click', () => this.handlers.onStart());
    playBtn.addEventListener('click', () => this.handlers.onOpenEmulator());
    leaveBtn.addEventListener('click', () => this.handlers.onLeave());
    cancelBtn.addEventListener('click', () => this.handlers.onCancel());
    document.querySelector('#close-arcade')?.addEventListener('click', () => this.setOpen(false));
  }

  isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  setOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }

  setError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.classList.toggle('hidden', message.length === 0);
  }

  open(guestId: string, catalog: GameCatalogItem[], sessions: GameSessionView[], mine: GameSessionView | null): void {
    this.guestId = guestId;
    this.catalog = catalog;
    this.sessions = sessions.filter((session) => isActiveSession(session.status));
    this.session = mine && isActiveSession(mine.status) ? mine : null;
    this.setError('');
    if (!this.selectedGameId) {
      this.selectedGameId = catalog.find((game) => game.enabled)?.id ?? '';
    }
    this.setOpen(true);
    this.render();
  }

  setSessions(sessions: GameSessionView[], mine: GameSessionView | null): void {
    this.sessions = sessions.filter((session) => isActiveSession(session.status));
    this.session = mine && isActiveSession(mine.status) ? mine : null;
    this.render();
  }

  setCatalog(catalog: GameCatalogItem[]): void {
    this.catalog = catalog;
    this.render();
  }

  private me(): GameSessionView['players'][number] | undefined {
    return this.session?.players.find((player) => player.guestId === this.guestId);
  }

  private render(): void {
    const session = this.session;
    const me = this.me();
    const inSession = Boolean(me);
    const host = session?.hostGuestId === this.guestId;
    const spectator = me?.role === 'spectator';
    const seated = session ? seatedPlayers(session.players) : [];
    const watchers = session ? spectatorMembers(session.players) : [];
    const canPlay = Boolean(session && (session.status === 'starting' || session.status === 'playing'));
    const watchReady = Boolean(session && (session.watchReady || isWatchReady(session)));

    this.gamesEl.replaceChildren();
    this.roomsEl.replaceChildren();
    this.playersEl.replaceChildren();

    if (!session) {
      this.note.textContent =
        'Cria uma sala (dá para jogar sozinho) ou entra numa que já exista. Assistir não ocupa P1–P4.';
      for (const game of this.catalog) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'catalog-item';
        if (game.id === this.selectedGameId) button.classList.add('selected');
        button.disabled = !game.enabled || this.busy;
        button.title = game.enabled
          ? `1–${game.maxPlayers} jogadores`
          : 'Coloque a ROM em server/data/roms/';
        const title = document.createElement('strong');
        title.textContent = game.name;
        const meta = document.createElement('span');
        meta.textContent = game.enabled ? `SNES · 1–${game.maxPlayers}P` : 'sem ROM';
        button.append(title, meta);
        button.addEventListener('click', () => {
          if (!game.enabled) return;
          this.selectedGameId = game.id;
          this.render();
        });
        this.gamesEl.append(button);
      }
      this.renderRooms();
    } else {
      const extra = watchers.length > 0 ? ` · ${watchers.length} a assistir` : '';
      this.note.textContent = `${session.gameName} · ${statusLabel(session.status)} · ${seated.length}/${session.maxPlayers}${extra}`;
      for (let seat = 1; seat <= session.maxPlayers; seat += 1) {
        const player = seated.find((item) => item.playerNumber === seat);
        const row = document.createElement('div');
        row.className = 'arcade-seat';
        const who = player ? player.name : 'vazio';
        row.textContent = `Player ${seat} · ${who}${player ? ` · ${playerStatusLabel(player.status)}` : ''}`;
        this.playersEl.append(row);
      }
      for (const watcher of watchers) {
        const row = document.createElement('div');
        row.className = 'arcade-seat spectator';
        row.textContent = `A assistir · ${watcher.name}`;
        this.playersEl.append(row);
      }
    }

    const othersReady = seated
      .filter((player) => player.guestId !== this.guestId)
      .every((player) => player.status === 'ready');
    const canHostStart =
      Boolean(host) &&
      session?.status === 'waiting' &&
      seated.length >= (session.minPlayers ?? 1) &&
      othersReady;

    this.createBtn.classList.toggle('hidden', Boolean(session));
    this.readyBtn.classList.toggle('hidden', !inSession || spectator || !session || session.status !== 'waiting');
    this.startBtn.classList.toggle('hidden', !canHostStart);
    this.playBtn.classList.toggle(
      'hidden',
      !inSession ||
        !session ||
        (spectator ? !watchReady : !canPlay),
    );
    this.leaveBtn.classList.toggle('hidden', !inSession);
    this.cancelBtn.classList.toggle('hidden', !host || !session || session.status === 'playing');

    this.createBtn.disabled = this.busy || !this.selectedGameId;
    this.readyBtn.disabled = this.busy || me?.status === 'ready' || me?.status === 'connected';
    this.startBtn.disabled = this.busy;
    this.playBtn.disabled = this.busy;
    this.leaveBtn.disabled = this.busy;
    this.cancelBtn.disabled = this.busy;

    this.readyBtn.textContent = me?.status === 'ready' ? 'Pronto' : 'Estou pronto';
    this.playBtn.textContent = spectator ? 'Assistir' : 'Abrir fliperama';
  }

  private renderRooms(): void {
    if (this.sessions.length === 0) return;
    const heading = document.createElement('p');
    heading.className = 'arcade-rooms-label';
    heading.textContent = 'Salas abertas';
    this.roomsEl.append(heading);
    for (const room of this.sessions) {
      const seated = seatedPlayers(room.players);
      const watchers = spectatorMembers(room.players);
      const host = seated.find((player) => player.playerNumber === 1);
      const full = seated.length >= room.maxPlayers;
      const card = document.createElement('div');
      card.className = 'arcade-room';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = room.gameName;
      const meta = document.createElement('span');
      const watchLabel = watchers.length > 0 ? ` · ${watchers.length} a assistir` : '';
      meta.textContent = `${host?.name ?? 'sala'} · ${seated.length}/${room.maxPlayers} · ${statusLabel(room.status)}${watchLabel}`;
      info.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'arcade-room-actions';
      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.textContent = 'Entrar';
      joinBtn.disabled = this.busy || full || room.status === 'starting' || room.status === 'playing';
      joinBtn.addEventListener('click', () => this.handlers.onJoin(room.id));
      const watchBtn = document.createElement('button');
      watchBtn.type = 'button';
      watchBtn.className = 'ghost';
      watchBtn.textContent = 'Assistir';
      watchBtn.disabled = this.busy;
      watchBtn.addEventListener('click', () => this.handlers.onWatch(room.id));
      actions.append(joinBtn, watchBtn);
      card.append(info, actions);
      this.roomsEl.append(card);
    }
  }
}

function statusLabel(status: GameSessionView['status']): string {
  if (status === 'waiting') return 'à espera';
  if (status === 'ready') return 'pronta';
  if (status === 'starting') return 'a começar';
  if (status === 'playing') return 'a jogar';
  if (status === 'finished') return 'terminada';
  return 'cancelada';
}

function playerStatusLabel(status: GameSessionView['players'][number]['status']): string {
  if (status === 'waiting') return 'à espera';
  if (status === 'ready') return 'pronto';
  if (status === 'connected') return 'no jogo';
  if (status === 'disconnected') return 'caiu';
  return 'fim';
}
