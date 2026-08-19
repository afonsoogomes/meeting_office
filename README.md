# Meeting Office

Escritório virtual 2D no estilo Gather, feito com Phaser. O personagem usa sprites de 4 direções (baixo, direita, cima, esquerda) em camadas — corpo, calça, camisa, cabelo, chapéu e acessório — e anda por um mapa com open office, sala de reunião, lounge e café.

## Rodar em modo dev

```bash
npm install
npm run dev
```

Sobe o Vite em `http://localhost:5173`, a API Nest em `http://localhost:8787` (WebSocket em `/ws`) e o LiveKit em `ws://127.0.0.1:7880` (Docker, ou `livekit-server --dev` se o binário estiver no PATH). Duas abas no mesmo URL já se veem e, no mesmo cômodo, se ouvem. Sem Docker/LiveKit o escritório continua jogável; o pill fica **voz off**.

Na mesma rede, o Vite imprime um endereço **Network**. A voz nesse caso precisa de `LIVEKIT_PUBLIC_URL=ws://SEU_IP:7880` no servidor e `--node-ip` com o mesmo IP no LiveKit.

Na primeira visita o jogo pede um nome (fica no `localStorage`, junto com um `guestId` para virar conta depois). Cada aba tem um id de sessão próprio, então duas abas do mesmo browser são duas pessoas.

O mapa e os móveis iniciais vêm do Nest (`GET /offices/default`, SQLite em `server/data/office.db`). O arquivo `shared/office-default.ts` é o seed: na primeira subida o banco copia essa casa. Se o Nest estiver fora, o jogo ainda abre com o seed local.

## Controles

| Tecla | Ação |
| --- | --- |
| `WASD` ou setas | Andar (4 direções) |
| `Shift` | Correr (segurar) |
| Clique | Andar até o tile (Shift também corre) |
| `E` | Sentar / levantar / deitar, ou abrir a TV (cola um link do YouTube) |
| `G` | Acenar |
| `C` | Abrir customização do avatar |
| `Enter` | Falar (chat no estilo Habbo) |
| `M` | Ligar / mutar o microfone |
| `K` | Ensurdecer / ouvir de novo |
| `F` | Modo móveis (colocar / girar / apagar) |
| `R` / scroll | No modo móveis, girar a peça na mão |
| Clique direito | No modo móveis, girar a peça sob o cursor |
| `X` | No modo móveis, apagar a peça sob o cursor |
| Scroll | Zoom (no modo móveis, gira a peça) |

## O que já existe

- Personagem paper-doll com as sprites em `public/assets/sprites`
- Idle, walk e corrida em 4 direções (esquerda espelha a direita)
- Colisão com paredes e móveis
- Zonas no HUD
- Colegas NPC (Rafa, Nina, Caio) que falam quando você chega perto
- Avatar persistido no `localStorage` (nome + `guestId` + aparência)
- Gate de nome na primeira visita
- Presença em tempo real: outras pessoas aparecem andando, sentando e acenando
- Chat compartilhado (histórico fixo + balão em cima da cabeça)
- Layout de móveis compartilhado: quem coloca/gira/apaga no modo `F` grava no SQLite e aparece para todo mundo
- Catálogo de ~330 móveis (cadeiras, mesas, sofás, tapetes, quadros, camas…)
- TV com YouTube: `E` na TV, escolhe a plataforma, cola o link; quem entra na sala vê o mesmo vídeo
- Voz por cômodo (LiveKit): quem está na mesma sala ouve em volume cheio; outra sala é outro canal. `M` mic, `K` som

## Ainda não entra nesta versão

Contas, um escritório por pessoa, vídeo na bolha do avatar, TURN para NAT difícil, e outras plataformas na TV (Vimeo, Twitch).

## Deploy (VPS)

Nginx Proxy Manager, envs e LiveKit: [docs/deploy/vps-nginx-proxy-manager.md](docs/deploy/vps-nginx-proxy-manager.md).

## Casa e tiles

O mapa é uma casa de cômodos (piso + papel 16×48 + moldura 2.5D). O seed está em `shared/office-default.ts`; a cópia viva fica no SQLite. Para outra casa ou novos tiles: `docs/sprites/README.md` e `docs/houses/AUTHORING.md`.

## Sprites do personagem

As atlases vêm do pack Playable Characters (formato 16×32, 4 direções):

- `farmer-base.png` — corpo
- `pants.png` / `shirts.png` — roupa
- `hairstyles.png` / `hats.png` / `accessories.png` — cabelo e acessórios
