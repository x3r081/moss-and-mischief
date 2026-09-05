import * as THREE from 'three';
import { makeSpear } from './frontier-models';

/**
 * Camera-local first-person models for Moss & Mischief.
 *
 * Attach the returned group directly to a PerspectiveCamera. Camera space uses
 * +X right, +Y up and -Z forward. The rig is intentionally kept low and to the
 * sides for a 72 degree field of view with a 0.06 near plane.
 */

type MaterialOptions = {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
};

const materialPool = new Map<string, THREE.MeshStandardMaterial>();
const geometryPool = new Map<string, THREE.BufferGeometry>();

const C = {
  cream: 0xf1dfba,
  creamDark: 0xd3b98a,
  teal: 0x287e78,
  tealDark: 0x185854,
  tealLight: 0x71b6a2,
  terracotta: 0xc96543,
  terracottaDark: 0x844137,
  wood: 0x966341,
  woodDark: 0x5f4030,
  leather: 0x704735,
  skin: 0xd99a70,
  sleeve: 0x236c69,
  cuff: 0xead5aa,
  iron: 0x46585b,
  ironLight: 0x758387,
  straw: 0xe1b75b,
  seed: 0x8c673d,
  water: 0x76d2cc,
  black: 0x18282b,
};

function material(
  name: string,
  color: number,
  options: MaterialOptions = {},
): THREE.MeshStandardMaterial {
  const key = `${name}:${color}:${JSON.stringify(options)}`;
  const cached = materialPool.get(key);
  if (cached) return cached;
  const result = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.86,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    flatShading: true,
  });
  materialPool.set(key, result);
  return result;
}

function geometry<T extends THREE.BufferGeometry>(
  key: string,
  factory: () => T,
): T {
  const cached = geometryPool.get(key) as T | undefined;
  if (cached) return cached;
  const result = factory();
  result.computeVertexNormals();
  geometryPool.set(key, result);
  return result;
}

const box = (x: number, y: number, z: number) =>
  geometry(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const cylinder = (top: number, bottom: number, height: number, sides = 7) =>
  geometry(
    `cylinder:${top}:${bottom}:${height}:${sides}`,
    () => new THREE.CylinderGeometry(top, bottom, height, sides),
  );
const cone = (radius: number, height: number, sides = 7) =>
  geometry(
    `cone:${radius}:${height}:${sides}`,
    () => new THREE.ConeGeometry(radius, height, sides),
  );
const sphere = (radius: number, detail = 1) =>
  geometry(
    `sphere:${radius}:${detail}`,
    () => new THREE.IcosahedronGeometry(radius, detail),
  );
const torus = (radius: number, tube: number, radial = 5, tubular = 12) =>
  geometry(
    `torus:${radius}:${tube}:${radial}:${tubular}`,
    () => new THREE.TorusGeometry(radius, tube, radial, tubular),
  );

const M = {
  cream: material('cream', C.cream),
  creamDark: material('aged cream', C.creamDark),
  teal: material('painted teal', C.teal),
  tealDark: material('deep teal', C.tealDark),
  tealLight: material('pale teal', C.tealLight),
  terracotta: material('terracotta', C.terracotta),
  terracottaDark: material('dark terracotta', C.terracottaDark),
  wood: material('warm wood', C.wood),
  woodDark: material('dark wood', C.woodDark),
  leather: material('leather', C.leather),
  skin: material('skin', C.skin),
  sleeve: material('teal sleeve', C.sleeve),
  cuff: material('cream cuff', C.cuff),
  iron: material('iron', C.iron, { metalness: 0.48, roughness: 0.55 }),
  ironLight: material('light iron', C.ironLight, {
    metalness: 0.38,
    roughness: 0.62,
  }),
  straw: material('straw', C.straw),
  seed: material('seed', C.seed),
  water: material('water', C.water, {
    emissive: 0x247f7a,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.82,
    roughness: 0.25,
  }),
  black: material('black', C.black),
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
  result.frustumCulled = false;
  return result;
}

function beamBetween(
  start: [number, number, number],
  end: [number, number, number],
  radius: number,
  surface: THREE.Material,
  sides = 7,
): THREE.Mesh {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const length = direction.length();
  const result = mesh(cylinder(radius, radius, length, sides), surface, [
    (from.x + to.x) / 2,
    (from.y + to.y) / 2,
    (from.z + to.z) / 2,
  ]);
  result.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return result;
}

function namedGroup(name: string): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.frustumCulled = false;
  return result;
}

