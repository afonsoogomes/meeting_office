# Meeting Office

Escritório virtual 2D no estilo Gather, feito com Phaser. O personagem usa sprites de 4 direções (baixo, direita, cima, esquerda) em camadas — corpo, calça, camisa, cabelo, chapéu e acessório — e anda por um mapa com open office, sala de reunião, lounge e café.

## Rodar em modo dev

```bash
npm install
npm run dev
```

O Vite abre o jogo em `http://localhost:5173`.

## Controles

| Tecla | Ação |
| --- | --- |
| `WASD` ou setas | Andar (4 direções) |
| `Shift` | Correr (segurar) |
| Clique | Andar até o tile (Shift também corre) |
| `E` | Sentar / levantar (cadeira, poltrona, sofá) |
| `G` | Acenar |
| `C` | Abrir customização do avatar |
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
- Colegas NPC (Ana, Bruno, Carla) que falam quando você chega perto
- Avatar persistido no `localStorage`
- Layout de móveis editável (`F`) e persistido no `localStorage`
- Catálogo de ~330 móveis (cadeiras, mesas, sofás, tapetes, quadros, camas…)

## Ainda não entra nesta versão

Multijogador, áudio/vídeo e chat. O personagem já está separado do input do jogador para encaixar rede depois.

## Casa e tiles

O mapa é uma casa de cômodos (piso + papel 16×48 + moldura 2.5D), definida em `src/world/houses/office.ts`. Para outra casa ou novos tiles: `docs/sprites/README.md` e `docs/houses/AUTHORING.md`.

## Sprites do personagem

As atlases vêm do pack Playable Characters (formato 16×32, 4 direções):

- `farmer-base.png` — corpo
- `pants.png` / `shirts.png` — roupa
- `hairstyles.png` / `hats.png` / `accessories.png` — cabelo e acessórios
