import type { GameState, Building } from './state';
import {
  type Resource,
  type Structure,
  type Inventory,
  RECIPES,
} from './catalog';

export type AnimalKind = 'rabbit' | 'boar' | 'deer';
export type Gear = 'axe' | 'pickaxe' | 'spear' | 'canteen' | 'boots';
export type FrontierState = {
  needs: {
    hunger: number;
    thirst: number;
    health: number;
    canteen: number;
    activeTime: number;
    comfort: number;
  };
  gear: Record<Gear, number>;
  discoveries: string[];
  treasures: Record<string, number>;
  wounds: Record<string, { hp: number; at: number }>;
  expedition: { id: string; baseline: number; started: number } | null;
};
export function initialFrontier(): FrontierState {
  return {
    needs: {
      hunger: 100,
      thirst: 100,
      health: 100,
      canteen: 3,
      activeTime: 0,
      comfort: 0,
    },
    gear: { axe: 1, pickaxe: 1, spear: 0, canteen: 1, boots: 1 },
    discoveries: [],
    treasures: {},
    wounds: {},
    expedition: null,
  };
}
export const FOOD: Partial<
  Record<
    Resource,
    { hunger: number; thirst: number; health: number; comfort?: number }
  >
> = {
  carrot: { hunger: 10, thirst: 3, health: 0 },
  apple: { hunger: 12, thirst: 8, health: 0 },
  berries: { hunger: 8, thirst: 7, health: 0 },
  bread: { hunger: 30, thirst: -3, health: 4 },
  cookedmeat: { hunger: 38, thirst: 0, health: 8 },
  jerky: { hunger: 45, thirst: -8, health: 6, comfort: 120 },
  berrytea: { hunger: 8, thirst: 48, health: 10 },
  trailration: { hunger: 65, thirst: 20, health: 20, comfort: 240 },
  roast: { hunger: 70, thirst: 8, health: 22, comfort: 180 },
  broth: { hunger: 28, thirst: 35, health: 30 },
  stew: { hunger: 40, thirst: 18, health: 12 },
  pie: { hunger: 55, thirst: 0, health: 16 },
  feast: { hunger: 100, thirst: 35, health: 45, comfort: 300 },
  jam: { hunger: 22, thirst: 2, health: 3 },
  honey: { hunger: 15, thirst: 0, health: 4 },
  egg: { hunger: 8, thirst: 0, health: 0 },
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const add = (s: GameState, key: string, n = 1) => {
  s.counters[key] = (s.counters[key] ?? 0) + n;
};
function spend(s: GameState, cost: Partial<Inventory>) {
  if (Object.entries(cost).some(([k, n]) => s.inventory[k as Resource] < n!))
    return false;
  for (const [k, n] of Object.entries(cost)) s.inventory[k as Resource] -= n!;
  return true;
}
export function applyNutrition(s: GameState, food: Resource) {
  const f = FOOD[food];
  if (!f) return;
  const n = s.frontier.needs;
  n.hunger = clamp(
    n.hunger +
      f.hunger * (1 + Math.max(0, stationLevel(s, 'tavern') - 1) * 0.1),
  );
  n.thirst = clamp(n.thirst + f.thirst);
  n.health = clamp(n.health + f.health);
  n.comfort = Math.max(n.comfort, f.comfort ?? 0);
}
export function eatFood(s: GameState, food: Resource) {
  if (!FOOD[food])
    return food === 'rawmeat'
      ? 'Cook wild meat first. Your stomach has not signed that waiver.'
      : 'That is not lunch. The mayor has checked.';
  if (!s.inventory[food])
    return 'Your lunch has been replaced by a compelling absence.';
  const thirsty = s.frontier.needs.thirst < 99.5;
  s.inventory[food]--;
  if (food === 'berrytea' && thirsty) add(s, 'drink');
  applyNutrition(s, food);
  add(s, `eat:${food}`);
  return `Fed and marginally more employable. +${FOOD[food]!.hunger} food · ${FOOD[food]!.thirst >= 0 ? '+' : ''}${FOOD[food]!.thirst} water.`;
}
export function canteenCapacity(s: GameState) {
  return 3 + (s.frontier.gear.canteen - 1) * 2;
}
/** Prefer useful nutrition over wasting a large meal on a tiny deficit. */
export function quickFood(s: GameState): Resource | null {
  const n = s.frontier.needs;
  let choice: Resource | null = null,
    best = 0;
  for (const food of Object.keys(FOOD) as Resource[]) {
    if (s.inventory[food] < 1) continue;
    const f = FOOD[food]!,
      hunger =
        f.hunger * (1 + Math.max(0, stationLevel(s, 'tavern') - 1) * 0.1);
    const thirstWeight = n.thirst < 25 ? 2 : 1;
    const benefit =
      Math.min(100 - n.hunger, hunger) +
      Math.min(100 - n.thirst, f.thirst) * thirstWeight +
      Math.min(100 - n.health, f.health) * 0.5;
    const waste =
      Math.max(0, hunger - (100 - n.hunger)) +
      Math.max(0, f.thirst - (100 - n.thirst)) +
      Math.max(0, f.health - (100 - n.health)) * 0.5;
    const score = benefit > 0 ? benefit / (1 + waste * 0.08) : benefit;
    if (score > best) {
      best = score;
      choice = food;
    }
  }
  return choice;
}
export function drinkWater(s: GameState, refill = false) {
  const n = s.frontier.needs;
  if (refill) {
    if (n.thirst < 99.5) add(s, 'drink');
    n.canteen = canteenCapacity(s);
    n.thirst = 100;
    return 'Fresh water! Canteen filled. The fish declined to join you.';
  }
  if (!n.canteen)
    return 'Empty canteen. Visit a spring or a well, or brew berry tea.';
  if (n.thirst >= 99.5)
    return 'Already refreshed. Save a sip for the next hill.';
  n.canteen--;
  n.thirst = clamp(n.thirst + 38);
  add(s, 'drink');
  return 'A refreshing absence of dehydration. +38 water.';
}
export function advanceSurvival(s: GameState, dt: number, sprint = false) {
  if (!Number.isFinite(dt) || dt <= 0 || !s.started) return false;
  dt = Math.min(dt, 5);
  const n = s.frontier.needs;
  n.activeTime += dt;
  const sheltered = n.comfort > 0 ? 0.6 : 1;
  n.comfort = Math.max(0, n.comfort - dt);
  n.hunger = clamp(n.hunger - dt * 0.075 * (sprint ? 1.2 : 1) * sheltered);
  n.thirst = clamp(
    n.thirst -
      (dt * 0.105 * (sprint ? 1.4 : 1) * sheltered) /
        (1 + 0.1 * (s.frontier.gear.canteen - 1)),
  );
  if (n.hunger < 1 || n.thirst < 1) n.health = clamp(n.health - dt * 0.65);
  else if (n.hunger > 55 && n.thirst > 55)
    n.health = clamp(n.health + dt * 0.3);
  s.counters['survival:days'] = Math.floor(n.activeTime / 600);
  if (n.health > 0) return false;
  n.health = 70;
  n.hunger = 50;
  n.thirst = 65;
  n.canteen = Math.max(1, n.canteen);
  s.player = { x: 0, z: 7 };
  s.inventory.coins = Math.max(0, s.inventory.coins - 5);
  add(s, 'rescues');
  return true;
}
export function stationLevel(s: GameState, type: Structure) {
  return s.buildings.reduce(
    (best, b) => (b.type === type ? Math.max(best, b.level ?? 1) : best),
    0,
  );
}
export const UPGRADABLE: Structure[] = [
  'workbench',
  'campfire',
  'forge',
  'kiln',
  'shed',
  'cottage',
  'greenhouse',
  'tavern',
  'well',
];
export function upgradeCost(b: Building): Partial<Inventory> {
  if ((b.level ?? 1) === 1)
    return b.type === 'forge'
      ? { iron: 6, brick: 8, plank: 6 }
      : { plank: 8, stone: 8, fiber: 4 };
  return { steel: 5, brick: 12, leather: 3, coins: 25 };
}
export function upgradeBuilding(s: GameState, id: string) {
  const b = s.buildings.find((b) => b.id === id);
  if (!b || !UPGRADABLE.includes(b.type))
    return 'That building is already doing its very best.';
  if ((b.level ?? 1) >= 3)
    return 'Masterwork complete. Further upgrades require a larger adjective.';
  if (!spend(s, upgradeCost(b)))
    return 'Gather the upgrade materials shown on the workshop card.';
  b.level = (b.level ?? 1) + 1;
  if (b.type === 'greenhouse')
    for (const p of s.plots)
      if (
        p.planted !== null &&
        Math.hypot(p.x - b.x, p.z - b.z) < 9 + (b.level - 1) * 3
      ) {
        p.watered = true;
        p.boosted = true;
        p.growthBonus = 1 + (b.level - 1) * 0.2;
      }
  add(s, `upgrade:${b.type}:${b.level}`);
  return `${RECIPES[b.type].name} is now level ${b.level}. New recipes and better results await.`;
}
export const GEAR_NAMES: Record<Gear, string> = {
  axe: 'Woodcutter’s axe',
  pickaxe: 'Quarry pickaxe',
  spear: 'Hunting spear',
  canteen: 'Canteen',
  boots: 'Trail boots',
};
export function gearCost(s: GameState, gear: Gear): Partial<Inventory> {
  const level = s.frontier.gear[gear];
  if (gear === 'spear' && level === 0) return { wood: 4, stone: 3, fiber: 2 };
  return level < 2
    ? { iron: 5, leather: 2, rope: 2 }
    : { steel: 6, leather: 4, machinery: 1 };
}
export function upgradeGear(s: GameState, gear: Gear) {
  const level = s.frontier.gear[gear];
  if (level >= 3) return 'This equipment is now more qualified than the mayor.';
  const needed = level === 0 ? 1 : level === 1 ? 2 : 3;
  if (stationLevel(s, 'workbench') < needed)
    return `A level ${needed} workbench is required.`;
  if (!spend(s, gearCost(s, gear)))
    return 'Not enough materials for that equipment upgrade.';
  s.frontier.gear[gear]++;
  add(s, `gear:${gear}:${level + 1}`);
  if (gear === 'canteen') s.frontier.needs.canteen = canteenCapacity(s);
  return `${GEAR_NAMES[gear]} level ${level + 1}. Warranty void if eaten.`;
}
export const LANDMARKS = [
  {
    id: 'moss-cave',
    name: 'The Cave of Mild Concern',
    x: -23,
    z: -16,
    kind: 'cave',
    clue: 'A mossy mouth west of the old hill. It snores politely.',
  },
  {
    id: 'picnic-ruins',
    name: 'Ruins of the Last Picnic',
    x: 21,
    z: 15,
    kind: 'ruins',
    clue: 'East of the village. Somebody forgot the sandwiches for three centuries.',
  },
  {
    id: 'boar-bluff',
    name: 'Boar-d of Directors',
    x: 35,
    z: 1,
    kind: 'camp',
    clue: 'Beyond the quarry’s southern trail. Meetings involve charging.',
  },
  {
    id: 'moon-pond',
    name: 'Moon Pond',
    x: 23,
    z: 33,
    kind: 'ruins',
    clue: 'South-east, where the moon checks its hair.',
  },
  {
    id: 'old-camp',
    name: 'Camp Questionable Decisions',
    x: -18,
    z: 30,
    kind: 'camp',
    clue: 'South of the orchard. Follow the abandoned optimism.',
  },
  {
    id: 'whisper-falls',
    name: 'Whisper Falls',
    x: -42,
    z: -4,
    kind: 'ruins',
    clue: 'Far west. The stones have gossip.',
  },
  {
    id: 'smugglers-cove',
    name: 'Smuggler’s Biscuit Cove',
    x: -20,
    z: -40,
    kind: 'cave',
    clue: 'Beyond the repaired bridge, on the western highland shore.',
  },
  {
    id: 'star-summit',
    name: 'The Summit of Excessive Paperwork',
    x: 2,
    z: -47,
    kind: 'ruins',
    clue: 'Through the ancient gate. Bring snacks, not forms.',
  },
] as const;
export const ANIMALS: {
  id: string;
  kind: AnimalKind;
  x: number;
  z: number;
  seed: number;
}[] = [
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `animal-rabbit-${i}`,
    kind: 'rabbit' as const,
    x: -13 + (i % 3) * 9,
    z: 15 + Math.floor(i / 3) * 8,
    seed: i + 1,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `animal-boar-${i}`,
    kind: 'boar' as const,
    x: 20 + (i % 3) * 7,
    z: -4 - Math.floor(i / 3) * 12,
    seed: i + 20,
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `animal-deer-${i}`,
    kind: 'deer' as const,
    x: -32 + (i % 3) * 8,
    z: -5 - Math.floor(i / 3) * 9,
    seed: i + 40,
  })),
];
export function animalPosition(a: (typeof ANIMALS)[number], now = Date.now()) {
  const t = (now / 1000) * (a.kind === 'rabbit' ? 0.6 : 0.3) + a.seed;
  return { x: a.x + Math.sin(t) * 2.2, z: a.z + Math.cos(t * 0.8) * 2.2 };
}
export function huntAnimal(s: GameState, id: string, now = Date.now()) {
  const a = ANIMALS.find((a) => a.id === id);
  if (!a || s.tool !== 'spear')
    return 'Equip the hunting spear (8). Wildlife is unimpressed by your watering can.';
  if (!s.frontier.gear.spear)
    return 'Craft a hunting spear at a workbench: open Upgrades (U).';
  if ((s.depleted[id] ?? 0) > now)
    return 'This trail is resting. Try another hunting ground.';
  const maxHp = a.kind === 'rabbit' ? 1 : a.kind === 'deer' ? 3 : 4;
  const old = s.frontier.wounds[id];
  const hp =
    (old && now - old.at < 20000 ? old.hp : maxHp) -
    s.frontier.gear.spear -
    Math.max(0, stationLevel(s, 'shed') - 1);
  if (hp > 0) {
    s.frontier.wounds[id] = { hp, at: now };
    return `${a.kind === 'boar' ? 'The boar has filed a complaint.' : 'Keep tracking!'} ${hp} more hit${hp === 1 ? '' : 's'} with a basic spear.`;
  }
  delete s.frontier.wounds[id];
  s.depleted[id] = now + 90000;
  const meat = a.kind === 'rabbit' ? 2 : a.kind === 'deer' ? 4 : 5;
  s.inventory.rawmeat += meat;
  s.inventory.hide += a.kind === 'rabbit' ? 1 : 2;
  add(s, `hunt:${a.kind}`);
  add(s, 'hunt');
  return `+${meat} wild meat · +${a.kind === 'rabbit' ? 1 : 2} hides. Cook before eating. The recipe says so, loudly.`;
}
export function discoverLandmark(s: GameState, id: string) {
  const l = LANDMARKS.find((l) => l.id === id);
  if (!l) return 'The landmark is experiencing an identity crisis.';
  if (s.frontier.discoveries.includes(id))
    return `${l.name}. Search its nearby cache again after it restocks.`;
  s.frontier.discoveries.push(id);
  s.inventory.coins += 12;
  s.xp += 25;
  add(s, `discover:${id}`);
  add(s, 'discover');
  return `Discovered ${l.name}! +12 acorns · +25 reputation. Cartography with snacks.`;
}
export function openTreasure(s: GameState, id: string, now = Date.now()) {
  const l = LANDMARKS.find((l) => `cache-${l.id}` === id);
  if (!l) return 'No cache here.';
  if ((s.frontier.treasures[id] ?? 0) > now)
    return `Cache restocks in ${Math.ceil((s.frontier.treasures[id] - now) / 1000)}s. Even treasure needs a tea break.`;
  if (!s.frontier.discoveries.includes(l.id))
    return 'Inspect the landmark before rummaging through its history.';
  s.frontier.treasures[id] = now + 300000;
  s.inventory.ancientcoin += 2;
  s.inventory.coins += 10;
  s.inventory.salt += 3;
  s.inventory.herbs += 2;
  add(s, 'treasure');
  return '+2 ancient acorns · +10 acorns · herbs and salt. The ancient accountant is furious.';
}
export const EXPEDITIONS = [
  {
    id: 'trail',
    name: 'The Lunch Break Trek',
    key: 'treasure',
    target: 2,
    coins: 25,
    detail: 'Open two landmark caches. Walking counts as paperwork avoidance.',
  },
  {
    id: 'forager',
    name: 'Aggressive Salad Research',
    key: 'gather:berries',
    target: 12,
    coins: 20,
    detail: 'Gather twelve berries. Eat the evidence later.',
  },
  {
    id: 'hunter',
    name: 'Board Meeting, Outdoors',
    key: 'hunt',
    target: 4,
    coins: 35,
    detail: 'Hunt four animals. The boars have rejected remote work.',
  },
  {
    id: 'chef',
    name: 'Extremely Local Catering',
    key: 'craft:cookedmeat',
    target: 4,
    coins: 30,
    detail: 'Cook four portions of campfire skewers.',
  },
  {
    id: 'builder',
    name: 'Wood With Qualifications',
    key: 'craft:plank',
    target: 12,
    coins: 28,
    detail: 'Craft twelve planks for the village supply drive.',
  },
  {
    id: 'explorer',
    name: 'Historical Rummaging',
    key: 'treasure',
    target: 4,
    coins: 55,
    detail: 'Open four caches. History has surprisingly good storage.',
  },
];
export function expeditionProgress(s: GameState) {
  const run = s.frontier.expedition,
    job = EXPEDITIONS.find((e) => e.id === run?.id);
  return run && job
    ? Math.max(
        0,
        Math.min(job.target, (s.counters[job.key] ?? 0) - run.baseline),
      )
    : 0;
}
export function expedition(s: GameState, id: string) {
  const job = EXPEDITIONS.find((e) => e.id === id);
  if (!job) return 'Unknown expedition.';
  const run = s.frontier.expedition;
  if (run) {
    if (run.id !== id)
      return 'Finish the active expedition first. One clipboard at a time.';
    if (expeditionProgress(s) < job.target)
      return 'A little more fieldwork is needed.';
    s.inventory.coins += job.coins;
    s.inventory.ancientcoin++;
    s.xp += 35;
    add(s, `expedition:${id}`);
    s.frontier.expedition = null;
    return `Expedition complete! +${job.coins} acorns · +1 ancient acorn · +35 reputation.`;
  }
  s.frontier.expedition = {
    id,
    baseline: s.counters[job.key] ?? 0,
    started: s.frontier.needs.activeTime,
  };
  return `${job.name} accepted. Only new activity counts. The clipboard is watching.`;
}
export function abandonExpedition(s: GameState) {
  if (!s.frontier.expedition)
    return 'No expedition to abandon. The clipboard is enjoying its day off.';
  s.frontier.expedition = null;
  return 'Expedition abandoned. No reward claimed; your supplies are safe. The clipboard forgives you.';
}
export function parseFrontier(
  value: unknown,
  oldSave: boolean,
): FrontierState | null {
  if (oldSave) return initialFrontier();
  if (!value || typeof value !== 'object') return null;
  const x = value as FrontierState,
    base = initialFrontier();
  if (
    !x.needs ||
    !x.gear ||
    !Array.isArray(x.discoveries) ||
    !x.treasures ||
    !x.wounds
  )
    return null;
  for (const k of Object.keys(base.needs) as (keyof FrontierState['needs'])[])
    if (
      !Number.isFinite(x.needs[k]) ||
      x.needs[k] < 0 ||
      x.needs[k] >
        (k === 'activeTime'
          ? 1e9
          : k === 'comfort'
            ? 300
            : k === 'canteen'
              ? 7
              : 100)
    )
      return null;
  for (const k of Object.keys(base.gear) as Gear[])
    if (
      !Number.isInteger(x.gear[k]) ||
      x.gear[k] < (k === 'spear' ? 0 : 1) ||
      x.gear[k] > 3
    )
      return null;
  if (
    x.discoveries.length > 8 ||
    new Set(x.discoveries).size !== x.discoveries.length ||
    x.discoveries.some((id) => !LANDMARKS.some((l) => l.id === id))
  )
    return null;
  if (
    Object.keys(x.treasures).length > 8 ||
    Object.entries(x.treasures).some(
      ([id, t]) =>
        !LANDMARKS.some((l) => `cache-${l.id}` === id) ||
        !Number.isFinite(t) ||
        t < 0 ||
        t > Date.now() + 300000,
    )
  )
    return null;
  if (
    Object.keys(x.wounds).length > ANIMALS.length ||
    Object.entries(x.wounds).some(
      ([id, w]) =>
        !ANIMALS.some((a) => a.id === id) ||
        !w ||
        !Number.isInteger(w.hp) ||
        w.hp < 1 ||
        w.hp > 4 ||
        !Number.isFinite(w.at) ||
        w.at > Date.now() + 5000,
    )
  )
    return null;
  if (
    x.expedition &&
    (!EXPEDITIONS.some((e) => e.id === x.expedition!.id) ||
      !Number.isFinite(x.expedition.baseline) ||
      x.expedition.baseline < 0 ||
      !Number.isFinite(x.expedition.started))
  )
    return null;
  return x;
}
