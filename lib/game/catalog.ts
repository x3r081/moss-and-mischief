export const RESOURCE_NAMES = {
  wood: 'Timber',
  stone: 'Stone',
  fiber: 'Fiber',
  seed: 'Seeds',
  carrot: 'Carrots',
  plank: 'Planks',
  bread: 'Carrot bread',
  crystal: 'Sun crystal',
  clay: 'Clay',
  ore: 'Copper ore',
  brick: 'Bricks',
  iron: 'Metal ingots',
  wheat: 'Wheat',
  pumpkin: 'Pumpkins',
  lavender: 'Lavender',
  flour: 'Flour',
  fish: 'Silverfin',
  mushroom: 'Mushrooms',
  apple: 'Apples',
  jam: 'Apple jam',
  cloth: 'Linen',
  honey: 'Honey',
  egg: 'Eggs',
  starglass: 'Starglass',
  pie: 'Harvest pie',
  stew: 'Forest stew',
  feast: 'Festival feast',
  coins: 'Acorns',
} as const;
export type Resource = keyof typeof RESOURCE_NAMES;
export type Inventory = Record<Resource, number>;
export type Structure =
  | 'workbench'
  | 'campfire'
  | 'garden'
  | 'fence'
  | 'cottage'
  | 'shed'
  | 'well'
  | 'kiln'
  | 'forge'
  | 'market'
  | 'greenhouse'
  | 'coop'
  | 'beehive'
  | 'windmill'
  | 'observatory'
  | 'tavern'
  | 'festival';
export type Craftable =
  | 'plank'
  | 'bread'
  | 'brick'
  | 'iron'
  | 'flour'
  | 'stew'
  | 'jam'
  | 'cloth'
  | 'starglass'
  | 'pie'
  | 'feast';
export type Project =
  | 'lighthouse'
  | 'bridge'
  | 'gate'
  | 'observatory'
  | 'festival';
export type Crop = 'carrot' | 'wheat' | 'pumpkin' | 'lavender';
export type Tool =
  | 'axe'
  | 'pickaxe'
  | 'seeds'
  | 'water'
  | 'build'
  | 'hands'
  | 'rod';
