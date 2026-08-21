import {
  CHANNEL_MESSAGE_MAX,
  CHANNEL_NAME_MAX,
  sanitizeChannelMessage,
  sanitizeChannelName,
  type ChannelMessage,
  type ChannelSummary,
} from '../../shared/protocol';

type ChannelsPanelHandlers = {
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  onSend: (id: string, text: string) => void;
};

export class ChannelsPanel {
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly thread: HTMLElement;
  private readonly pick: HTMLElement;
  private readonly titleInput: HTMLInputElement;
  private readonly log: HTMLElement;
  private readonly compose: HTMLTextAreaElement;
  private readonly createInput: HTMLInputElement;
  private readonly handlers: ChannelsPanelHandlers;
  private channels: ChannelSummary[] = [];
  private selectedId: string | null = null;
  private pendingName: string | null = null;
  private messages: ChannelMessage[] = [];
  private renameTimer = 0;
  private lastSendAt = 0;

  constructor(handlers: ChannelsPanelHandlers) {
    const panel = document.querySelector('#channels-panel');
    const list = document.querySelector('#channel-list');
    const empty = document.querySelector('#channel-empty');
    const thread = document.querySelector('#channel-thread');
    const pick = document.querySelector('#channel-pick');
    const titleInput = document.querySelector('#channel-title');
    const log = document.querySelector('#channel-log');
    const compose = document.querySelector('#channel-input');
    const createInput = document.querySelector('#channel-new-name');
    const createForm = document.querySelector('#channel-create');
    const sendForm = document.querySelector('#channel-form');
    if (
      !(panel instanceof HTMLElement) ||
      !(list instanceof HTMLElement) ||
      !(empty instanceof HTMLElement) ||
      !(thread instanceof HTMLElement) ||
      !(pick instanceof HTMLElement) ||
      !(titleInput instanceof HTMLInputElement) ||
      !(log instanceof HTMLElement) ||
      !(compose instanceof HTMLTextAreaElement) ||
      !(createInput instanceof HTMLInputElement) ||
      !(createForm instanceof HTMLFormElement) ||
      !(sendForm instanceof HTMLFormElement)
    ) {
      throw new Error('Channels panel markup missing');
    }
    this.panel = panel;
    this.list = list;
    this.empty = empty;
    this.thread = thread;
    this.pick = pick;
    this.titleInput = titleInput;
    this.log = log;
    this.compose = compose;
    this.createInput = createInput;
    this.handlers = handlers;
    this.compose.maxLength = CHANNEL_MESSAGE_MAX;
    this.titleInput.maxLength = CHANNEL_NAME_MAX;
    this.createInput.maxLength = CHANNEL_NAME_MAX;

    document.querySelector('#close-channels')?.addEventListener('click', () => this.handlers.onClose());
    document.querySelector('#channel-remove')?.addEventListener('click', () => {
      if (!this.selectedId) return;
      const current = this.channels.find((channel) => channel.id === this.selectedId);
      if (!current) return;
      if (!window.confirm(`Apagar o canal “${current.name}” e o histórico dele?`)) return;
      this.handlers.onRemove(this.selectedId);
    });
    createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = sanitizeChannelName(this.createInput.value);
      if (!name) return;
      this.pendingName = name;
      window.setTimeout(() => {
        if (this.pendingName === name) this.pendingName = null;
      }, 4000);
      this.createInput.value = '';
      this.handlers.onCreate(name);
    });
    sendForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.sendDraft();
    });
    this.compose.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      this.sendDraft();
    });
    this.titleInput.addEventListener('change', () => this.commitRename());
    this.titleInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.titleInput.blur();
    });
  }

  isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  selected(): string | null {
    return this.selectedId;
  }

  setOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    document.querySelector('#channels-btn')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) this.renderList();
  }

  setChannels(channels: ChannelSummary[]): void {
    this.channels = channels;
    if (this.pendingName) {
      const spawned = channels.find((channel) => channel.name === this.pendingName);
      if (spawned) {
        this.pendingName = null;
        this.selectedId = spawned.id;
        this.handlers.onOpen(spawned.id);
      }
    }
    if (this.selectedId && !channels.some((channel) => channel.id === this.selectedId)) {
      this.selectedId = null;
      this.messages = [];
    }
    this.renderList();
    this.syncThread();
  }

  setHistory(channelId: string, messages: ChannelMessage[]): void {
    if (this.selectedId !== channelId) return;
    this.messages = messages;
    this.renderLog(true);
  }

  appendMessage(channelId: string, message: ChannelMessage): void {
    if (this.selectedId !== channelId) return;
    if (this.messages.some((item) => item.id === message.id)) return;
    this.messages.push(message);
    this.renderLog(false);
  }

  openChannel(id: string): void {
    if (!this.channels.some((channel) => channel.id === id)) return;
    this.selectedId = id;
    this.messages = [];
    this.renderList();
    this.syncThread();
    this.renderLog(true);
    this.handlers.onOpen(id);
    this.compose.focus();
  }

  private sendDraft(): void {
    if (!this.selectedId) return;
    const text = sanitizeChannelMessage(this.compose.value);
    if (!text) return;
    const now = performance.now();
    if (now - this.lastSendAt < 400) return;
    this.lastSendAt = now;
    this.compose.value = '';
    this.handlers.onSend(this.selectedId, text);
  }

  private commitRename(): void {
    if (!this.selectedId) return;
    const name = sanitizeChannelName(this.titleInput.value);
    const current = this.channels.find((channel) => channel.id === this.selectedId);
    if (!name || !current || name === current.name) {
      if (current) this.titleInput.value = current.name;
      return;
    }
    window.clearTimeout(this.renameTimer);
    this.renameTimer = window.setTimeout(() => {
      if (this.selectedId) this.handlers.onRename(this.selectedId, name);
    }, 120);
  }

  private renderList(): void {
    this.list.replaceChildren();
    this.empty.classList.toggle('hidden', this.channels.length > 0);
    for (const channel of this.channels) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'channel-row';
      if (channel.id === this.selectedId) button.classList.add('current');
      const name = document.createElement('strong');
      name.textContent = `# ${channel.name}`;
      const preview = document.createElement('span');
      preview.textContent = channel.lastText
        ? `${channel.lastName ? `${channel.lastName}: ` : ''}${channel.lastText.replace(/\s+/g, ' ')}`
        : 'sem mensagens';
      button.append(name, preview);
      button.addEventListener('click', () => this.openChannel(channel.id));
      this.list.append(button);
    }
  }

  private syncThread(): void {
    const current = this.channels.find((channel) => channel.id === this.selectedId);
    this.thread.classList.toggle('hidden', !current);
    this.pick.classList.toggle('hidden', Boolean(current));
    if (!current) return;
    if (document.activeElement !== this.titleInput) this.titleInput.value = current.name;
  }

  private renderLog(pinBottom: boolean): void {
    const nearBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 48;
    this.log.replaceChildren();
    for (const message of this.messages) {
      const row = document.createElement('div');
      row.className = 'channel-line';
      const meta = document.createElement('p');
      meta.className = 'channel-line-meta';
      const who = document.createElement('strong');
      who.textContent = message.name;
      const time = document.createElement('time');
      time.dateTime = new Date(message.at).toISOString();
      time.textContent = formatStamp(message.at);
      meta.append(who, time);
      const body = document.createElement('p');
      body.className = 'channel-line-text';
      body.textContent = message.text;
      row.append(meta, body);
      this.log.append(row);
    }
    if (pinBottom || nearBottom) this.log.scrollTop = this.log.scrollHeight;
  }
}

function formatStamp(at: number): string {
  const date = new Date(at);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
