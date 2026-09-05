# Moss & Mischief

A first-person 3D island adventure about building a village, exploring suspicious ruins, and keeping a goose mayor supplied with good news. All models, terrain, shaders, and audio are original procedural content.

## Play

Click the scene to capture the mouse. Move the mouse to look, WASD to walk, Shift to run, Space to hop, and E or left-click to use the object under the crosshair. Tab frees the cursor; Escape pauses. If capture is unavailable, button-free mouse follow takes over. Touch controls and arrow-key turning are also available.

Scroll or press 1–8 to select axe, pickaxe, seeds, watering can, build tool, hands, fishing rod, or hunting spear. Craft the first spear at a workbench through **U**. R rotates a building preview or changes the selected crop. B opens building plans, C crafting, I inventory, J the journal, U upgrades and expeditions, and L co-op camps. F chooses a useful carried food or drink based on your needs, favoring less waste; G drinks from your canteen. Choose a specific meal manually in Provisions.

Use **Find** on the quest card, or **Guide me** in the journal, to track a resident or project with a compass arrow and distance. The journal also guides you home or to the village spring. Discovered, replenished caches can be tracked in Field notes. Northern destinations guide you toward required crossings first. This is a bearing to the destination; walk around obstacles along the way.

The frontier expansion includes:

- 72 story quests across 12 acts, 24 repeatable resident contracts, and six repeatable expeditions.
- Six regions, eight discoverable landmarks with replenishing caches, and 22 roaming rabbits, deer and boars.
- 17 building plans, nine workshop/building upgrade paths, five equipment upgrade paths, 21 material/food recipes, and four crops.
- Hunting, cooking, personal hunger/thirst/health, canteens, comfort bonuses, and camp rescue. Needs pause in menus and do not drain offline. Hungry or dehydrated explorers move and recover stamina more slowly; empty supplies cause health loss. Cook meat before eating. Boars damage nearby players.
- Level 2 workbenches unlock leather and rope; level 2 forges unlock steel. Level 3 workbenches unlock machinery and trail rations. Master crafting stations double output; kiln level 2 already doubles bricks. Upgraded sheds improve hunting, greenhouses extend irrigation and accelerate growth, wells/cottages provide comfort, and taverns improve meals.
- Fishing with timed bites, feed-based livestock production, village trading, community projects, and free play after the story.

Crafting cards show the actual output including workshop bonuses. Expedition cards list exact rewards; an unwanted expedition can be abandoned without losing supplies, then restarted with fresh progress. In co-op, the expedition belongs to the whole crew.

Tool animations apply effects at impact. Depleted trees become short stumps, deposits become rubble, and forage becomes clipped patches with regrowth countdowns. Hunted animals disappear until their trail repopulates. The building grid shows valid footprints and rejection reasons; resource areas stay reserved for regrowth.

## Co-op camps

Open **L**, name your explorer, and create a shared copy of your current island. Give friends the invitation link or 16-character code; the hosted site must also allow them access. Up to four active explorers can see each other and share materials, construction, farming, crafting, upgrades, story objectives, and expeditions. Hunger, thirst, health, canteens and fishing lines belong to each explorer. Bait and catches use the shared pantry.

Camps persist in the hosted database after everyone leaves. Keep the code to rejoin. Explorer membership uses a private browser cookie; it is not an account or cross-device identity. Leaving ends that membership and restores the untouched solo save. Exporting while in a camp downloads a snapshot of the shared island. Importing or resetting a solo save requires leaving the camp first.

This is simple co-op for trusted friends, with approximately one-second presence updates and interpolated avatars. There is no public matchmaking, chat, PvP or host moderation. Anyone with the camp code and site access can join and edit that island. The server validates known targets, reach, movement bounds, recipe gates, materials and placement, and serializes shared changes to avoid lost updates. Commands require a connection. No paid assets, purchases or subscriptions were added.

Paid actions have durable receipts for the lifetime of a membership, so retrying an older request does not spend resources again. Temporary network/server errors retry the same action ID, with backoff when another request is finishing. Switching camps releases your old slot immediately; reconnecting after expiry still respects the four-player limit. Leaving deletes the membership's personal state and receipts.

## Development

Node.js 22.13 or newer is required.

```sh
npm ci
npm run build
npm run db:local
npm run dev
```

The first build emits the local Worker configuration. `db:local` applies the checked-in migrations to the project-local D1 development database; it does not contact a remote Cloudflare account. Run it when new migrations are added. Solo mode does not need the database.

```sh
npm test
npm run typecheck
npm run lint
npm run test:camp
npm run build
```

`test:camp` requires the local server and migrated local database. It creates disposable local test camps and tests separate cookie sessions, shared harvests, concurrent paid builds/crafts, older action retries, cross-member request IDs, expired slot recovery, room switching, membership checks, personal canteens/fishing, and durable rejoining. Unit tests include the full 72-quest crafting/progression chain, migration, survival and hunting, geometry, walkable approaches, first-person input/animation contracts, waypoints, meal selection and client retry behavior. Browser/device playtesting and load testing are not covered by those checks.

## Saves and source

Version 1 and 2 saves migrate to version 3. Existing buildings, crops, inventory and completed quests survive. The old lighthouse ending continues at quest seven, and the old festival ending continues into the frontier acts. Solo saves retain a previous valid backup and support JSON import/export. Crop growth uses timestamps. Packing refunds original building materials, feed and planted seeds; upgrade materials are not refunded.

- `lib/game/world.ts`: scene, first-person controls, placement, wildlife and avatars.
- `lib/game/state.ts`, `catalog.ts`, `quests.json`, `frontier-quests.json`: economy and progression.
- `lib/game/frontier.ts`: survival, hunting, equipment, workshop upgrades and expeditions.
- `lib/game/commands.ts`, `targets.json`: common validated action rules and scene target registry.
- `scripts/generate-world-targets.ts`: exports deterministic scene targets; rerun after changing world layout.
- `lib/game/camp.ts`, `app/api/camp/route.ts`: co-op client and database-backed room service.
- `db/schema.ts`, `drizzle/`: database schema and generated migrations, packaged by Sites.
- `components/game`: HUD, crafting, upgrades, field notes and camp panels.

React, Three.js, Vinext and supporting libraries retain their own licenses. The system font stack and procedural assets avoid external media downloads.
