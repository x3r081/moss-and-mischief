import { onLand } from './terrain';
import story from './quests.json';
import {
  RESOURCE_NAMES,
  RECIPES,
  CROPS,
  STRUCTURES,
  PROJECT_COSTS,
  TOOL_NAMES,
  type Resource,
  type Inventory,
  type Structure,
  type Craftable,
  type Project,
  type Crop,
  type Tool,
  type Npc,
} from './catalog';
export * from './catalog';
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
  crop: Crop;
  boosted: boolean;
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
  version: 2;
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
  counters: Record<string, number>;
  projects: Record<Project, boolean>;
  collected: string[];
  contracts: Record<string, number>;
  production: Record<string, number>;
  xp: number;
  tool: Tool;
  crop: Crop;
  water: number;
  fishing: { id: string; biteAt: number; expiresAt: number } | null;
  migrated: boolean;
};
type Objective = { key: string; target: number; label: string };
type QuestData = {
  id: string;
  act: number;
  title: string;
  short: string;
  detail: string;
  quote: string;
  npc: string;
  objectives: Objective[];
  reward: { coins: number; xp: number };
  unlock?: string[];
};
export type Contract = {
  id: string;
  title: string;
  npc: string;
  description: string;
  cost: Partial<Inventory>;
  reward: { coins: number; xp: number };
};
export const SAVE_KEY = 'moss-mischief-v2',
  LEGACY_SAVE_KEY = 'moss-mischief-v1';
export const START = { x: 0, z: 7 },
  GROW_TIME = CROPS.carrot.time;
