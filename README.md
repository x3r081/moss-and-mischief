# Moss & Mischief

An original single-player 3D island adventure. Build a homestead, tend a garden, craft useful things, and restore a lighthouse while a goose mayor takes the credit.

## Play

Use WASD or arrow keys to walk, Shift to run, Space to hop, and E to interact. Click the ground to walk to it or click a nearby object to interact. Right-drag orbits the camera; the mouse wheel zooms. B opens building, C crafting, I the backpack, J the quest journal, and Escape closes a panel or pauses. Touch controls are included.

Six chapters connect renewable gathering, farming, crafting, building, ruins exploration, and a lighthouse ending. Free play continues after completion. Gardens mature in 35 seconds when watered; there is no death, hunger, subscription, or in-game purchase.

## Local development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

The app uses React, Three.js and the Sites/Vinext framework. All 3D meshes, terrain, shaders, and audio are original procedural content created for this project; no paid asset libraries or external media downloads are needed. Fonts use the system font stack. Third-party libraries retain their respective licenses in node_modules and the dependency lockfile.

## Saves and settings

Saves are device-local, versioned, validated, and written after actions and every ten seconds. A previous valid save is retained as a backup. Settings provide JSON export/import, sound control, high or lightweight graphics, fullscreen, and a confirmed fresh start. Building materials are fully refunded when a structure is packed away. Plant growth uses timestamps and continues while away.

## Project structure

- `lib/game/world.ts`: scene, rendering, camera, movement, collision, placement and animation.
- `lib/game/models.ts`: shared procedural 3D asset library.
- `lib/game/state.ts`: inventory, recipes, progression, farming and save validation.
- `lib/game/audio.ts`: synthesized music and effects, activated by a user gesture.
- `components/game`: HUD, dialogs, crafting, settings and journal map.
- `tests/game.test.ts`: complete progression, economic invariants, save recovery, terrain/asset contracts and optional WebMCP action checks.

## Release validation and scope

Automated gameplay and model tests, TypeScript checks, dependency audit, and a production build are required before deployment. The optional WebMCP API feature-detects browser support; its contract is covered by unit tests. No supported live WebMCP validation context was available for this build.

This is a compact complete single-player adventure, with one island and a six-chapter arc. It is not a multiplayer service. Saves do not automatically sync across devices. Broad device/browser playtesting and performance certification remain release follow-up work; no such coverage is claimed by the automated tests.
