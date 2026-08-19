# Sprites de interior

O escritório é uma **casa de cômodos-ilha** no vazio preto, no estilo do interior do Stardew Valley: cada sala tem piso próprio, papel de parede alto no norte (16×48) e uma moldura 2.5D de madeira (tampa vista de cima + face escura).

## Por onde começar

| Quero… | Abra |
| --- | --- |
| Montar outra casa / outro andar | [../houses/AUTHORING.md](../houses/AUTHORING.md) |
| Coordenadas dos tiles que o jogo já nomeia | [ATLAS.md](./ATLAS.md) |
| O que existe no pack em `Downloads/Sprites` | [PACK.md](./PACK.md) |
| Pré-visualizações | [previews/](./previews/) |

Fonte das PNGs no projeto: `public/assets/tiles/`.  
Fonte original: `/Users/afonsooliveira/Downloads/Sprites/Tilesets/`.

## Anatomia de um cômodo

```
        ┌ papéis 16×48 (3 tiles de colisão, só visual de fundo)
        │
   [tampa de madeira 2.5D nas laterais]
        │
   ──── piso (retângulo walkable) ────
        │
   [tampa + face no sul — o “corte” da dollhouse]
```

- **Norte:** um sprite 16×48 por coluna, origem `(0, 1)` na linha do piso. Janelas só na fachada do prédio (salas de cima).
- **Sul:** 1 tile `rim-s` (Farmhouse `(48, 144)`). Portas usam `cap-sw` / `cap-se` nos batentes.
- **Leste/oeste:** `cap-top` visto de cima; extremidade sul `cap-end-s`.
- **Fora da casa:** `Void`, não se desenha — o fundo da câmera é `#050304`.

Não use os rims de `Town Interiors.png` para estas paredes. Eles são de loja e geram trilhos pretos no meio do piso.

## Arquivos de código

- `src/world/atlas.ts` — recortes nomeados (fonte da verdade)
- `src/world/house.ts` — `HouseSpec` → grid + desenho
- `src/world/houses/office.ts` — o escritório atual
