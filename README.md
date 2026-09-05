# Moss & Mischief

An original single-player 3D island adventure. Build a homestead, tend a garden, craft useful things, and restore a lighthouse, reopen the highlands, chart the stars, and host a festival while a goose mayor takes the credit.

## Play

Play at eye level with a perspective camera, visible hands and tools, and crosshair targeting. Click the scene to capture the mouse, move the mouse to look, WASD to walk, Shift to run, Space to hop, and E or left-click to use the aimed object within reach. Interactions respect scenery and walls. Tab frees the cursor; Escape pauses. Menus release the mouse and wait for your next click to recapture it.

If mouse capture is unavailable, button-free mouse follow starts automatically. Move the pointer to an edge to keep turning; Tab frees the cursor for HUD buttons. On touch screens, drag the scene to look and use the movement pad, Use button and Hop button. Arrow keys also turn the view. Scroll cycles all seven tools without opening menus, cancelling any active placement. R rotates a building plan. B opens building, C crafting, I the backpack, J the journal. Settings include field of view, mouse sensitivity, and optional head movement (off by default). The island and campaign remain fully playable in first person.

The expansion has 36 story quests across six acts, 12 repeatable resident contracts, six regions, 17 building plans, 11 crafting recipes, and four crops. The island spans roughly 4.5 times its original area. Fishing has timed bites, coops and apiaries turn feed into produce, and five community projects culminate in a festival. Free play continues afterward.

Select tools explicitly: 1 axe (wood), 2 pickaxe (stone/clay/ore), 3 seeds (plant selected crop), 4 watering can, 5 building, 6 hands (harvest/forage/relics), 7 fishing rod. E uses the selected tool; conversations, stations and community projects accept any tool. Watered crops mature in 70–140 seconds. Refill the watering can at the village spring or a well. There are no purchases or subscriptions.

Tool actions have separate wind-up, impact, and recovery animations. Resources and effects change at the impact frame, with distinct wood chips and mining feedback. Switching tools, pausing, or losing the target prevents an unfinished hit from harvesting. Depleted trees become low cut stumps; rock deposits become rubble, and forage becomes clipped patches. Target the remains to see the regrowth countdown. Their footprints remain reserved for regrowth.

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

Version 1 saves migrate to version 2, preserving inventory, plots, buildings and opening-act progress. An old lighthouse ending continues at quest seven. Saves are device-local, versioned, validated, and written after actions and every ten seconds. A previous valid save is retained as a backup. Settings provide JSON export/import, sound control, high or lightweight graphics, fullscreen, and a confirmed fresh start. Building materials are fully refunded when a structure is packed away. Plant growth uses timestamps and continues while away.

## Project structure

- `lib/game/world.ts`: scene, first-person camera, pointer capture/fallback/touch controls, crosshair raycasting, movement, collision, placement and animation.
- `lib/game/first-person.ts`: view settings, look/movement math and line-of-sight selection.
- `lib/game/first-person-models.ts`: camera-space hands and seven tool models.
- `lib/game/first-person-motion.ts`: reusable articulated tool and hand animations.
- `lib/game/resource-remains.ts`: pooled cut stumps, rubble, and clipped patches.
- `lib/game/models.ts`: shared procedural 3D asset library.
- `lib/game/state.ts`: economy, production, fishing, progression and save migration.
- `lib/game/catalog.ts` and `quests.json`: recipes, residents, crops, projects and campaign content.
- `lib/game/extra-models.ts`: expansion structures, villagers, resource patches and crops.
- `lib/game/placement.ts`: shared rotated footprint, slope, reach and collision checks.
- `lib/game/audio.ts`: synthesized music and effects, activated by a user gesture.
- `components/game`: HUD, dialogs, crafting, settings and journal map.
- `tests/game.test.ts`: complete progression, economic invariants, save recovery, terrain/asset contracts and optional WebMCP action checks.

## Release validation and scope

Automated gameplay and model tests, TypeScript checks, dependency audit, and a production build are required before deployment. The optional WebMCP API feature-detects browser support; its contract is covered by unit tests. No supported live WebMCP validation context was available for this build.

This is a single-player adventure, with an expanded island and a six-act campaign. The content is intended for substantially longer play than the opening act; no measured completion-time claim is made. It is not a multiplayer service. Saves do not automatically sync across devices. Broad device/browser playtesting and performance certification remain release follow-up work; no such coverage is claimed by the automated tests.
