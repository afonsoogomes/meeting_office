# Como montar outra casa

Uma casa é um `HouseSpec`. O escritório modelo está em `shared/office-default.ts` (seed no banco, slug `default`). Escritórios novos (`POST /offices`) copiam essa geometria com os cômodos vazios. `src/world/houses/office.ts` só reexporta esse seed para o Phaser.

O builder (`src/world/house.ts`) deriva colisão e desenho. Não autotile à mão.

## 1. Definir cômodos

Cada cômodo é o **retângulo walkable do piso**. O builder acrescenta sozinho:

- 3 tiles de papel a norte (`WALLPAPER_TILES`)
- 1 tile de moldura 2.5D a sul, leste e oeste
- cantos convexos e batentes nas portas

```ts
{
  id: 'studio',
  name: 'Estúdio',
  x: 6, y: 5, w: 12, h: 8,
  floor: 'floor-office',      // chave de src/world/atlas.ts
  wallpaper: 'wall-farm',
}
```

Janela só entra se existir um tile **do mesmo papel** (mesmo padrão, sem defasagem). `wall-farm-window` não casa com `wall-farm` (ripas defasadas 2px) e nenhum outro papel deste kit tem janela — omita `window` / `windows`. Cômodos de baixo também não levam janela: o papel é a parede dos fundos, não uma fachada.

## 2. Empilhar cômodos (estilo dollhouse)

Cômodos em níveis diferentes ligam-se com **escada**, não com um túnel de piso furando o papel.

```
rows  5–13  piso de cima
row  14     tampa 2.5D (vão nas colunas da escada)
rows 14–16  escada (3 degraus, um por tile)
rows 17–19  piso de baixo
```

Cômodos no **mesmo** nível (lado a lado) usam só vão com pilares, sem escada.

## 3. Portas e escadas

```ts
doors: [
  { x: 22, y: 7, w: 1, h: 3 },   // vão N–S no mesmo piso
],
stairs: [
  { x: 8, y: 14, w: 5, h: 3 },    // desce do piso de cima (altura do papel)
],
```

O builder marca essas células como chão. Os batentes sul viram `cap-sw` / `cap-se` sozinhos. A sprite `stair` (Farmhouse `(16, 240)`) é um degrau por tile; `h` é o número de níveis.

## 4. Móveis

Cada peça no mapa é só `{ item, col, row }` (e `facing` se girar). `col`/`row` é o tile **noroeste** do pé no chão. Tamanho, colisão, ação e lugares vêm do **catálogo**, não do mapa.

- Peças geradas do `furniture.png`: `src/world/furnitureData.ts` (`scripts/gen-furniture-catalog.py`).
- Peças à mão (TV, fliperama, cozinha, vasos): `EXTRAS` em `src/world/furniture.ts`.
- Recortes de sprite: [../sprites/ATLAS.md](../sprites/ATLAS.md).

O modo **F** lista o catálogo em abas. Preview no cursor; clique esquerdo coloca se `canPlace` for verdadeiro; `R` / scroll / direito gira; `X` apaga.

### 4.1 Catálogo — o que preencher

```ts
{
  id: 'sofa',
  label: 'Sofá azul',
  group: 'seat',
  w: 3, h: 1,             // footprint virado para baixo (tiles)
  collide: true,
  layer: 'object',        // floor | object | wall
  use: 'sit',             // omitir = só decoração
  slots: 2,               // opcional; ver defaults abaixo
  slotAnchors: [          // opcional; ver §4.3
    { u: 0.25, v: 1 },
    { u: 0.75, v: 1 },
  ],
  side: { w: 2, h: 1 },   // footprint quando facing left/right
  sprites: { down: 'sofa', right: 'sofa-right', up: 'sofa-up' },
}
```

`use`:

| `use` | Ação | Hover | Quem escolhe o lugar |
| --- | --- | --- | --- |
| `sit` | Sentar (`E` / clique) | Retângulo do móvel inteiro | O jogo (slot livre mais perto) |
| `sleep` | Deitar | Idem | Idem |
| `watch` | TV | Idem | — |
| `play` | Fliperama | Idem | — |
| (ausente) | Nenhuma | Tile de chão, se walkable | — |

