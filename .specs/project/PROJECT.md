# Meeting Office

**Vision:** Um escritório virtual 2D no estilo Gather, onde colegas andam pelo espaço, entram em salas e se encontram para trabalhar ou descontrair.
**For:** Times pequenos que querem um lugar compartilhado mais vivo do que uma call avulsa.
**Solves:** Falta de um ambiente comum para “estar junto” — reuniões, conversa de corredor e pausa — sem sair do browser.

## Goals

- Andar pelo escritório com um personagem montado nas sprites existentes (WASD / setas).
- Distinguir zonas (open office, reunião, lounge, café) como espaços com propósito.
- Subir o projeto com um único comando de desenvolvimento.

## Tech Stack

**Core:**

- Framework: Phaser 4
- Language: TypeScript
- Bundler: Vite

**Key dependencies:** Phaser, Vite, NestJS, `ws`, LiveKit

## Scope

**v1 includes:**

- Personagem em camadas (corpo + roupa + cabelo) com idle, walk, wave e talk
- Mapa de escritório com colisão, câmera e zoom
- Zonas com HUD e colegas NPC para o espaço parecer vivo
- Customização básica de avatar
- Nome na primeira visita + `guestId` local
- Presença compartilhada (ver outros avatares no mesmo mapa)
- Voz por proximidade (LiveKit + mixer espacial)
- `npm run dev`

**Explicitly out of scope:**

- Contas e login
- Vídeo / compartilhar tela
- Layout de móveis sincronizado entre clientes

## Constraints

- Usar as sprites em `phaser_character_assets_v2` (112×112, um frame por direção; roupas só de frente).
- Phaser como engine.
- Comando simples para testar em modo dev.