export const TOOL_NAMES: Record<Tool, string> = {
  axe: 'Axe · 1',
  pickaxe: 'Pickaxe · 2',
  seeds: 'Seed pouch · 3',
  water: 'Watering can · 4',
  build: 'Build · 5',
  hands: 'Hands · 6',
  rod: 'Fishing rod · 7',
};
export type Recipe = {
  name: string;
  cost: Partial<Inventory>;
  description: string;
  station?: Structure;
  unlock: number;
  category: 'building' | 'material' | 'food' | 'project';
  size?: [number, number];
  output?: number;
};
export const RECIPES: Record<Structure | Craftable | Project, Recipe> = {
  workbench: {
    name: 'Workbench',
    cost: { wood: 5, stone: 3 },
    description: 'Turns timber into slightly more official timber.',
    unlock: 0,
    category: 'building',
    size: [2.5, 1.3],
  },
  campfire: {
    name: 'Campfire',
    cost: { wood: 3, stone: 3 },
    description: 'A little sun. A surprisingly good kitchen.',
    unlock: 0,
    category: 'building',
    size: [1.7, 1.7],
  },
  garden: {
    name: 'Garden beds',
    cost: { wood: 4, fiber: 2 },
    description: 'Three beds for your growing ambitions.',
    unlock: 0,
    category: 'building',
    size: [4.5, 1.5],
  },
  fence: {
    name: 'Rustic fence',
    cost: { plank: 1, fiber: 1 },
    description: 'Keep the outside slightly more outside.',
    unlock: 0,
    category: 'building',
    size: [4, 0.5],
  },
  cottage: {
    name: 'Cozy cottage',
    cost: { plank: 4, stone: 6, fiber: 3 },
    description: 'A proper home. Interact to recover your energy.',
    unlock: 0,
    category: 'building',
    size: [5.8, 4.8],
  },
  shed: {
    name: 'Ranger’s shed',
    cost: { plank: 8, stone: 8, fiber: 6 },
    description: 'A trail outpost that unlocks mushroom foraging.',
    unlock: 6,
    category: 'building',
    size: [3.5, 3.5],
  },
  well: {
    name: 'Stone well',
    cost: { stone: 12, plank: 4 },
    description: 'Refill your watering can, wherever you settle.',
    unlock: 6,
    category: 'building',
    size: [2.2, 2.2],
  },
  kiln: {
    name: 'Potter’s kiln',
    cost: { stone: 15, clay: 12, wood: 8 },
    description: 'Clay goes in. Bricks and questionable pottery come out.',
    unlock: 10,
    category: 'building',
    size: [2.8, 2.8],
  },
  forge: {
    name: 'Copper forge',
    cost: { brick: 10, stone: 12, plank: 6 },
    description: 'Smelt ore into ingots. Goggles strongly encouraged.',
    unlock: 12,
    category: 'building',
    size: [3.7, 3.7],
  },
  market: {
    name: 'Village market',
    cost: { plank: 12, cloth: 4, brick: 6 },
    description: 'Sell produce and buy seeds. Honk calls it an economy.',
    unlock: 14,
    category: 'building',
    size: [4.5, 3.5],
  },
  greenhouse: {
    name: 'Greenhouse',
    cost: { plank: 14, iron: 8, brick: 10 },
    description: 'Crops within 9m grow 35% faster and water themselves.',
    unlock: 18,
    category: 'building',
    size: [5.8, 4.8],
  },
  coop: {
    name: 'Chicken coop',
    cost: { plank: 10, cloth: 3, stone: 6 },
    description: 'Feed 3 wheat. Collect 3 eggs after two minutes.',
    unlock: 18,
    category: 'building',
    size: [3.5, 2.8],
  },
  beehive: {
    name: 'Apiary',
    cost: { plank: 8, lavender: 8, cloth: 2 },
    description: 'Add 3 lavender. Collect 3 honey after two minutes.',
    unlock: 20,
    category: 'building',
    size: [2.5, 2.5],
  },
  windmill: {
    name: 'Working windmill',
    cost: { plank: 18, brick: 12, iron: 6, cloth: 4 },
    description: 'Mills wheat into flour. No hamster required.',
    unlock: 16,
    category: 'building',
    size: [4.5, 4.5],
  },
  observatory: {
    name: 'Observatory',
    cost: { brick: 20, iron: 14, starglass: 6, plank: 12 },
    description: 'Map the stars. They refuse to hold still.',
    unlock: 28,
    category: 'building',
    size: [5.8, 5.8],
  },
  tavern: {
    name: 'The Honking Hearth',
    cost: { plank: 20, brick: 18, cloth: 6, iron: 4 },
    description: 'A community kitchen for pies, feasts, and gossip.',
    unlock: 29,
    category: 'building',
    size: [5.8, 4.8],
  },
  festival: {
    name: 'Festival pavilion',
    cost: { plank: 24, cloth: 10, lavender: 12, brick: 8 },
    description: 'A stage big enough for the mayor’s ego. Almost.',
    unlock: 32,
    category: 'building',
    size: [6.8, 4.8],
  },
  plank: {
    name: 'Timber plank',
    cost: { wood: 2 },
    description: 'Wood with a promising career in architecture.',
    station: 'workbench',
    unlock: 0,
    category: 'material',
  },
  bread: {
    name: 'Carrot bread',
    cost: { carrot: 2, wood: 1 },
    description: 'A vegetable wearing a delicious disguise.',
    station: 'campfire',
    unlock: 0,
    category: 'food',
  },
  brick: {
    name: 'Fired brick',
    cost: { clay: 2, wood: 1 },
    description: 'A rock you can take personal credit for.',
    station: 'kiln',
    unlock: 10,
    category: 'material',
  },
  iron: {
    name: 'Metal ingot',
    cost: { ore: 3, wood: 2 },
    description: 'Three ores become one very serious paperweight.',
    station: 'forge',
    unlock: 12,
    category: 'material',
  },
  flour: {
    name: 'Stoneground flour',
    cost: { wheat: 3 },
    description: 'Wheat, but professionally inconvenienced.',
    station: 'windmill',
    unlock: 16,
    category: 'material',
  },
  cloth: {
    name: 'Woven linen',
    cost: { fiber: 5 },
    description: 'For sails, awnings, and dramatic entrances.',
    station: 'workbench',
    unlock: 6,
    category: 'material',
  },
  stew: {
    name: 'Forest stew',
    cost: { mushroom: 3, carrot: 2, wood: 1 },
    description: 'Earthy. Hearty. Legally distinguishable from a puddle.',
    station: 'campfire',
    unlock: 6,
    category: 'food',
  },
  jam: {
    name: 'Orchard jam',
    cost: { apple: 4, wood: 1 },
    description: 'Summer in a jar. No lid-related qualifications needed.',
    station: 'campfire',
    unlock: 14,
    category: 'food',
  },
  starglass: {
    name: 'Starglass',
    cost: { iron: 2, lavender: 3, stone: 3 },
    description: 'Crystal-clear evidence that the smith is also a wizard.',
    station: 'forge',
    unlock: 24,
    category: 'material',
  },
  pie: {
    name: 'Harvest pie',
    cost: { flour: 2, pumpkin: 3, egg: 1, honey: 1 },
    description: 'A small edible monument to your hard work.',
    station: 'campfire',
    unlock: 24,
    category: 'food',
  },
  feast: {
    name: 'Festival feast',
    cost: { pie: 2, fish: 3, jam: 2, bread: 2 },
    description: 'A banquet fit for a goose. And his entire electorate.',
    station: 'tavern',
    unlock: 29,
    category: 'food',
  },
  lighthouse: {
    name: 'Restore lighthouse',
    cost: { plank: 3, stone: 5, crystal: 1 },
    description: 'Light up the coast and begin the wider adventure.',
    unlock: 5,
    category: 'project',
  },
  bridge: {
    name: 'Restore the highland bridge',
    cost: { plank: 16, brick: 12, iron: 4 },
    description: 'Reconnect the northern trail to the highlands.',
    unlock: 23,
    category: 'project',
  },
  gate: {
    name: 'Open the ancient gate',
    cost: { starglass: 4, iron: 6 },
    description: 'The four lost relics reveal a way through.',
    unlock: 27,
    category: 'project',
  },
};
// The observatory and festival also have a separate community completion action.
export const PROJECT_COSTS: Record<Project, Partial<Inventory>> = {
  lighthouse: RECIPES.lighthouse.cost,
  bridge: RECIPES.bridge.cost,
  gate: RECIPES.gate.cost,
  observatory: { starglass: 8, cloth: 4 },
  festival: { feast: 6, pie: 8, jam: 6, honey: 6 },
};
export const STRUCTURES = Object.keys(RECIPES).filter(
  (k) => RECIPES[k as keyof typeof RECIPES].category === 'building',
) as Structure[];
export const CRAFTABLES = Object.keys(RECIPES).filter((k) =>
  ['material', 'food'].includes(RECIPES[k as keyof typeof RECIPES].category),
) as Craftable[];
export const CROPS: Record<
  Crop,
  {
    name: string;
    time: number;
    yield: number;
    seedCost: number;
    unlock: number;
  }
