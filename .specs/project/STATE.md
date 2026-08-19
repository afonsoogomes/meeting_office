# State

**Last Updated:** 2026-08-15
**Current Work:** office-mvp — prototype jogável via `npm run dev`

---

## Recent Decisions (Last 60 days)

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

---

## Quick Tasks Completed

| # | Description | Date | Commit | Status |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

---

## Deferred Ideas

- [ ] Multijogador (Colyseus / PartyKit / WebSocket)
- [ ] WebRTC por proximidade
- [ ] Pets como companions
- [ ] Editor de mapa

---

## Todos

- [x] Validar visual das sprites no browser (personagem composto aparece no corredor)
