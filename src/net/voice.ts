import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteTrackPublication,
} from 'livekit-client';
import { voiceGain, type VoicePlace } from '../audio/spatial';

export type VoiceStatus = 'off' | 'connecting' | 'live';

export type MediaKind = 'camera' | 'screen';

export type MediaTile = {
  guestId: string;
  kind: MediaKind;
  element: HTMLVideoElement;
  local: boolean;
};

type VoiceSession = {
  url: string;
  token: string;
};

export class VoiceClient {
  private readonly room = new Room({
    dynacast: true,
    adaptiveStream: true,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    videoCaptureDefaults: {
      resolution: VideoPresets.h360.resolution,
    },
  });
  private readonly audios = new Map<string, { guestId: string; element: HTMLAudioElement }>();
  private readonly tiles = new Map<string, MediaTile>();
  private readonly speaking = new Set<string>();
  private readonly remoteMuted = new Set<string>();
  private localId = '';
  private localName = '';
  private closed = false;
  private deaf = false;
  private status: VoiceStatus = 'off';

  constructor(private readonly onChange: () => void) {
    this.room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      this.attach(track, pub.source, participant.identity, false);
    });
    this.room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      this.detach(track, pub.source, participant.identity);
    });
    this.room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track) this.attach(pub.track, pub.source, this.localId, true);
      this.onChange();
    });
    this.room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      if (pub.track) this.detach(pub.track, pub.source, this.localId);
      else this.dropByKey(mediaKey(this.localId, kindFromSource(pub.source) ?? pub.source));
      this.onChange();
    });
    this.room.on(RoomEvent.TrackMuted, (_pub, participant) => this.refreshMuted(participant.identity));
    this.room.on(RoomEvent.TrackUnmuted, (_pub, participant) => this.refreshMuted(participant.identity));
    this.room.on(RoomEvent.ParticipantConnected, (participant) => this.refreshMuted(participant.identity));
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.remoteMuted.delete(participant.identity);
      this.speaking.delete(participant.identity);
      this.dropParticipant(participant.identity);
      this.onChange();
    });
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.speaking.clear();
      for (const speaker of speakers) this.speaking.add(speaker.identity);
      this.onChange();
    });
    this.room.on(RoomEvent.Disconnected, () => {
      this.dropAll();
      if (!this.closed) this.setStatus('off');
    });
    this.room.on(RoomEvent.Reconnecting, () => this.setStatus('connecting'));
    this.room.on(RoomEvent.Reconnected, () => this.setStatus('live'));
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

  isCameraEnabled(): boolean {
    if (this.room.state !== ConnectionState.Connected) return false;
    return this.room.localParticipant.isCameraEnabled;
  }

  isScreenShareEnabled(): boolean {
    if (this.room.state !== ConnectionState.Connected) return false;
    return this.room.localParticipant.isScreenShareEnabled;
  }

  isSpeaking(guestId: string): boolean {
    return this.speaking.has(guestId);
  }

  isRemoteMuted(guestId: string): boolean {
    return this.remoteMuted.has(guestId);
  }

  listTiles(): MediaTile[] {
    return [...this.tiles.values()];
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
    if (!(await this.ensureLive())) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(this.isMicMuted());
    } catch {
      return;
    }
    this.onChange();
  }

  async toggleCamera(): Promise<void> {
    if (!(await this.ensureLive())) return;
    try {
      await this.room.localParticipant.setCameraEnabled(!this.isCameraEnabled());
    } catch {
      return;
    }
    this.onChange();
  }

  async toggleScreenShare(): Promise<void> {
    if (!(await this.ensureLive())) return;
    try {
      await this.room.localParticipant.setScreenShareEnabled(!this.isScreenShareEnabled(), {
        audio: true,
        resolution: { width: 1920, height: 1080, frameRate: 15 },
        surfaceSwitching: 'include',
      });
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
    this.syncSubscriptions(places, local.roomId);
    for (const { guestId, element } of this.audios.values()) {
      const remote = places.get(guestId);
      const gain = guestId === this.localId ? 0 : remote ? voiceGain(local, remote) : 0;
      element.volume = this.deaf ? 0 : gain;
      element.muted = this.deaf || gain <= 0.001;
    }
  }

  disconnect(): void {
    this.closed = true;
    this.dropAll();
    this.room.disconnect();
    this.setStatus('off');
  }

  private async ensureLive(): Promise<boolean> {
    if (this.room.state !== ConnectionState.Connected && this.localId) {
      await this.connect(this.localId, this.localName);
    }
    return this.room.state === ConnectionState.Connected;
  }

  private syncSubscriptions(places: Map<string, VoicePlace>, localRoom: string): void {
    for (const participant of this.room.remoteParticipants.values()) {
      const same = places.get(participant.identity)?.roomId === localRoom;
      for (const pub of participant.trackPublications.values()) {
        if (!isRoomVideo(pub)) continue;
        if (pub.isSubscribed === same || !('setSubscribed' in pub)) continue;
        void (pub as RemoteTrackPublication).setSubscribed(same);
      }
    }
  }

  private attach(track: Track, source: Track.Source, guestId: string, local: boolean): void {
    if (track.kind === Track.Kind.Audio) {
      this.attachAudio(track, source, guestId);
      return;
    }
    if (track.kind === Track.Kind.Video) this.attachVideo(track, source, guestId, local);
  }

  private detach(track: Track, source: Track.Source, guestId: string): void {
    track.detach();
    const kind = kindFromSource(source);
    if (kind) this.dropByKey(mediaKey(guestId, kind));
    else this.dropByKey(mediaKey(guestId, source));
  }

  private attachAudio(track: Track, source: Track.Source, guestId: string): void {
    const key = mediaKey(guestId, source);
    this.dropByKey(key);
    const element = track.attach();
    if (!(element instanceof HTMLAudioElement)) {
      track.detach();
      return;
    }
    element.setAttribute('data-voice', key);
    element.autoplay = true;
    element.setAttribute('playsinline', 'true');
    element.style.display = 'none';
    document.body.append(element);
    this.audios.set(key, { guestId, element });
  }

  private attachVideo(track: Track, source: Track.Source, guestId: string, local: boolean): void {
    const kind = kindFromSource(source);
    if (!kind) return;
    const key = mediaKey(guestId, kind);
    this.dropByKey(key);
    const element = track.attach();
    if (!(element instanceof HTMLVideoElement)) {
      track.detach();
      return;
    }
    element.autoplay = true;
    element.playsInline = true;
    element.muted = true;
    element.setAttribute('data-media', key);
    this.tiles.set(key, { guestId, kind, element, local });
    this.onChange();
  }

  private dropByKey(key: string): void {
    const audio = this.audios.get(key);
    if (audio) {
      audio.element.remove();
      this.audios.delete(key);
    }
    const tile = this.tiles.get(key);
    if (tile) {
      tile.element.remove();
      this.tiles.delete(key);
    }
  }

  private dropParticipant(guestId: string): void {
    for (const key of [...this.audios.keys(), ...this.tiles.keys()]) {
      if (key.startsWith(`${guestId}|`)) this.dropByKey(key);
    }
  }

  private dropAll(): void {
    for (const { element } of this.audios.values()) element.remove();
    this.audios.clear();
    for (const tile of this.tiles.values()) tile.element.remove();
    this.tiles.clear();
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

  private setStatus(status: VoiceStatus): void {
    this.status = status;
    this.onChange();
  }
}

function mediaKey(guestId: string, source: string): string {
  return `${guestId}|${source}`;
}

function kindFromSource(source: Track.Source): MediaKind | null {
  if (source === Track.Source.Camera) return 'camera';
  if (source === Track.Source.ScreenShare) return 'screen';
  return null;
}

function isRoomVideo(pub: { kind: Track.Kind; source: Track.Source }): boolean {
  return pub.kind === Track.Kind.Video || pub.source === Track.Source.ScreenShareAudio;
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
