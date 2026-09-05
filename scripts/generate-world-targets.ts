import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { IslandWorld } from '../lib/game/world';
import { initialState } from '../lib/game/state';
// A build-time export of the same deterministic scene used by the client.
// No renderer, browser, or hand-authored duplicate coordinates.
const state = initialState();
state.projects.bridge = true;
state.projects.gate = true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const world: any = Object.create(IslandWorld.prototype);
Object.assign(world, {
  scene: new THREE.Scene(),
  state: () => state,
  entities: [],
  blockers: [],
  clouds: [],
  animals: new Map(),
  label: () => {},
});
world.createTerrain();
world.createVillage();
world.createNature();
world.createExpansion();
world.createFrontier();
writeFileSync(
  'lib/game/targets.json',
  JSON.stringify(
    {
      targets: world.entities
        .filter((e: { kind: string }) => e.kind !== 'animal')
        .map(
          (e: {
            id: string;
            kind: string;
            x: number;
            z: number;
            radius: number;
          }) => ({ id: e.id, kind: e.kind, x: e.x, z: e.z, r: e.radius }),
        ),
      blockers: world.blockers,
    },
    null,
    2,
  ) + '\n',
);
console.log('Exported authoritative scene targets.');