> = {
  carrot: { name: 'Carrot', time: 70000, yield: 3, seedCost: 1, unlock: 0 },
  wheat: { name: 'Wheat', time: 95000, yield: 4, seedCost: 1, unlock: 6 },
  pumpkin: { name: 'Pumpkin', time: 140000, yield: 3, seedCost: 2, unlock: 16 },
  lavender: {
    name: 'Lavender',
    time: 110000,
    yield: 4,
    seedCost: 2,
    unlock: 16,
  },
};
export const NPCS = {
  mayor: {
    name: 'Mayor Honk',
    x: -3,
    z: 4,
    role: 'mayor',
    region: 'homestead',
  },
  ranger: {
    name: 'Rowan Bramble',
    x: -29,
    z: -8,
    role: 'ranger',
    region: 'forest',
  },
  fisher: {
    name: 'Captain Minnow',
    x: 26,
    z: 28,
    role: 'fisher',
    region: 'marsh',
  },
  smith: {
    name: 'Ember Flint',
    x: 29,
    z: -20,
    role: 'smith',
    region: 'quarry',
  },
  botanist: {
    name: 'Professor Petal',
    x: -28,
    z: 23,
    role: 'botanist',
    region: 'orchard',
  },
  astronomer: {
    name: 'Dr. Puddlewick',
    x: -5,
    z: -37,
    role: 'astronomer',
    region: 'highlands',
  },
  baker: {
    name: 'Bunty Butterworth',
    x: 4,
    z: 17,
    role: 'baker',
    region: 'homestead',
  },
} as const;
export type Npc = keyof typeof NPCS;
export const REGIONS = {
  homestead: { name: 'Bramblewick', x: 0, z: 7 },
  forest: { name: 'Whisperwood', x: -29, z: -8 },
  quarry: { name: 'Coppercrag Quarry', x: 29, z: -20 },
  orchard: { name: 'Tumbledown Orchard', x: -28, z: 23 },
  marsh: { name: 'Silverfin Marsh', x: 26, z: 28 },
  highlands: { name: 'Starfall Highlands', x: -5, z: -37 },
} as const;
export type Region = keyof typeof REGIONS;
export const PROJECT_LOCATIONS: Record<
  Project,
  { x: number; z: number; name: string }
> = {
  lighthouse: { x: 17, z: -9, name: 'Bramblewick Lighthouse' },
  bridge: { x: 0, z: -27, name: 'Broken Highland Bridge' },
  gate: { x: -5, z: -39, name: 'The Fourfold Gate' },
  observatory: { x: -5, z: -44, name: 'Starfall Lens' },
  festival: { x: 5, z: 15, name: 'The Great Bramblewick Festival' },
};
export const RELIC_LOCATIONS = [
  { id: 'relic-forest', x: -39, z: -15, name: 'The Acorn of Dubious Wisdom' },
  {
    id: 'relic-quarry',
    x: 38,
    z: -25,
    name: 'The Chisel of Mild Inconvenience',
  },
  { id: 'relic-orchard', x: -35, z: 32, name: 'The Jam Jar of Destiny' },
  { id: 'relic-marsh', x: 35, z: 33, name: 'The Sock That Knows Too Much' },
];
export function regionAt(x: number, z: number): Region {
  let best: Region = 'homestead',
    d = Infinity;
  for (const [key, p] of Object.entries(REGIONS)) {
    const n = Math.hypot(x - p.x, z - p.z);
    if (n < d) {
      d = n;
      best = key as Region;
    }
  }
  return best;
}
