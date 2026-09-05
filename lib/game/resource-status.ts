export const RESOURCE_KINDS: readonly string[] = [
  'wood',
  'stone',
  'fiber',
  'ore',
  'clay',
  'mushroom',
  'apple',
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
