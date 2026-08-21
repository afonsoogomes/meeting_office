import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { DEFAULT_OFFICE_SLUG } from '../../../shared/protocol';

const ROOM = process.env.LIVEKIT_ROOM ?? 'office';
const API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'secret';
const PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL ?? process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';

@Injectable()
export class VoiceService {
  async issue(
    guestId: string,
    name: string,
    officeSlug = DEFAULT_OFFICE_SLUG,
  ): Promise<{ url: string; token: string; room: string }> {
    const room = `${ROOM}-${officeSlug}`;
    try {
      const token = new AccessToken(API_KEY, API_SECRET, {
        identity: guestId,
        name,
        ttl: '2h',
      });
      token.addGrant({
        roomJoin: true,
        room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });
      return { url: PUBLIC_URL, token: await token.toJwt(), room };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'token failed';
      throw new ServiceUnavailableException(message);
    }
  }
}
