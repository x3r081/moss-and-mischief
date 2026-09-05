import {
  gather,
  farm,
  craft,
  build,
  dismantle,
  trade,
  completeContract,
  talk,
  fish,
  collectRelic,
  performProject,
  tendProduction,
  requiredTool,
  toolError,
  addCount,
  RECIPES,
  RESOURCE_NAMES,
  TOOL_NAMES,
  NPCS,
  RELIC_LOCATIONS,
  type GameState,
  type Resource,
  type Structure,
  type Craftable,
  type Project,
  type Npc,
} from './state';
import {
  upgradeBuilding,
  upgradeGear,
  eatFood,
  drinkWater,
  expedition,
  abandonExpedition,
  huntAnimal,
  discoverLandmark,
  openTreasure,
  stationLevel,
  type Gear,
} from './frontier';
import { onLand } from './terrain';
import { placement } from './placement';
import targets from './targets.json';
import { ANIMALS, LANDMARKS, animalPosition } from './frontier';

function knownTarget(
  s: GameState,
  c: Extract<GameCommand, { type: 'interact' }>,
  now: number,
) {
  const animal = ANIMALS.find((a) => a.id === c.id);
  if (animal)
    return (
      c.kind === 'animal' &&
      Math.hypot(
        c.x - animalPosition(animal, now).x,
        c.z - animalPosition(animal, now).z,
      ) < 2
    );
  const plot = s.plots.find((p) => p.id === c.id);
  if (plot)
    return c.kind === 'plot' && Math.hypot(c.x - plot.x, c.z - plot.z) < 0.1;
  const building = s.buildings.find((b) => b.id === c.id);
  if (building) {
    const kind =
      building.type === 'well'
        ? 'spring'
        : ['coop', 'beehive'].includes(building.type)
          ? 'production'
          : building.type === 'cottage'
            ? 'cottage'
            : building.type === 'market'
              ? 'market'
              : 'station';
    return (
      c.kind === kind && Math.hypot(c.x - building.x, c.z - building.z) < 0.1
    );
  }
  return targets.targets.some(
    (t) =>
      t.id === c.id &&
      t.kind === c.kind &&
      Math.hypot(c.x - t.x, c.z - t.z) < 0.1,
  );
}

export type GameCommand =
  | {
      type: 'interact';
      id: string;
      kind: string;
      x: number;
      z: number;
      actionTime?: number;
    }
  | {
      type: 'build';
      structure: Structure;
      x: number;
      z: number;
      rotation: number;
    }
  | { type: 'craft'; recipe: Craftable; amount: number }
  | { type: 'pack' | 'contract' | 'upgrade' | 'expedition'; id: string }
  | { type: 'gear'; gear: Gear }
  | { type: 'eat'; food: Resource }
  | { type: 'drink' | 'rescue' | 'abandon-expedition' }
  | { type: 'trade'; resource: Resource; sell: boolean };

