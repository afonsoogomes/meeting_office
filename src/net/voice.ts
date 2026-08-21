import {
  ConnectionState,
  createLocalAudioTrack,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type LocalAudioTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { voiceGain, type VoicePlace } from '../audio/spatial';
import { clampPeerVolume, loadPeerVolumes, savePeerVolumes } from '../audio/peerVolume';

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
  source: Track.Source;
};

export class VoiceClient {
  private readonly room = new Room({
    dynacast: true,
    adaptiveStream: true,
    // Safari fires `pagehide` when switching tabs/apps and would drop the call.
    disconnectOnPageLeave: false,
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
    publishDefaults: {
      stopMicTrackOnMute: false,
    },
  });
  private readonly audios = new Map<string, AudioSlot>();
  private readonly tiles = new Map<string, MediaTile>();
  private readonly speaking = new Set<string>();
  private readonly lastGain = new Map<string, number>();
  private readonly appliedVolume = new Map<string, number>();
  private readonly playAfter = new WeakMap<HTMLAudioElement, number>();
  private readonly watching = new Set<string>();
  private readonly peerLevels = loadPeerVolumes();
  private screenLevel = 1;
  private localId = '';
  private localName = '';
  private closed = false;
  private deaf = false;
  private wantMic = false;
  private armedTrack: LocalAudioTrack | null = null;
  private armWait: Promise<void> | null = null;
  private connectLock: Promise<boolean> | null = null;
  private status: VoiceStatus = 'off';
  private resuming = false;
  private resumeQueued = false;
  private playbackBlocked = false;
  private listening = false;
  private readonly resumeTimers: number[] = [];
  private readonly resumeBtn = document.querySelector('#voice-resume');

