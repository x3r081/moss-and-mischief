import { onLand } from './terrain';
export type Resource =
  | 'wood'
  | 'stone'
  | 'fiber'
  | 'seed'
  | 'carrot'
  | 'plank'
  | 'bread'
  | 'crystal';
export type Structure =
  | 'campfire'
  | 'workbench'
  | 'fence'
  | 'cottage'
  | 'garden';
export type Tool = 'axe' | 'pickaxe' | 'seeds' | 'water' | 'build';
export type Inventory = Record<Resource, number>;
export type Building = {
  id: string;
  type: Structure;
  x: number;
  z: number;
  rotation: number;
};
export type Plot = {
  id: string;
  x: number;
  z: number;
  planted: number | null;
  watered: boolean;
};
export type Stats = {
  gathered: number;
  planted: number;
  harvested: number;
  crafted: number;
  talked: boolean;
  explored: boolean;
};
export type GameState = {
  version: 1;
  inventory: Inventory;
  buildings: Building[];
  plots: Plot[];
  depleted: Record<string, number>;
  stats: Stats;
  player: { x: number; z: number };
  elapsed: number;
  completed: number[];
  won: boolean;
  started: boolean;
  savedAt: number;
  sound: boolean;
  quality: 'high' | 'low';
};
export const SAVE_KEY = 'moss-mischief-v1';
export const RESOURCE_NAMES: Record<Resource, string> = {
  wood: 'Timber',
  stone: 'Stone',
  fiber: 'Fiber',
  seed: 'Seeds',
  carrot: 'Carrots',
  plank: 'Planks',
  bread: 'Carrot bread',
  crystal: 'Sun crystal',
};
export const START = { x: 0, z: 7 };
export const GROW_TIME = 35000;
export const RECIPES: Record<
  Structure | 'plank' | 'bread' | 'lighthouse',
  { name: string; cost: Partial<Inventory>; description: string }
