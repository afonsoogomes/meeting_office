import type { RoomId } from '../world/layout';

export type VoicePlace = {
  x: number;
  y: number;
  roomId: RoomId;
};

/** Same map room = same voice channel at full volume. Other rooms are silent. */
export function voiceGain(local: VoicePlace, remote: VoicePlace): number {
  return local.roomId === remote.roomId ? 1 : 0;
}
