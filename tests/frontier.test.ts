import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, parseSave, type Building } from '../lib/game/state';
import {
  advanceSurvival,
  upgradeGear,
  huntAnimal,
  eatFood,
  drinkWater,
} from '../lib/game/frontier';
import { craft } from '../lib/game/state';
import { mergeCamp } from '../lib/game/camp';

void test('cooked food pays once, raw meat is rejected, and full springs cannot farm drink objectives', () => {
  const s = initialState();
  s.inventory.rawmeat = 3;
  s.inventory.cookedmeat = 1;
  s.frontier.needs.hunger = 10;
  s.frontier.needs.thirst = 10;
  eatFood(s, 'rawmeat');
  assert.equal(s.inventory.rawmeat, 3);
  assert.equal(s.frontier.needs.hunger, 10);
  eatFood(s, 'cookedmeat');
  assert.equal(s.inventory.cookedmeat, 0);
  assert.equal(s.frontier.needs.hunger, 48);
  eatFood(s, 'cookedmeat');
  assert.equal(s.frontier.needs.hunger, 48);
  drinkWater(s, true);
  drinkWater(s, true);
  assert.equal(s.counters.drink, 1);
  const bottle = s.frontier.needs.canteen;
  drinkWater(s);
  assert.equal(s.frontier.needs.canteen, bottle);
  s.frontier.needs.thirst = 20;
  s.inventory.berrytea = 1;
  eatFood(s, 'berrytea');
  assert.equal(s.frontier.needs.thirst, 68);
  assert.equal(s.counters.drink, 2);
});
void test('advanced recipes require the station upgrade and master workshops double paid output', () => {
  const s = initialState();
  s.inventory.hide = 10;
  s.inventory.salt = 10;
  s.buildings = [
    { id: 'bench', type: 'workbench', x: 8, z: 9, rotation: 0, level: 1 },
  ];
  const before = structuredClone(s.inventory);
  craft(s, 'leather');
  assert.deepEqual(s.inventory, before);
  s.buildings[0].level = 2;
  craft(s, 'leather');
  assert.equal(s.inventory.leather, 1);
  assert.equal(s.inventory.hide, 8);
  s.buildings[0].level = 3;
  craft(s, 'leather');
  assert.equal(s.inventory.leather, 3);
  assert.equal(s.inventory.hide, 6);
});
void test('room merges replace shared inventory and upgrades while retaining personal camera and needs', () => {
  const local = initialState(),
    shared = initialState();
  local.frontier.needs.hunger = 12;
  local.player = { x: 8, z: 9 };
  local.view.yaw = 1;
  shared.inventory.wood = 45;
  shared.frontier.gear.axe = 3;
  shared.frontier.needs.hunger = 100;
  const merged = mergeCamp(local, shared);
  assert.equal(merged.inventory.wood, 45);
  assert.equal(merged.frontier.gear.axe, 3);
  assert.equal(merged.frontier.needs.hunger, 12);
  assert.deepEqual(merged.player, { x: 8, z: 9 });
  assert.equal(merged.view.yaw, 1);
  assert.equal(local.inventory.wood, 3);
});

void test('survival caps one tick, drains frontier needs, and rescues at zero health', () => {
  const s = initialState();
  s.started = true;
  const before = structuredClone(s.frontier.needs);
  advanceSurvival(s, 999);
  assert.equal(s.frontier.needs.activeTime, 5, 'large frame delta is capped');
  assert.ok(s.frontier.needs.hunger < before.hunger);
  assert.ok(s.frontier.needs.thirst < before.thirst);

  s.frontier.needs.health = 0.1;
  s.frontier.needs.hunger = 0;
  s.frontier.needs.thirst = 0;
  s.inventory.coins = 9;
  s.player = { x: 8, z: 8 };
  assert.equal(advanceSurvival(s, 5), true);
  assert.deepEqual(s.player, { x: 0, z: 7 });
  assert.equal(s.frontier.needs.health, 70);
  assert.equal(s.inventory.coins, 4);
  assert.equal(s.counters.rescues, 1);
});

void test('gear upgrades enforce workbench levels and do not spend on a failed gate', () => {
  const s = initialState();
  s.inventory = {
    ...s.inventory,
    wood: 4,
    stone: 3,
    fiber: 2,
    iron: 5,
    leather: 2,
    rope: 2,
  };
  const before = structuredClone(s.inventory);
  assert.match(upgradeGear(s, 'spear'), /level 1 workbench/);
  assert.deepEqual(s.inventory, before);
  const bench: Building = {
    id: 'bench',
    type: 'workbench',
    x: 4,
    z: 4,
    rotation: 0,
    level: 1,
  };
  s.buildings = [bench];
  assert.equal(upgradeGear(s, 'spear').includes('level 1'), true);
  assert.equal(s.frontier.gear.spear, 1);
  const afterFirst = structuredClone(s.inventory);
  bench.level = 1;
  assert.match(upgradeGear(s, 'spear'), /level 2 workbench/);
  assert.deepEqual(s.inventory, afterFirst);
});

void test('hunting accumulates wounds, awards once, and respects cooldown', () => {
  const s = initialState();
  s.tool = 'spear';
  s.frontier.gear.spear = 1;
  const now = 100000;
  assert.match(huntAnimal(s, 'animal-boar-0', now), /more hit/);
  assert.equal(s.frontier.wounds['animal-boar-0']?.hp, 3);
  huntAnimal(s, 'animal-boar-0', now + 1);
  huntAnimal(s, 'animal-boar-0', now + 2);
  const result = huntAnimal(s, 'animal-boar-0', now + 3);
  assert.match(result, /wild meat/);
  assert.equal(s.inventory.rawmeat, 5);
  assert.equal(s.inventory.hide, 2);
  const after = structuredClone(s.inventory);
  assert.match(huntAnimal(s, 'animal-boar-0', now + 4), /resting/);
  assert.deepEqual(s.inventory, after);
});

void test('version 2 saves gain frontier defaults while preserving homestead state', () => {
  const old: Omit<ReturnType<typeof initialState>, 'version' | 'frontier'> & {
    version: number;
    frontier?: ReturnType<typeof initialState>['frontier'];
  } = initialState();
  old.version = 2;
  old.inventory.wood = 37;
  old.buildings = [
    { id: 'old-cottage', type: 'cottage', x: 4, z: -2, rotation: 0 },
  ];
  delete old.frontier;
  const migrated = parseSave(JSON.stringify(old));
  assert.ok(migrated);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.inventory.wood, 37);
  assert.equal(migrated.buildings[0].id, 'old-cottage');
  assert.equal(migrated.frontier.gear.spear, 0);
  assert.equal(migrated.frontier.needs.health, 100);
});

void test('save validation rejects fractional frontier wound health', () => {
  const s = initialState();
  s.frontier.wounds = { 'animal-boar-0': { hp: 1.5, at: Date.now() } };
  assert.equal(parseSave(JSON.stringify(s)), null);
});
