# Instalar o fliperama SNES (Netplay)

Passo a passo para subir a parte de jogos: contentor Docker, ROM, variáveis e proxy. Como o Netplay funciona por dentro: [NETPLAY.md](./NETPLAY.md). Deploy geral do escritório (Nest, LiveKit, NPM): [../deploy/vps-nginx-proxy-manager.md](../deploy/vps-nginx-proxy-manager.md).

O Nest **não** emula o SNES. Ele só cria salas (até **5** jogadores no Bomberman, mais quem assiste). Cada browser abre o EmulatorJS; o contentor `netplay` faz a sinalização Socket.IO.

## 1. O que precisa existir

| Peça | Onde | Porta no contentor | Porta no host (env) |
| --- | --- | --- | --- |
| Nest `/games` | processo Node | — | `PORT` (8787) |
| Contentor **netplay** | `docker compose` | 3000 | **`NETPLAY_PORT`** (3000) |
| Contentor **livekit** (voz, já existia) | `docker compose` | 7880 / 7881 / 7882 | **`LIVEKIT_PORT`**, `LIVEKIT_TCP_PORT`, `LIVEKIT_UDP_PORT` |
| ROM | disco, fora do git | — | `GAMES_ROM_DIR` |

As envs `*_PORT` mudam só a porta **espelhada no host** (`host:container`). O processo dentro do contentor continua na porta de sempre.

## 2. Dev na tua máquina

```bash
cp .env.example .env          # na raiz do repo
# opcional: NETPLAY_PORT=3010 se a 3000 estiver ocupada

mkdir -p server/data/roms/snes
cp /caminho/do/teu/dump.smc server/data/roms/snes/super-bomberman-5.smc

npm install
npm run dev
```

`npm run dev` sobe Vite, Nest, LiveKit e Netplay. O compose lê o `.env` da raiz para interpolar as portas. O Nest também lê esse ficheiro.

Confirma:

```bash
curl -sS http://127.0.0.1:3000/health
# {"ok":true}   — usa a tua NETPLAY_PORT se mudaste

curl -sS http://127.0.0.1:8787/games
# Bomberman com "enabled": true e "maxPlayers": 5 se a ROM estiver no sítio
```

No mapa: `E` no fliperama → **Criar sala** → **Começar agora** (solo) ou espera gente até 5 → **Abrir fliperama**.

## 3. Variáveis

Copia `.env.example` → `.env` (local) ou mete as mesmas chaves no systemd da VPS.

| Variável | Obrigatória | Função |
| --- | --- | --- |
| `GAMES_ROM_DIR` | sim na VPS | Pasta das ROMs. Cwd do Nest = `server/`, por isso `data/roms` → `server/data/roms/` |
| `NETPLAY_PORT` | não (default 3000) | Porta do **host** publicada pelo Docker (`3010:3000` se puseres 3010) |
| `NETPLAY_PUBLIC_URL` | sim na VPS | URL que o **browser** usa. Local: vazio → `http://<hostname>:<NETPLAY_PORT>`. VPS: `https://netplay.exemplo.com` |
| `LIVEKIT_PORT` | não (7880) | Porta host da sinalização LiveKit |
| `LIVEKIT_TCP_PORT` | não (7881) | Porta host TCP RTC |
| `LIVEKIT_UDP_PORT` | não (7882) | Porta host UDP do compose `--dev` (produção LiveKit usa a range 50000–60000, não esta) |
| `EJS_CDN` | não | Default `https://cdn.emulatorjs.org/latest/data/` |
| `NETPLAY_ICE_JSON` | não | TURN se o WebRTC falhar na internet |

Se mudares `NETPLAY_PORT` na VPS, o **Forward Port** do Nginx Proxy Manager tem de ser o mesmo número. `NETPLAY_PUBLIC_URL` continua o HTTPS do subdomínio.

Se mudares `LIVEKIT_PORT` em local, atualiza `LIVEKIT_URL` / `LIVEKIT_PUBLIC_URL` para o mesmo porto (`ws://127.0.0.1:7980`).

## 4. ROM

Nada comercial no git (`.gitignore` em `server/data/roms/**`). Nomes esperados:

```
server/data/roms/snes/super-bomberman-5.smc   →  Super Bomberman 5 (1–5 jogadores)
server/data/roms/snes/super-mario-kart.sfc    →  Super Mario Kart (1–2)
server/data/roms/snes/game.sfc                →  SNES 2P genérico
```

O catálogo (`shared/game-catalog.ts`) só marca **enabled** se o ficheiro existir.

## 5. VPS (depois do Nest/site já rodarem)

Na pasta do repo:

```bash
cd /opt/meeting-office
git pull
npm install
npm run build

mkdir -p server/data/roms/snes
# copia a ROM que tens direito de hospedar
cp /root/roms/super-bomberman-5.smc server/data/roms/snes/super-bomberman-5.smc
```

`.env` na raiz (o compose interpola) **e** as mesmas chaves no systemd do Nest:

```bash
GAMES_ROM_DIR=/opt/meeting-office/server/data/roms
NETPLAY_PORT=3000
NETPLAY_PUBLIC_URL=https://netplay.exemplo.com
```

Sobe **só** o netplay (o LiveKit de produção costuma ser outro container, não o `--dev` do compose):

```bash
docker compose up -d --build netplay
curl -sS http://127.0.0.1:${NETPLAY_PORT:-3000}/health
```

Reinicia o Nest para apanhar as env. SQLite não precisa de migrate à mão.

### Nginx Proxy Manager

1. No Proxy Host do escritório: custom location **`/games`** → Nest `8787` (como `/ws`).
2. Proxy Host novo: `netplay.exemplo.com` → `172.17.0.1` porta **`NETPLAY_PORT`**, Websockets ON, Let’s Encrypt.
3. DNS A `netplay.exemplo.com` no IP da VPS.

Não abras `NETPLAY_PORT` na internet; só 443 no NPM.

### Arcade no mapa antigo

Se o `office.db` já existia antes do fliperama no seed, a máquina pode não estar no chão. Coloca com `F`, ou uma vez `OFFICE_RESEED=1` no restart do Nest (restaura o layout default).

## 6. Conferir na VPS

```bash
curl -sS http://127.0.0.1:8787/games
curl -sS http://127.0.0.1:3000/health          # ou a tua NETPLAY_PORT
curl -sS https://office.exemplo.com/games
curl -sS https://netplay.exemplo.com/health
```

Dois browsers em `https://office.exemplo.com`, `E` no fliperama, criar / entrar / assistir.

| Sintoma | Causa típica |
| --- | --- |
| Jogo “sem ROM” | Ficheiro em falta ou `GAMES_ROM_DIR` errado (cwd do Nest) |
| `ERR_CONNECTION_REFUSED` :3000 | Contentor `netplay` down, ou `NETPLAY_PORT` ≠ URL do browser |
| Netplay 502 no subdomínio | NPM a apontar para a porta antiga; alinha com `NETPLAY_PORT` |
| Solo ok, ninguém junta | `NETPLAY_PUBLIC_URL` com `127.0.0.1` ou `http` no site HTTPS |
| Sem fliperama no mapa | SQLite antigo; `F` ou `OFFICE_RESEED=1` |