function addArms(root: THREE.Group): void {
  const leftForearm = namedGroup('left-forearm');
  leftForearm.position.set(-0.39, -0.51, -0.68);
  leftForearm.rotation.set(-0.08, -0.08, -0.16);
  leftForearm.add(mesh(cylinder(0.075, 0.105, 0.4, 7), M.sleeve));
  leftForearm.add(mesh(cylinder(0.088, 0.088, 0.08, 8), M.cuff, [0, 0.23, 0]));
  const leftHand = mesh(
    sphere(0.105, 1),
    M.skin,
    [0.012, 0.32, -0.006],
    [0.82, 1.08, 0.72],
  );
  leftHand.name = 'left-hand';
  leftForearm.add(leftHand);
  root.add(leftForearm);

  const rightForearm = namedGroup('right-forearm');
  rightForearm.position.set(0.4, -0.52, -0.66);
  rightForearm.rotation.set(-0.1, 0.08, 0.18);
  rightForearm.add(mesh(cylinder(0.075, 0.105, 0.42, 7), M.sleeve));
  rightForearm.add(mesh(cylinder(0.088, 0.088, 0.08, 8), M.cuff, [0, 0.24, 0]));
  const rightHand = mesh(
    sphere(0.105, 1),
    M.skin,
    [-0.012, 0.33, -0.008],
    [0.82, 1.08, 0.72],
  );
  rightHand.name = 'right-hand';
  rightForearm.add(rightHand);
  root.add(rightForearm);
}

function makeHandsTool(): THREE.Group {
  const tool = namedGroup('tool-hands');
  // Small thumbs create an open-handed pose without filling the sight line.
  tool.add(
    mesh(
      cylinder(0.035, 0.045, 0.13, 6),
      M.skin,
      [-0.34, -0.24, -0.66],
      [1, 1, 1],
      [0, 0, -0.55],
    ),
  );
  tool.add(
    mesh(
      cylinder(0.035, 0.045, 0.13, 6),
      M.skin,
      [0.35, -0.25, -0.65],
      [1, 1, 1],
      [0, 0, 0.55],
    ),
  );
  return tool;
}

function makeAxeTool(): THREE.Group {
  const tool = namedGroup('tool-axe');
  tool.position.set(0.5, -0.53, -0.66);
  tool.rotation.z = -0.22;
  tool.add(mesh(cylinder(0.035, 0.045, 0.58, 7), M.wood));
  tool.add(mesh(cylinder(0.052, 0.052, 0.1, 8), M.leather, [0, -0.19, 0]));
  tool.add(mesh(box(0.27, 0.13, 0.085), M.iron, [-0.09, 0.25, 0]));
  tool.add(
    mesh(
      cone(0.11, 0.24, 4),
      M.ironLight,
      [-0.245, 0.25, 0],
      [1, 0.72, 0.8],
      [0, 0, Math.PI / 2],
    ),
  );
  tool.add(mesh(box(0.06, 0.16, 0.1), M.tealDark, [0.035, 0.24, 0]));
  return tool;
}

function makePickaxeTool(): THREE.Group {
  const tool = namedGroup('tool-pickaxe');
  tool.position.set(0.42, -0.54, -0.68);
  tool.rotation.z = -0.18;
  tool.add(mesh(cylinder(0.034, 0.046, 0.6, 7), M.wood));
  tool.add(mesh(box(0.23, 0.1, 0.085), M.iron, [0, 0.265, 0]));
  tool.add(
    mesh(
      cone(0.08, 0.16, 5),
      M.ironLight,
      [-0.13, 0.265, 0],
      [1, 0.72, 0.82],
      [0, 0, Math.PI / 2],
    ),
  );
  tool.add(
    mesh(
      cone(0.08, 0.16, 5),
      M.ironLight,
      [0.13, 0.265, 0],
      [1, 0.72, 0.82],
      [0, 0, -Math.PI / 2],
    ),
  );
  tool.add(mesh(cylinder(0.052, 0.052, 0.1, 8), M.tealDark, [0, 0.16, 0]));
  return tool;
}

