import { RECIPES, type Structure } from './catalog';
import type { GameState } from './state';
import { heightAt, onLand } from './terrain';
export type Footprint = {
  x: number;
  z: number;
  w: number;
  d: number;
  rotation: number;
};
export type Blocker = { id?: string; x: number; z: number; r: number };
export function footprint(
  type: Structure,
  x: number,
  z: number,
  rotation = 0,
): Footprint {
  const [w, d] = RECIPES[type].size!;
  return { x, z, w, d, rotation };
}
export function corners(a: Footprint, pad = 0) {
  const c = Math.cos(a.rotation),
    s = Math.sin(a.rotation);
  return [-1, 1].flatMap((i) =>
    [-1, 1].map((j) => ({
      x: a.x + i * (a.w / 2 + pad) * c + j * (a.d / 2 + pad) * s,
      z: a.z - i * (a.w / 2 + pad) * s + j * (a.d / 2 + pad) * c,
    })),
  );
}
export function overlaps(a: Footprint, b: Footprint, pad = 0.3) {
  const ac = corners(a, pad / 2),
    bc = corners(b, pad / 2);
  for (const r of [a.rotation, b.rotation])
    for (const axis of [
      { x: Math.cos(r), z: -Math.sin(r) },
      { x: Math.sin(r), z: Math.cos(r) },
    ]) {
      const pa = ac.map((p) => p.x * axis.x + p.z * axis.z),
        pb = bc.map((p) => p.x * axis.x + p.z * axis.z);
      if (
        Math.max(...pa) < Math.min(...pb) ||
        Math.max(...pb) < Math.min(...pa)
      )
        return false;
    }
  return true;
}
export function circleHits(a: Footprint, b: Blocker, pad = 0) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    c = Math.cos(a.rotation),
    s = Math.sin(a.rotation),
    lx = dx * c - dz * s,
    lz = dx * s + dz * c;
  return (
    Math.hypot(
      Math.max(0, Math.abs(lx) - a.w / 2),
      Math.max(0, Math.abs(lz) - a.d / 2),
    ) <
    b.r + pad
  );
}
export function placement(
  s: GameState,
  type: Structure,
  x: number,
  z: number,
  rotation = 0,
  blockers: Blocker[] = [],
): { ok: boolean; reason: string } {
  const fail = (reason: string) => ({ ok: false, reason });
  if (![x, z, rotation].every(Number.isFinite))
    return fail('Point at solid ground.');
  if (s.completed.length < RECIPES[type].unlock)
    return fail(`Unlock after quest ${RECIPES[type].unlock}.`);
  if (s.buildings.length >= 180)
    return fail('Island building limit reached. Pack a structure away.');
  if (Math.hypot(x - s.player.x, z - s.player.z) > 14)
    return fail('Walk closer. Build within the glowing 14m circle.');
  if (z < -29 && !s.projects.bridge)
    return fail('Restore the highland bridge first.');
  if (z < -41 && !s.projects.gate) return fail('Open the ancient gate first.');
  const f = footprint(type, x, z, rotation),
    cs = corners(f, 0.35);
  if (cs.some((p) => !onLand(p.x, p.z, 1.3)))
    return fail('Too close to the shore. Move inland.');
  if (circleHits(f, { ...s.player, r: 0.65 }, 0.25))
    return fail('You are standing in the footprint. Step aside.');
  if (blockers.filter((b) => !b.id).some((b) => circleHits(f, b, 0.35)))
    return fail('Blocked by scenery or a resident. Choose the clear meadow.');
  if (
    s.buildings.some((b) =>
      overlaps(f, footprint(b.type, b.x, b.z, b.rotation)),
    )
  )
    return fail('Another building needs this space. Leave a small gap.');
  if (
    s.plots.some((p) =>
      overlaps(f, { ...p, w: 1.4, d: 1.4, rotation: 0 }, 0.25),
    )
  )
    return fail('Keep your garden beds clear.');
  const heights = cs.map((p) => heightAt(p.x, p.z));
  if (Math.max(...heights) - Math.min(...heights) > 0.9)
    return fail('This slope is too steep. Try flatter ground.');
  return { ok: true, reason: 'Clear ground · click or Enter to place' };
}
