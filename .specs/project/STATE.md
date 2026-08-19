# State

**Last Updated:** 2026-08-19
**Current Work:** voz por proximidade (LiveKit)

---

## Recent Decisions (Last 60 days)

### AD-006: Voz via LiveKit SFU (2026-08-19)

**Decision:** Audio em WebRTC pelo LiveKit (`livekit-client` + `POST /voice/token`). Mixer de volume no cliente com `roomAt` + distância. Dev local: `livekit-server --dev` (Docker) com key `devkey`.
**Reason:** Mesh P2P não aguenta o teto de 24; o `/ws` de presença não serve para PCM.
**Trade-off:** `npm run dev` tenta subir Docker; se falhar, o jogo segue e o HUD mostra voz off.
**Impact:** Vídeo e TURN ficam para depois. Identity LiveKit = presence id da aba.

### AD-005: Presença no NestJS (2026-08-19)

**Decision:** Substituir o `server/index.ts` avulso por um app Nest (`server/`), HTTP em `:8787` e `ws` no path `/ws`. O protocolo do cliente permanece o mesmo.
**Reason:** Conta/login entra como `AuthModule` + JWT sem trocar o Phaser; `GET /health` já existe; ValidationPipe global para HTTP futuro.
**Trade-off:** Não usamos `@WebSocketGateway` (formato `{ event, data }`); o socket nativo evita reescrever o cliente.
**Impact:** `guestId` continua o gancho da conta. `nest g module auth` no pacote `server/` quando for a hora.

### AD-004: Presença via `ws` in-repo (2026-08-19)

**Decision:** Um processo Node com `ws` na porta 8787, Vite faz proxy de `/ws`. Identidade de conta futura é `guestId` no localStorage; o id na rede é por aba (`sessionStorage`) para duas abas se verem.
**Reason:** Sem conta cloud; `npm run dev` sobe cliente e sala; o teste do marco é dois browsers no mesmo mapa.
**Trade-off:** Deploy na internet exige hospedar o processo do WebSocket, não só o estático.
**Impact:** Furniture continua local. Contas entram depois ligando o `guestId`.

### AD-001: Phaser 4 + Vite + TypeScript (2026-08-15)

**Decision:** Usar Phaser 4 (versão atual no npm) com Vite.
**Reason:** `npm install phaser` entrega a linha 4.x; API de tilemap/arcade permanece familiar.
**Trade-off:** Menos tutoriais do que Phaser 3.
**Impact:** Projeto sobe com `npm run dev`.

### AD-002: v1 local, sem rede (2026-08-15)

**Decision:** Primeiro entregável é single-player com NPCs.
**Reason:** Pedido enfatiza mecânica do personagem e comando para testar; multiplayer/WebRTC é outro marco.
**Trade-off:** Ainda não dá para “reunir de verdade” com colegas.
**Impact:** Código do `Character` fica agnóstico a input (jogador vs NPC) para encaixar rede depois.

### AD-003: Roupas só de frente (2026-08-15)

**Decision:** Overlay de catálogo em todas as direções; esconder face/óculos/barba quando virado para cima.
**Reason:** O pack não tem vistas laterais/trasseiras das peças.
**Trade-off:** Perfil e costas ficam híbridos (corpo direcional + roupa frontal).
**Impact:** Documentado no README.

---

## Active Blockers

_Nenhum._

---

## Lessons Learned

### L-001: Array tilemap usa índice 0 como primeiro tile

**Context:** Grid gerado em código, não Tiled JSON.
**Problem:** Em Tiled, 0 é vazio; no `make.tilemap({ data })` do Phaser, 0 é o primeiro tile do tileset.
**Solution:** `Tile.Wood = 0` de propósito.
**Prevents:** Salas “vazias” no chão.

### L-002: tsx/esbuild não emite `design:paramtypes`

**Context:** Nest no `server/` sobe com `tsx watch`.
**Problem:** DI por construtor deixou `presence` undefined; o processo crashava no primeiro `join`.
**Solution:** `@Inject(PresenceService)` no socket.
**Prevents:** Provider Nest com tsx sem token explícito.

---

## Quick Tasks Completed

| # | Description | Date | Commit | Status |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

---

## Deferred Ideas

- [x] Presença em tempo real (WebSocket in-repo)
- [x] WebRTC por proximidade
- [ ] Bolha de câmera / vídeo
- [ ] Pets como companions
- [ ] Editor de mapa
- [ ] Contas ligando o `guestId` local
- [ ] Layout de móveis no servidor

---

## Todos

- [x] Validar visual das sprites no browser (personagem composto aparece no corredor)
