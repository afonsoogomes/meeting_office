import {
  sanitizeChannelPost,
  sanitizeChannelSummary,
  type ChannelMessage,
  type ChannelSummary,
} from '../../shared/protocol';
import { currentOfficeSlug } from './layout';

const STORAGE = 'meeting-office-channels-v1';

export type LocalChannels = {
  channels: ChannelSummary[];
  messages: Record<string, ChannelMessage[]>;
};

export function emptyChannels(): LocalChannels {
  return { channels: [], messages: {} };
}

export function loadLocalChannels(): LocalChannels {
  try {
    const raw = localStorage.getItem(`${STORAGE}:${currentOfficeSlug()}`);
    if (!raw) return emptyChannels();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyChannels();
    const record = parsed as { channels?: unknown; messages?: unknown };
    const channels = Array.isArray(record.channels)
      ? record.channels.flatMap((item) => {
          const channel = sanitizeChannelSummary(item);
          return channel ? [channel] : [];
        })
      : [];
    const messages: Record<string, ChannelMessage[]> = {};
    if (record.messages && typeof record.messages === 'object' && !Array.isArray(record.messages)) {
      for (const [id, list] of Object.entries(record.messages as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        messages[id] = list.flatMap((item) => {
          const message = sanitizeChannelPost(item);
          return message ? [message] : [];
        });
      }
    }
    return { channels, messages };
  } catch {
    return emptyChannels();
  }
}

export function saveLocalChannels(state: LocalChannels): void {
  try {
    localStorage.setItem(`${STORAGE}:${currentOfficeSlug()}`, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}
