# Voice tasks

1. **Token Nest** — `POST /voice/token` mints JWT LiveKit (`guestId` = identity).
2. **LiveKit local** — `docker compose` / `livekit-server --dev` no `npm run dev`.
3. **Cliente** — `VoiceClient` conecta, anexa tracks, mute/deaf.
4. **Mixer** — `voiceGain` por sala + distância; tick na `OfficeScene`.
5. **HUD + avatar** — pills mic/som, `M`/`K`, anel de falando, badge mudo.
