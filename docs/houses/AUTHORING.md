# Como montar outra casa

Uma casa é um `HouseSpec` em `src/world/houses/`. O escritório (`office.ts`) é o exemplo completo.

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

Cada peça no mapa é só `{ item, col, row }`. `col`/`row` é o tile **noroeste** do pé no chão. Tamanho, colisão e se é tapete vêm do catálogo (`CATALOG` em `src/world/furniture.ts`, gerado em `furnitureData.ts` a partir de `furniture.png`).

O modo **F** lista ~330 peças em abas (assentos, mesas, armários, cozinha, plantas, luzes, decoração, parede, tapetes, camas). Cadeiras, bancos, poltronas e sofás têm `use: 'sit'`.

```ts
{ item: 'fridge', col: 24, row: 23 }
{ item: 'chair', col: 30, row: 9, facing: 'up' }
...desk(7, 6)       // escrivaninha 2×1 + cadeira virada para a mesa
...tableSet(29, 8)  // mesa 4×1 + 4 cadeiras (cada uma para a mesa)
```

Cadeira, poltrona e sofá têm `use: 'sit'` no catálogo. O jogador clica no móvel ou aperta `E` ao lado: anda até a frente do assento e senta. `WASD` ou `E` de novo levanta. Outras ações no futuro entram no mesmo campo `use`.

Móveis altos (`fridge`, `tv`, `bookshelf`) ficam na **primeira linha do piso**; a sprite sobe por cima do papel sozinha.

No jogo, `F` abre o catálogo. O preview segue o mouse (encaixado no tile noroeste). Clique esquerdo coloca se `canPlace(floor, places, draft)` for verdadeiro — só em células `role === 'floor'` (não parede, porta ou escada), sem sobrepor móveis com colisão. `R`, scroll ou clique direito gira; sofá de lado vira 2×1. `X` apaga a peça sob o cursor. O layout fica em `localStorage` (`meeting-office-furniture-v1`); Restaurar volta ao `OFFICE_HOUSE.furniture`.

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
