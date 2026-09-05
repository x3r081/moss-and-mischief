import * as THREE from 'three';

/**
 * Low-poly harvested-resource remains for Moss & Mischief.
 *
 * Convention: +Y is up and every returned group rests on y=0. Geometry and
 * materials are pooled so repeated depleted nodes stay inexpensive.
 */

type MaterialOptions = {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
};

const materials = new Map<string, THREE.MeshStandardMaterial>();
const geometries = new Map<string, THREE.BufferGeometry>();

const C = {
  soil: 0x624536,
  bark: 0x654331,
  barkDark: 0x473229,
  cutWood: 0xd3aa68,
  cutRing: 0x8e633c,
  stone: 0x7d8984,
  stoneDark: 0x505d5a,
  ore: 0x536b70,
  oreGlint: 0x7fa8a4,
  clay: 0xb96b4d,
  clayDark: 0x874b3d,
  stem: 0x527f4c,
  dryStem: 0xa9874f,
  leaf: 0x4c8b58,
  mushroom: 0xb95b45,
  cream: 0xead8ac,
  apple: 0xb84d42,
  appleFlesh: 0xe8c982,
};

function material(
  name: string,
  color: number,
  options: MaterialOptions = {},
): THREE.MeshStandardMaterial {
  const key = `${name}:${color}:${JSON.stringify(options)}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const result = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.9,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    flatShading: true,
  });
  materials.set(key, result);
  return result;
}

function geometry<T extends THREE.BufferGeometry>(
  key: string,
  create: () => T,
): T {
  const cached = geometries.get(key) as T | undefined;
  if (cached) return cached;
  const result = create();
  result.computeVertexNormals();
  geometries.set(key, result);
  return result;
}

const box = (x: number, y: number, z: number) =>
  geometry(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const cylinder = (top: number, bottom: number, height: number, sides = 7) =>
  geometry(
    `cylinder:${top}:${bottom}:${height}:${sides}`,
    () => new THREE.CylinderGeometry(top, bottom, height, sides),
  );
const cone = (radius: number, height: number, sides = 6) =>
  geometry(
    `cone:${radius}:${height}:${sides}`,
    () => new THREE.ConeGeometry(radius, height, sides),
  );
const rock = (radius: number) =>
  geometry(`rock:${radius}`, () => new THREE.IcosahedronGeometry(radius, 1));
const torus = (radius: number, tube: number, radial = 4, tubular = 10) =>
  geometry(
    `torus:${radius}:${tube}:${radial}:${tubular}`,
    () => new THREE.TorusGeometry(radius, tube, radial, tubular),
  );

const M = {
  soil: material('disturbed soil', C.soil),
  bark: material('bark', C.bark),
  barkDark: material('dark bark', C.barkDark),
  cutWood: material('fresh cut wood', C.cutWood),
  cutRing: material('cut growth rings', C.cutRing),
  stone: material('stone', C.stone),
  stoneDark: material('dark stone', C.stoneDark),
  ore: material('dull ore', C.ore, { metalness: 0.24, roughness: 0.72 }),
  oreGlint: material('ore glint', C.oreGlint, {
    metalness: 0.36,
    roughness: 0.58,
  }),
  clay: material('clay', C.clay),
  clayDark: material('dark clay', C.clayDark),
  stem: material('clipped green stem', C.stem),
  dryStem: material('dry stem', C.dryStem),
  leaf: material('fallen leaf', C.leaf),
  mushroom: material('mushroom fragment', C.mushroom),
  cream: material('cream', C.cream),
  apple: material('apple skin', C.apple),
  appleFlesh: material('apple flesh', C.appleFlesh),
};

function mesh(
  shape: THREE.BufferGeometry,
  surface: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const result = new THREE.Mesh(shape, surface);
  result.position.set(...position);
  result.scale.set(...scale);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function group(name: string, kind: string): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.userData.resourceKind = kind;
  result.userData.harvested = true;
  return result;
}

function onGround(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y) > 1e-6) {
    for (const child of root.children) child.position.y -= bounds.min.y;
    root.updateMatrixWorld(true);
  }
  return root;
}

function makeWoodRemains(): THREE.Group {
  const root = group('harvested wood remains', 'wood');
  root.add(mesh(cylinder(0.18, 0.23, 0.27, 8), M.bark, [0, 0.135, 0]));
  root.add(mesh(cylinder(0.175, 0.175, 0.022, 12), M.cutWood, [0, 0.281, 0]));
  root.add(
    mesh(
      torus(0.105, 0.012, 4, 12),
      M.cutRing,
      [0, 0.294, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  root.add(
    mesh(
      torus(0.052, 0.008, 4, 10),
      M.cutRing,
      [0, 0.297, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  const chips: Array<[number, number, number, number]> = [
    [-0.29, 0.025, 0.08, -0.7],
    [0.26, 0.022, 0.13, 0.55],
    [0.18, 0.02, -0.25, -0.2],
    [-0.2, 0.018, -0.22, 0.35],
  ];
  for (const [x, y, z, turn] of chips) {
    root.add(
      mesh(
        box(0.16, 0.035, 0.065),
        M.cutWood,
        [x, y, z],
        [1, 1, 1],
        [0, turn, 0.12],
      ),
    );
  }
  root.add(mesh(rock(0.08), M.barkDark, [0.22, 0.055, -0.04], [1.2, 0.5, 0.8]));
  return onGround(root);
}

function makeRubbleRemains(kind: 'stone' | 'ore' | 'clay'): THREE.Group {
  const root = group(`harvested ${kind} rubble`, kind);
  const main = kind === 'stone' ? M.stone : kind === 'ore' ? M.ore : M.clay;
  const accent =
    kind === 'stone' ? M.stoneDark : kind === 'ore' ? M.oreGlint : M.clayDark;
  root.add(mesh(cylinder(0.43, 0.48, 0.055, 10), M.soil, [0, 0.0275, 0]));
  const pieces: Array<[number, number, number, number, number]> = [
    [-0.22, 0.11, 0.02, 0.22, -0.25],
    [0.18, 0.09, -0.12, 0.18, 0.5],
    [0.25, 0.065, 0.2, 0.13, -0.35],
    [-0.08, 0.06, -0.25, 0.12, 0.15],
    [0.02, 0.05, 0.19, 0.1, 0.8],
  ];
  for (let i = 0; i < pieces.length; i++) {
    const [x, y, z, size, turn] = pieces[i];
    root.add(
      mesh(
        rock(size),
        i % 2 ? accent : main,
        [x, y, z],
        [1.15, 0.55, 0.85],
        [0.2 * i, turn, 0.12 * (i - 2)],
      ),
    );
  }
  if (kind === 'ore') {
    root.add(mesh(cone(0.055, 0.14, 5), M.oreGlint, [-0.2, 0.19, 0.01]));
  }
  return onGround(root);
}

function addClippedStem(
  root: THREE.Group,
  x: number,
  z: number,
  height: number,
  green = true,
): void {
  root.add(
    mesh(cylinder(0.018, 0.026, height, 5), green ? M.stem : M.dryStem, [
      x,
      0.05 + height / 2,
      z,
    ]),
  );
  root.add(
    mesh(cylinder(0.021, 0.021, 0.012, 6), M.cream, [x, 0.056 + height, z]),
  );
}

function makeFiberRemains(): THREE.Group {
  const root = group('clipped fiber patch', 'fiber');
  root.add(mesh(cylinder(0.39, 0.44, 0.055, 10), M.soil, [0, 0.0275, 0]));
  addClippedStem(root, -0.18, 0.08, 0.13, false);
  addClippedStem(root, 0.03, -0.12, 0.1, false);
  addClippedStem(root, 0.2, 0.1, 0.15, false);
  addClippedStem(root, -0.04, 0.19, 0.08, false);
  root.add(
    mesh(
      rock(0.11),
      M.leaf,
      [0.2, 0.045, -0.17],
      [1.4, 0.2, 0.62],
      [0, 0.5, 0],
    ),
  );
  root.add(
    mesh(
      box(0.22, 0.025, 0.05),
      M.dryStem,
      [-0.16, 0.05, -0.18],
      [1, 1, 1],
      [0, -0.45, 0.08],
    ),
  );
  return onGround(root);
}

function makeMushroomRemains(): THREE.Group {
  const root = group('picked mushroom patch', 'mushroom');
  root.add(mesh(cylinder(0.38, 0.43, 0.055, 10), M.soil, [0, 0.0275, 0]));
  addClippedStem(root, -0.16, 0.06, 0.08);
  addClippedStem(root, 0.11, -0.1, 0.065);
  addClippedStem(root, 0.2, 0.16, 0.05);
  root.add(
    mesh(
      rock(0.13),
      M.mushroom,
      [-0.22, 0.045, -0.17],
      [1.3, 0.18, 0.7],
      [0, 0.55, 0],
    ),
  );
  root.add(
    mesh(
      rock(0.09),
      M.mushroom,
      [0.12, 0.035, 0.22],
      [1.2, 0.16, 0.65],
      [0, -0.4, 0],
    ),
  );
  return onGround(root);
}

function makeAppleRemains(): THREE.Group {
  const root = group('picked apple patch', 'apple');
  root.add(mesh(cylinder(0.42, 0.47, 0.055, 10), M.soil, [0, 0.0275, 0]));
  addClippedStem(root, -0.19, 0.08, 0.14);
  addClippedStem(root, 0.07, -0.13, 0.1);
  addClippedStem(root, 0.22, 0.12, 0.12);
  root.add(
    mesh(
      rock(0.12),
      M.leaf,
      [-0.03, 0.043, 0.22],
      [1.45, 0.18, 0.7],
      [0, -0.4, 0],
    ),
  );
  root.add(mesh(rock(0.105), M.apple, [0.2, 0.062, -0.2], [1, 0.42, 0.72]));
  root.add(
    mesh(cylinder(0.035, 0.035, 0.028, 7), M.appleFlesh, [0.2, 0.092, -0.2]),
  );
  root.add(
    mesh(
      cylinder(0.012, 0.015, 0.08, 5),
      M.barkDark,
      [0.2, 0.132, -0.2],
      [1, 1, 1],
      [0, 0, -0.25],
    ),
  );
  return onGround(root);
}

/** Create the low remains left after a resource node has been harvested. */
export function makeResourceRemains(kind: string): THREE.Group {
  switch (kind) {
    case 'wood':
      return makeWoodRemains();
    case 'stone':
    case 'ore':
    case 'clay':
      return makeRubbleRemains(kind);
    case 'fiber':
      return makeFiberRemains();
    case 'mushroom':
      return makeMushroomRemains();
    case 'apple':
      return makeAppleRemains();
    default:
      throw new Error(`Unknown harvested resource kind: ${kind}`);
  }
}

/** Dispose pooled GPU resources after every remains instance has been removed. */
export function disposeResourceRemains(): void {
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  geometries.clear();
  materials.clear();
}
