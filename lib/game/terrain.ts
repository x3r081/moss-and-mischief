export const LAND_RADIUS = 54;
export function shoreRadius(angle: number) {
  return 53 + Math.sin(angle * 3 + 0.4) * 3.5 + Math.cos(angle * 5) * 1.8;
}
export function onLand(x: number, z: number, margin = 0) {
  return Math.hypot(x, z) < shoreRadius(Math.atan2(z, x)) - margin;
}
export function heightAt(x: number, z: number) {
  const d = Math.hypot(x, z);
  const inner = Math.exp(-((x + 10) ** 2 + (z + 12) ** 2) / 80) * 2.4;
  const highland = Math.exp(-((x + 5) ** 2 + (z + 38) ** 2) / 180) * 3.4;
  const quarry = Math.exp(-((x - 30) ** 2 + (z + 20) ** 2) / 110) * 1.5;
  return (
    0.7 +
    inner +
    highland +
    quarry +
    Math.sin(x * 0.22) * Math.cos(z * 0.2) * 0.25 -
    Math.max(0, d - 48) * 0.13
  );
}