  private officeSlug = '';

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
    this.room.on(RoomEvent.TrackUnpublished, (pub, participant) => {
      if (pub.source === Track.Source.ScreenShare) this.watching.delete(participant.identity);
      this.onChange();
    });
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
    this.bindLifecycle();
  }

  getStatus(): VoiceStatus {
    return this.status;
  }

  isDeaf(): boolean {
    return this.deaf;
  }

  isMicMuted(): boolean {
    if (this.deaf) return true;
    return !this.wantMic;
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

  listRemoteScreenShares(): string[] {
    const ids: string[] = [];
    for (const participant of this.room.remoteParticipants.values()) {
      if (participant.getTrackPublication(Track.Source.ScreenShare)) ids.push(participant.identity);
    }
    return ids;
  }

  watchingScreens(): ReadonlySet<string> {
    return this.watching;
  }

  watchScreen(guestId: string): void {
    if (guestId === this.localId) return;
    this.watching.add(guestId);
    this.onChange();
  }

  unwatchScreen(guestId: string): void {
    this.watching.delete(guestId);
    this.dropByKey(mediaKey(guestId, 'screen'));
    this.dropByKey(mediaKey(guestId, Track.Source.ScreenShareAudio));
    this.onChange();
  }

  peerLevel(guestId: string): number {
    return this.peerLevels.get(guestId) ?? 1;
  }

  setPeerLevel(guestId: string, level: number): void {
    const next = clampPeerVolume(level);
    if (next === 1) this.peerLevels.delete(guestId);
    else this.peerLevels.set(guestId, next);
    savePeerVolumes(this.peerLevels);
    this.onChange();
  }

  setScreenLevel(level: number): void {
    this.screenLevel = clampPeerVolume(level);
    for (const slot of this.audios.values()) {
      if (slot.source !== Track.Source.ScreenShareAudio) continue;
      this.appliedVolume.delete(slot.key);
      this.applyGain(slot, this.deaf ? 0 : this.screenLevel);
    }
  }

  prepare(guestId: string, name: string, officeSlug = ''): void {
    this.localId = guestId;
    this.localName = name;
    this.officeSlug = officeSlug;
    this.closed = false;
    this.bindLifecycle();
    void this.ensureLive();
  }

  async connect(guestId: string, name: string): Promise<void> {
    this.localId = guestId;
    this.localName = name;
    await this.ensureLive();
  }

  async unlock(): Promise<void> {
    if (this.closed) return;
    claimCallAudio();
    // getUserMedia must start in this gesture turn — don't await connect first.
    void this.armMic();
    void this.ensureLive();
    if (this.room.state !== ConnectionState.Connected) return;
    // Recycle + play in this turn — Safari user-activation dies after `await`.
    if (this.hasPausedRemoteAudio()) this.recycleAudioElements();
    void this.room.startAudio();
    for (const slot of this.audios.values()) this.playIfPaused(slot.element, true);
  }

  async toggleMute(): Promise<void> {
    const enable = this.isMicMuted();
    if (enable) this.setDeaf(false);
    this.wantMic = enable;
    this.onChange();
    if (enable) void this.armMic();
    void this.unlock();
    if (!(await this.ensureLive())) return;
    try {
      await this.applyMic();
    } catch {
      if (enable) this.wantMic = false;
      this.onChange();
    }
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
      await this.room.localParticipant.setScreenShareEnabled(!this.isScreenShareEnabled(), screenShareCapture());
    } catch {
      return;
    }
    if (!this.isScreenShareEnabled()) this.dropByKey(mediaKey(this.localId, 'screen'));
    this.onChange();
  }

  toggleDeaf(): void {
    this.setDeaf(!this.deaf);
    if (this.deaf) {
      this.wantMic = false;
      void this.disableMic();
    }
    this.onChange();
  }

  tick(places: Map<string, VoicePlace>): void {
    const local = places.get(this.localId);
    if (!local) return;
    this.syncSubscriptions(places, local.roomId);
    for (const slot of this.audios.values()) {
      this.applyGain(slot, this.gainFor(slot, places, local));
    }
  }

  disconnect(): void {
    this.closed = true;
    this.wantMic = false;
    this.showResume(false);
    this.clearResumeTimers();
    this.unbindLifecycle();
    this.dropAll();
    this.dropArmedMic();
    this.connectLock = null;
    this.room.disconnect();
    this.setStatus('off');
  }

  private async ensureLive(): Promise<boolean> {
    if (this.closed) return false;
    if (this.room.state === ConnectionState.Connected) return true;
    if (!this.localId) return false;
    if (!this.connectLock) {
      this.connectLock = this.joinRoom().finally(() => {
        this.connectLock = null;
      });
    }
    return this.connectLock;
  }

  private async joinRoom(): Promise<boolean> {
    if (this.room.state === ConnectionState.Connected) {
      this.setStatus('live');
      return true;
    }
    this.bindLifecycle();
    claimCallAudio();
    this.setStatus('connecting');
    try {
      const session = await fetchSession(this.localId, this.localName, this.officeSlug);
      if (this.closed) return false;
      await this.room.connect(session.url, session.token);
      this.setStatus('live');
      await this.publishArmed(this.wantMic);
      void this.maybeArmIfGranted();
      void this.resumeAfterInterrupt();
      return true;
    } catch {
      this.setStatus('off');
      return false;
    }
  }

  private syncSubscriptions(places: Map<string, VoicePlace>, localRoom: string): void {
    for (const participant of this.room.remoteParticipants.values()) {
      const same = places.get(participant.identity)?.roomId === localRoom;
      const watch = this.watching.has(participant.identity);
      for (const pub of participant.trackPublications.values()) {
        if (!('setSubscribed' in pub)) continue;
        const want = this.wantPublication(pub, same, watch);
        if (want === null || pub.isSubscribed === want) continue;
        void (pub as RemoteTrackPublication).setSubscribed(want);
      }
    }
  }

  private wantPublication(
    pub: { kind: Track.Kind; source: Track.Source },
    sameRoom: boolean,
    watch: boolean,
  ): boolean | null {
    if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) return watch;
    if (pub.kind === Track.Kind.Video) return sameRoom;
    // Keep remote mics subscribed even in another room. Safari blocks autoplay
    // on a fresh <audio> after unsubscribe/resubscribe (walking through a door).
    if (pub.kind === Track.Kind.Audio) return true;
    return null;
  }

  private rejectScreen(guestId: string, source: Track.Source): void {
    const pub = this.room.remoteParticipants.get(guestId)?.getTrackPublication(source);
    if (pub && 'setSubscribed' in pub && pub.isSubscribed) {
      void (pub as RemoteTrackPublication).setSubscribed(false);
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
    if (source === Track.Source.ScreenShareAudio && !this.watching.has(guestId)) {
      this.rejectScreen(guestId, source);
      return;
    }
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
    element.setAttribute('webkit-playsinline', 'true');
    element.style.display = 'none';
    document.body.append(element);
    const slot: AudioSlot = { key, guestId, element, track, source };
    element.addEventListener('pause', this.onAudioPause);
    this.audios.set(key, slot);
    this.playIfPaused(element);
  }

  private attachVideo(track: Track, source: Track.Source, guestId: string, local: boolean): void {
    const kind = kindFromSource(source);
    if (!kind) return;
    if (kind === 'screen' && !local && !this.watching.has(guestId)) {
      this.rejectScreen(guestId, source);
      return;
    }
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
    element.setAttribute('playsinline', 'true');
    element.setAttribute('webkit-playsinline', 'true');
    element.setAttribute('data-media', key);
    if (kind === 'screen') {
      element.classList.add('screen-share-video');
      if (local) {
        try {
          track.mediaStreamTrack.contentHint = 'detail';
        } catch {
          /* Safari may ignore */
        }
      }
    }
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
    this.watching.delete(guestId);
    for (const key of [...this.audios.keys(), ...this.tiles.keys()]) {
      if (key.startsWith(`${guestId}|`)) this.dropByKey(key);
    }
    this.lastGain.delete(guestId);
  }

  private dropAll(): void {
    this.watching.clear();
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

  private gainFor(slot: AudioSlot, places: Map<string, VoicePlace>, local: VoicePlace): number {
    const personal = this.peerLevel(slot.guestId);
    if (slot.source === Track.Source.ScreenShareAudio) {
      return this.watching.has(slot.guestId) ? this.screenLevel : 0;
    }
    const remote = places.get(slot.guestId);
    if (!remote) return (this.lastGain.get(slot.guestId) ?? 1) * personal;
    const gain = voiceGain(local, remote);
    this.lastGain.set(slot.guestId, gain);
    return gain * personal;
  }

  private applyGain(slot: AudioSlot, gain: number): void {
    const want = this.deaf ? 0 : gain;
    const silent = want <= 0;
    const level = silent ? 0 : want;
    const token = silent ? 0 : level;
    if (this.appliedVolume.get(slot.key) !== token || slot.element.muted !== silent) {
      this.appliedVolume.set(slot.key, token);
      if (slot.track instanceof RemoteAudioTrack) slot.track.setVolume(level);
      else slot.element.volume = level;
      slot.element.muted = silent;
    }
    if (this.deaf) {
      slot.element.pause();
      return;
    }
    this.playIfPaused(slot.element);
  }

  private setDeaf(deaf: boolean): void {
    if (this.deaf === deaf) {
      if (deaf) this.applyOutput();
      return;
    }
    this.deaf = deaf;
    this.applyOutput();
    if (deaf) {
      this.showResume(false);
      return;
    }
    for (const slot of this.audios.values()) this.playIfPaused(slot.element, true);
  }

  private applyOutput(): void {
    for (const slot of this.audios.values()) {
      this.appliedVolume.delete(slot.key);
      if (slot.source === Track.Source.ScreenShareAudio) {
        this.applyGain(slot, this.watching.has(slot.guestId) ? this.screenLevel : 0);
        continue;
      }
      this.applyGain(slot, (this.lastGain.get(slot.guestId) ?? 1) * this.peerLevel(slot.guestId));
    }
  }

  private async disableMic(): Promise<void> {
    this.wantMic = false;
    await this.applyMic();
  }

  private playIfPaused(element: HTMLAudioElement, force = false): void {
    if (this.deaf || this.closed || document.visibilityState === 'hidden') return;
    const key = element.getAttribute('data-voice');
    if (!key || this.audios.get(key)?.element !== element) return;
    if (!element.paused && !element.ended) return;
    const now = performance.now();
    const waitUntil = this.playAfter.get(element) ?? 0;
    if (!force && now < waitUntil) return;
    this.playAfter.set(element, now + 400);
    const silent = (this.appliedVolume.get(key) ?? 1) <= 0;
    element.muted = silent;
    void element.play().then(() => {
      if (this.audios.get(key)?.element !== element) return;
      element.muted = silent;
      this.notePlayback(true);
    }).catch(() => {
      this.notePlayback(false);
    });
  }

  private notePlayback(ok: boolean): void {
    if (ok) {
      if (!this.hasPausedRemoteAudio()) {
        this.playbackBlocked = false;
        this.showResume(false);
      }
      return;
    }
    this.playbackBlocked = true;
    this.showResume(true);
  }

  private hasPausedRemoteAudio(): boolean {
    for (const slot of this.audios.values()) {
      if (slot.element.paused) return true;
    }
    return false;
  }

  private recycleAudioElements(): void {
    const snapshot = [...this.audios.values()].map((slot) => ({
      track: slot.track,
      source: slot.source,
      guestId: slot.guestId,
    }));
    for (const slot of snapshot) {
      this.dropByKey(mediaKey(slot.guestId, slot.source));
      this.attachAudio(slot.track, slot.source, slot.guestId);
    }
  }

  private readonly onAudioPause = (event: Event): void => {
    if (this.deaf || document.visibilityState === 'hidden') return;
    if (!(event.target instanceof HTMLAudioElement)) return;
    this.playIfPaused(event.target);
  };

  private readonly onForeground = (): void => {
    if (this.closed || document.visibilityState === 'hidden') return;
    if (this.room.state !== ConnectionState.Connected) {
      if (this.localId) void this.ensureLive().then(() => this.scheduleResume([0, 150, 600]));
      return;
    }
    this.scheduleResume([0, 150, 600]);
  };

  private readonly onAudioSession = (): void => {
    if (audioSession()?.state === 'interrupted') return;
    this.scheduleResume([0, 200]);
  };

  private readonly onUserGesture = (): void => {
    if (this.closed) return;
    void this.armMic();
    if (this.status !== 'live') {
      void this.ensureLive();
      return;
    }
    if (!this.playbackBlocked && this.room.canPlaybackAudio && !this.hasPausedRemoteAudio()) return;
    void this.unlock();
  };

  private scheduleResume(delays: number[]): void {
    this.clearResumeTimers();
    for (const ms of delays) {
      this.resumeTimers.push(window.setTimeout(() => void this.resumeAfterInterrupt(), ms));
    }
  }

  private clearResumeTimers(): void {
    for (const id of this.resumeTimers) window.clearTimeout(id);
    this.resumeTimers.length = 0;
  }

  private bindLifecycle(): void {
    if (this.listening) return;
    this.listening = true;
    document.addEventListener('visibilitychange', this.onForeground);
    window.addEventListener('pageshow', this.onForeground);
    window.addEventListener('focus', this.onForeground);
    document.addEventListener('pointerdown', this.onUserGesture, true);
    document.addEventListener('keydown', this.onUserGesture, true);
    audioSession()?.addEventListener('statechange', this.onAudioSession);
  }

  private unbindLifecycle(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('visibilitychange', this.onForeground);
    window.removeEventListener('pageshow', this.onForeground);
    window.removeEventListener('focus', this.onForeground);
    document.removeEventListener('pointerdown', this.onUserGesture, true);
    document.removeEventListener('keydown', this.onUserGesture, true);
    audioSession()?.removeEventListener('statechange', this.onAudioSession);
  }

  private async resumeAfterInterrupt(): Promise<void> {
    if (this.closed || this.room.state !== ConnectionState.Connected) return;
    if (document.visibilityState === 'hidden') return;
    if (this.resuming) {
      this.resumeQueued = true;
      return;
    }
    this.resuming = true;
    claimCallAudio();
    try {
      try {
        await this.room.startAudio();
      } catch {
        this.playbackBlocked = true;
      }
      for (const slot of this.audios.values()) this.playIfPaused(slot.element, true);
      await this.restoreMic();
      this.showResume(this.playbackBlocked || !this.room.canPlaybackAudio);
    } catch {
      this.playbackBlocked = true;
      this.showResume(true);
    } finally {
      this.resuming = false;
      if (this.resumeQueued) {
        this.resumeQueued = false;
        void this.resumeAfterInterrupt();
      }
    }
  }

  private async restoreMic(): Promise<void> {
    await this.applyMic();
  }

  private armMic(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.armedTrack) return Promise.resolve();
    if (this.armWait) return this.armWait;
    this.armWait = this.captureMic().finally(() => {
      this.armWait = null;
    });
    return this.armWait;
  }

  private async captureMic(): Promise<void> {
    if (this.armedTrack) return;
    try {
      const track = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (this.closed) {
        track.stop();
        return;
      }
      track.stopOnMute = false;
      if (!this.wantMic) await track.mute();
      this.armedTrack = track;
      await this.publishArmed(this.wantMic);
    } catch {
      if (this.wantMic) {
        this.wantMic = false;
        this.onChange();
      }
    }
  }

  private async maybeArmIfGranted(): Promise<void> {
    if (this.closed || this.armedTrack || this.armWait) return;
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') void this.armMic();
    } catch {
      return;
    }
  }

  private async applyMic(): Promise<void> {
    if (this.wantMic && !this.armedTrack) await this.armMic();
    await this.publishArmed(this.wantMic);
    this.onChange();
  }

  private async publishArmed(unmuted: boolean): Promise<void> {
    if (this.room.state !== ConnectionState.Connected) return;
    const track = this.armedTrack;
    if (track) {
      if (unmuted) await track.unmute();
      else await track.mute();
    }
    try {
      if (track && !this.room.localParticipant.getTrackPublication(Track.Source.Microphone)) {
        await this.room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
      }
      await this.room.localParticipant.setMicrophoneEnabled(unmuted);
    } catch {
      return;
    }
  }

  private dropArmedMic(): void {
    this.armWait = null;
    const track = this.armedTrack;
    this.armedTrack = null;
    try {
      track?.stop();
    } catch {
      return;
    }
  }

  private showResume(need: boolean): void {
    this.resumeBtn?.classList.toggle('hidden', this.closed || this.deaf || !need);
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

function isTouchDevice(): boolean {
  return (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia('(pointer: coarse)').matches;
}

function screenShareCapture(): {
  audio: boolean;
  contentHint: 'detail';
  surfaceSwitching: 'include';
  resolution?: { width: number; height: number; frameRate: number };
} {
  // LiveKit skips size constraints on Safari 17+ for a reason: forcing
  // 1920×1080 on iPad/iPhone encodes a landscape frame that Safari then
  // rotates with the device, so the share appears on its side.
  if (isTouchDevice()) {
    return { audio: true, contentHint: 'detail', surfaceSwitching: 'include' };
  }
  return {
    audio: true,
    contentHint: 'detail',
    surfaceSwitching: 'include',
    resolution: { width: 1920, height: 1080, frameRate: 15 },
  };
}

async function fetchSession(guestId: string, name: string, office = ''): Promise<VoiceSession> {
  const response = await fetch('/voice/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestId, name, ...(office ? { office } : {}) }),
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
