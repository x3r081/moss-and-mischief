export const LAND_RADIUS = 26;
export function shoreRadius(angle: number) {
  return 25 + Math.sin(angle * 3 + 0.4) * 1.7 + Math.cos(angle * 5) * 0.9;
}
export function onLand(x: number, z: number, margin = 0) {
  return Math.hypot(x, z) < shoreRadius(Math.atan2(z, x)) - margin;
}
export function heightAt(x: number, z: number) {
  const d = Math.hypot(x, z);
  const hill = Math.exp(-((x + 10) ** 2 + (z + 12) ** 2) / 80) * 2.4;
  return (
    0.7 +
    hill +
    Math.sin(x * 0.22) * Math.cos(z * 0.2) * 0.25 -
    Math.max(0, d - 21) * 0.19
  );
}
