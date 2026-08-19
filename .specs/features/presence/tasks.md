# Presence Tasks

**Design**: `.specs/features/presence/design.md`
**Status**: Done

Tests: none (no coverage matrix). Gate: `npm run build`.

## Execution Plan

T1 → T2 → T3 → T4 → T5

### T1: Identity + name gate

**Where**: `src/character/appearance.ts`, `src/ui/gate.ts`, `index.html`, `src/styles.css`, `src/main.ts`
**Requirement**: PRES-01, PRES-02

### T2: Shared protocol

**Where**: `shared/protocol.ts`
**Requirement**: PRES-03

### T3: WebSocket room

**Where**: `server/index.ts`, `package.json`, `vite.config.ts`
**Requirement**: PRES-03, PRES-05

### T4: Character snapshot / remote apply

**Where**: `src/character/Character.ts`
**Requirement**: PRES-03

### T5: Presence client + scene + HUD

**Where**: `src/net/presence.ts`, `src/scenes/OfficeScene.ts`, `src/ui/hud.ts`, `README.md`
**Requirement**: PRES-03, PRES-04
