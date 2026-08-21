import {
  ConnectionState,
  RemoteAudioTrack,
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

type AudioSlot = {
  key: string;
  guestId: string;
  element: HTMLAudioElement;
  track: Track;
};

export class VoiceClient {
  private readonly room = new Room({
    dynacast: true,
    adaptiveStream: true,
    // HTML <audio> (not Web Audio). iPad Safari keeps that playing in the
    // background, like Meet; AudioContext is suspended as soon as you leave.
    webAudioMix: false,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    videoCaptureDefaults: {
      resolution: VideoPresets.h360.resolution,
    },
  });
  private readonly audios = new Map<string, AudioSlot>();
  private readonly tiles = new Map<string, MediaTile>();
  private readonly speaking = new Set<string>();
  private readonly lastGain = new Map<string, number>();
  private readonly appliedVolume = new Map<string, number>();
  private readonly playAfter = new WeakMap<HTMLAudioElement, number>();
  private localId = '';
  private localName = '';
  private closed = false;
  private deaf = false;
  private wantMic = false;
  private status: VoiceStatus = 'off';
  private resuming = false;
  private readonly resumeBtn = document.querySelector('#voice-resume');

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
    this.room.on(RoomEvent.TrackMuted, (pub, participant) => {
      const kind = kindFromSource(pub.source);
      if (kind) {
        pub.track?.detach();
        this.dropByKey(mediaKey(participant.identity, kind));
      }
      this.onChange();
    });
    this.room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      if (pub.track) this.attach(pub.track, pub.source, participant.identity, participant.identity === this.localId);
      this.onChange();
    });
    this.room.on(RoomEvent.TrackPublished, () => this.onChange());
    this.room.on(RoomEvent.ParticipantConnected, () => this.onChange());
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
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
    this.room.on(RoomEvent.Reconnected, () => {
      this.setStatus('live');
      void this.resumeAfterInterrupt();
    });
    this.room.on(RoomEvent.AudioPlaybackStatusChanged, (canPlay) => {
      this.showResume(!canPlay && this.status === 'live');
    });
    this.room.on(RoomEvent.MediaDevicesError, () => this.onChange());
    this.resumeBtn?.addEventListener('click', () => {
      void this.unlock();
    });
    document.addEventListener('visibilitychange', this.onForeground);
    window.addEventListener('pageshow', this.onForeground);
    window.addEventListener('focus', this.onForeground);
    audioSession()?.addEventListener('statechange', this.onAudioSession);
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
    const participant = this.participantOf(guestId);
    if (!participant) return false;
    const mic = participant.getTrackPublication(Track.Source.Microphone);
    if (!mic) return false;
    return mic.isMuted || !participant.isMicrophoneEnabled;
  }

  listTiles(): MediaTile[] {
    return [...this.tiles.values()].filter((tile) => this.isVideoLive(tile));
  }

  prepare(guestId: string, name: string): void {
    this.localId = guestId;
    this.localName = name;
  }

  async connect(guestId: string, name: string): Promise<void> {
    this.localId = guestId;
    this.localName = name;
    this.closed = false;
    document.addEventListener('visibilitychange', this.onForeground);
    window.addEventListener('pageshow', this.onForeground);
    window.addEventListener('focus', this.onForeground);
    audioSession()?.addEventListener('statechange', this.onAudioSession);
    claimCallAudio();
    if (this.room.state === ConnectionState.Connected) {
      this.setStatus('live');
      return;
    }
    this.setStatus('connecting');
    try {
      const session = await fetchSession(guestId, name);
      await this.room.connect(session.url, session.token);
      this.setStatus('live');
      void this.resumeAfterInterrupt();
    } catch {
      this.setStatus('off');
    }
  }

  async unlock(): Promise<void> {
    await this.resumeAfterInterrupt();
  }

  async toggleMute(): Promise<void> {
    if (!(await this.ensureLive())) return;
    const enable = this.isMicMuted();
    this.wantMic = enable;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enable);
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
    if (!this.isCameraEnabled()) this.dropByKey(mediaKey(this.localId, 'camera'));
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
    if (!this.isScreenShareEnabled()) this.dropByKey(mediaKey(this.localId, 'screen'));
    this.onChange();
  }

  toggleDeaf(): void {
    this.deaf = !this.deaf;
    this.onChange();
    if (!this.deaf) void this.resumeAfterInterrupt();
  }

  tick(places: Map<string, VoicePlace>): void {
    const local = places.get(this.localId);
    if (!local) return;
    this.syncSubscriptions(places, local.roomId);
    for (const slot of this.audios.values()) {
      this.applyGain(slot, this.gainFor(slot.guestId, places, local));
    }
  }

  disconnect(): void {
    this.closed = true;
    this.showResume(false);
    document.removeEventListener('visibilitychange', this.onForeground);
    window.removeEventListener('pageshow', this.onForeground);
    window.removeEventListener('focus', this.onForeground);
    audioSession()?.removeEventListener('statechange', this.onAudioSession);
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
        if (!('setSubscribed' in pub)) continue;
        const video = isRoomVideo(pub);
        const mic = pub.kind === Track.Kind.Audio && pub.source !== Track.Source.ScreenShareAudio;
        if (!video && !mic) continue;
        const want = video ? same : same && !this.deaf;
        if (pub.isSubscribed === want) continue;
        void (pub as RemoteTrackPublication).setSubscribed(want);
      }
    }
  }

  private participantOf(guestId: string) {
    if (guestId === this.localId) {
      return this.room.state === ConnectionState.Connected ? this.room.localParticipant : undefined;
    }
    return this.room.remoteParticipants.get(guestId);
  }

  private isVideoLive(tile: MediaTile): boolean {
    const participant = this.participantOf(tile.guestId);
    if (!participant) return false;
    if (tile.kind === 'camera') return participant.isCameraEnabled;
    return participant.isScreenShareEnabled;
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
    if (guestId === this.localId) return;
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
    const slot: AudioSlot = { key, guestId, element, track };
    element.addEventListener('pause', this.onAudioPause);
    this.audios.set(key, slot);
    this.playIfPaused(element);
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
      audio.element.removeEventListener('pause', this.onAudioPause);
      audio.element.remove();
      this.audios.delete(key);
      this.appliedVolume.delete(key);
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
    this.lastGain.delete(guestId);
  }

  private dropAll(): void {
    for (const slot of this.audios.values()) {
      slot.element.removeEventListener('pause', this.onAudioPause);
      slot.element.remove();
    }
    this.audios.clear();
    this.appliedVolume.clear();
    this.lastGain.clear();
    for (const tile of this.tiles.values()) tile.element.remove();
    this.tiles.clear();
  }

  private setStatus(status: VoiceStatus): void {
    this.status = status;
    publishMediaSession(status === 'live');
    this.onChange();
  }

  private gainFor(guestId: string, places: Map<string, VoicePlace>, local: VoicePlace): number {
    const remote = places.get(guestId);
    if (!remote) return this.lastGain.get(guestId) ?? 1;
    const gain = voiceGain(local, remote);
    this.lastGain.set(guestId, gain);
    return gain;
  }

  private applyGain(slot: AudioSlot, gain: number): void {
    const volume = this.deaf ? 0 : gain;
    if (this.appliedVolume.get(slot.key) !== volume) {
      this.appliedVolume.set(slot.key, volume);
      if (slot.track instanceof RemoteAudioTrack) slot.track.setVolume(volume);
      else slot.element.volume = volume;
    }
    this.playIfPaused(slot.element);
  }

  private playIfPaused(element: HTMLAudioElement): void {
    if (this.closed || document.visibilityState === 'hidden' || !element.paused) return;
    const key = element.getAttribute('data-voice');
    if (!key || this.audios.get(key)?.element !== element) return;
    const now = performance.now();
    const waitUntil = this.playAfter.get(element) ?? 0;
    if (now < waitUntil) return;
    this.playAfter.set(element, now + 500);
    void element.play().catch(() => {
      void this.resumeAfterInterrupt();
    });
  }

  private readonly onAudioPause = (event: Event): void => {
    if (document.visibilityState === 'hidden') return;
    if (!(event.target instanceof HTMLAudioElement)) return;
    this.playIfPaused(event.target);
  };

  private readonly onForeground = (): void => {
    if (document.visibilityState === 'hidden') return;
    void this.resumeAfterInterrupt();
  };

  private readonly onAudioSession = (): void => {
    if (audioSession()?.state === 'interrupted') return;
    void this.resumeAfterInterrupt();
  };

  private async resumeAfterInterrupt(): Promise<void> {
    if (this.closed || this.resuming || this.room.state !== ConnectionState.Connected) return;
    if (document.visibilityState === 'hidden') return;
    this.resuming = true;
    claimCallAudio();
    try {
      await Promise.race([this.room.startAudio(), wait(800)]);
      for (const slot of this.audios.values()) this.playIfPaused(slot.element);
      await this.restoreMic();
      this.showResume(!this.room.canPlaybackAudio);
    } catch {
      this.showResume(true);
    } finally {
      this.resuming = false;
    }
  }

  private async restoreMic(): Promise<void> {
    if (!this.wantMic) return;
    try {
      if (!this.room.localParticipant.isMicrophoneEnabled) {
        await this.room.localParticipant.setMicrophoneEnabled(true);
        return;
      }
      const pub = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const track = pub?.track;
      const media = track?.mediaStreamTrack;
      if (!media || media.readyState !== 'live' || media.muted) {
        if (track && 'restartTrack' in track && typeof track.restartTrack === 'function') {
          await track.restartTrack();
        }
      }
    } catch {
      return;
    }
  }

  private showResume(need: boolean): void {
    this.resumeBtn?.classList.toggle('hidden', this.closed || !need);
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

type CallAudioSession = {
  type: string;
  state: string;
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
};

function audioSession(): CallAudioSession | undefined {
  return (navigator as Navigator & { audioSession?: CallAudioSession }).audioSession;
}

function claimCallAudio(): void {
  const session = audioSession();
  if (!session) return;
  try {
    session.type = 'play-and-record';
  } catch {
    return;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function publishMediaSession(active: boolean): void {
  if (!navigator.mediaSession) return;
  try {
    navigator.mediaSession.playbackState = active ? 'playing' : 'none';
    if (active) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Meeting Office',
        artist: 'Voz',
      });
    }
  } catch {
    return;
  }
}
