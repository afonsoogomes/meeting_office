# Subir o Meeting Office na VPS (Nginx Proxy Manager)

Um domínio HTTPS na frente de tudo. O Nginx Proxy Manager (NPM) termina o TLS; o Nest, o `dist/` e o LiveKit ficam na VPS.

Não precisa de `VITE_WS_URL` nem de base URL no frontend se o site e a API forem o **mesmo host**.

```
Browser
  │  https://office.exemplo.com          (jogo + /ws + /voice)
  │  wss://livekit.exemplo.com           (mídia WebRTC)
  ▼
Nginx Proxy Manager :443
  ├─ /           → estático  :4173   (pasta dist/)
  ├─ /ws         → Nest      :8787   (WebSocket de presença)
  ├─ /offices    → Nest      :8787   (casa + móveis)
  ├─ /voice      → Nest      :8787   (POST /voice/token)
  ├─ /games      → Nest      :8787   (sessões SNES + ROM)
  ├─ /health     → Nest      :8787
  ├─ netplay.*   → Netplay   :3000   (Socket.IO; WebSocket)
  └─ livekit.*   → LiveKit   :7880   (sinalização)
                   UDP 50000–60000   (mídia; NÃO passa pelo NPM)
```

O cliente já monta as URLs assim:

- presença: `wss://<mesmo-host>/ws`
- token: `POST /voice/token` (origem da página)
- LiveKit: o JSON do token traz `LIVEKIT_PUBLIC_URL` — o browser conecta **nessa** URL, não em `127.0.0.1`

---

## 1. O que sobe na VPS

| Peça | Comando | Porta |
| --- | --- | --- |
| Site | `npm run build` e servir `dist/` | 4173 |
| Nest | `npm run start -w meeting-office-server` | 8787 (`PORT`) |
| LiveKit | Docker com config de produção | 7880/tcp + UDP |

`npm run dev` e `livekit --dev` são só para a sua máquina.

---

## 2. Variáveis de ambiente (Nest)

Arquivo na VPS, por exemplo `/opt/meeting-office/server/.env` (o `tsx` **não** carrega `.env` sozinho — exporte no systemd ou use `EnvironmentFile`).

```bash
PORT=8787

LIVEKIT_API_KEY=officekey
LIVEKIT_API_SECRET=cole_aqui_um_segredo_longo
LIVEKIT_ROOM=office

# URL que o BROWSER usa. Tem que ser o host do Proxy Host do LiveKit.
LIVEKIT_PUBLIC_URL=wss://livekit.exemplo.com

# SQLite do escritório compartilhado (seed em shared/office-default.ts na primeira subida)
OFFICE_DB_PATH=/opt/meeting-office/server/data/office.db

# SNES: ROMs que você tem direito de hospedar
GAMES_ROM_DIR=/opt/meeting-office/server/data/roms
NETPLAY_PUBLIC_URL=https://netplay.exemplo.com
EJS_CDN=https://cdn.emulatorjs.org/latest/data/
```

Gere o secret:

```bash
openssl rand -hex 32
```

Não use `devkey` / `secret` nem `ws://127.0.0.1:7880` na VPS.

### Precisa de `VITE_*`?

| Situação | Precisa? |
| --- | --- |
| NPM no mesmo domínio (`office.exemplo.com` serve o jogo e faz proxy de `/ws`, `/offices` e `/voice`) | **Não.** Build normal, sem env no Vite. |
| Nest noutro host (`api.exemplo.com`) | Sim: `VITE_WS_URL=wss://api.exemplo.com/ws` **no `npm run build`**. O `POST /voice/token` ainda vai para a origem da página — nesse caso o NPM do **site** também precisa proxy de `/voice`, ou o fetch quebra. Prefira um domínio só. |

`LIVEKIT_URL` no Nest é opcional; se não existir, vale `LIVEKIT_PUBLIC_URL`.

---

## 3. Build e processos no host

Na pasta do repo:

```bash
cd /opt/meeting-office
git pull
npm install
npm run build
```

Isso gera `dist/` (estático) e typecheck do Nest. O Nest em produção hoje sobe com:

```bash
PORT=8787 \
LIVEKIT_PUBLIC_URL=wss://livekit.exemplo.com \
LIVEKIT_API_KEY=officekey \
LIVEKIT_API_SECRET=... \
npm run start -w meeting-office-server
```

Estático (exemplo simples):

```bash
npx --yes serve dist -l 4173
```

Escute em `0.0.0.0` se o NPM estiver em Docker e for falar com a porta do host.

### systemd (Nest)

`/etc/systemd/system/meeting-office-api.service`:

```ini
[Unit]
Description=Meeting Office Nest
After=network.target

[Service]
WorkingDirectory=/opt/meeting-office
Environment=PORT=8787
Environment=LIVEKIT_PUBLIC_URL=wss://livekit.exemplo.com
Environment=LIVEKIT_API_KEY=officekey
Environment=LIVEKIT_API_SECRET=troque
Environment=LIVEKIT_ROOM=office
ExecStart=/usr/bin/npm run start -w meeting-office-server
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now meeting-office-api
```

Estático: outro unit igual com `ExecStart=/usr/bin/npx --yes serve dist -l 4173`, `WorkingDirectory=/opt/meeting-office`.

---

## 4. LiveKit (não use `--dev`)

