import assert from 'node:assert/strict';
import test from 'node:test';
import { waypointGuide } from '../lib/game/navigation';
import {
  abandonExpedition,
  expedition,
  expeditionProgress,
  FOOD,
  quickFood,
} from '../lib/game/frontier';
import {
  craft,
  craftOutput,
  initialState,
  PROJECT_LOCATIONS,
  type Resource,
} from '../lib/game/state';

function clearFood(s: ReturnType<typeof initialState>) {
  for (const food of Object.keys(FOOD) as Resource[]) s.inventory[food] = 0;
}

void test('waypoint bearings follow the first-person world yaw convention', () => {
  const s = initialState();
  s.player = { x: 0, z: 0 };
  s.view.yaw = 0;

  assert.ok(
    Math.abs(waypointGuide(s, { name: 'north', x: 0, z: -10 }).turn) < 1e-8,
  );
  assert.ok(
    Math.abs(waypointGuide(s, { name: 'east', x: 10, z: 0 }).turn - 90) < 1e-8,
  );

  // Positive Three.js yaw faces west; a west target should be straight ahead.
  s.view.yaw = Math.PI / 2;
  assert.ok(
    Math.abs(waypointGuide(s, { name: 'west', x: -10, z: 0 }).turn) < 1e-8,
  );
});

void test('waypoints route through the bridge and then the gate in order', () => {
  const s = initialState();
  s.player = { x: 0, z: 0 };
  const summit = { name: 'Star Summit', x: 2, z: -47 };

  let guide = waypointGuide(s, summit);
  assert.deepEqual(guide.target, PROJECT_LOCATIONS.bridge);
  assert.equal(guide.blocked, true);

  s.projects.bridge = true;
  guide = waypointGuide(s, summit);
  assert.deepEqual(guide.target, PROJECT_LOCATIONS.gate);
  assert.equal(guide.blocked, true);

  s.projects.gate = true;
  guide = waypointGuide(s, summit);
  assert.deepEqual(guide.target, summit);
  assert.equal(guide.blocked, false);
});

void test('quick food fills the missing need while avoiding a wasted feast', () => {
  const s = initialState();
  clearFood(s);
  s.inventory.carrot = 1;
  s.inventory.feast = 1;
  s.frontier.needs.hunger = 95;
  s.frontier.needs.thirst = 100;
  s.frontier.needs.health = 100;
  assert.equal(quickFood(s), 'carrot');

  clearFood(s);
  s.inventory.berrytea = 1;
  s.inventory.feast = 1;
  s.frontier.needs.hunger = 100;
  s.frontier.needs.thirst = 10;
  assert.equal(quickFood(s), 'berrytea');

  clearFood(s);
  s.inventory.feast = 1;
  s.frontier.needs.hunger = 60;
  s.frontier.needs.thirst = 100;
  assert.equal(
    quickFood(s),
    'feast',
    'the only useful food remains available even when oversized',
  );
  s.frontier.needs.hunger = 100;
  assert.equal(quickFood(s), null, 'full needs do not waste food');
});

void test('quick food never treats raw meat as ready food', () => {
  const s = initialState();
  clearFood(s);
  s.inventory.rawmeat = 4;
  s.frontier.needs.hunger = 10;
  s.frontier.needs.thirst = 10;
  assert.equal(quickFood(s), null);
});

void test('abandoning an expedition clears only the run and pays no reward', () => {
  const s = initialState();
  s.inventory.coins = 37;
  s.inventory.ancientcoin = 4;
  s.xp = 19;
  s.counters['gather:berries'] = 4;
  const inventoryBefore = structuredClone(s.inventory);
  const xpBefore = s.xp;

  assert.match(expedition(s, 'forager'), /accepted/);
  s.counters['gather:berries'] = 10;
  assert.equal(expeditionProgress(s), 6);
  assert.match(abandonExpedition(s), /abandoned/);
  assert.equal(s.frontier.expedition, null);
  assert.deepEqual(s.inventory, inventoryBefore);
  assert.equal(s.xp, xpBefore);
  assert.equal(s.counters['expedition:forager'], undefined);
  assert.match(abandonExpedition(s), /No expedition/);
  expedition(s, 'forager');
  assert.equal(expeditionProgress(s), 0, 'restarting requires new work');
});

void test('craft output and the actual upgraded craft both double at station level three', () => {
  const s = initialState();
  s.buildings = [
    { id: 'bench', type: 'workbench', x: 4, z: 4, rotation: 0, level: 3 },
  ];
  s.inventory.hide = 4;
  s.inventory.salt = 2;

  assert.equal(craftOutput(s, 'leather', 2), 4);
  assert.match(craft(s, 'leather', 2), /^\+4 Leather/);
  assert.equal(s.inventory.leather, 4);
  assert.equal(s.inventory.hide, 0);
  assert.equal(s.inventory.salt, 0);
});
