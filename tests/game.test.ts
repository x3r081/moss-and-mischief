/* oxlint-disable typescript/no-explicit-any -- Tests intentionally construct malformed untrusted saves. */
/* oxlint-disable import/namespace -- Exercise every named procedural asset factory with the same contract. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  canAfford,
  pay,
  craft,
  build,
  dismantle,
  farm,
  growth,
  gather,
  updateQuests,
  restoreLighthouse,
  parseSave,
  saveGame,
  readSave,
  SAVE_KEY,
  GROW_TIME,
} from '../lib/game/state';
import { onLand, heightAt, shoreRadius } from '../lib/game/terrain';
import { registerGameTools, type Registry } from '../lib/game/webmcp';
import { IslandWorld } from '../lib/game/world';
import * as THREE from 'three';
import * as models from '../lib/game/models';

void test('complete adventure is achievable from the starting economy', () => {
  const s = initialState(),
    now = Date.now();
  s.started = true;
  s.stats.talked = true;
  updateQuests(s);
  for (let i = 0; i < 10; i++) gather(s, `wood${i}`, 'wood', now);
  for (let i = 0; i < 6; i++) gather(s, `stone${i}`, 'stone', now);
  gather(s, 'flowers', 'fiber', now);
  build(s, 'workbench', 1, 3);
  updateQuests(s);
  assert.deepEqual(s.completed, [0, 1]);
  for (const p of s.plots.slice(0, 2)) {
    farm(s, p.id, now);
    farm(s, p.id, now + 1);
    farm(s, p.id, now + GROW_TIME + 1);
  }
  updateQuests(s);
  assert.equal(s.stats.harvested, 4);
  build(s, 'campfire', 1, 10);
  craft(s, 'bread');
  updateQuests(s);
  for (let i = 0; i < 7; i++) craft(s, 'plank');
  build(s, 'cottage', 4, -2);
  updateQuests(s);
  s.inventory.crystal = 1;
  s.stats.explored = true;
  restoreLighthouse(s);
  updateQuests(s);
  assert.equal(s.won, true);
  assert.deepEqual(s.completed, [0, 1, 2, 3, 4, 5]);
  assert.ok(Object.values(s.inventory).every((n) => n >= 0));
  assert.ok(parseSave(JSON.stringify(s)));
});
void test('failed purchases and recipes leave inventory untouched', () => {
  const s = initialState(),
    before = structuredClone(s.inventory);
  assert.equal(pay(s, { wood: 100 }), false);
  assert.equal(canAfford(s, { stone: 3 }), false);
  craft(s, 'plank');
  build(s, 'cottage', 4, 4);
  assert.deepEqual(s.inventory, before);
  assert.equal(s.buildings.length, 0);
});
void test('crafting requires a station even when ingredients exist', () => {
  const s = initialState();
  s.inventory.wood = 100;
  s.inventory.carrot = 12;
  craft(s, 'plank');
  craft(s, 'bread');
  assert.equal(s.inventory.plank, 0);
  assert.equal(s.inventory.bread, 0);
});
void test('gathering obeys respawn time and is renewable', () => {
  const s = initialState();
  gather(s, 'oak', 'wood', 100);
  gather(s, 'oak', 'wood', 101);
  assert.equal(s.inventory.wood, 6);
  gather(s, 'oak', 'wood', 45100);
  assert.equal(s.inventory.wood, 9);
  gather(s, 'plant', 'fiber', 200);
  assert.equal(s.inventory.seed, 8);
});
void test('watering accelerates real crop growth and harvest returns seeds', () => {
  const s = initialState(),
    p = s.plots[0];
  farm(s, p.id, 1000);
  assert.equal(s.inventory.seed, 5);
  assert.equal(growth(p, 1000 + GROW_TIME), 0.4);
  farm(s, p.id, 1001);
  assert.equal(growth(p, 1000 + GROW_TIME), 1);
  farm(s, p.id, 1000 + GROW_TIME);
  assert.equal(s.inventory.carrot, 2);
  assert.equal(s.inventory.seed, 7);
  assert.equal(p.planted, null);
  assert.equal(p.watered, false);
});
void test('unwatered crops mature and zero seeds cannot make inventory negative', () => {
  const s = initialState();
  s.inventory.seed = 0;
  farm(s, s.plots[0].id, 1000);
  assert.equal(s.plots[0].planted, null);
  s.inventory.seed = 1;
  farm(s, s.plots[0].id, 1000);
  farm(s, s.plots[0].id, 1000 + GROW_TIME * 2.5);
  assert.equal(s.inventory.carrot, 2);
});
void test('quests cannot skip farming or cooking to win', () => {
  const s = initialState();
  s.inventory = {
    wood: 100,
    stone: 100,
    fiber: 100,
    seed: 6,
    carrot: 0,
    plank: 100,
    bread: 0,
    crystal: 1,
  };
  build(s, 'cottage', 4, -2);
  updateQuests(s);
  assert.deepEqual(s.completed, []);
  restoreLighthouse(s);
  assert.equal(s.won, false);
  assert.equal(s.inventory.crystal, 1);
});
void test('packing a garden refunds materials and seeds, removes its plots', () => {
  const s = initialState(),
    before = structuredClone(s.inventory);
  build(s, 'garden', 4, -2);
  const id = s.buildings[0].id;
  farm(s, `${id}-plot-0`, 1000);
  dismantle(s, id);
  assert.deepEqual(s.inventory, before);
  assert.equal(s.plots.length, 6);
  assert.equal(s.buildings.length, 0);
  dismantle(s, id);
  assert.deepEqual(s.inventory, before);
});
void test('rotated gardens place crops in the same orientation as their preview', () => {
  const s = initialState();
  build(s, 'garden', 4, -2, Math.PI / 2);
  const plots = s.plots.slice(-3);
  assert.ok(plots.every((p) => Math.abs(p.x - 4) < 1e-8));
  assert.deepEqual(
    plots.map((p) => p.z),
    [-0.5, -2, -3.5],
  );
});
void test('save validation rejects malformed and dangerous values', () => {
  assert.equal(parseSave('{bad'), null);
  for (const change of [
    (s: any) => (s.inventory.wood = -1),
    (s: any) => (s.inventory.seed = '7'),
    (s: any) => (s.player.x = 200),
    (s: any) => (s.plots[0].x = 500),
    (s: any) => (s.plots[0].planted = Date.now() + 1e12),
    (s: any) => s.plots.push(s.plots[0]),
    (s: any) => (s.depleted.oak = Date.now() + 1e12),
    (s: any) => (s.version = 100),
  ]) {
    const s = initialState();
    change(s);
    assert.equal(parseSave(JSON.stringify(s)), null);
  }
});
void test('save round trip and backup recovery preserve progression', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
  });
  const s = initialState();
  s.inventory.wood = 40;
  assert.equal(saveGame(s), true);
  s.inventory.wood = 50;
  saveGame(s);
  values.set(SAVE_KEY, 'corrupt');
  assert.equal(readSave().inventory.wood, 40);
  delete (globalThis as any).localStorage;
});
void test('unavailable storage is handled without crashing', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('blocked');
    },
  });
  assert.equal(saveGame(initialState()), false);
  assert.deepEqual(readSave().inventory, initialState().inventory);
  delete (globalThis as any).localStorage;
});
void test('procedural terrain has a valid shoreline and finite elevations', () => {
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * Math.PI * 2,
      r = shoreRadius(a);
    assert.ok(onLand(Math.cos(a) * (r - 1), Math.sin(a) * (r - 1)));
    assert.ok(!onLand(Math.cos(a) * (r + 1), Math.sin(a) * (r + 1)));
    assert.ok(Number.isFinite(heightAt(Math.cos(a) * r, Math.sin(a) * r)));
  }
});
void test('placement cannot put a building around the player or overlap props', () => {
  const w = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    player: { position: { x: 0, z: 7 } },
    state: () => initialState(),
    blockers: [{ x: -7, z: 0, r: 3 }],
    entities: [],
  });
  assert.equal(w.canPlace('cottage', 0, 7), false);
  assert.equal(w.canPlace('cottage', -7, 0), false);
  assert.equal(w.canPlace('cottage', 4, -2), true);
  assert.equal(w.canPlace('cottage', 20, 20), false);
  assert.equal(w.canPlace('workbench', 6, 4), false);
});
void test('every original 3D asset instantiates with finite, grounded geometry', () => {
  for (const name of [
    'makeTree',
    'makeRock',
    'makeHouse',
    'makeWindmill',
    'makeWorkbench',
    'makeCampfire',
    'makeFence',
    'makeCrop',
    'makePlayer',
    'makeGoose',
    'makeChest',
    'makeCrystal',
  ] as const) {
    const model =
      name === 'makeCrop'
        ? models.makeCrop(3)
        : (models[name] as () => THREE.Group)();
    const box = new THREE.Box3().setFromObject(model);
    assert.ok(Number.isFinite(box.max.y), name);
    assert.ok(Math.abs(box.min.y) < 0.001, name);
    assert.ok(box.max.y > 0, name);
  }
  models.disposeAssetLibrary();
});
void test('WebMCP recipes share real state, enforce ingredients, and validate inputs', () => {
  const registered = new Map<string, any>();
  let signal: AbortSignal | undefined;
  const registry: Registry = {
    registerTool: (def, opts) => {
      registered.set(def.name, def);
      signal = opts.signal;
    },
  };
  const s = initialState();
  let changes = 0;
  const cleanup = registerGameTools(
    registry,
    () => s,
    () => changes++,
  );
  assert.equal(registered.size, 2);
  const read = registered.get('read_island_progress'),
    craftTool = registered.get('craft_island_recipe');
  assert.equal(read.annotations.readOnlyHint, true);
  assert.equal(craftTool.annotations.readOnlyHint, false);
  assert.throws(() => craftTool.execute({ recipe: 'cottage' }));
  assert.throws(() => craftTool.execute({ recipe: 'plank' }));
  s.started = true;
  s.inventory.wood = 10;
  s.inventory.stone = 3;
  build(s, 'workbench', 1, 3);
  craftTool.execute({ recipe: 'plank' });
  assert.equal(read.execute({}).inventory.plank, 1);
  assert.equal(changes, 1);
  cleanup();
  assert.equal(signal?.aborted, true);
});
