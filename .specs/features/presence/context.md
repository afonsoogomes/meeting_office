# Presence — context

Decisions from the 2026-08-19 discussion. Locked for this slice.

| Topic | Decision |
| --- | --- |
| Identity now | `guestId` (UUID) + `name` + `appearance` in localStorage |
| First visit | Overlay asks for name before the game starts |
| Accounts | Later. Login will bind the same `guestId`; do not invent auth now |
| World | One room. Furniture stays per-browser (localStorage). Map is not synced |
| Failure | If the socket is down, play solo. Do not block the office |
| Voice / chat | Out of scope |
| NPCs | Keep Rafa / Nina / Caio |
| Stack | In-repo `ws` server + Vite proxy. No PartyKit, Colyseus, or Nest |