export function validCommand(value: unknown): value is GameCommand {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const id = typeof c.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(c.id);
  const coordinate =
    Number.isFinite(c.x) &&
    Number.isFinite(c.z) &&
    onLand(Number(c.x), Number(c.z), 0.2);
  switch (c.type) {
    case 'interact':
      return (
        id &&
        coordinate &&
        typeof c.kind === 'string' &&
        c.kind.length < 24 &&
        (c.actionTime === undefined || Number.isFinite(c.actionTime))
      );
    case 'build':
      return (
        coordinate &&
        Number.isFinite(c.rotation) &&
        Object.hasOwn(RECIPES, String(c.structure)) &&
        RECIPES[c.structure as Structure].category === 'building'
      );
    case 'craft':
      return (
        Object.hasOwn(RECIPES, String(c.recipe)) &&
        ['food', 'material'].includes(
          RECIPES[c.recipe as Craftable].category,
        ) &&
        Number.isInteger(c.amount) &&
        Number(c.amount) >= 1 &&
        Number(c.amount) <= 20
      );
    case 'pack':
    case 'contract':
    case 'upgrade':
    case 'expedition':
      return id;
    case 'gear':
      return ['axe', 'pickaxe', 'spear', 'canteen', 'boots'].includes(
        String(c.gear),
      );
    case 'eat':
      return (
        typeof c.food === 'string' && Object.hasOwn(RESOURCE_NAMES, c.food)
      );
    case 'drink':
    case 'rescue':
    case 'abandon-expedition':
      return true;
    case 'trade':
      return (
        typeof c.resource === 'string' &&
        Object.hasOwn(RESOURCE_NAMES, c.resource) &&
        typeof c.sell === 'boolean'
      );
    default:
      return false;
  }
}
/** The same command rules run in solo play and in the authoritative co-op room. */
export function applyCommand(s: GameState, c: GameCommand, now = Date.now()) {
  if (!validCommand(c)) return 'That request fell off the clipboard.';
  switch (c.type) {
    case 'craft':
      return craft(s, c.recipe, c.amount);
    case 'pack':
      return dismantle(s, c.id);
    case 'contract':
      return completeContract(s, c.id, now);
    case 'trade':
      return trade(s, c.resource, c.sell);
    case 'upgrade':
      return upgradeBuilding(s, c.id);
    case 'gear':
      return upgradeGear(s, c.gear);
    case 'eat':
      return eatFood(s, c.food);
    case 'drink':
      return drinkWater(s);
    case 'expedition':
      return expedition(s, c.id);
    case 'abandon-expedition':
      return abandonExpedition(s);
    case 'rescue':
      s.inventory.coins = Math.max(0, s.inventory.coins - 5);
      return 'The goose ambulance has submitted its invoice.';
    case 'build': {
      const check = placement(s, c.structure, c.x, c.z, c.rotation, [
        ...targets.blockers,
        ...targets.targets
          .filter((t) => !['wood', 'stone'].includes(t.kind))
          .map((t) => ({ x: t.x, z: t.z, r: t.r + 0.35 })),
        ...LANDMARKS.map((l) => ({ x: l.x, z: l.z, r: 1.2 })),
      ]);
      return check.ok
        ? build(s, c.structure, c.x, c.z, c.rotation)
        : check.reason;
    }
    case 'interact': {
      if (!knownTarget(s, c, now))
        return 'That object is out of sync. Aim at it again.';
      if (Math.hypot(c.x - s.player.x, c.z - s.player.z) > 5.5)
        return 'Walk closer to use that object.';
      if ((c.z < -29 && !s.projects.bridge) || (c.z < -41 && !s.projects.gate))
        return 'Open the highland route first.';
      const needed = requiredTool(s, c.kind, c.id);
      if (needed && s.tool !== needed) return toolError(s, needed);
      if (
        [
          'wood',
          'stone',
          'fiber',
          'ore',
          'clay',
          'mushroom',
          'apple',
          'berries',
          'herbs',
          'salt',
        ].includes(c.kind)
      ) {
        if (
          !/^(?:tree|outer-tree|rock|fiber|flower|ore|clay|mushroom|apple|berries|herbs|salt)-/.test(
            c.id,
          )
        )
          return 'Unknown gathering patch.';
        return gather(s, c.id, c.kind as Parameters<typeof gather>[2], now);
      }
      if (c.kind === 'plot') return farm(s, c.id, now);
      if (c.kind === 'animal') return huntAnimal(s, c.id, now);
      if (c.kind === 'landmark') return discoverLandmark(s, c.id);
      if (c.kind === 'cache') return openTreasure(s, c.id, now);
      if (c.kind === 'npc' || c.kind === 'goose') {
        if (!Object.hasOwn(NPCS, c.id)) return 'No resident by that name.';
        talk(s, c.id as Npc);
        return '';
      }
      if (c.kind === 'fish')
        return fish(
          s,
          c.id,
          c.actionTime === undefined
            ? now
            : Math.max(now - 1000, Math.min(now, c.actionTime)),
        );
      if (c.kind === 'relic')
        return RELIC_LOCATIONS.some((r) => r.id === c.id)
          ? collectRelic(s, c.id)
          : 'Unknown relic.';
      if (c.kind === 'project' || c.kind === 'lighthouse')
        return Object.hasOwn(s.projects, c.id)
          ? performProject(s, c.id as Project)
          : 'Unknown community project.';
      if (c.kind === 'production') return tendProduction(s, c.id, now);
      if (c.kind === 'spring') {
        s.water = 24;
        const message = drinkWater(s, true);
        const well = s.buildings.find(
          (b) => b.id === c.id && b.type === 'well',
        );
        if (well)
          s.frontier.needs.comfort = Math.max(
            s.frontier.needs.comfort,
            ((well.level ?? 1) - 1) * 60,
          );
        return message;
      }
      if (c.kind === 'cottage') {
        s.frontier.needs.health = 100;
        s.frontier.needs.comfort = Math.max(
          s.frontier.needs.comfort,
          stationLevel(s, 'cottage') * 90,
        );
        return 'Rested. The bed has accepted your resignation from standing.';
      }
      if (c.kind === 'crystal' && !s.stats.explored) {
        s.inventory.crystal++;
        s.stats.explored = true;
        addCount(s, 'gather:crystal');
        return 'Sun crystal recovered. An excellent start to a suspicious collection.';
      }
      if (c.kind === 'chest' && c.id === 'supplies') {
        if ((s.depleted.supplies ?? 0) > now)
          return 'More supplies arrive in a minute.';
        for (const r of ['wood', 'stone', 'fiber'] as const)
          s.inventory[r] += 2;
        s.depleted.supplies = now + 60000;
        return '+2 timber · +2 stone · +2 fiber. Excellent sea delivery.';
      }
      return '';
    }
  }
}
export function validTool(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(TOOL_NAMES, value);
}
