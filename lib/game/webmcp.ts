import {
  currentQuest,
  QUESTS,
  canAfford,
  RECIPES,
  craft,
  type GameState,
} from './state';
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
export type Registry = {
  registerTool: (
    tool: ToolDefinition,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
/** Optional agent controls share the game's real progression and recipe checks. */
export function registerGameTools(
  registry: Registry | undefined,
  state: () => GameState,
  changed: () => void,
) {
  const life = new AbortController();
  if (!registry?.registerTool) return () => life.abort();
  const definitions: ToolDefinition[] = [
    {
      name: 'read_island_progress',
      description:
        'Read current quest, backpack, structures, and player position in Moss & Mischief.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const s = state();
        return {
          quest: QUESTS[currentQuest(s)].detail,
          inventory: { ...s.inventory },
          buildings: s.buildings.map((b) => ({
            id: b.id,
            type: b.type,
            x: b.x,
            z: b.z,
          })),
          player: { ...s.player },
          won: s.won,
        };
      },
    },
    {
      name: 'craft_island_recipe',
      description:
        'Craft one plank or carrot bread using backpack ingredients and the required built station. Updates the same backpack as the crafting menu.',
      inputSchema: {
        type: 'object',
        properties: { recipe: { type: 'string', enum: ['plank', 'bread'] } },
        required: ['recipe'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (
          !input ||
          typeof input !== 'object' ||
          Object.keys(input).length !== 1 ||
          !('recipe' in input) ||
          (input.recipe !== 'plank' && input.recipe !== 'bread')
        )
          throw new Error('recipe must be plank or bread');
        const s = state(),
          r = input.recipe;
        if (!s.started) throw new Error('Start the adventure first.');
        if (
          !s.buildings.some(
            (b) => b.type === (r === 'plank' ? 'workbench' : 'campfire'),
          )
        )
          throw new Error('Build the required station first.');
        if (!canAfford(s, RECIPES[r].cost))
          throw new Error('Not enough ingredients.');
        const message = craft(s, r);
        changed();
        return { message, inventory: { ...s.inventory } };
      },
    },
  ];
  for (const def of definitions)
    try {
      void Promise.resolve(
        registry.registerTool(def, { signal: life.signal }),
      ).catch(() => {});
    } catch {
      /* Progressive enhancement: unsupported registries do not affect gameplay. */
    }
  return () => life.abort();
}
