# Atlas de interiores

Coordenadas em pixels nativos na PNG (grade 16×16, salvo pisos 32×32).  
O jogo escala ×2 (`TILESET_SCALE`) para tiles de 32px.

Fonte da verdade no código: `src/world/atlas.ts`.

Pré-visualizações: [previews/wallpapers.png](./previews/wallpapers.png), [previews/floors.png](./previews/floors.png), [previews/farmhouse-walls.png](./previews/farmhouse-walls.png).

## Paredes 2.5D — `Farmhouse.png`

Estes tiles são o kit de moldura. Cantos convexos (L com vazio preto) existem; **não há tile de T interno**. Não inverta folds para “inventar” curva.

| Chave | Pixel (x, y) | Tamanho | Uso |
| --- | --- | --- | --- |
| `wall-farm` | 32, 16 | 16×48 | Papel norte ( ripas de madeira + cap no topo ) |
| `wall-farm-window` | 48, 16 | 16×48 | Janela no paper da fazenda; **não** alinha com `wall-farm` (ripas 2px defasadas) — não usar neste escritório |
| `cap-top` | 48, 128 | 16×16 | Topo de parede N–S (visto de cima) |
| `rim-s` | 48, 144 | 16×16 | Divisória sul: tampa clara + face escura |
| `cap-end-s` | 48, 176 | 16×16 | Extremidade arredondada sul (`knockBlack`) |
| `cap-se` | 64, 128 | 16×16 | Canto convexo SE / batente leste (`knockBlack`) |
| `cap-sw` | 80, 128 | 16×16 | Canto convexo SW / batente oeste (`knockBlack`) |
| `stair` | 16, 240 | 16×16 (um degrau por tile) | Degraus entre pisos; o tileset usa a metade de cima do tile |

Cozinha / TV (16×48, encostar no norte do cômodo):

| Chave | Pixel | Uso |
| --- | --- | --- |
| `counter` | 32, 192 | Balcão |
| `stove` | 48, 192 | Fogão |
| `sink` | 64, 192 | Pia |
| `fridge` | 80, 192 | Geladeira |
| `tv` | 96, 192 (32×48) | TV + rack |
| `rug` | 96, 128 (32×32) | Tapete |

## Papéis 16×48 — `Walls & Floors.png`

16 papéis por linha, cada um 16×48. Linha `r` começa em `y = r * 48`, coluna `c` em `x = c * 16`.

| Chave | Linha, col | Pixel | Tema |
| --- | --- | --- | --- |
| `wall-wood` | 0, 0 | 0, 0 | Ripas verticais claras |
| `wall-panel` | 0, 11 | 176, 0 | Painel de madeira |
| `wall-blue` | 1, 0 | 0, 48 | Azul com pontos (estudo) |
| `wall-plank` | 1, 2 | 32, 48 | Tábuas claras (corredor) |
| `wall-stripe` | 1, 11 | 176, 48 | Listras |
| `wall-red` | 2, 7 | 112, 96 | Vermelho + rodapé alto |
| `wall-wainscot` | 2, 8 | 128, 96 | Verde + rodapé |

Há 7 linhas de papel (112 desenhos) até `y = 336`. Contact sheet: [previews/wallpaper-row-0.png](./previews/wallpaper-row-0.png).

Para um papel novo: `x = col * 16`, `y = row * 48`, `w = 16`, `h = 48`. Adicione uma entrada em `SLICES` e use a chave no `HouseSpec`.

## Pisos 32×32 — `Walls & Floors.png`

Os pisos começam em `y = 336`. Tile `(col, row)` relativo a esse bloco: `x = col * 32`, `y = 336 + row * 32`.

| Chave | (col, row) | Pixel | Uso no escritório |
| --- | --- | --- | --- |
| `floor-hall` | 0, 3 | 0, 432 | Corredor |
| `floor-cafe` | 0, 4 | 0, 464 | Café (azul) |
| `floor-office` | 0, 5 | 0, 496 | Open office |
| `floor-meeting` | 1, 5 | 32, 496 | Reunião |
| `floor-lounge` | 5, 3 | 160, 432 | Lounge |

`Flooring.png` (512×256) é outra catálogo 32×32; `floor-honey` é `(0, 0)` — útil para casas futuras.

## Móveis

O catálogo jogável vem de `scripts/gen-furniture-catalog.py` (índices oficiais do `Furniture.png`, grade 32 colunas × 16px). Fonte da verdade gerada: `src/world/furnitureData.ts`. Recortes extra (escrivaninha, vasos e fliperamas do Craftables, cozinha do Farmhouse) continuam em `src/world/atlas.ts` e `EXTRAS` em `src/world/furniture.ts`.

Padrão de `use`, `slots` e `slotAnchors` (lugares ≠ tiles): [../houses/AUTHORING.md](../houses/AUTHORING.md#41-catálogo--o-que-preencher).

Peças já usadas no escritório modelo:

| Chave | PNG | Pixel | Tamanho |
| --- | --- | --- | --- |
| `desk` | Chairs & Desks | 0, 96 | 32×29 |
| `chair` | Furniture | 0, 0 | 16×32 (frente) |
| `chair-right` | Furniture | 16, 0 | 16×32 (lado; espelhar p/ esquerda) |
| `chair-up` | Furniture | 32, 0 | 16×32 (costas) |
| `armchair` | Furniture | 0, 144 | 32×32 (frente) |
| `armchair-right` | Furniture | 32, 144 | 32×32 (lado; espelhar p/ esquerda) |
| `armchair-up` | Furniture | 64, 144 | 32×32 (costas) |
| `sofa` | Furniture | 0, 208 | 48×32 (frente, 3×1) |
| `sofa-right` | Furniture | 48, 208 | 32×32 (lado, 2×1; espelhar p/ esquerda) |
| `sofa-up` | Furniture | 80, 208 | 48×32 (costas, 3×1) |
| `table` | Furniture | 224, 400 | 64×32 |
| `cabinet` | Furniture | 0, 640 | 48×48 (3 portas; não cortar em 32px) |
| `bookshelf-light` | Furniture | 48, 640 | 32×48 |
| `bookshelf` | Furniture | 80, 640 | 32×48 |
| `rug` | Furniture | 354, 1362 | 93×62 |
| `plant` | Craftables | 0, 0 | 16×32 |
| `plant-fern` | Craftables | 32, 0 | 16×32 |
| `arcade` | Craftables | 80, 544 | 16×32 — fliperama Prairie King |
| `arcade-junimo` | Craftables | 112, 608 | 16×32 — fliperama Junimo Kart |

`Furniture.png` é 980×1488 numa grade de 16px. Em `y = 640` o armário é **48×48** (começa em x=0); as estantes seguintes começam em **x=48** e **x=80** (32×48). Não fatiar essa fileira a cada 32px a partir de 0. Cadeiras: 3 vistas na primeira linha; esquerda = `chair-right` espelhada. Tapete em `Furniture`, não no Farmhouse `(96, 128)` (isso é kit de parede).

## O que não usar neste kit

- `Town Interiors.png` `(32, 0)` (`rim-s` da cidade) — o topo nativo é preto e vira trincheira.
- Preencher célula de parede com preto sólido (`wall-fill`).
- Espelhar `cap-se` / `cap-sw` para cantos internos em T: o lighting inverte e o tile não existe nessa forma.
