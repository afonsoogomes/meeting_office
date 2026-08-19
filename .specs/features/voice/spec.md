# Voice (proximity) Specification

## Problem Statement

O escritório compartilhado ainda é mudo. Para parecer Gather, quem está perto precisa se ouvir, e uma porta (sala diferente) precisa cortar o som.

## Goals

- [ ] Conversar por proximidade no mesmo cômodo, sem “iniciar call”
- [ ] Mute / ensurdecer no HUD, com anel de falando no avatar
- [ ] Voz opcional: se o SFU estiver fora, o jogo continua

## Out of Scope

| Feature | Reason |
| --- | --- |
| Vídeo / tela | Mixer e SFU iguais; entra depois |
| TURN em produção | Dev local na mesma máquina não precisa |
| HRTF esquerda/direita | Volume por distância basta no v1 |
| Mesh P2P | Não escala até 24 pessoas |

---

## User Stories

### P1: Ouvir quem está no mesmo cômodo ⭐ MVP

**User Story**: Como colega no escritório, quero ouvir quem está perto na mesma sala.

**Acceptance Criteria**:

1. WHEN duas pessoas estão no lounge THEN cada uma SHALL ouvir a outra em volume cheio
2. WHEN uma pessoa entra na sala de reunião e a outra fica no hall THEN o áudio SHALL cortar
3. WHEN o LiveKit não está no ar THEN o jogo SHALL continuar e o HUD SHALL mostrar voz off

### P1: Mute e microfone

**User Story**: Como jogador, quero ligar/desligar o mic com um clique ou tecla.

**Acceptance Criteria**:

1. WHEN eu clico o pill de mic (ou `M`) THEN o microfone SHALL alternar mute
2. WHEN o mic está mudo THEN os outros SHALL não me ouvir e o avatar SHALL mostrar “mudo”
3. WHEN eu falo com o mic aberto THEN um anel SHALL aparecer no avatar (local e remoto)
4. WHEN o browser bloqueia autoplay THEN o primeiro clique no jogo SHALL liberar o áudio (`startAudio`)

### P2: Ensurdecer

**User Story**: Como jogador, quero silenciar a saída sem desligar o mic.

**Acceptance Criteria**:

1. WHEN eu clico o pill de som (ou `K`) THEN os áudios remotos SHALL ficar mudos localmente
2. WHEN eu desensurdeço THEN o mixer espacial SHALL voltar a aplicar volume

---

## Traceability

| ID | Story | Covers |
| --- | --- | --- |
| VOICE-01 | P1 cômodo | Mixer + `roomAt` |
| VOICE-02 | P1 mute | LiveKit `setMicrophoneEnabled` + HUD |
| VOICE-03 | P2 deaf | Gain/mute local |
| VOICE-04 | Degradação | Token/connect falha sem derrubar a cena |
