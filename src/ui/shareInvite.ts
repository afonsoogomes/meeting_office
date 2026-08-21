import { playShareChime } from '../audio/shareChime';

export type ScreenShareOffer = {
  guestId: string;
  name: string;
};

type ShareInviteHandlers = {
  onWatch: (guestId: string) => void;
};

export class ShareInvites {
  private readonly root: HTMLElement;
  private readonly compact = new Set<string>();
  private readonly chimed = new Set<string>();
  private signature = '';

  constructor(private readonly handlers: ShareInviteHandlers) {
    const root = document.querySelector('#share-invites');
    if (!(root instanceof HTMLElement)) throw new Error('share invites markup missing');
    this.root = root;
  }

  sync(offers: ScreenShareOffer[], watching: ReadonlySet<string>): void {
    const live = new Set(offers.map((offer) => offer.guestId));
    prune(this.compact, live);
    prune(this.chimed, live);

    const pending = offers.filter((offer) => !watching.has(offer.guestId));
    for (const offer of pending) {
      if (this.chimed.has(offer.guestId)) continue;
      this.chimed.add(offer.guestId);
      playShareChime();
    }
    const signature = pending
      .map((offer) => `${offer.guestId}:${offer.name}:${this.compact.has(offer.guestId) ? 'c' : 'f'}`)
      .join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    this.render(pending);
  }

  private render(pending: ScreenShareOffer[]): void {
    this.root.classList.toggle('hidden', pending.length === 0);
    this.root.replaceChildren();
    for (const offer of pending) {
      const compact = this.compact.has(offer.guestId);
      const card = document.createElement('div');
      card.className = compact ? 'share-invite is-compact' : 'share-invite';

      const copy = document.createElement('p');
      copy.className = 'share-invite-copy';
      copy.textContent = compact
        ? `Tela de ${offer.name}`
        : `${offer.name} está compartilhando a tela`;

      const watch = document.createElement('button');
      watch.type = 'button';
      watch.textContent = 'Assistir';
      watch.addEventListener('click', () => this.handlers.onWatch(offer.guestId));

      card.append(copy, watch);
      if (!compact) {
        const later = document.createElement('button');
        later.type = 'button';
        later.className = 'ghost';
        later.textContent = 'Agora não';
        later.addEventListener('click', () => {
          this.compact.add(offer.guestId);
          this.signature = '';
          this.render(pending);
        });
        card.append(later);
      }
      this.root.append(card);
    }
  }
}

function prune(set: Set<string>, live: Set<string>): void {
  for (const id of [...set]) {
    if (!live.has(id)) set.delete(id);
  }
}