O jogador **não escolhe o quadradinho**. Clicar em qualquer tile do sofá é “sentar neste móvel”. `WASD` ou `E` de novo levanta.

### 4.2 Quantos lugares (`slots`)

`slots` é **pessoas**, não tiles. Um sofá 3×1 tem 3 tiles de colisão e **2** lugares.

Defaults em `occupantSlots` / `withSitLayout` (`src/world/furniture.ts`) se o catálogo não declarar `slots` nem `slotAnchors`:

| Peça | Footprint `w` (frente) | `side` | Lugares |
| --- | --- | --- | --- |
| Cadeira, banqueta, trono | 1 | — | 1 |
| Poltrona larga | ≥ 2 | não | 1 |
| Banco | 2 | sim | 2 |
| Sofá | 3 | sim | 2 |
| Sofá grande | ≥ 4 | sim | 3 |
| Cama | &lt; 3 | — | 1 |
| Cama de casal | ≥ 3 | — | 2 |

O número **não muda** ao girar o móvel (sofá de lado continua com 2 lugares, mesmo com footprint 2×1).

Se o default falhar no sprite novo, declare `slots` (e de preferência `slotAnchors`) no `CatalogEntry`. Não gere um slot por tile.

### 4.3 Onde o boneco senta (`slotAnchors`)

Coordenadas no footprint **virado para baixo**, 0–1:

- `u` — esquerda → direita
- `v` — norte → sul (**1 = frente do assento**, borda sul)

O código roda estes pontos com `facing`. Sem `slotAnchors`, sofás/bancos espalham os lugares na frente (`v = 1`). Cadeira e poltrona de 1 lugar ficam no assento (`u = 0.5`, `v = 1`) em qualquer rotação — senão a cadeira virada à mesa senta a pessoa em cima do tampo.

Sofá 3 tiles / 2 almofadas:

```ts
slotAnchors: [
  { u: 0.25, v: 1 },
  { u: 0.75, v: 1 },
]
```

Checklist ao adicionar um assento ou cama:

1. `w`/`h` = colisão no chão, não o número de pessoas.
2. `use: 'sit'` ou `'sleep'`.
3. `slots` = quantas pessoas cabem no desenho (almofadas / colchões).
4. Se as pessoas não caírem no sítio certo, `slotAnchors` com um `{ u, v }` por lugar.
5. Sofá/banco com sprite de lado: `side: { w, h }` + `sprites.right` (esquerda espelha).
6. Testar: hover cobre o móvel todo; 2.ª pessoa senta no outro lugar; 3.ª vê **Lotado**.

Peças de **parede** (`layer: 'wall'`): só no papel norte (`role === 'back'`). Não ocupam piso. Móveis altos (`fridge`, `tv`, `bookshelf`) ficam na **primeira linha do piso**; a sprite sobe no papel sozinha.

```ts
{ item: 'fridge', col: 24, row: 23 }
{ item: 'chair', col: 30, row: 9, facing: 'up' }
...desk(7, 6)
...tableSet(29, 8)
```

## 5. Ligar no jogo

1. Crie `src/world/houses/minha-casa.ts` exportando um `HouseSpec`.
2. Em `src/world/layout.ts`, troque `OFFICE_HOUSE` (ou faça um registro de casas).
3. Papel/piso/móvel novos: uma linha em `SLICES` (`src/world/atlas.ts`) — ver [../sprites/ATLAS.md](../sprites/ATLAS.md).
4. Copie a PNG para `public/assets/tiles/` se ainda não estiver lá, e declare em `TILESET_FILES`.

## 6. Checklist visual

- Fundo preto fora da casa, sem “trincheiras” pretas no meio do piso
- Cada sala com piso e papel diferentes
- Cômodos empilhados ligados por escada larga, não por um túnel de piso
- Tampa de madeira visível no sul de cada cômodo (não uma linha fina)
- Móveis: `{ item, col, row }` no tile noroeste; catálogo em `src/world/furniture.ts`
- `knockBlack` só em caps em L (`cap-se`, `cap-sw`, `cap-end-s`)