export const ACT_NAMES = [
  'A place to begin',
  'Beyond the garden gate',
  'A village takes root',
  'The generous island',
  'What the stars forgot',
  'A festival worth the honk',
];
export function count(s: GameState, key: string): number {
  if (key.startsWith('build:'))
    return s.buildings.filter((b) => b.type === key.slice(6)).length;
  return s.counters[key] ?? 0;
}
export const QUESTS = (story.main as QuestData[]).map((q) => ({
  ...q,
  target: q.objectives.reduce((n, o) => n + o.target, 0),
  progress: (s: GameState) =>
    q.objectives.reduce((n, o) => n + Math.min(o.target, count(s, o.key)), 0),
  check: (s: GameState) =>
    q.objectives.every((o) => count(s, o.key) >= o.target),
}));
export const CONTRACTS = story.contracts as Contract[];
export function initialState(): GameState {
  const inventory = Object.fromEntries(
    Object.keys(RESOURCE_NAMES).map((k) => [k, 0]),
  ) as Inventory;
  Object.assign(inventory, { wood: 3, stone: 2, fiber: 2, seed: 8, coins: 10 });
  return {
    version: 2,
    inventory,
    buildings: [],
    plots: Array.from({ length: 6 }, (_, i) => ({
      id: `plot-${i}`,
      x: 6 + (i % 3) * 1.55,
      z: 4 + Math.floor(i / 3) * 1.7,
      planted: null,
      watered: false,
      crop: 'carrot',
      boosted: false,
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
    counters: {},
    projects: {
      lighthouse: false,
      bridge: false,
      gate: false,
      observatory: false,
      festival: false,
    },
    collected: [],
    contracts: {},
    production: {},
    xp: 0,
    tool: 'axe',
    crop: 'carrot',
    water: 12,
    fishing: null,
    migrated: false,
  };
}
export function addCount(s: GameState, key: string, n = 1) {
  s.counters[key] = (s.counters[key] ?? 0) + n;
}
export function canAfford(s: GameState, cost: Partial<Inventory>) {
  return Object.entries(cost).every(
    ([key, n]) =>
      Number.isFinite(n) && n! >= 0 && s.inventory[key as Resource] >= n!,
  );
}
export function pay(s: GameState, cost: Partial<Inventory>) {
  if (!canAfford(s, cost)) return false;
  for (const [key, n] of Object.entries(cost))
    s.inventory[key as Resource] -= n!;
  return true;
}
export function currentQuest(s: GameState) {
  const i = QUESTS.findIndex((_, i) => !s.completed.includes(i));
  return i < 0 ? QUESTS.length - 1 : i;
}
export function unlocked(s: GameState, key: keyof typeof RECIPES) {
  return s.completed.length >= RECIPES[key].unlock;
}
export function updateQuests(s: GameState) {
  const added: number[] = [];
  for (let i = 0; i < QUESTS.length; i++) {
    if (s.completed.includes(i)) continue;
    if (!QUESTS[i].check(s)) break;
    s.completed.push(i);
    s.inventory.coins += QUESTS[i].reward.coins;
    s.xp += QUESTS[i].reward.xp;
    added.push(i);
  }
  s.won = s.projects.festival && s.completed.length === QUESTS.length;
  return added;
}
export function requiredTool(
  s: GameState,
  kind: string,
  id?: string,
): Tool | null {
  if (kind === 'wood') return 'axe';
  if (['stone', 'ore', 'clay'].includes(kind)) return 'pickaxe';
  if (['fiber', 'mushroom', 'apple', 'relic'].includes(kind)) return 'hands';
  if (kind === 'fish') return 'rod';
  if (kind === 'plot') {
    const p = s.plots.find((p) => p.id === id);
    if (!p || p.planted === null) return 'seeds';
    return growth(p) >= 1 ? 'hands' : 'water';
  }
  return null;
}
export function toolError(s: GameState, needed: Tool) {
  return s.tool === needed
    ? ''
    : `Equip ${TOOL_NAMES[needed]} first. Your ${TOOL_NAMES[s.tool].split(' · ')[0].toLowerCase()} is enthusiastic but unqualified.`;
}
export function growth(p: Plot, now = Date.now()) {
  return p.planted === null
    ? 0
    : Math.min(
        1,
        Math.max(
          0,
          (now - p.planted) /
            ((CROPS[p.crop]?.time ?? GROW_TIME) *
              (p.watered ? 1 : 2.5) *
              (p.boosted ? 0.65 : 1)),
        ),
      );
}
export function farm(s: GameState, id: string, now = Date.now()) {
  const p = s.plots.find((p) => p.id === id);
  if (!p) return 'That garden has wandered off.';
  const needed: Tool =
    p.planted === null ? 'seeds' : growth(p, now) >= 1 ? 'hands' : 'water';
  const problem = toolError(s, needed);
  if (problem) return problem;
  if (p.planted === null) {
    const crop = CROPS[s.crop];
    if (s.completed.length < crop.unlock)
      return `${crop.name} seeds unlock after quest ${crop.unlock}.`;
    if (s.inventory.seed < crop.seedCost)
      return 'Gather wildflowers with your hands for more seeds, or buy seeds at the market.';
    s.inventory.seed -= crop.seedCost;
    p.crop = s.crop;
    p.planted = now;
    p.boosted = s.buildings.some(
      (b) => b.type === 'greenhouse' && Math.hypot(b.x - p.x, b.z - p.z) < 9,
    );
    p.watered = p.boosted;
    s.stats.planted++;
    addCount(s, `plant:${p.crop}`);
    return `${crop.name} planted. ${p.boosted ? 'The greenhouse handles the watering.' : 'Equip the watering can (4) to water it.'}`;
  }
  if (growth(p, now) >= 1) {
    const crop = CROPS[p.crop];
    s.inventory[p.crop] += crop.yield;
    s.inventory.seed += crop.seedCost + 1;
    s.stats.harvested += crop.yield;
    addCount(s, `harvest:${p.crop}`, crop.yield);
    p.planted = null;
    p.watered = false;
    return `+${crop.yield} ${RESOURCE_NAMES[p.crop]} · +${crop.seedCost + 1} seeds. A delicious achievement.`;
  }
  if (!p.watered) {
    if (s.water < 1)
      return 'Your watering can is empty. Refill at the village spring or a well.';
    s.water--;
    p.watered = true;
    return 'Watered. Your plant appreciates the beverage.';
  }
  return `${CROPS[p.crop].name}: ${Math.ceil(((1 - growth(p, now)) * CROPS[p.crop].time * (p.boosted ? 0.65 : 1)) / 1000)}s until harvest.`;
}
export function craft(s: GameState, type: Craftable, amount = 1) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 20)
    return 'Craft between 1 and 20 at a time.';
  const r = RECIPES[type];
  if (!r || !['food', 'material'].includes(r.category))
    return 'That is not a craftable recipe.';
  if (!unlocked(s, type))
    return `Unlock this recipe by completing quest ${r.unlock}.`;
  if (r.station && !s.buildings.some((b) => b.type === r.station))
    return `Build a ${RECIPES[r.station].name.toLowerCase()} first.`;
  const cost = Object.fromEntries(
    Object.entries(r.cost).map(([k, v]) => [k, v! * amount]),
  );
  if (!pay(s, cost)) return 'Not enough ingredients for that batch.';
  s.inventory[type] += amount;
  addCount(s, `craft:${type}`, amount);
  if (type === 'bread') s.stats.crafted += amount;
  return `+${amount} ${r.name}. Handmade, goose approved.`;
}
export function build(
  s: GameState,
  type: Structure,
  x: number,
  z: number,
  rotation = 0,
) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    !Number.isFinite(rotation) ||
    !onLand(x, z, 1)
  )
    return 'Choose solid ground.';
  if (!STRUCTURES.includes(type)) return 'That building is not available.';
  if (!unlocked(s, type))
    return `Unlock this building after quest ${RECIPES[type].unlock}.`;
  if (s.buildings.length >= 180)
    return 'Your island has reached its building limit. Pack away a structure first.';
  if (!pay(s, RECIPES[type].cost)) return 'You need a few more materials.';
  const id = `built-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  s.buildings.push({ id, type, x, z, rotation });
  addCount(s, `built:${type}`);
  if (type === 'garden')
    for (let i = 0; i < 3; i++)
      s.plots.push({
        id: `${id}-plot-${i}`,
        x: x + (i - 1) * 1.5 * Math.cos(rotation),
        z: z - (i - 1) * 1.5 * Math.sin(rotation),
        planted: null,
        watered: false,
        crop: s.crop,
        boosted: false,
      });
  return `${RECIPES[type].name} built. Honk is already drafting the plaque.`;
}
export function gather(
  s: GameState,
  id: string,
  type: 'wood' | 'stone' | 'fiber' | 'clay' | 'ore' | 'mushroom' | 'apple',
  now = Date.now(),
) {
  const need = requiredTool(s, type)!;
  const error = toolError(s, need);
  if (error) return error;
  if ((s.depleted[id] ?? 0) > now)
    return `Restocking in ${Math.ceil((s.depleted[id] - now) / 1000)}s. Try another patch.`;
  if (type === 'mushroom' && !s.buildings.some((b) => b.type === 'shed'))
    return 'Build a ranger’s shed to learn which mushrooms are legally lunch.';
  s.depleted[id] = now + 60000;
  const n = type === 'wood' || type === 'stone' ? 4 : 3;
  s.inventory[type] += n;
  s.stats.gathered += n;
  addCount(s, `gather:${type}`, n);
  if (type === 'fiber') s.inventory.seed += 3;
  return `+${n} ${RESOURCE_NAMES[type]}${type === 'fiber' ? ' · +3 seeds' : ''}. ${type === 'ore' ? 'Rock-solid career prospects.' : 'Locally sourced. Slightly ridiculous.'}`;
}
export function talk(s: GameState, npc: Npc) {
  addCount(s, `talk:${npc}`);
  if (npc === 'mayor') s.stats.talked = true;
}
export function performProject(s: GameState, project: Project) {
  if (s.projects[project])
    return 'Already restored. The mayor still takes the credit.';
  const required =
    project === 'lighthouse'
      ? 5
      : project === 'bridge'
        ? 23
        : project === 'gate'
          ? 27
          : project === 'observatory'
            ? 28
            : 35;
  if (s.completed.length < required)
    return `Continue the story first. This project opens after quest ${required}.`;
  if (project === 'gate' && (s.counters.relics ?? 0) < 4)
    return 'Find all four relics across Whisperwood, the quarry, the orchard, and the marsh.';
  if (
    ['observatory', 'festival'].includes(project) &&
    !s.buildings.some((b) => b.type === project)
  )
    return `Build the ${RECIPES[project].name.toLowerCase()} first.`;
  if (!pay(s, PROJECT_COSTS[project]))
    return 'You are missing materials. Open the Projects tab in your journal.';
  s.projects[project] = true;
  addCount(s, `project:${project}`);
  return project === 'lighthouse'
    ? 'The lighthouse is lit. There is a much bigger island beyond the homestead.'
    : project === 'bridge'
      ? 'The highland trail is open! Pack a sandwich.'
      : project === 'gate'
        ? 'The gate opens. Something ancient just made a very modern creaking noise.'
        : project === 'observatory'
          ? 'The stars are charted. None of them are named Honk. Yet.'
          : 'The festival begins! Every corner of this island helped make it happen.';
}
export const restoreLighthouse = (s: GameState) =>
  performProject(s, 'lighthouse');
export function fish(s: GameState, id: string, now = Date.now()) {
  const e = toolError(s, 'rod');
  if (e) return e;
  if (!s.counters['talk:fisher'])
    return 'Meet Captain Minnow at Silverfin Marsh to learn fishing.';
  if (s.fishing && s.fishing.id !== id) s.fishing = null;
  if (!s.fishing) {
    if (!pay(s, { seed: 1 }))
      return 'You need one seed for bait. Wildflowers have plenty.';
    s.fishing = { id, biteAt: now + 2500, expiresAt: now + 8000 };
    return 'Line cast… wait for the golden bite indicator, then press E to reel!';
  }
  if (now < s.fishing.biteAt)
    return 'Patience. The fish is considering your offer.';
  if (now > s.fishing.expiresAt) {
    s.fishing = null;
    return 'The fish escaped. Press E to cast again.';
  }
  s.fishing = null;
  s.inventory.fish += 2;
  addCount(s, 'catch:fish', 2);
  return '+2 silverfin! Captain Minnow would describe that as “fish”.';
}
export function collectRelic(s: GameState, id: string) {
  const e = toolError(s, 'hands');
  if (e) return e;
  if (s.collected.includes(id)) return 'You already recovered this relic.';
  s.collected.push(id);
  addCount(s, 'relics');
  return `Relic ${s.collected.length}/4 recovered. A museum would have questions.`;
}
export function tendProduction(s: GameState, id: string, now = Date.now()) {
  const b = s.buildings.find((b) => b.id === id);
  if (!b || !['coop', 'beehive'].includes(b.type))
    return 'Nothing to collect here.';
  const type = b.type === 'coop' ? 'egg' : 'honey',
    input = b.type === 'coop' ? 'wheat' : 'lavender',
    due = s.production[id];
  if (due) {
    if (now < due)
      return `${RESOURCE_NAMES[type]} ready in ${Math.ceil((due - now) / 1000)}s.`;
    s.inventory[type] += 3;
    addCount(s, `produce:${type}`, 3);
    delete s.production[id];
    return `+3 ${RESOURCE_NAMES[type]}. A small business with extremely small employees.`;
  }
  if (!pay(s, { [input]: 3 }))
    return `Add 3 ${RESOURCE_NAMES[input]} to begin production.`;
  s.production[id] = now + 120000;
  return `Production started. Return in two minutes for ${RESOURCE_NAMES[type].toLowerCase()}.`;
}
export function completeContract(s: GameState, id: string, now = Date.now()) {
  const c = CONTRACTS.find((c) => c.id === id);
  if (!c) return 'That request has flown away.';
  if (!s.counters[`talk:${c.npc}`])
    return 'Meet this resident before delivering an order.';
  if ((s.contracts[id] ?? 0) > now)
    return 'This resident is still enjoying your last delivery.';
  if (!pay(s, c.cost)) return 'Gather everything on the request first.';
  s.inventory.coins += c.reward.coins;
  s.xp += c.reward.xp;
  s.contracts[id] = now + 90000;
  addCount(s, 'contracts');
  return `Request delivered. +${c.reward.coins} acorns · +${c.reward.xp} reputation.`;
}
export function trade(s: GameState, type: Resource, sell = true) {
  if (!s.buildings.some((b) => b.type === 'market'))
    return 'Build a village market first.';
  if (!sell) {
    if (!pay(s, { coins: 5 })) return 'You need 5 acorns for a seed bundle.';
    s.inventory.seed += 10;
    return '+10 seeds. Grow something unreasonable.';
  }
  if (
    ![
      'carrot',
      'wheat',
      'pumpkin',
      'lavender',
      'fish',
      'apple',
      'mushroom',
      'bread',
      'jam',
      'pie',
      'honey',
      'egg',
    ].includes(type)
  )
    return 'That item is not for sale.';
  if (!pay(s, { [type]: 1 })) return 'None to sell.';
  s.inventory.coins +=
    type === 'pie' ? 15 : ['bread', 'jam', 'honey'].includes(type) ? 5 : 2;
  return 'Sold. The goose economy is thriving.';
}
export function dismantle(s: GameState, id: string) {
  const b = s.buildings.find((b) => b.id === id);
  if (!b) return 'That building is already packed away.';
  for (const [r, n] of Object.entries(RECIPES[b.type].cost))
    s.inventory[r as Resource] += n!;
  if (s.production[id]) {
    s.inventory[b.type === 'coop' ? 'wheat' : 'lavender'] += 3;
    delete s.production[id];
  }
  if (b.type === 'garden') {
    for (const p of s.plots.filter((p) => p.id.startsWith(id + '-plot-')))
      if (p.planted !== null) s.inventory.seed += CROPS[p.crop].seedCost;
    s.plots = s.plots.filter((p) => !p.id.startsWith(id + '-plot-'));
  }
  s.buildings = s.buildings.filter((b) => b.id !== id);
  return 'Packed away. Building materials, feed and planted seeds returned.';
}
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function parseSave(raw: string | null): GameState | null {
  try {
    if (!raw || raw.length > 1_000_000) return null;
    const x = JSON.parse(raw);
    if (
      ![1, 2].includes(x.version) ||
      !record(x.inventory) ||
      !record(x.stats) ||
      !Array.isArray(x.buildings) ||
      !Array.isArray(x.plots) ||
      !Array.isArray(x.completed) ||
      !record(x.player) ||
      !finite(x.player.x) ||
      !finite(x.player.z) ||
      !onLand(x.player.x, x.player.z, 0.5)
    )
      return null;
    const legacy = x.version === 1;
    const inventory = initialState().inventory;
    for (const k of Object.keys(inventory) as Resource[]) {
      const v = x.inventory[k] ?? (legacy ? 0 : undefined);
      if (!Number.isSafeInteger(v) || Number(v) < 0 || Number(v) > 1_000_000)
        return null;
      inventory[k] = Number(v);
    }
    if (
      x.buildings.length > 180 ||
      x.plots.length > 550 ||
      x.buildings.some(
        (b: Building) =>
          !b ||
          !STRUCTURES.includes(b.type) ||
          typeof b.id !== 'string' ||
          !finite(b.x) ||
          !finite(b.z) ||
          !onLand(b.x, b.z, 1) ||
          !finite(b.rotation),
      ) ||
      x.plots.some(
        (p: Plot) =>
          !p ||
          typeof p.id !== 'string' ||
          !finite(p.x) ||
          !finite(p.z) ||
          !onLand(p.x, p.z, 0.5) ||
          (p.planted !== null &&
            (!finite(p.planted) ||
              p.planted < 0 ||
              p.planted > Date.now() + 60000)) ||
          typeof p.watered !== 'boolean' ||
          (!legacy && !Object.hasOwn(CROPS, p.crop)),
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
      !record(x.depleted) ||
      Object.values(x.depleted).some(
        (v) => !finite(v) || v > Date.now() + 300000,
      )
    )
      return null;
    if (
      new Set(x.buildings.map((b: Building) => b.id)).size !==
        x.buildings.length ||
      new Set(x.plots.map((p: Plot) => p.id)).size !== x.plots.length
    )
      return null;
    const s = { ...initialState(), ...x, version: 2, inventory } as GameState;
    s.quality = x.quality === 'low' ? 'low' : 'high';
    s.sound = x.sound !== false;
    s.completed = [
      ...new Set<number>(
        x.completed.filter(
          (v: unknown) =>
            Number.isInteger(v) &&
            Number(v) >= 0 &&
            Number(v) < (legacy ? 6 : QUESTS.length),
        ),
      ),
    ].sort((a, b) => a - b);
    s.completed = s.completed.filter(
      (v, i, a) => v === i && a.slice(0, i).every((n, j) => n === j),
    );
    s.plots = x.plots.map((p: Plot) => ({
      ...p,
      crop: legacy ? 'carrot' : p.crop,
      boosted: !!p.boosted,
    }));
    if (legacy) {
      s.migrated = true;
      s.counters = {
        'talk:mayor': s.stats.talked ? 1 : 0,
        'harvest:carrot': s.stats.harvested,
        'craft:bread': s.stats.crafted,
        'gather:wood': 0,
      };
      s.projects = { ...initialState().projects, lighthouse: x.won };
      if (x.won) {
        s.counters['project:lighthouse'] = 1;
        s.completed = [0, 1, 2, 3, 4, 5];
      }
      s.xp = s.completed.reduce((n, i) => n + QUESTS[i].reward.xp, 0);
      s.inventory.coins += s.completed.reduce(
        (n, i) => n + QUESTS[i].reward.coins,
        0,
      );
      s.won = false;
    } else {
      for (const key of ['counters', 'contracts', 'production'])
        if (
          !record(x[key]) ||
          Object.keys(x[key]).length > 2000 ||
          Object.values(x[key]).some((v) => !finite(v) || v < 0)
        )
          return null;
      if (
        !record(x.projects) ||
        Object.keys(initialState().projects).some(
          (k) => typeof x.projects[k] !== 'boolean',
        ) ||
        !Array.isArray(x.collected) ||
        x.collected.length > 4 ||
        new Set(x.collected).size !== x.collected.length ||
        x.collected.some((v: unknown) => typeof v !== 'string') ||
        !finite(x.xp) ||
        x.xp < 0 ||
        !finite(x.water) ||
        x.water < 0 ||
        x.water > 24 ||
        !Object.hasOwn(TOOL_NAMES, x.tool) ||
        !Object.hasOwn(CROPS, x.crop)
      )
        return null;
      s.fishing = null;
    }
    return s;
  } catch {
    return null;
  }
}
export function readSave(): GameState {
  try {
    for (const key of [
      SAVE_KEY,
      SAVE_KEY + '-backup',
      LEGACY_SAVE_KEY,
      LEGACY_SAVE_KEY + '-backup',
    ]) {
      const s = parseSave(localStorage.getItem(key));
      if (s) return s;
    }
    return initialState();
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
