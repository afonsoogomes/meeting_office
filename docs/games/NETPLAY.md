# SNES Netplay (EmulatorJS)

Instalação (Docker, ROM, env, VPS): **[INSTALL.md](./INSTALL.md)**.

O escritório cria a sessão (quem é P1–P5, qual ROM, password). **Cada browser** abre o EmulatorJS. O Nest **não** envia frames.

## O que o EmulatorJS faz (e o que não faz)

Isto **não** é o netplay do RetroArch (TCP 55435, cada lado emula o SNES em lockstep).

O Netplay atual do EmulatorJS (`latest`, classe `Netplay`) é:

1. Sinalização **Socket.IO** no servidor `infra/emulatorjs-netplay` (contentor :3000; no host é `NETPLAY_PORT`).
2. **WebRTC** entre os browsers: o **host** (Player 1) emula; os outros recebem vídeo e mandam input.
3. O índice do controle é `Object.keys(players).indexOf(playerID)` — **ordem de entrada**. Quem abre a sala é P1. O próximo join é P2.

Não existe `EJS_playerNumber`. O backend marca `playerNumber` e **só o P1** chama `netplayOpenRoom`. Os outros esperam o `sessionid` e chamam `netplayJoinRoom`.

Se o host cair, o servidor Netplay promove outro owner e os ports SNES podem embaralhar. O Nest encerra a sessão.

`EJS_gameID` tem de ser um **número** (saves + lista de salas). O catálogo mapeia slug → inteiro.

## ROMs

Nada comercial no git. Coloque ficheiros que você tem direito de hospedar:

```
server/data/roms/snes/super-bomberman-5.smc  →  super-bomberman-5
server/data/roms/snes/super-mario-kart.sfc   →  super-mario-kart
server/data/roms/snes/game.sfc               →  snes-2p
```

Catálogo: `shared/game-catalog.ts`. O jogo só aparece **enabled** se o ficheiro existir. `GAMES_ROM_DIR` aponta para essa pasta (cwd do Nest = `server/`).

A ROM só é servida em `GET /games/:id/rom` para quem está na sessão **starting/playing**.

## Dev

```bash
# ROM de teste (homebrew / dump seu)
cp ~/meus-jogos/snes-2p.sfc server/data/roms/snes/game.sfc

npm test
npm run dev
```

Docker Compose sobe **livekit** e **netplay**. Sem Docker, o script tenta `node infra/emulatorjs-netplay/server.js`.

Abra duas abas (dois `guestId`). `E` no fliperama → **Criar sala** / **Entrar** / **Assistir** → **Estou pronto** (se fores jogar). Quando a partida arranca, o emulador abre sozinho.

Dá para **começar sozinho** (host: **Começar**). Várias salas do mesmo jogo podem existir ao mesmo tempo. **Assistir** entra no stream do host sem ocupar P1–P5; o teclado do espectador é bloqueado. O EmulatorJS não tem modo watch nativo — o espectador só entra na sala Netplay **depois** de todos os jogadores estarem ligados, para não roubar o slot P2+.

## Teste manual P1 / P2

1. Aba A: **Criar sala** (`snes-2p`, Kart ou Bomberman). Você é Player 1. **Começar** se quiseres solo.
2. Aba B: **Entrar** nessa sala (não numa nova). Você é Player 2. Ou **Assistir** para só ver.
3. Os jogadores marcam **Estou pronto** (não precisa se fores o host a começar sozinho).
4. Aba A: **Começar** (só se a sala ainda não estiver cheia). O emulador abre em todos.
5. Aba B (jogador): o jogo abre sozinho e entra na mesma sala Netplay.
6. Aba C (espectador): espera os jogadores abrirem → **Assistir**.
7. Confirme na barra: Player 1 no Netplay / Player 2 no Netplay / A assistir.
8. **Voltar ao escritório** encerra (host) ou sai (guest / espectador).

## Rede / Nginx

| Peça | Porta | Protocolo | NPM? |
| --- | --- | --- | --- |
| Nest `/games` | 8787 | HTTPS | sim, mesmo host do site |
| Nest `/ws` | 8787 | WSS | sim |
| Netplay | `NETPLAY_PORT` (default 3000) | HTTP + Socket.IO (TCP) | sim, **outro** location ou subdomínio |
| WebRTC mídia | dinâmico | UDP (STUN/TURN) | **não** passa no NPM |
| LiveKit | inalterado | | |

Produção, no Proxy Host do escritório, extra:

```
location /games { proxy_pass http://127.0.0.1:8787; ... }
```

Netplay (subdomínio `netplay.exemplo.com` → host `NETPLAY_PORT`) com WebSocket:

```
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

No Nest: `NETPLAY_PUBLIC_URL=https://netplay.exemplo.com`

Socket.IO usa `/socket.io` nesse host. Não precisa STUN extra na LAN. Na internet, NAT simétrico pede TURN:

```
NETPLAY_ICE_JSON=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:seu-turn:3478","username":"...","credential":"..."}]
```

Não sobe coturn no compose por omissão.

`EJS_CDN` default: `https://cdn.emulatorjs.org/latest/data/` (`latest` acompanha o `main`; no CDN **não existe** `/main/`). A stable 4.2.3 **não** expõe `netplayOpenRoom` (issue #1185).

No Super Bomberman 5 o SNES só destrava 3PLAYER–5PLAYER como **MAN** com Super Multitap na porta 2. O core `snes9x` do canal `latest` **não exporta** `ejs_set_controller_port_device`; o iframe pede o core em `4.3.0-pre` (e grava `input_libretro_device_p2 = 257` no `retroarch.cfg`). Sem isso o ecrã de select só deixa COM/OFF no 3PLAYER — as três janelas mostram o mesmo ecrã porque os convidados recebem o vídeo do host.

## Segurança

O cliente **não** escolhe `playerNumber`, `userId` da sessão nem a ROM. Password Netplay nasce no Nest e só vai no `GET .../play`. `/list` do servidor Netplay continua público; a password impede join aleatório. CORS do Netplay é aberto (código upstream); não exponha a porta 3000 na internet sem TLS + firewall.

## API

```
GET  /games
POST /games/sessions            { guestId, name, gameId }
POST /games/sessions/:id/join
POST /games/sessions/:id/watch
POST /games/sessions/:id/ready
POST /games/sessions/:id/start
POST /games/sessions/:id/netplay  { guestId, roomId }  // só P1
POST /games/sessions/:id/leave
GET  /games/sessions/:id/play?guestId=
GET  /games/:gameId/rom?guestId=
```

WS `{ type: 'game', sessions: [...] }` (sem password).
