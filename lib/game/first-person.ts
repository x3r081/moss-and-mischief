import * as THREE from 'three';

export const EYE_HEIGHT = 1.65;
export const INTERACTION_REACH = 4.5;
export type ViewSettings = {
  yaw: number;
  pitch: number;
  fov: number;
  sensitivity: number;
  bob: boolean;
};
export type LookMode = 'free' | 'locked' | 'follow' | 'touch';
export const DEFAULT_VIEW: ViewSettings = {
  yaw: Math.PI / 4,
  pitch: -0.08,
  fov: 75,
  sensitivity: 1,
  bob: false,
};
export function normalizeView(value: unknown): ViewSettings {
  const x = (
    value && typeof value === 'object' ? value : {}
  ) as Partial<ViewSettings>;
  const bounded = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(min, Math.min(max, v))
      : fallback;
  return {
    yaw: bounded(x.yaw, -1e6, 1e6, DEFAULT_VIEW.yaw) % (Math.PI * 2),
    pitch: bounded(x.pitch, -1.45, 1.45, DEFAULT_VIEW.pitch),
    fov: bounded(x.fov, 60, 95, 75),
    sensitivity: bounded(x.sensitivity, 0.3, 2.5, 1),
    bob: x.bob === true,
  };
}
export function lookDelta(view: ViewSettings, dx: number, dy: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const scale = 0.0022 * view.sensitivity;
  view.yaw =
    THREE.MathUtils.euclideanModulo(
      view.yaw - dx * scale + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
  view.pitch = THREE.MathUtils.clamp(view.pitch - dy * scale, -1.45, 1.45);
}
export function walkDirection(yaw: number, strafe: number, forward: number) {
  const length = Math.max(1, Math.hypot(strafe, forward));
  return {
    x: (strafe * Math.cos(yaw) - forward * Math.sin(yaw)) / length,
    z: (-strafe * Math.sin(yaw) - forward * Math.cos(yaw)) / length,
  };
}
export function viewHeading(yaw: number) {
  return (
    Math.round(THREE.MathUtils.euclideanModulo((-yaw * 180) / Math.PI, 360)) %
    360
  );
}
export function compassName(yaw: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
    Math.round(viewHeading(yaw) / 45) % 8
  ];
}
export function visibleInTree(object: THREE.Object3D) {
  for (let p: THREE.Object3D | null = object; p; p = p.parent)
    if (!p.visible) return false;
  return true;
}
/** The first solid hit wins, including scenery with no interaction. */
export function aimEntity<T extends { object: THREE.Object3D }>(
  hits: THREE.Intersection[],
  entities: T[],
  reach = INTERACTION_REACH,
): T | null {
  const hit = hits.find((h) => visibleInTree(h.object));
  if (!hit || hit.distance > reach) return null;
  const owners = new Map(
    entities.filter((e) => visibleInTree(e.object)).map((e) => [e.object, e]),
  );
  for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
    const entity = owners.get(o);
    if (entity) return entity;
  }
  return null;
}
