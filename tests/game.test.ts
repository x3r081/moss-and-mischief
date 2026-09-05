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
  talk,
  fish,
  collectRelic,
  tendProduction,
  completeContract,
  trade,
  performProject,
  QUESTS,
  CONTRACTS,
  CROPS,
  RECIPES,
  PROJECT_COSTS,
  STRUCTURES,
  RELIC_LOCATIONS,
  count,
  type Resource,
  type Structure,
  type Craftable,
  type Crop,
  type Npc,
  type Project,
} from '../lib/game/state';
import { onLand, heightAt, shoreRadius } from '../lib/game/terrain';
import { registerGameTools, type Registry } from '../lib/game/webmcp';
import { IslandWorld } from '../lib/game/world';
import * as THREE from 'three';
import * as models from '../lib/game/models';
import { placement, footprint, overlaps } from '../lib/game/placement';
import {
  makeStructure,
  makeVillager,
  makeCropVariant,
} from '../lib/game/extra-models';

void test('opening act is achievable and lighthouse continues the adventure', () => {
  const s = initialState(),
    now = Date.now();
  s.started = true;
  talk(s, 'mayor');
  updateQuests(s);
  for (let i = 0; i < 10; i++) gather(s, `wood${i}`, 'wood', now);
  s.tool = 'pickaxe';
  for (let i = 0; i < 6; i++) gather(s, `stone${i}`, 'stone', now);
  s.tool = 'hands';
  gather(s, 'flowers', 'fiber', now);
  build(s, 'workbench', 1, 3);
  updateQuests(s);
  assert.deepEqual(s.completed, [0, 1]);
  for (const p of s.plots.slice(0, 2)) {
    s.tool = 'seeds';
    farm(s, p.id, now);
    s.tool = 'water';
    farm(s, p.id, now + 1);
    s.tool = 'hands';
    farm(s, p.id, now + GROW_TIME + 1);
  }
  updateQuests(s);
  assert.equal(s.stats.harvested, 6);
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
  assert.equal(s.won, false);
  assert.equal(s.projects.lighthouse, true);
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
  assert.equal(s.inventory.wood, 7);
  gather(s, 'oak', 'wood', 60100);
  assert.equal(s.inventory.wood, 11);
  s.tool = 'hands';
  gather(s, 'plant', 'fiber', 200);
  assert.equal(s.inventory.seed, 11);
});
void test('watering accelerates real crop growth and harvest returns seeds', () => {
  const s = initialState(),
    p = s.plots[0];
  s.tool = 'seeds';
  farm(s, p.id, 1000);
  assert.equal(s.inventory.seed, 7);
  assert.equal(growth(p, 1000 + GROW_TIME), 0.4);
  s.tool = 'water';
  farm(s, p.id, 1001);
  assert.equal(growth(p, 1000 + GROW_TIME), 1);
  s.tool = 'hands';
  farm(s, p.id, 1000 + GROW_TIME);
  assert.equal(s.inventory.carrot, 3);
  assert.equal(s.inventory.seed, 9);
  assert.equal(p.planted, null);
  assert.equal(p.watered, false);
});
void test('unwatered crops mature and zero seeds cannot make inventory negative', () => {
  const s = initialState();
  s.tool = 'seeds';
  s.inventory.seed = 0;
  farm(s, s.plots[0].id, 1000);
  assert.equal(s.plots[0].planted, null);
  s.inventory.seed = 1;
  farm(s, s.plots[0].id, 1000);
  s.tool = 'hands';
  farm(s, s.plots[0].id, 1000 + GROW_TIME * 2.5);
  assert.equal(s.inventory.carrot, 3);
});
void test('quests cannot skip farming or cooking to win', () => {
  const s = initialState();
  s.inventory = {
    ...s.inventory,
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
  s.inventory.wood = 4;
  before.wood = 4;
  build(s, 'garden', 4, -2);
  const id = s.buildings[0].id;
  s.tool = 'seeds';
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
  s.inventory.wood = 4;
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
    (s: any) => (s.tool = 'toString'),
    (s: any) => (s.crop = 'constructor'),
    (s: any) => (s.plots[0].crop = '__proto__'),
    (s: any) => (s.collected = ['relic-forest', 'relic-forest']),
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
void test('wrong equipped tools cannot mutate gathering, planting, watering or harvesting', () => {
  const s = initialState(),
    p = s.plots[0],
    before = JSON.stringify(s);
  gather(s, 'ore', 'ore', 1000);
  farm(s, p.id, 1000);
  assert.equal(JSON.stringify(s), before);
  s.tool = 'seeds';
  farm(s, p.id, 1000);
  const water = s.water;
  farm(s, p.id, 1001);
  assert.equal(p.watered, false);
  s.tool = 'water';
  farm(s, p.id, 1001);
  assert.equal(s.water, water - 1);
  farm(s, p.id, 1000 + GROW_TIME);
  assert.equal(s.inventory.carrot, 0);
  s.tool = 'hands';
  farm(s, p.id, 1000 + GROW_TIME);
  assert.equal(s.inventory.carrot, 3);
});
void test('crop selection, unlocks, water limits, and greenhouse boost are real', () => {
  const s = initialState(),
    p = s.plots[0];
  s.tool = 'seeds';
  s.crop = 'pumpkin';
  farm(s, p.id, 1000);
  assert.equal(p.planted, null);
  s.completed = Array.from({ length: 18 }, (_, i) => i);
  s.buildings.push({
    id: 'greenhouse',
    type: 'greenhouse',
    x: 12,
    z: 4,
    rotation: 0,
  });
  farm(s, p.id, 1000);
  assert.equal(p.crop, 'pumpkin');
  assert.equal(p.boosted, true);
  assert.equal(p.watered, true);
  assert.equal(growth(p, 1000 + CROPS.pumpkin.time * 0.65), 1);
  s.tool = 'hands';
  farm(s, p.id, 1000 + CROPS.pumpkin.time * 0.65);
  assert.equal(s.inventory.pumpkin, 3);
  const p2 = s.plots[1];
  s.buildings = [];
  s.water = 0;
  s.tool = 'seeds';
  farm(s, p2.id, 1000);
  s.tool = 'water';
  farm(s, p2.id, 1001);
  assert.equal(p2.watered, false);
});
void test('fishing has a timed bite, bait cost, learning requirement, and rod requirement', () => {
  const s = initialState();
  s.tool = 'rod';
  fish(s, 'spot', 1000);
  assert.equal(s.fishing, null);
  talk(s, 'fisher');
  fish(s, 'spot', 1000);
  assert.equal(s.inventory.seed, 7);
  fish(s, 'spot', 1200);
  assert.equal(s.inventory.fish, 0);
  s.tool = 'hands';
  fish(s, 'spot', 4000);
  assert.equal(s.inventory.fish, 0);
  s.tool = 'rod';
  fish(s, 'spot', 4000);
  assert.equal(s.inventory.fish, 2);
  fish(s, 'spot', 10000);
  fish(s, 'spot', 19000);
  assert.equal(s.inventory.fish, 2);
  assert.equal(s.fishing, null);
});
void test('livestock requires feed and elapsed time; collecting cannot duplicate produce', () => {
  const s = initialState();
  s.buildings.push({ id: 'coop', type: 'coop', x: 10, z: 0, rotation: 0 });
  s.inventory.wheat = 3;
  tendProduction(s, 'coop', 1000);
  assert.equal(s.inventory.wheat, 0);
  tendProduction(s, 'coop', 1001);
  assert.equal(s.inventory.egg, 0);
  tendProduction(s, 'coop', 121000);
  assert.equal(s.inventory.egg, 3);
  tendProduction(s, 'coop', 121001);
  assert.equal(s.inventory.egg, 3);
  assert.equal(s.counters['produce:egg'], 3);
});
void test('contracts consume goods once, respect cooldowns, and market uses earned currency', () => {
  const s = initialState(),
    c = CONTRACTS[0];
  for (const r of Object.keys(s.inventory) as Resource[]) s.inventory[r] = 1000;
  const coins = s.inventory.coins;
  completeContract(s, c.id, 1000);
  assert.equal(s.inventory.coins, coins);
  talk(s, c.npc as Npc);
  completeContract(s, c.id, 1000);
  assert.equal(s.inventory.coins, coins + c.reward.coins);
  const after = JSON.stringify(s.inventory);
  completeContract(s, c.id, 1001);
  assert.equal(JSON.stringify(s.inventory), after);
  completeContract(s, c.id, 91000);
  assert.equal(s.counters.contracts, 2);
  s.buildings.push({ id: 'market', type: 'market', x: 10, z: 0, rotation: 0 });
  const seed = s.inventory.seed;
  trade(s, 'seed', false);
  assert.equal(s.inventory.seed, seed + 10);
  assert.ok(Object.values(s.inventory).every((n) => n >= 0));
});
void test('completed legacy saves preserve homestead and continue at quest seven', () => {
  const old: any = initialState();
  old.version = 1;
  old.won = true;
  old.started = true;
  old.completed = [0, 1, 2, 3, 4, 5];
  old.stats = {
    gathered: 80,
    planted: 6,
    harvested: 12,
    crafted: 2,
    talked: true,
    explored: true,
  };
  old.buildings = [
    {
      id: 'original-cottage',
      type: 'cottage',
      x: 4,
      z: -2,
      rotation: Math.PI / 2,
    },
  ];
  old.inventory = {
    wood: 12,
    stone: 9,
    fiber: 6,
    seed: 14,
    carrot: 8,
    plank: 4,
    bread: 2,
    crystal: 0,
  };
  for (const p of old.plots) {
    delete p.crop;
    delete p.boosted;
  }
  for (const k of [
    'counters',
    'projects',
    'collected',
    'contracts',
    'production',
    'xp',
    'tool',
    'crop',
    'water',
    'fishing',
  ])
    delete old[k];
  const s = parseSave(JSON.stringify(old))!;
  assert.ok(s);
  assert.equal(s.version, 2);
  assert.equal(s.won, false);
  assert.equal(s.projects.lighthouse, true);
  assert.equal(s.buildings[0].id, 'original-cottage');
  assert.equal(s.inventory.carrot, 8);
  assert.equal(s.completed.length, 6);
  assert.equal(s.counters['gather:wood'], 0);
  assert.equal(s.plots[0].crop, 'carrot');
  assert.ok(parseSave(JSON.stringify(s)));
  old.won = false;
  old.completed = [0, 1];
  const partial = parseSave(JSON.stringify(old))!;
  assert.equal(partial.projects.lighthouse, false);
  assert.equal(partial.completed.length, 2);
});
void test('noncontiguous quest completion is normalized to a valid prefix', () => {
  const s = initialState();
  s.completed = [0, 2, 35];
  assert.deepEqual(parseSave(JSON.stringify(s))!.completed, [0]);
});
void test('rotated rectangular footprints use actual width and depth', () => {
  const s = initialState();
  s.player = { x: 0, z: 0 };
  s.plots = [];
  s.inventory.plank = 9;
  s.inventory.fiber = 9;
  s.buildings = [{ id: 'f', type: 'fence', x: 5, z: 0, rotation: Math.PI / 2 }];
  assert.equal(placement(s, 'workbench', 5, 2.2, 0).ok, false);
  assert.equal(placement(s, 'workbench', 7, 0, 0).ok, true);
  assert.equal(
    overlaps(footprint('fence', 0, 0, 0), footprint('fence', 0, 2, 0)),
    false,
  );
  assert.equal(
    overlaps(
      footprint('fence', 0, 0, Math.PI / 2),
      footprint('fence', 0, 2, 0),
    ),
    true,
  );
  assert.match(placement(s, 'cottage', 50, 0).reason, /closer/);
  assert.match(placement(s, 'cottage', 0, 0).reason, /standing/);
  assert.equal(placement(s, 'cottage', NaN, 2).ok, false);
});
void test('roof ridge is above both eaves', () => {
  const house = models.makeHouse();
  house.updateMatrixWorld(true);
  for (const name of ['roof-north', 'roof-south']) {
    const roof = house.getObjectByName(name) as THREE.Mesh;
    assert.ok(roof);
    const p = roof.geometry.attributes.position;
    let inner = 0,
      outer = 0,
      ni = 0,
      no = 0;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3()
        .fromBufferAttribute(p, i)
        .applyMatrix4(roof.matrixWorld);
      if (Math.abs(v.z) < 0.2) {
        inner += v.y;
        ni++;
      }
      if (Math.abs(v.z) > 2) {
        outer += v.y;
        no++;
      }
    }
    assert.ok(ni && no);
    assert.ok(inner / ni > outer / no + 1.5, name);
  }
});
void test('all expansion models have finite grounded geometry inside placement footprints', () => {
  for (const type of STRUCTURES.filter(
    (t) => !['garden', 'cottage', 'workbench', 'campfire', 'fence'].includes(t),
  )) {
    const m = makeStructure(type),
      b = new THREE.Box3().setFromObject(m),
      [w, d] = RECIPES[type].size!;
    assert.ok(Math.abs(b.min.y) < 0.002, type);
    assert.ok(b.max.x - b.min.x <= w + 0.05, type + ' width');
    assert.ok(b.max.z - b.min.z <= d + 0.05, type + ' depth');
  }
  for (const type of Object.keys(CROPS) as Crop[])
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Box3().setFromObject(makeCropVariant(type, i));
      assert.ok(Number.isFinite(b.max.y));
      assert.ok(b.min.y >= -0.002);
    }
  for (const role of [
    'ranger',
    'fisher',
    'smith',
    'botanist',
    'astronomer',
    'baker',
  ] as const) {
    const b = new THREE.Box3().setFromObject(makeVillager(role));
    assert.ok(Math.abs(b.min.y) < 0.002);
  }
});
void test('all 36 quests can be completed in order with real actions and unlocked dependency chains', () => {
  const s = initialState();
  s.started = true;
  let time = 1000000,
    id = 0;
  const stock = (resource: Resource, amount: number) => {
    if (s.inventory[resource] >= amount) return;
    const needed = amount - s.inventory[resource];
    if (
      ['wood', 'stone', 'fiber', 'clay', 'ore', 'mushroom', 'apple'].includes(
        resource,
      )
    ) {
      s.tool =
        resource === 'wood'
          ? 'axe'
          : ['stone', 'ore', 'clay'].includes(resource)
            ? 'pickaxe'
            : 'hands';
      if (resource === 'mushroom') station('shed');
      while (s.inventory[resource] < amount) {
        const before: number = s.inventory[resource];
        gather(
          s,
          `node-${id++}`,
          resource as Parameters<typeof gather>[2],
          time,
        );
        assert.ok(s.inventory[resource] > before, resource);
      }
    } else if (Object.hasOwn(CROPS, resource)) {
      const crop = resource as Crop;
      assert.ok(
        s.completed.length >= CROPS[crop].unlock,
        resource + ' crop locked',
      );
      for (let i = 0; i < Math.ceil(needed / CROPS[crop].yield); i++) {
        s.crop = crop;
        s.tool = 'seeds';
        s.inventory.seed += 2;
        const p = s.plots[0];
        farm(s, p.id, time);
        s.tool = 'water';
        s.water = 24;
        farm(s, p.id, time + 1);
        time += CROPS[crop].time + 1;
        s.tool = 'hands';
        farm(s, p.id, time);
      }
    } else if (resource === 'egg' || resource === 'honey') {
      const kind = resource === 'egg' ? 'coop' : 'beehive';
      station(kind);
      const b = s.buildings.find((b) => b.type === kind)!;
      while (s.inventory[resource] < amount) {
        stock(kind === 'coop' ? 'wheat' : 'lavender', 3);
        tendProduction(s, b.id, time);
        time += 120001;
        tendProduction(s, b.id, time);
      }
    } else if (resource === 'fish') {
      talk(s, 'fisher');
      while (s.inventory.fish < amount) {
        s.tool = 'rod';
        s.inventory.seed++;
        fish(s, 'spot', time);
        time += 3000;
        fish(s, 'spot', time);
      }
    } else if (resource === 'crystal') {
      s.inventory.crystal = 1;
      s.stats.explored = true;
    } else {
      const r = RECIPES[resource as Craftable];
      assert.ok(r, resource);
      assert.ok(
        s.completed.length >= r.unlock,
        `${resource} locked at quest ${s.completed.length + 1}`,
      );
      if (r.station) station(r.station);
      for (const [k, n] of Object.entries(r.cost))
        stock(k as Resource, n! * needed);
      let left = needed;
      while (left) {
        const n = Math.min(left, 20),
          before: number = s.inventory[resource];
        craft(s, resource as Craftable, n);
        assert.equal(s.inventory[resource], before + n, resource);
        left -= n;
      }
    }
  };
  const station = (type: Structure) => {
    if (s.buildings.some((b) => b.type === type)) return;
    assert.ok(
      s.completed.length >= RECIPES[type].unlock,
      `${type} locked at quest ${s.completed.length + 1}`,
    );
    for (const [r, n] of Object.entries(RECIPES[type].cost))
      stock(r as Resource, n!);
    build(s, type, 15, 12);
    assert.ok(
      s.buildings.some((b) => b.type === type),
      type,
    );
  };
  for (let i = 0; i < QUESTS.length; i++) {
    assert.equal(s.completed.length, i, `at quest ${i + 1}`);
    for (const o of QUESTS[i].objectives) {
      const [verb, key] = o.key.split(':');
      if (verb === 'talk') talk(s, key as Npc);
      else if (verb === 'visit') s.counters[o.key] = 1;
      else if (verb === 'build') {
        while (count(s, o.key) < o.target) {
          const t = key as Structure;
          for (const [r, n] of Object.entries(RECIPES[t].cost))
            stock(r as Resource, n!);
          assert.ok(s.completed.length >= RECIPES[t].unlock);
          build(s, t, 15, 12);
        }
      } else if (verb === 'project') {
        const t = key as Project;
        for (const [r, n] of Object.entries(PROJECT_COSTS[t]))
          stock(r as Resource, n!);
        performProject(s, t);
        assert.equal(s.projects[t], true, t);
      } else if (o.key === 'relics') {
        s.tool = 'hands';
        for (const r of RELIC_LOCATIONS) collectRelic(s, r.id);
      } else {
        const r = key as Resource,
          need = Math.max(0, o.target - count(s, o.key));
        stock(r, s.inventory[r] + need);
        assert.ok(count(s, o.key) >= o.target, o.key);
      }
    }
    updateQuests(s);
    assert.ok(s.completed.includes(i), QUESTS[i].title);
    assert.ok(Object.values(s.inventory).every((n) => n >= 0));
  }
  assert.equal(s.completed.length, 36);
  assert.equal(s.won, true);
  assert.ok(
    parseSave(
      JSON.stringify({
        ...s,
        plots: s.plots.map((p) => ({ ...p, planted: null })),
      }),
    ),
  );
  assert.equal(CONTRACTS.length, 12);
});
void test('expanded island has walkable routes to every resident, relic and project', () => {
  const s = initialState();
  s.projects.bridge = true;
  s.projects.gate = true;
  const w: any = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    scene: new THREE.Scene(),
    state: () => s,
    entities: [],
    blockers: [],
    clouds: [],
    label: () => {},
  });
  w.createTerrain();
  w.createVillage();
  w.createNature();
  w.createExpansion();
  const step = 0.75,
    seen = new Set<string>(),
    queue: [number, number][] = [[0, 9]];
  const key = (x: number, z: number) => `${x},${z}`;
  seen.add(key(0, 9));
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        k = key(nx, nz);
      if (!seen.has(k) && w.walkable(nx * step, nz * step)) {
        seen.add(k);
        queue.push([nx, nz]);
      }
    }
  }
  assert.ok(queue.length > 10000, 'expanded walkable area');
  for (const e of w.entities.filter((e: any) =>
    [
      'npc',
      'goose',
      'crystal',
      'project',
      'lighthouse',
      'relic',
      'fish',
      'spring',
    ].includes(e.kind),
  )) {
    assert.ok(
      queue.some(
        ([x, z]) => Math.hypot(e.x - x * step, e.z - z * step) < e.radius + 2.5,
      ),
      `${e.id} is reachable`,
    );
  }
  s.projects.bridge = false;
  s.projects.gate = false;
  assert.equal(w.walkable(-5, -37), false);
  assert.equal(w.walkable(-5, -44), false);
  assert.ok(w.entities.filter((e: any) => e.kind === 'ore').length >= 8);
  assert.ok(w.entities.filter((e: any) => e.kind === 'apple').length >= 8);
});
void test('moving the build pointer off land invalidates a previously valid ghost', () => {
  const w: any = Object.create(IslandWorld.prototype);
  let feedback = '';
  Object.assign(w, {
    validGhost: true,
    ghost: new THREE.Group(),
    buildType: 'cottage',
    ray: { setFromCamera: () => {}, intersectObject: () => [] },
    events: {
      placement: (_ok: boolean, message: string) => (feedback = message),
    },
  });
  w.updateGhost();
  assert.equal(w.validGhost, false);
  assert.equal(w.ghost.visible, false);
  assert.match(feedback, /solid ground/);
});
void test('rotating a preview revalidates both the footprint and grid immediately', () => {
  const w: any = Object.create(IslandWorld.prototype);
  let preview = 0,
    grid = 0;
  Object.assign(w, {
    rotation: 0,
    gridCenter: new THREE.Vector2(),
    updateGhost: () => preview++,
    updateGrid: () => grid++,
  });
  w.rotateBuild();
  assert.equal(w.rotation, Math.PI / 2);
  assert.equal(preview, 1);
  assert.equal(grid, 1);
});