`/opt/meeting-office/deploy/livekit.yaml`:

```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"

keys:
  officekey: "o_mesmo_LIVEKIT_API_SECRET_do_nest"

rtc:
  port_range_start: 50000
  port_range_end: 60000
  tcp_port: 7881
  use_external_ip: true
```

`use_external_ip: true` anuncia o IP público nos candidatos ICE. Se a VPS tiver IP errado no STUN, troque por:

```yaml
rtc:
  node_ip: "SEU.IP.PUBLICO"
```

Docker:

```bash
docker run -d --name livekit --restart unless-stopped \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 50000-60000:50000-60000/udp \
  -v /opt/meeting-office/deploy/livekit.yaml:/etc/livekit.yaml \
  livekit/livekit-server \
  --config /etc/livekit.yaml
```

Firewall: TCP 80, 443 (NPM), TCP 7881 se usar fallback, **UDP 50000–60000** (mídia). Sem UDP a voz falha fora da sua rede, mesmo com o token 200.

A chave em `keys:` tem que ser **igual** a `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` do Nest.

---

## 5. Nginx Proxy Manager

Dois Proxy Hosts. No NPM, **Details → Websockets Support = ON** nos dois.

O NPM em Docker não alcança `127.0.0.1` da VPS. Use um destes no *Forward Hostname / IP*:

- Nest/estático no **host**: IP da bridge Docker, em geral `172.17.0.1`
- Ou `host.docker.internal` se você já adicionou no compose do NPM
- Serviços no **mesmo Docker network** do NPM: nome do container (`meeting-office-api`)

### Host 1 — o jogo

| Campo | Valor |
| --- | --- |
| Domain Names | `office.exemplo.com` |
| Scheme | `http` |
| Forward Hostname / IP | `172.17.0.1` |
| Forward Port | `4173` |
| Websockets Support | ligado |
| Block Common Exploits | à vontade |
| SSL | Let's Encrypt, Force SSL, HTTP/2 |

**Custom Locations** (mesmo Proxy Host):

| Location | Scheme | Forward host | Port |
| --- | --- | --- | --- |
| `/ws` | http | `172.17.0.1` | `8787` |
| `/offices` | http | `172.17.0.1` | `8787` |
| `/voice` | http | `172.17.0.1` | `8787` |
| `/games` | http | `172.17.0.1` | `8787` |
| `/health` | http | `172.17.0.1` | `8787` |

A location `/` continua no Details (4173). Sem as custom locations, presença e token 404/502.

SSL: Request certificate, Force SSL. Microfone no browser **exige** HTTPS.

### Host 2 — LiveKit (sinalização)

| Campo | Valor |
| --- | --- |
| Domain Names | `livekit.exemplo.com` |
| Scheme | `http` |
| Forward Hostname / IP | `172.17.0.1` |
| Forward Port | `7880` |
| Websockets Support | ligado |
| SSL | Let's Encrypt, Force SSL |

Esse host tem que ser **exatamente** o host de `LIVEKIT_PUBLIC_URL=wss://livekit.exemplo.com` (sem path).

UDP de mídia **não** entra no NPM. Os browsers falam UDP direto na VPS.

### Host 3 — Netplay EmulatorJS (sinalização Socket.IO)

| Campo | Valor |
| --- | --- |
| Domain Names | `netplay.exemplo.com` |
| Scheme | `http` |
| Forward Hostname / IP | `172.17.0.1` |
| Forward Port | `3000` |
| Websockets Support | ligado |
| SSL | Let's Encrypt, Force SSL |

Tem que ser o mesmo host de `NETPLAY_PUBLIC_URL`. A mídia SNES é WebRTC **entre os browsers** (STUN/TURN), não passa aqui. Detalhe: [docs/games/NETPLAY.md](../games/NETPLAY.md).

### Advanced (só se o WS do `/ws` cair)

No Proxy Host do jogo, aba Advanced:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_read_timeout 86400;
```

Com Websockets Support ligado, em geral não precisa.

---

## 6. Conferir

Na VPS:

```bash
curl -sS http://127.0.0.1:8787/health
# {"ok":true}

curl -sS http://127.0.0.1:8787/offices/default | head -c 80
# {"slug":"default","name":"Meeting Office"...

curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8787/voice/token \
  -H 'Content-Type: application/json' \
  -d '{"guestId":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","name":"Teste"}'
# 200
```

Pelo domínio:

```bash
curl -sS https://office.exemplo.com/health
```

No jogo: duas abas em `https://office.exemplo.com`, pill **N no escritório**, **mic** nas duas, mesmo cômodo.

| Sintoma | Causa típica |
| --- | --- |
| Pill sozinho / voz 502 em `/voice/token` | Custom location `/ws` ou `/voice` errada, ou Nest fora |
| Personagens ok, pill **voz off** | LiveKit down, `LIVEKIT_PUBLIC_URL` com `127.0.0.1`, ou SSL do host 2 |
| Token 200, mic some em 2s | UDP 50000–60000 fechado, ou `node_ip` errado |
| Mic nem pede permissão | Site em HTTP |

---

## 7. DNS

| Nome | Tipo | Destino |
| --- | --- | --- |
| `office.exemplo.com` | A | IP da VPS |
| `livekit.exemplo.com` | A | IP da VPS |

Os dois no mesmo IP; o NPM separa pelo `Host`.
