# Roadmap

**Current Milestone:** Voz por proximidade
**Status:** Complete

---

## Milestone 1 — Escritório jogável

**Goal:** Abrir o browser, andar com o avatar e reconhecer o escritório.
**Target:** Prototype jogável via `npm run dev`

### Features

**Personagem base** - COMPLETE

- Camadas das sprites (body, clothes, hair)
- Movimento 4 direções, idle/walk/wave
- Customização simples de avatar

**Mapa do escritório** - COMPLETE

- Open office, sala de reunião, lounge e café
- Colisão, câmera, zoom
- Zonas no HUD e NPCs

---

## Milestone 2 — Presença compartilhada

**Goal:** Dois browsers no mesmo mapa.

### Features

**Multijogador** - COMPLETE

- Nome na primeira visita + `guestId` no localStorage
- Servidor WebSocket de presença (uma sala)
- Avatares remotos (andar, sentar, acenar)

**Proximidade (ouvir quem está perto)** - COMPLETE

---

## Milestone 3 — Reuniões de verdade

**Goal:** Sala privada com áudio/vídeo.

### Features

**WebRTC por zona** - COMPLETE (isolamento por `roomAt`; volume por distância)
**Chat rápido** - COMPLETE
**Bolha de câmera** - PLANNED

---

## Future Considerations

- Pets seguindo o personagem
- Salas/mapas customizáveis
- Persistência de avatar na conta