> = {
  workbench: {
    name: 'Workbench',
    cost: { wood: 5, stone: 3 },
    description: 'A table with career ambitions. Unlocks crafting.',
  },
  campfire: {
    name: 'Campfire',
    cost: { wood: 3, stone: 3 },
    description: 'A tiny sun. Excellent for questionable baking.',
  },
  garden: {
    name: 'Garden bed',
    cost: { wood: 2, fiber: 1 },
    description: 'Three more places to bury your expectations.',
  },
  fence: {
    name: 'Rustic fence',
    cost: { plank: 1, fiber: 1 },
    description: 'For keeping the outside slightly more outside.',
  },
  cottage: {
    name: 'Cozy cottage',
    cost: { plank: 4, stone: 6, fiber: 3 },
    description: 'A roof over your head. A triumph over weather.',
  },
  plank: {
    name: 'Timber plank',
    cost: { wood: 2 },
    description: 'Wood, but flatter and more employable.',
  },
  bread: {
    name: 'Carrot bread',
    cost: { carrot: 2, wood: 1 },
    description: 'A vegetable wearing a delicious disguise.',
  },
  lighthouse: {
    name: 'Restore lighthouse',
    cost: { plank: 3, stone: 5, crystal: 1 },
    description: 'Give the lost stars a place to come home.',
  },
};
export const QUESTS = [
  {
    title: 'A rather peculiar welcome',
    short: 'Meet the mayor',
    detail: 'Find Mayor Honk by the cottage. Press E to introduce yourself.',
    quote:
      '“Welcome! I was elected unanimously. I was the only candidate. And the only voter.”',
    check: (s: GameState) => s.stats.talked,
    progress: (s: GameState) => (s.stats.talked ? 1 : 0),
    target: 1,
  },
  {
    title: 'Some assembly encouraged',
    short: 'Build a workbench',
    detail:
      'Gather 5 timber and 3 stone. Open Build (B) and place a workbench.',
    quote:
      '“Our previous craftsman was a beaver. Excellent work. Ate the invoice.”',
    check: (s: GameState) => s.buildings.some((b) => b.type === 'workbench'),
    progress: (s: GameState) =>
      s.buildings.some((b) => b.type === 'workbench') ? 1 : 0,
    target: 1,
  },
  {
    title: 'Lettuce begin',
    short: 'Harvest 3 carrots',
    detail:
      'Plant seeds in the garden beds. Water them, then return in 35 seconds.',
    quote: '“Talk to your plants. I usually discuss local zoning.”',
    check: (s: GameState) => s.stats.harvested >= 3,
    progress: (s: GameState) => Math.min(s.stats.harvested, 3),
    target: 3,
  },
  {
    title: 'A toast to civilization',
    short: 'Bake carrot bread',
    detail:
      'Build a campfire, then craft carrot bread. Yes, that counts as cooking.',
    quote: '“Bread is just a sandwich waiting for purpose.”',
    check: (s: GameState) => s.stats.crafted >= 1,
    progress: (s: GameState) => Math.min(s.stats.crafted, 1),
    target: 1,
  },
  {
    title: 'Home, sweet slightly crooked home',
    short: 'Build your cottage',
    detail:
      'Craft 4 planks. Gather 6 stone and 3 fiber, then build your own cottage.',
    quote:
      '“The property market is wild. Yesterday a mushroom sold for three acorns.”',
    check: (s: GameState) => s.buildings.some((b) => b.type === 'cottage'),
    progress: (s: GameState) =>
      s.buildings.some((b) => b.type === 'cottage') ? 1 : 0,
    target: 1,
  },
  {
    title: 'The light at the end of the honk',
    short: 'Restore the lighthouse',
    detail:
      'Find the sun crystal in the northern ruins. Bring it, 3 planks and 5 stone to the lighthouse.',
    quote:
      '“I borrowed the lighthouse bulb for my reading lamp. In retrospect, a maritime incident.”',
    check: (s: GameState) => s.won,
    progress: (s: GameState) => (s.won ? 1 : 0),
    target: 1,
  },
];
export function initialState(): GameState {
  return {
    version: 1,
    inventory: {
      wood: 3,
      stone: 2,
      fiber: 2,
      seed: 6,
      carrot: 0,
      plank: 0,
      bread: 0,
      crystal: 0,
    },
    buildings: [],
    plots: Array.from({ length: 6 }, (_, i) => ({
      id: `plot-${i}`,
      x: 6 + (i % 3) * 1.55,
      z: 4 + Math.floor(i / 3) * 1.7,
      planted: null,
      watered: false,
    })),
    depleted: {},
    stats: {
      gathered: 0,
      planted: 0,
      harvested: 0,
      crafted: 0,
      talked: false,
      explored: false,
    },
    player: { ...START },
    elapsed: 0,
    completed: [],
    won: false,
    started: false,
    savedAt: 0,
    sound: true,
    quality: 'high',
  };
}
export function canAfford(s: GameState, cost: Partial<Inventory>): boolean {
  return Object.entries(cost).every(
    ([r, n]) => s.inventory[r as Resource] >= n!,
  );
}
export function pay(s: GameState, cost: Partial<Inventory>): boolean {
  if (!canAfford(s, cost)) return false;
  for (const [r, n] of Object.entries(cost)) s.inventory[r as Resource] -= n!;
  return true;
}
export function currentQuest(s: GameState): number {
  const i = QUESTS.findIndex((_, i) => !s.completed.includes(i));
  return i < 0 ? 5 : i;
}
export function updateQuests(s: GameState): number[] {
  const added: number[] = [];
  for (let i = 0; i < QUESTS.length; i++) {
    if (s.completed.includes(i)) continue;
    if (!QUESTS[i].check(s)) break;
    s.completed.push(i);
    added.push(i);
  }
  return added;
}
export function growth(p: Plot, now = Date.now()): number {
  return p.planted === null
    ? 0
    : Math.min(
        1,
        Math.max(
          0,
          (now - p.planted) / (p.watered ? GROW_TIME : GROW_TIME * 2.5),
        ),
      );
}
export function farm(s: GameState, id: string, now = Date.now()): string {
  const p = s.plots.find((p) => p.id === id);
  if (!p) return 'That garden bed has wandered off.';
  if (p.planted === null) {
    if (s.inventory.seed < 1) return 'Gather wildflowers for more seeds.';
    s.inventory.seed--;
    p.planted = now;
    p.watered = false;
    s.stats.planted++;
    return 'Seed planted. An extremely small farm has happened.';
  }
  if (growth(p, now) >= 1) {
    s.inventory.carrot += 2;
    s.inventory.seed += 2;
    s.stats.harvested += 2;
    p.planted = null;
    p.watered = false;
    return '+2 carrots · +2 seeds. Farm-to-pocket freshness.';
  }
  if (!p.watered) {
    p.watered = true;
    return 'Watered! Your carrots appreciate the beverage.';
  }
  return `Growing happily. ${Math.ceil(((1 - growth(p, now)) * GROW_TIME) / 1000)}s until harvest.`;
}
export function craft(s: GameState, type: 'plank' | 'bread'): string {
  const station = type === 'plank' ? 'workbench' : 'campfire';
  if (!s.buildings.some((b) => b.type === station))
    return `Build a ${station} first.`;
  if (!pay(s, RECIPES[type].cost))
    return 'A few ingredients short. The recipe shows what you need.';
  s.inventory[type]++;
  if (type === 'bread') s.stats.crafted++;
  return `+1 ${RESOURCE_NAMES[type]}. ${type === 'bread' ? 'The goose looks interested.' : 'Wood has been successfully reorganized.'}`;
}
export function build(
  s: GameState,
  type: Structure,
  x: number,
  z: number,
  rotation = 0,
): string {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Choose solid ground.';
  if (!pay(s, RECIPES[type].cost)) return 'You need a few more materials.';
  const id = `built-${Date.now()}-${s.buildings.length}`;
  s.buildings.push({ id, type, x, z, rotation });
  if (type === 'garden')
    for (let i = 0; i < 3; i++)
      s.plots.push({
        id: `${id}-plot-${i}`,
        x: x + (i - 1) * 1.5 * Math.cos(rotation),
        z: z - (i - 1) * 1.5 * Math.sin(rotation),
        planted: null,
        watered: false,
      });
  return `${RECIPES[type].name} built. The planning department approves.`;
}
export function gather(
  s: GameState,
  id: string,
  type: 'wood' | 'stone' | 'fiber',
  now = Date.now(),
): string {
  if ((s.depleted[id] ?? 0) > now)
    return 'Nature is restocking. Try a nearby patch.';
  s.depleted[id] = now + 45000;
  s.inventory[type] += 3;
  s.stats.gathered += 3;
  if (type === 'fiber') s.inventory.seed += 2;
  return `+3 ${RESOURCE_NAMES[type]}${type === 'fiber' ? ' · +2 seeds' : ''}. ${type === 'wood' ? 'Locally sourced. Tree approved.' : type === 'stone' ? 'A rock-solid investment.' : 'Weeding, but make it foraging.'}`;
}
export function restoreLighthouse(s: GameState): string {
  if (s.won) return 'The coast is safe. The goose is taking all the credit.';
  if (
    ![0, 1, 2, 3, 4].every((i) => s.completed.includes(i)) ||
    !s.buildings.some((b) => b.type === 'cottage')
  )
    return 'Finish the first five chapters and build a cottage before lighting the beacon.';
  if (!pay(s, RECIPES.lighthouse.cost))
    return 'The beacon needs 3 planks, 5 stone, and the sun crystal from the northern ruins.';
  s.won = true;
  return 'The light is back. So are the mayor’s outrageous claims of competence.';
}
export function dismantle(s: GameState, id: string): string {
  const b = s.buildings.find((b) => b.id === id);
  if (!b) return 'That building is already packed away.';
  for (const [r, n] of Object.entries(RECIPES[b.type].cost))
    s.inventory[r as Resource] += n!;
  if (b.type === 'garden') {
    for (const p of s.plots.filter((p) => p.id.startsWith(id + '-plot-')))
      if (p.planted !== null) s.inventory.seed++;
    s.plots = s.plots.filter((p) => !p.id.startsWith(id + '-plot-'));
  }
  s.buildings = s.buildings.filter((b) => b.id !== id);
  return 'Packed away. All building materials and planted seeds returned.';
}
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
export function parseSave(raw: string | null): GameState | null {
  try {
    if (!raw) return null;
    const x = JSON.parse(raw);
    if (
      x.version !== 1 ||
      !x.inventory ||
      !x.stats ||
      !Array.isArray(x.buildings) ||
      !Array.isArray(x.plots) ||
      !Array.isArray(x.completed) ||
      !x.player ||
      !finite(x.player.x) ||
      !finite(x.player.z) ||
      !onLand(x.player.x, x.player.z, 0.5)
    )
      return null;
    for (const r of Object.keys(initialState().inventory))
      if (
        !Number.isSafeInteger(x.inventory[r]) ||
        x.inventory[r] < 0 ||
        x.inventory[r] > 100000
      )
        return null;
    if (
      x.buildings.length > 250 ||
      x.plots.length > 800 ||
      x.buildings.some(
        (b: Building) =>
          !['campfire', 'workbench', 'fence', 'cottage', 'garden'].includes(
            b.type,
          ) ||
          typeof b.id !== 'string' ||
          !finite(b.x) ||
          !finite(b.z) ||
          !onLand(b.x, b.z, 1) ||
          !finite(b.rotation),
      ) ||
      x.plots.some(
        (p: Plot) =>
          typeof p.id !== 'string' ||
          !finite(p.x) ||
          !finite(p.z) ||
          !onLand(p.x, p.z, 0.5) ||
          (p.planted !== null &&
            (!finite(p.planted) || p.planted > Date.now() + 60000)) ||
          typeof p.watered !== 'boolean',
      )
    )
      return null;
    for (const k of ['gathered', 'planted', 'harvested', 'crafted'])
      if (!finite(x.stats[k]) || x.stats[k] < 0) return null;
    if (
      typeof x.stats.talked !== 'boolean' ||
      typeof x.stats.explored !== 'boolean' ||
      !finite(x.elapsed) ||
      x.elapsed < 0 ||
      typeof x.started !== 'boolean' ||
      typeof x.won !== 'boolean' ||
      !x.depleted ||
      typeof x.depleted !== 'object' ||
      Array.isArray(x.depleted) ||
      Object.values(x.depleted).some((v) => !finite(v))
    )
      return null;
    x.completed = [
      ...new Set(
        x.completed.filter(
          (v: unknown) =>
            Number.isInteger(v) && Number(v) >= 0 && Number(v) < 6,
        ),
      ),
    ];
    if (
      new Set(x.buildings.map((b: Building) => b.id)).size !==
        x.buildings.length ||
      new Set(x.plots.map((p: Plot) => p.id)).size !== x.plots.length ||
      Object.values(x.depleted).some((v) => Number(v) > Date.now() + 300000)
    )
      return null;
    x.quality = x.quality === 'low' ? 'low' : 'high';
    x.sound = x.sound !== false;
    return x as GameState;
  } catch {
    return null;
  }
}
export function readSave(): GameState {
  try {
    return (
      parseSave(localStorage.getItem(SAVE_KEY)) ??
      parseSave(localStorage.getItem(SAVE_KEY + '-backup')) ??
      initialState()
    );
  } catch {
    return initialState();
  }
}
export function saveGame(s: GameState): boolean {
  try {
    const previous = localStorage.getItem(SAVE_KEY);
    if (parseSave(previous))
      localStorage.setItem(SAVE_KEY + '-backup', previous!);
    s.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
