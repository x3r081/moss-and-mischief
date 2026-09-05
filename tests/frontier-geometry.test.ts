/* oxlint-disable typescript/no-explicit-any -- Prototype harness avoids WebGL/browser construction. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EYE_HEIGHT, aimEntity, visibleInTree } from '../lib/game/first-person';
import { makeFirstPersonRig } from '../lib/game/first-person-models';
import { FirstPersonMotion } from '../lib/game/first-person-motion';
import {
  makeAnimal,
  makeExplorer,
  makeLandmark,
  makeUpgradeOrnament,
} from '../lib/game/frontier-models';
import { ANIMALS, LANDMARKS, animalPosition } from '../lib/game/frontier';
import { initialState } from '../lib/game/state';
import { IslandWorld } from '../lib/game/world';
import { heightAt, onLand } from '../lib/game/terrain';

function assertFiniteModel(root: THREE.Object3D, label: string): THREE.Box3 {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  assert.ok(
    [
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
    ].every(Number.isFinite),
    `${label} has finite world bounds`,
  );
  let meshes = 0;
  root.traverse((object) => {
    assert.ok(
      object.matrixWorld.elements.every(Number.isFinite),
      `${label}/${object.name || object.type} has a finite transform`,
    );
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const position = object.geometry.getAttribute('position');
    assert.ok(position, `${label} mesh has positions`);
    for (let i = 0; i < position.count; i++)
      assert.ok(
        [position.getX(i), position.getY(i), position.getZ(i)].every(
          Number.isFinite,
        ),
        `${label} mesh has finite vertices`,
      );
  });
  assert.ok(meshes > 0, `${label} contains visible geometry`);
  return bounds;
}

void test('frontier animals, explorers, landmarks and upgrade ornaments are finite and grounded', () => {
  for (const kind of ['rabbit', 'boar', 'deer'] as const) {
    const model = makeAnimal(kind),
      bounds = assertFiniteModel(model, kind),
      height = bounds.max.y - bounds.min.y;
    assert.ok(Math.abs(bounds.min.y) < 0.001, `${kind} rests on y=0`);
    assert.ok(
      height >= 0.5 && height <= 1.2,
      `${kind} has gameplay-scale height`,
    );
    for (const name of ['body', 'head', 'leg-0', 'leg-1', 'leg-2', 'leg-3'])
      assert.ok(model.getObjectByName(name), `${kind} exposes ${name}`);
    if (kind === 'rabbit') {
      assert.ok(model.getObjectByName('ear-0'));
      assert.ok(model.getObjectByName('ear-1'));
    }
    if (kind === 'deer') {
      assert.ok(model.getObjectByName('antler-0'));
      assert.ok(model.getObjectByName('antler-1'));
    }
  }

  const explorer = makeExplorer(0x4a8f88),
    explorerBounds = assertFiniteModel(explorer, 'explorer');
  assert.ok(Math.abs(explorerBounds.min.y) < 0.001);
  assert.ok(Math.abs(explorerBounds.max.y - 1.7) < 0.001);
  for (const name of ['body', 'head', 'leg-0', 'leg-1', 'arm-0', 'arm-1'])
    assert.ok(explorer.getObjectByName(name), `explorer exposes ${name}`);

  for (const kind of ['cave', 'camp', 'ruins', 'treasure']) {
    const bounds = assertFiniteModel(makeLandmark(kind), `landmark-${kind}`);
    assert.ok(Math.abs(bounds.min.y) < 0.001, `${kind} rests on y=0`);
  }
  for (let level = 1; level <= 3; level++) {
    const bounds = assertFiniteModel(
      makeUpgradeOrnament(level),
      `upgrade-${level}`,
    );
    assert.ok(Math.abs(bounds.min.y) < 0.001);
  }
});

void test('spear is the only selected tool at idle and leaves the center sight line clear', () => {
  const rig = makeFirstPersonRig(),
    motion = new FirstPersonMotion(rig);
  motion.pose('spear', null);
  rig.updateMatrixWorld(true);

  const toolNames = [
    'axe',
    'pickaxe',
    'seeds',
    'water',
    'build',
    'hands',
    'rod',
    'spear',
  ];
  assert.deepEqual(
    toolNames
      .map((name) => rig.getObjectByName(`tool-${name}`))
      .filter((tool) => tool?.visible)
      .map((tool) => tool!.name),
    ['tool-spear'],
  );

  const spear = rig.getObjectByName('tool-spear');
  assert.ok(spear instanceof THREE.Group);
  const spearBounds = assertFiniteModel(spear, 'idle spear');
  assert.ok(
    spearBounds.max.z < -0.04,
    'spear remains beyond the overlay near plane',
  );
  assert.ok(
    spearBounds.min.x > 0.1,
    'spear stays in the lower-right view area',
  );
  assert.ok(spearBounds.max.y < 0, 'spear stays below the sight-line center');

  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.025, 4),
    ray = new THREE.Raycaster(),
    visibleMeshes: THREE.Mesh[] = [];
  camera.updateMatrixWorld(true);
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  rig.traverseVisible((object) => {
    if (object instanceof THREE.Mesh) visibleMeshes.push(object);
  });
  assert.equal(
    ray.intersectObjects(visibleMeshes, false).length,
    0,
    'idle hands and spear do not cover the center crosshair',
  );
});

void test('every deterministic animal wander path stays on finite land', () => {
  for (const animal of ANIMALS) {
    for (let now = 0; now <= 600_000; now += 250) {
      const point = animalPosition(animal, now);
      assert.ok(
        Number.isFinite(point.x) && Number.isFinite(point.z),
        `${animal.id} has a finite wander point at ${now}ms`,
      );
      assert.ok(
        onLand(point.x, point.z, 0.5),
        `${animal.id} remains inside the shoreline at ${now}ms`,
      );
    }
  }
});

void test('every frontier landmark and cache is aimable within reach from walkable land', () => {
  const state = initialState();
  state.projects.bridge = true;
  state.projects.gate = true;
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
  world.scene.updateMatrixWorld(true);

  const targets = world.entities.filter((entity: any) =>
    ['landmark', 'cache'].includes(entity.kind),
  );
  assert.equal(targets.length, LANDMARKS.length * 2);
  const meshes = world.collectAimMeshes(world.scene).filter(visibleInTree),
    ray = new THREE.Raycaster();
  ray.far = 4.5;

  for (const entity of targets) {
    const aimPoints: THREE.Vector3[] = [];
    entity.object.traverse((object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh)
        aimPoints.push(
          new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()),
        );
    });
    assert.ok(aimPoints.length, `${entity.id} exposes an aimable surface`);

    let found = false;
    for (let radius = 1; radius <= 4.5 && !found; radius += 0.5) {
      for (let index = 0; index < 24 && !found; index++) {
        const angle = (index / 24) * Math.PI * 2,
          x = entity.x + Math.cos(angle) * radius,
          z = entity.z + Math.sin(angle) * radius;
        if (!world.walkable(x, z)) continue;
        const eye = new THREE.Vector3(x, heightAt(x, z) + EYE_HEIGHT, z);
        for (const point of aimPoints) {
          ray.set(eye, point.clone().sub(eye).normalize());
          if (
            aimEntity(ray.intersectObjects(meshes, false), world.entities) ===
            entity
          ) {
            found = true;
            break;
          }
        }
      }
    }
    assert.ok(
      found,
      `${entity.id} has an unobstructed surface within reach from walkable land`,
    );
  }
});
