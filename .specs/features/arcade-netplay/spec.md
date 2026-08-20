# Arcade SNES Netplay

## Problem Statement

O fliperama no escritório é só um móvel. Quem chega nele precisa escolher um SNES autorizado, formar P1/P2 no backend, e abrir o EmulatorJS sem configurar o emulador à mão.

## Goals

- [ ] Criar/entrar em sessão no Nest, com `guestId` (não há contas).
- [ ] Atribuir playerNumber no servidor.
- [ ] Abrir EmulatorJS (SNES) e ligar o Netplay self-hosted.
- [ ] Voltar ao escritório ao sair.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Contas / JWT | Identidade continua `guestId` |
| Cores além de SNES | MVP |
| ROMs comerciais no git | Só path configurável |
| Netplay Libretro TCP 55435 | EmulatorJS não expõe isso |
| Cada cliente emular o SNES sozinho | EmulatorJS manda vídeo do host aos guests |

---

## User Stories

### P1: Sessão + P1/P2 ⭐ MVP

**User Story**: Como colega no escritório, quero `E` no fliperama, escolher um SNES e ocupar um slot.

**Acceptance Criteria**:

1. WHEN o host cria uma sessão THEN o sistema SHALL ser Player 1.
2. WHEN outro `guestId` entra THEN o sistema SHALL ser Player 2 (próximo número livre).
3. WHEN a sessão está cheia THEN join SHALL falhar.
4. WHEN o mesmo `guestId` entra de novo THEN o sistema SHALL devolver o mesmo slot.
5. WHEN todos os **jogadores** (não espectadores) estão READY e a sessão está completa THEN status SHALL virar STARTING.
6. WHEN o host pede start com ≥ minPlayers (incluindo 1) todos prontos THEN SHALL começar mesmo com lugares vazios.
7. WHEN já existe uma sessão THEN criar SHALL abrir **outra sala** (não junta automaticamente).
8. WHEN um guest escolhe Assistir THEN SHALL entrar como `spectator` sem `playerNumber` 1–max.

**Independent Test**: testes do `GamesService` sem browser.

### P1: Emulador + Netplay

**User Story**: Como jogador pronto, quero o SNES abrir e o outro browser ser o outro controle.

**Acceptance Criteria**:

1. WHEN o host abre o overlay THEN o EmulatorJS SHALL criar a sala Netplay.
2. WHEN o guest abre o overlay THEN SHALL entrar na mesma sala (password da sessão).
3. WHEN os dois estão na sala THEN P1 SHALL ser o host EmulatorJS e P2 o primeiro join.

### P2: Sair e voltar ao mapa

**User Story**: Como jogador, quero sair e voltar a andar no escritório.

---

## Requirement Traceability

| ID | Requirement | Story | Status |
| --- | --- | --- | --- |
| SNES-01 | Backend dono de sessão, slot e jogo | P1 sessão | Implemented |
| SNES-02 | Frontend não escolhe playerNumber | P1 sessão | Implemented |
| SNES-03 | ROM só via storage, se o guest está na sessão | P1 emulador | Implemented |
| SNES-04 | EmulatorJS iframe + Netplay self-hosted | P1 emulador | Implemented |
| SNES-05 | Host = P1 no Netplay (ordem de join) | P1 emulador | Implemented |
