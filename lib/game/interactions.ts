import { requiredTool, type GameState } from './state';
import { CROPS } from './catalog';

/** Track actual effects for impact particles/audio, excluding time, camera and UI. */
export function interactionSnapshot(s: GameState, id: string) {
  return JSON.stringify([
    s.inventory,
    s.plots.find((p) => p.id === id),
    s.water,
    s.fishing,
    s.production[id],
    s.projects,
    s.collected,
    s.frontier.wounds,
    s.frontier.discoveries,
    s.frontier.treasures,
  ]);
}

/** Unavailable actions report their existing explanation without a misleading swing. */
export function canAnimateInteraction(
  s: GameState,
  kind: string,
  id: string,
  now = Date.now(),
) {
  const tool = requiredTool(s, kind, id);
  if ((tool && tool !== s.tool) || (s.depleted[id] ?? 0) > now) return false;
  if (kind === 'animal' && !s.frontier.gear.spear) return false;
  if (kind === 'mushroom' && !s.buildings.some((b) => b.type === 'shed'))
    return false;
  if (kind === 'fish') {
    if (!s.counters['talk:fisher']) return false;
    if (s.fishing?.id === id)
      return now >= s.fishing.biteAt && now <= s.fishing.expiresAt;
    return s.inventory.seed > 0;
  }
  if (kind === 'plot') {
    const p = s.plots.find((p) => p.id === id);
    if (!p) return false;
    if (tool === 'seeds')
      return (
        s.inventory.seed >= CROPS[s.crop].seedCost &&
        s.completed.length >= CROPS[s.crop].unlock
      );
    if (tool === 'water') return !p.watered && s.water > 0;
  }
  return (
    !!tool ||
    (s.tool === 'hands' && ['production', 'chest', 'crystal'].includes(kind))
  );
}
