# Escritório jogável — Specification

## Problem Statement

Precisamos de um protótipo andável do escritório virtual, usando as sprites já extraídas, para validar a sensação de Gather antes de investir em rede e vídeo.

## Goals

- [ ] Personagem composto pelas atlases 112×112 anda nas 4 direções
- [ ] Escritório com 4 zonas reconhecíveis e colisão
- [ ] `npm run dev` sobe o jogo no browser

## Out of Scope

| Feature | Reason |
| --- | --- |
| Multijogador | Marco 2 |
| Áudio/vídeo | Marco 3 |
| Backend / login | Fora do protótipo |

---

## User Stories

### P1: Andar pelo escritório ⭐ MVP

**User Story:** Como colega, quero mover meu avatar com teclado para explorar o escritório.

**Acceptance Criteria:**

1. WHEN eu pressiono WASD ou setas THEN o personagem SHALL andar na direção correspondente
2. WHEN eu solto as teclas THEN o personagem SHALL ficar em idle na última direção
3. WHEN eu atravesso um móvel ou parede THEN o sistema SHALL bloquear o movimento

**Independent Test:** Nascer no corredor, andar até o lounge sem atravessar paredes.

### P1: Personagem em camadas ⭐ MVP

**User Story:** Como colega, quero ver um avatar vestido (corpo + roupa + cabelo) usando as sprites do pack.

**Acceptance Criteria:**

1. WHEN o jogo carrega THEN o personagem SHALL renderizar as camadas na ordem do README das sprites
2. WHEN o personagem anda THEN o body SHALL trocar para o frame `walk` da direção
3. WHEN eu pressiono G THEN o personagem SHALL acenar (`wave`) e voltar ao idle

**Independent Test:** Trocar cabelo/roupa no painel e ver o overlay atualizar.

### P1: Zonas do escritório ⭐ MVP

**User Story:** Como colega, quero perceber salas diferentes (reunião, lounge, café, open office).

**Acceptance Criteria:**

1. WHEN eu entro numa zona THEN o HUD SHALL mostrar o nome da sala
2. WHEN eu me aproximo de um NPC THEN o NPC SHALL olhar para mim e “falar”
3. WHEN eu uso o scroll THEN a câmera SHALL dar zoom mantendo o pixel art nítido

**Independent Test:** Entrar na sala de reunião e ver o HUD mudar.

### P2: Customizar avatar

**User Story:** Como colega, quero escolher cabelo, rosto e roupa.

**Acceptance Criteria:**

1. WHEN eu altero uma peça no painel THEN o personagem SHALL atualizar na hora
2. WHEN eu recarrego a página THEN a aparência SHALL persistir no localStorage

---

## Edge Cases

- WHEN WASD e setas são pressionados juntos THEN o movimento SHALL ser normalizado (sem acelerar na diagonal)
- WHEN o pack não tem vista traseira da roupa THEN o body `up` SHALL esconder face/óculos/barba
- WHEN uma camada opcional está vazia THEN o sprite SHALL ficar oculto

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CHAR-01 | Personagem em camadas | Execute | Implementing |
| CHAR-02 | Movimento 4 direções | Execute | Implementing |
| CHAR-03 | Wave / talk | Execute | Implementing |
| MAP-01 | Mapa + colisão | Execute | Implementing |
| MAP-02 | Zonas + HUD | Execute | Implementing |
| DEV-01 | `npm run dev` | Execute | Implementing |

---

## Success Criteria

- [ ] `npm run dev` abre o escritório sem erros no console
- [ ] Dá para andar, acenar e customizar o avatar
- [ ] As 4 salas são distinguíveis
