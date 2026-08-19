import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client';
import { voiceGain, type VoicePlace } from '../audio/spatial';

export type VoiceStatus = 'off' | 'connecting' | 'live';

type VoiceSession = {
  url: string;
  token: string;
};

export class VoiceClient {
  private readonly room = new Room({
    dynacast: true,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  private readonly sounds = new Map<string, HTMLAudioElement>();
  private readonly speaking = new Set<string>();
  private readonly remoteMuted = new Set<string>();
  private localId = '';
  private localName = '';
  private closed = false;
  private deaf = false;
  private status: VoiceStatus = 'off';

  constructor(private readonly onChange: () => void) {
    this.room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      this.attach(track, participant.identity);
    });
    this.room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      this.detach(track, participant.identity);
    });
    this.room.on(RoomEvent.TrackMuted, (_pub, participant) => this.refreshMuted(participant.identity));
    this.room.on(RoomEvent.TrackUnmuted, (_pub, participant) => this.refreshMuted(participant.identity));
    this.room.on(RoomEvent.ParticipantConnected, (participant) => this.refreshMuted(participant.identity));
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.remoteMuted.delete(participant.identity);
      this.speaking.delete(participant.identity);
      this.onChange();
    });
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.speaking.clear();
      for (const speaker of speakers) this.speaking.add(speaker.identity);
      this.onChange();
    });
    this.room.on(RoomEvent.Disconnected, () => {
      this.dropSounds();
      if (!this.closed) this.setStatus('off');
    });
    this.room.on(RoomEvent.Reconnecting, () => this.setStatus('connecting'));
    this.room.on(RoomEvent.Reconnected, () => this.setStatus('live'));
    this.room.on(RoomEvent.LocalTrackPublished, () => this.onChange());
    this.room.on(RoomEvent.LocalTrackUnpublished, () => this.onChange());
    this.room.on(RoomEvent.MediaDevicesError, () => this.onChange());
  }

  getStatus(): VoiceStatus {
    return this.status;
  }

  isDeaf(): boolean {
    return this.deaf;
  }

  isMicMuted(): boolean {
    if (this.room.state !== ConnectionState.Connected) return true;
    return !this.room.localParticipant.isMicrophoneEnabled;
  }

  isSpeaking(guestId: string): boolean {
    return this.speaking.has(guestId);
  }

  isRemoteMuted(guestId: string): boolean {
    return this.remoteMuted.has(guestId);
  }

  prepare(guestId: string, name: string): void {
    this.localId = guestId;
    this.localName = name;
  }

  async connect(guestId: string, name: string): Promise<void> {
    this.localId = guestId;
    this.localName = name;
    this.closed = false;
    if (this.room.state === ConnectionState.Connected) {
      this.setStatus('live');
      return;
    }
    this.setStatus('connecting');
    try {
      const session = await fetchSession(guestId, name);
      await this.room.connect(session.url, session.token);
      this.setStatus('live');
    } catch {
      this.setStatus('off');
    }
  }

  async unlock(): Promise<void> {
    try {
      await this.room.startAudio();
    } catch {
      return;
    }
  }

  async toggleMute(): Promise<void> {
    if (this.room.state !== ConnectionState.Connected && this.localId) {
      await this.connect(this.localId, this.localName);
    }
    if (this.room.state !== ConnectionState.Connected) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(this.isMicMuted());
    } catch {
      return;
    }
    this.onChange();
  }

  toggleDeaf(): void {
    this.deaf = !this.deaf;
    this.onChange();
  }

  tick(places: Map<string, VoicePlace>): void {
    const local = places.get(this.localId);
    if (!local) return;
    for (const [guestId, element] of this.sounds) {
      const remote = places.get(guestId);
      const gain = remote ? voiceGain(local, remote) : 0;
      element.volume = this.deaf ? 0 : gain;
      element.muted = this.deaf || gain <= 0.001;
    }
  }

  disconnect(): void {
    this.closed = true;
    this.dropSounds();
    this.room.disconnect();
    this.setStatus('off');
  }

  private attach(track: RemoteTrack, guestId: string): void {
    if (track.kind !== Track.Kind.Audio) return;
    this.detach(track, guestId);
    const element = track.attach();
    if (!(element instanceof HTMLAudioElement)) {
      track.detach();
      return;
    }
    element.setAttribute('data-voice', guestId);
    element.autoplay = true;
    element.setAttribute('playsinline', 'true');
    element.style.display = 'none';
    document.body.append(element);
    this.sounds.set(guestId, element);
  }

  private detach(track: RemoteTrack, guestId: string): void {
    track.detach();
    const element = this.sounds.get(guestId);
    element?.remove();
    this.sounds.delete(guestId);
  }

  private refreshMuted(identity: string): void {
    if (identity === this.localId) {
      this.onChange();
      return;
    }
    const participant = this.room.remoteParticipants.get(identity);
    const mic = participant?.getTrackPublication(Track.Source.Microphone);
    if (!participant || !mic || mic.isMuted) this.remoteMuted.add(identity);
    else this.remoteMuted.delete(identity);
    this.onChange();
  }

  private dropSounds(): void {
    for (const element of this.sounds.values()) element.remove();
    this.sounds.clear();
  }

  private setStatus(status: VoiceStatus): void {
    this.status = status;
    this.onChange();
  }
}

async function fetchSession(guestId: string, name: string): Promise<VoiceSession> {
  const response = await fetch('/voice/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestId, name }),
  });
  if (!response.ok) throw new Error('voice token failed');
  const body: unknown = await response.json();
  if (!isSession(body)) throw new Error('voice token malformed');
  return body;
}

function isSession(value: unknown): value is VoiceSession {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.url === 'string' && typeof record.token === 'string';
}