function makeSeedsTool(): THREE.Group {
  const tool = namedGroup('tool-seeds');
  tool.position.set(0.43, -0.5, -0.64);
  tool.add(mesh(sphere(0.2, 1), M.leather, [0, -0.02, 0], [0.78, 1.05, 0.62]));
  tool.add(
    mesh(
      torus(0.11, 0.025, 5, 10),
      M.creamDark,
      [0, 0.14, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  tool.add(mesh(box(0.22, 0.12, 0.045), M.teal, [0, 0.03, 0.125]));
  tool.add(
    mesh(
      cylinder(0.015, 0.015, 0.22, 5),
      M.cream,
      [-0.085, 0.2, 0],
      [1, 1, 1],
      [0, 0, -0.6],
    ),
  );
  tool.add(
    mesh(
      cylinder(0.015, 0.015, 0.22, 5),
      M.cream,
      [0.085, 0.2, 0],
      [1, 1, 1],
      [0, 0, 0.6],
    ),
  );
  for (const [x, y, z] of [
    [-0.08, 0.18, -0.015],
    [0.02, 0.21, 0.02],
    [0.09, 0.17, -0.01],
  ] as Array<[number, number, number]>) {
    tool.add(mesh(sphere(0.025, 1), M.seed, [x, y, z], [1, 0.62, 0.75]));
  }
  return tool;
}

function makeWaterTool(): THREE.Group {
  const tool = namedGroup('tool-water');
  tool.position.set(0.39, -0.52, -0.67);
  tool.add(mesh(cylinder(0.13, 0.15, 0.3, 9), M.teal, [0, 0, 0]));
  tool.add(mesh(cylinder(0.08, 0.1, 0.08, 8), M.tealDark, [0, 0.19, 0]));
  tool.add(
    mesh(
      torus(0.16, 0.025, 5, 12),
      M.cream,
      [0, 0.13, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  tool.add(beamBetween([0.12, 0.08, 0], [0.2, 0.17, -0.035], 0.035, M.teal, 7));
  tool.add(
    mesh(
      cone(0.065, 0.08, 8),
      M.tealDark,
      [0.24, 0.2, -0.04],
      [1, 1, 0.8],
      [0, 0, -0.88],
    ),
  );
  tool.add(
    mesh(sphere(0.045, 1), M.water, [0.27, 0.15, -0.05], [0.7, 1.1, 0.7]),
  );
  return tool;
}

function makeBuildTool(): THREE.Group {
  const tool = namedGroup('tool-build');
  tool.position.set(0.43, -0.53, -0.66);
  tool.rotation.z = -0.2;
  tool.add(mesh(cylinder(0.034, 0.045, 0.55, 7), M.wood));
  tool.add(mesh(box(0.29, 0.13, 0.11), M.iron, [0, 0.235, 0]));
  tool.add(
    mesh(
      cylinder(0.075, 0.055, 0.15, 7),
      M.ironLight,
      [0.18, 0.235, 0],
      [1, 1, 1],
      [0, 0, Math.PI / 2],
    ),
  );
  tool.add(mesh(box(0.06, 0.17, 0.115), M.terracottaDark, [-0.14, 0.235, 0]));
  tool.add(mesh(cylinder(0.052, 0.052, 0.095, 8), M.leather, [0, -0.17, 0]));
  return tool;
}

function makeRodTool(): THREE.Group {
  const tool = namedGroup('tool-rod');
  tool.position.set(0.41, -0.55, -0.65);
  tool.add(
    beamBetween([-0.045, -0.2, 0], [0.08, 0.16, -0.07], 0.025, M.wood, 7),
  );
  tool.add(
    beamBetween([0.08, 0.16, -0.07], [0.17, 0.36, -0.13], 0.015, M.tealDark, 7),
  );
  tool.add(
    mesh(
      torus(0.085, 0.02, 5, 12),
      M.iron,
      [-0.01, -0.03, 0.015],
      [1, 1, 1],
      [0, Math.PI / 2, 0],
    ),
  );
  tool.add(
    mesh(
      cylinder(0.025, 0.025, 0.1, 7),
      M.wood,
      [0.03, -0.03, 0.09],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  tool.add(
    beamBetween([0.17, 0.36, -0.13], [0.12, -0.17, -0.26], 0.006, M.water, 5),
  );
  tool.add(
    mesh(
      torus(0.028, 0.006, 4, 8),
      M.iron,
      [0.12, -0.19, -0.26],
      [1, 1, 1],
      [0, Math.PI / 2, 0],
    ),
  );
  return tool;
}

/**
 * Create a first-person rig with two persistent arms and seven selectable tool
 * groups. `tool-hands` is visible initially; all held tools start hidden.
 */
export function makeFirstPersonRig(): THREE.Group {
  const root = namedGroup('first-person-rig');
  root.userData.camera = { fov: 72, near: 0.06 };
  root.userData.toolNames = [
    'axe',
    'pickaxe',
    'seeds',
    'water',
    'build',
    'hands',
    'rod',
    'spear',
  ];

  addArms(root);
  const tools = [
    makeAxeTool(),
    makePickaxeTool(),
    makeSeedsTool(),
    makeWaterTool(),
    makeBuildTool(),
    makeHandsTool(),
    makeRodTool(),
    makeSpear(),
  ];
  for (const tool of tools) {
    tool.visible = tool.name === 'tool-hands';
    root.add(tool);
  }
  return root;
}

/** Dispose the shared GPU resources when no first-person rig remains in use. */
export function disposeFirstPersonModels(): void {
  geometryPool.forEach((value) => value.dispose());
  materialPool.forEach((value) => value.dispose());
  geometryPool.clear();
  materialPool.clear();
}
