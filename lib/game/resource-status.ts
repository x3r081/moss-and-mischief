export const RESOURCE_KINDS: readonly string[] = [
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
];
export function harvestedLabel(kind: string) {
  return kind === 'wood'
    ? 'Cut stump'
    : ['stone', 'ore', 'clay'].includes(kind)
      ? 'Depleted deposit'
      : 'Picked patch';
}
export function regrowthSeconds(
  depleted: Record<string, number>,
  id: string,
  now = Date.now(),
) {
  return Math.max(0, Math.ceil(((depleted[id] ?? 0) - now) / 1000));
}

/** Other cooldowns, such as the supply chest, are not harvested resources. */
export function resourceRegrowthSeconds(
  depleted: Record<string, number>,
  entity: { id: string; kind: string } | null,
  now = Date.now(),
) {
  return entity && RESOURCE_KINDS.includes(entity.kind)
    ? regrowthSeconds(depleted, entity.id, now)
    : 0;
}
