import { PROJECT_LOCATIONS, type GameState } from './state';

export type Waypoint = { name: string; x: number; z: number };
/** Guide toward the required crossing before a destination on locked terrain. */
export function waypointGuide(s: GameState, destination: Waypoint) {
  const crossing =
    destination.z < -29 && !s.projects.bridge
      ? PROJECT_LOCATIONS.bridge
      : destination.z < -41 && !s.projects.gate
        ? PROJECT_LOCATIONS.gate
        : null;
  const target = crossing ?? destination;
  const dx = target.x - s.player.x,
    dz = target.z - s.player.z;
  const angle = Math.atan2(dx, -dz) + s.view.yaw;
  return {
    target,
    distance: Math.hypot(dx, dz),
    turn: (Math.atan2(Math.sin(angle), Math.cos(angle)) * 180) / Math.PI,
    blocked: !!crossing,
    nearby: Math.hypot(dx, dz) <= 4,
  };
}
