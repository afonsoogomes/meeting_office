# Presence Specification

## Problem Statement

The office is a single-player Phaser client. Colleagues cannot see each other. Identity is a local avatar named "Você" with no guest id, so a future account cannot attach to the same person.

## Goals

- [ ] First visit asks for a name and stores it with a stable `guestId` in localStorage
- [ ] Two browsers on `npm run dev` show each other's avatar (move, sit, wave, name, look)
- [ ] Socket down still lets one person walk the office

## Out of Scope

| Feature | Reason |
| --- | --- |
| Accounts / login | Next milestone; bind `guestId` then |
| Shared furniture | Layout stays local so presence stays small |
| WebRTC / proximity audio | Milestone 3 |
| Chat | Milestone 3 |
| Multiple rooms | One office |

---

## User Stories

### P1: Guest name on first visit ⭐ MVP

**User Story**: As a new visitor, I want to type my name before entering so others can read it above my head.

**Why P1**: Identity has to exist before presence is meaningful, and it is the hook for later accounts.

**Acceptance Criteria**:

1. WHEN localStorage has no name or the name is `Você` THEN the system SHALL show a name gate and SHALL NOT start Phaser until a valid name is submitted
2. WHEN I submit a name of 2–18 characters THEN the system SHALL save `guestId`, `name`, and `appearance` in localStorage and start the office
3. WHEN I reload THEN the system SHALL skip the gate and reuse the same `guestId` and name
4. WHEN I change the name in the avatar panel (`C`) THEN the system SHALL persist it and, if online, tell peers

**Independent Test**: Clear site data, open the app, enter a name, reload — gate does not return; Application tab shows `guestId`.

---

### P1: Shared presence ⭐ MVP

**User Story**: As a teammate, I want to see other people walking the same office so it feels shared.

**Why P1**: This is the milestone (“two browsers on the same map”).

**Acceptance Criteria**:

1. WHEN two clients join THEN each SHALL see the other's avatar, name label, and appearance
2. WHEN a peer walks, runs, waves, sits, or lies down THEN the other client SHALL reflect that pose
3. WHEN a peer disconnects THEN their avatar SHALL leave
4. WHEN the server is unreachable THEN the local office SHALL still run and the HUD SHALL show a solo/offline state
5. WHEN I reconnect with the same `guestId` THEN the server SHALL replace the previous socket (no duplicate body)

**Independent Test**: `npm run dev`, two tabs, walk/sit/wave; quit one tab; kill the server process and confirm the remaining tab still walks.

---

## Edge Cases

- WHEN the name is blank or one character THEN the gate SHALL refuse submit
- WHEN a v6 avatar exists without `guestId` THEN load SHALL mint a `guestId` and keep name/appearance
- WHEN pose numbers are non-finite THEN the server SHALL drop the message
- WHEN more than 24 people try to join THEN later sockets SHALL be closed

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PRES-01 | P1: Guest name | Execute | Verified |
| PRES-02 | P1: guestId persistence | Execute | Verified |
| PRES-03 | P1: Shared presence | Execute | Verified |
| PRES-04 | P1: Offline solo | Execute | Verified |
| PRES-05 | P1: Replace duplicate guestId | Execute | Verified |

---

## Success Criteria

- [ ] Two tabs see each other move
- [ ] First visit is gated on name; reload is not
- [ ] No account, no shared furniture, no audio in this slice
