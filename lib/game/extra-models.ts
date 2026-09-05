import * as THREE from 'three';

/**
 * Standalone procedural expansion assets for Moss & Mischief.
 *
 * Coordinate convention: +Y is up, +Z is the front, and every returned group
 * is corrected to rest on y=0. Geometry and materials are pooled across every
 * instance. The deliberately low segment counts and flat shading match the
 * soft, faceted style of the core game.
 */

type VillagerRole =
  | 'ranger'
  | 'fisher'
  | 'smith'
  | 'botanist'
  | 'astronomer'
  | 'baker';
type ResourceType = 'ore' | 'clay' | 'mushroom' | 'apple' | 'relic' | 'fish';
type CropType = 'carrot' | 'wheat' | 'pumpkin' | 'lavender';

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
  cream: 0xf2dfb8,
  creamDark: 0xd7be8d,
  teal: 0x267e78,
  tealDark: 0x175954,
  tealLight: 0x70b8a4,
  terracotta: 0xc86442,
  terracottaDark: 0x824236,
  wood: 0x966442,
  timber: 0x654432,
  bark: 0x52392d,
  straw: 0xe2b85b,
  strawLight: 0xf1d17c,
  leaf: 0x3f8b5d,
  leafLight: 0x75ad62,
  stone: 0x7f8880,
  stoneDark: 0x505d5b,
  iron: 0x45575a,
  soot: 0x293638,
  skin: 0xd99a70,
  clothBlue: 0x47788a,
  lavender: 0x8d72aa,
  white: 0xfff3dc,
  black: 0x17272a,
  orange: 0xe87a3e,
  red: 0xb8493f,
  gold: 0xdcae45,
  water: 0x69c4c1,
  glass: 0x9fd6c8,
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
    roughness: options.roughness ?? 0.88,
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
const cylinder = (top: number, bottom: number, height: number, sides = 8) =>
  geometry(
    `cylinder:${top}:${bottom}:${height}:${sides}`,
    () => new THREE.CylinderGeometry(top, bottom, height, sides),
  );
const cone = (radius: number, height: number, sides = 8) =>
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

/** A solid triangular prism whose ridge is always roofY + rise, above both eaves. */
function roofPrism(
  width: number,
  depth: number,
  rise: number,
): THREE.BufferGeometry {
  return geometry(`roofPrism:${width}:${depth}:${rise}`, () => {
    const x = width / 2;
    const z = depth / 2;
    const positions = new Float32Array([
      -x,
      0,
      -z,
      x,
      0,
      -z,
      0,
      rise,
      -z,
      -x,
      0,
      z,
      x,
      0,
      z,
      0,
      rise,
      z,
    ]);
    const indices = [
      0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2,
    ];
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    result.setIndex(indices);
    return result;
  });
}

function mesh(
  shape: THREE.BufferGeometry,
  surface: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const result = new THREE.Mesh(shape, surface);
  result.position.set(...position);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function group(name: string): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  return result;
}

function finish(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y) > 1e-5) {
    for (const child of root.children) child.position.y -= bounds.min.y;
    root.updateMatrixWorld(true);
  }
  return root;
}

const M = {
  cream: material('cream plaster', C.cream),
  creamDark: material('aged cream', C.creamDark),
  teal: material('painted teal', C.teal),
  tealDark: material('deep teal', C.tealDark),
  tealLight: material('pale teal', C.tealLight),
  roof: material('terracotta roof', C.terracotta),
  roofDark: material('dark roof trim', C.terracottaDark),
  wood: material('warm wood', C.wood),
  timber: material('dark timber', C.timber),
  bark: material('bark', C.bark),
  straw: material('straw', C.straw),
  strawLight: material('light straw', C.strawLight),
  leaf: material('leaf', C.leaf),
  leafLight: material('light leaf', C.leafLight),
  stone: material('stone', C.stone),
  stoneDark: material('dark stone', C.stoneDark),
  iron: material('iron', C.iron, { metalness: 0.42 }),
  soot: material('soot', C.soot),
  glass: material('greenhouse glass', C.glass, {
    roughness: 0.18,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  }),
  window: material('warm window', 0xffc56b, {
    roughness: 0.25,
    emissive: 0xe78130,
    emissiveIntensity: 0.65,
  }),
  water: material('water', C.water, {
    roughness: 0.25,
    transparent: true,
    opacity: 0.82,
  }),
  black: material('black', C.black),
  skin: material('skin', C.skin),
  white: material('white', C.white),
  gold: material('gold', C.gold, { metalness: 0.25 }),
};

function addWindow(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  width = 0.62,
): void {
  root.add(mesh(box(width + 0.14, 0.74, 0.1), M.timber, [x, y, z]));
  root.add(mesh(box(width, 0.58, 0.08), M.window, [x, y, z + 0.07]));
  root.add(mesh(box(0.055, 0.6, 0.055), M.timber, [x, y, z + 0.13]));
}

function addPitchedShell(
  root: THREE.Group,
  width: number,
  depth: number,
  wallHeight: number,
  rise: number,
  wallMaterial: THREE.Material = M.cream,
  roofMaterial: THREE.Material = M.roof,
): void {
  root.add(
    mesh(box(width, wallHeight, depth), wallMaterial, [0, wallHeight / 2, 0]),
  );
  root.add(
    mesh(roofPrism(width + 0.32, depth + 0.32, rise), roofMaterial, [
      0,
      wallHeight,
      0,
    ]),
  );
  root.add(
    mesh(box(width + 0.28, 0.12, 0.14), M.roofDark, [0, wallHeight + rise, 0]),
  );
}

function setFootprint(root: THREE.Group, width: number, depth: number): void {
  root.userData.footprint = { width, depth };
}

function makeShed(): THREE.Group {
  const root = group('shed');
  setFootprint(root, 3, 3);
  addPitchedShell(root, 2.65, 2.45, 1.85, 0.78, M.creamDark);
  root.add(mesh(box(1.02, 1.55, 0.12), M.teal, [0, 0.775, 1.285]));
  root.add(mesh(box(0.12, 1.62, 0.14), M.timber, [0, 0.81, 1.37]));
  for (const x of [-1.18, 1.18])
    root.add(mesh(box(0.13, 1.78, 0.14), M.timber, [x, 0.9, 1.29]));
  root.add(mesh(box(2.48, 0.13, 0.14), M.timber, [0, 1.62, 1.3]));
  root.add(
    mesh(
      cylinder(0.08, 0.1, 1.18, 6),
      M.wood,
      [0.94, 0.59, -0.7],
      [0, 0, 0.12],
    ),
  );
  root.add(mesh(cone(0.3, 0.65, 7), M.straw, [0.9, 0.42, -0.68]));
  return finish(root);
}

function makeWell(): THREE.Group {
  const root = group('well');
  setFootprint(root, 2, 2);
  root.add(mesh(cylinder(0.76, 0.88, 0.58, 12), M.stone, [0, 0.29, 0]));
  root.add(mesh(cylinder(0.56, 0.56, 0.08, 12), M.water, [0, 0.56, 0]));
  for (const x of [-0.78, 0.78])
    root.add(mesh(box(0.14, 1.75, 0.16), M.timber, [x, 1.05, 0]));
  root.add(
    mesh(
      cylinder(0.1, 0.1, 1.68, 8),
      M.wood,
      [0, 1.33, 0],
      [0, 0, Math.PI / 2],
    ),
  );
  root.add(
    mesh(
      cylinder(0.25, 0.25, 0.36, 10),
      M.wood,
      [0, 1.33, 0],
      [0, 0, Math.PI / 2],
    ),
  );
  root.add(mesh(box(0.035, 0.85, 0.035), M.timber, [0, 0.9, 0]));
  root.add(mesh(cylinder(0.2, 0.15, 0.3, 8), M.teal, [0, 0.52, 0]));
  root.add(mesh(roofPrism(1.95, 1.25, 0.48), M.roof, [0, 1.88, 0]));
  return finish(root);
}

function makeKiln(): THREE.Group {
  const root = group('kiln');
  setFootprint(root, 2, 2);
  const dome = mesh(sphere(0.82, 2), M.creamDark, [0, 0.72, 0]);
  dome.scale.set(1, 0.92, 1);
  root.add(dome);
  root.add(mesh(box(0.72, 0.72, 0.12), M.soot, [0, 0.43, 0.75]));
  root.add(mesh(roofPrism(0.72, 0.18, 0.34), M.soot, [0, 0.79, 0.82]));
  root.add(mesh(cylinder(0.22, 0.3, 1.15, 8), M.roof, [0.35, 1.46, -0.15]));
  root.add(
    mesh(cylinder(0.34, 0.34, 0.12, 8), M.roofDark, [0.35, 2.03, -0.15]),
  );
  for (const x of [-0.56, 0.56])
    root.add(mesh(box(0.22, 0.16, 0.42), M.roof, [x, 0.16, 0.55]));
  root.add(mesh(box(1.8, 0.12, 1.7), M.stoneDark, [0, 0.06, 0]));
  return finish(root);
}

function makeForge(): THREE.Group {
  const root = group('forge');
  setFootprint(root, 3, 3);
  root.add(mesh(box(2.75, 0.12, 2.65), M.stoneDark, [0, 0.06, 0]));
  root.add(mesh(box(2.6, 1.35, 0.18), M.creamDark, [0, 0.74, -1.14]));
  for (const x of [-1.18, 1.18])
    root.add(mesh(box(0.17, 2.18, 0.17), M.timber, [x, 1.12, 0.95]));
  root.add(mesh(roofPrism(2.95, 2.65, 0.72), M.tealDark, [0, 2.16, 0]));
  root.add(mesh(box(0.95, 0.7, 0.7), M.roof, [-0.65, 0.41, -0.7]));
  root.add(
    mesh(
      box(0.64, 0.4, 0.12),
      material('forge fire', C.orange, {
        emissive: 0xff441e,
        emissiveIntensity: 1.4,
      }),
      [-0.65, 0.55, -0.32],
    ),
  );
  root.add(mesh(box(0.42, 1.85, 0.48), M.stone, [-0.65, 1.5, -0.86]));
  root.add(mesh(box(0.82, 0.2, 0.38), M.iron, [0.57, 0.82, 0.2]));
  root.add(mesh(box(0.35, 0.58, 0.3), M.iron, [0.57, 0.46, 0.2]));
  root.add(
    mesh(cone(0.22, 0.52, 4), M.iron, [1.03, 0.87, 0.2], [0, 0, -Math.PI / 2]),
  );
  return finish(root);
}

function makeMarket(): THREE.Group {
  const root = group('market');
  setFootprint(root, 4, 3);
  root.add(mesh(box(3.8, 0.12, 2.7), M.stone, [0, 0.06, 0]));
  for (const x of [-1.65, 1.65])
    for (const z of [-1.05, 1.05])
      root.add(mesh(box(0.15, 2.35, 0.15), M.timber, [x, 1.2, z]));
  root.add(mesh(roofPrism(3.95, 2.85, 0.7), M.roof, [0, 2.3, 0]));
  root.add(mesh(box(3.5, 0.18, 0.85), M.wood, [0, 0.93, 0.35]));
  root.add(mesh(box(3.45, 0.72, 0.72), M.teal, [0, 0.48, 0.38]));
  for (const x of [-1.15, -0.38, 0.38, 1.15]) {
    root.add(
      mesh(sphere(0.17, 1), x < 0 ? M.leafLight : M.roof, [x, 1.13, 0.32]),
    );
  }
  root.add(mesh(box(3.75, 0.3, 0.06), M.cream, [0, 1.72, 1.24]));
  for (const x of [-1.4, -0.7, 0, 0.7, 1.4])
    root.add(
      mesh(box(0.32, 0.3, 0.065), x % 1.4 === 0 ? M.teal : M.roof, [
        x,
        1.72,
        1.28,
      ]),
    );
  return finish(root);
}

function makeGreenhouse(): THREE.Group {
  const root = group('greenhouse');
  setFootprint(root, 5, 4);
  root.add(mesh(box(4.8, 0.16, 3.8), M.stoneDark, [0, 0.08, 0]));
  root.add(mesh(box(4.55, 2.05, 3.55), M.glass, [0, 1.1, 0]));
  root.add(mesh(roofPrism(4.65, 3.65, 1.05), M.glass, [0, 2.12, 0]));
  for (const x of [-2.18, 0, 2.18]) {
    root.add(mesh(box(0.1, 3.08, 0.1), M.tealDark, [x, 1.62, 1.78]));
    root.add(mesh(box(0.1, 3.08, 0.1), M.tealDark, [x, 1.62, -1.78]));
  }
  for (const z of [-1.7, 0, 1.7])
    root.add(mesh(box(4.55, 0.1, 0.1), M.tealDark, [0, 2.08, z]));
  root.add(mesh(box(4.7, 0.12, 0.12), M.tealDark, [0, 3.15, 0]));
  root.add(mesh(box(0.92, 1.78, 0.1), M.teal, [0, 0.98, 1.82]));
  for (const x of [-1.45, 1.45]) {
    root.add(mesh(box(1.05, 0.36, 2.75), M.wood, [x, 0.34, 0]));
    for (const z of [-0.9, 0, 0.9])
      root.add(mesh(sphere(0.22, 1), M.leaf, [x, 0.72, z]));
  }
  return finish(root);
}

function makeCoop(): THREE.Group {
  const root = group('coop');
  setFootprint(root, 3, 2);
  for (const x of [-0.85, 0.85])
    root.add(mesh(box(0.14, 0.62, 0.14), M.timber, [x, 0.31, -0.15]));
  root.add(mesh(box(2.35, 1.2, 1.45), M.creamDark, [0, 1.2, -0.12]));
  root.add(mesh(roofPrism(2.65, 1.78, 0.62), M.roof, [0, 1.8, -0.12]));
  root.add(mesh(box(0.66, 0.72, 0.1), M.teal, [0, 1.08, 0.65]));
  root.add(mesh(box(0.9, 0.12, 0.3), M.wood, [0, 0.65, 0.78]));
  root.add(mesh(box(2.65, 0.1, 0.1), M.roofDark, [0, 2.42, -0.12]));
  for (const x of [-1.25, 1.25])
    root.add(mesh(box(0.1, 0.72, 0.1), M.wood, [x, 0.36, 0.8]));
  root.add(mesh(box(2.6, 0.08, 0.08), M.wood, [0, 0.7, 0.8]));
  return finish(root);
}

function makeBeehive(): THREE.Group {
  const root = group('beehive');
  setFootprint(root, 2, 2);
  root.add(mesh(box(1.38, 0.15, 1.18), M.wood, [0, 0.72, 0]));
  for (const x of [-0.52, 0.52])
    root.add(mesh(box(0.12, 0.72, 0.12), M.timber, [x, 0.36, 0]));
  for (let i = 0; i < 4; i++)
    root.add(
      mesh(
        box(1.25 - i * 0.08, 0.3, 0.98 - i * 0.05),
        i % 2 ? M.strawLight : M.straw,
        [0, 0.94 + i * 0.28, 0],
      ),
    );
  root.add(mesh(roofPrism(1.48, 1.28, 0.42), M.teal, [0, 2.03, 0]));
  root.add(
    mesh(
      cylinder(0.12, 0.12, 0.08, 10),
      M.black,
      [0, 1.08, 0.53],
      [Math.PI / 2, 0, 0],
    ),
  );
  for (const [x, y] of [
    [-0.72, 1.65],
    [0.72, 1.48],
    [0.57, 1.9],
  ] as Array<[number, number]>) {
    root.add(mesh(sphere(0.07, 1), M.gold, [x, y, 0.18]));
    root.add(mesh(sphere(0.045, 1), M.white, [x - 0.05, y + 0.04, 0.16]));
  }
  return finish(root);
}

function makeWindmillStructure(): THREE.Group {
  const root = group('windmill');
  setFootprint(root, 4, 4);
  root.add(mesh(cylinder(1.15, 1.52, 4.1, 9), M.cream, [0, 2.05, 0]));
  root.add(mesh(cone(1.48, 1.35, 9), M.roof, [0, 4.78, 0]));
  root.add(mesh(box(0.72, 1.3, 0.12), M.teal, [0, 0.65, 1.37]));
  const rotor = group('windmill rotor');
  rotor.position.set(0, 4.1, 1.3);
  rotor.add(
    mesh(
      cylinder(0.22, 0.22, 0.45, 10),
      M.iron,
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  for (let i = 0; i < 4; i++) {
    const sail = group(`sail ${i + 1}`);
    sail.rotation.z = (i * Math.PI) / 2 + Math.PI / 8;
    sail.add(mesh(box(0.12, 1.78, 0.11), M.timber, [0, 0.89, 0]));
    sail.add(
      mesh(
        box(0.55, 1.18, 0.055),
        M.creamDark,
        [0.28, 1.05, -0.05],
        [0, 0, -0.08],
      ),
    );
    rotor.add(sail);
  }
  root.add(rotor);
  return finish(root);
}

function makeObservatory(): THREE.Group {
  const root = group('observatory');
  setFootprint(root, 5, 5);
  root.add(mesh(cylinder(2.16, 2.28, 2.45, 12), M.cream, [0, 1.225, 0]));
  const dome = mesh(sphere(1.92, 2), M.teal, [0, 2.5, 0]);
  dome.scale.set(1, 0.7, 1);
  root.add(dome);
  root.add(
    mesh(box(0.5, 1.35, 1.95), M.tealDark, [0, 3.04, 0.55], [-0.34, 0, 0]),
  );
  root.add(mesh(box(0.92, 1.62, 0.12), M.roofDark, [0, 0.81, 2.18]));
  addWindow(root, -1.05, 1.25, 1.91, 0.58);
  addWindow(root, 1.05, 1.25, 1.91, 0.58);
  const scope = mesh(
    cylinder(0.22, 0.32, 2.25, 10),
    M.iron,
    [0, 3.55, 0.3],
    [0.72, 0, 0],
  );
  root.add(scope);
  root.add(
    mesh(
      cylinder(0.36, 0.36, 0.16, 10),
      M.gold,
      [0, 4.37, -0.45],
      [0.72, 0, 0],
    ),
  );
  return finish(root);
}

function makeTavern(): THREE.Group {
  const root = group('tavern');
  setFootprint(root, 5, 4);
  addPitchedShell(root, 4.55, 3.5, 2.65, 1.3);
  for (const x of [-2.05, 0, 2.05])
    root.add(mesh(box(0.16, 2.58, 0.16), M.timber, [x, 1.3, 1.79]));
  root.add(mesh(box(4.25, 0.16, 0.16), M.timber, [0, 2.42, 1.79]));
  root.add(mesh(box(1.0, 1.85, 0.12), M.teal, [0, 0.925, 1.82]));
  addWindow(root, -1.35, 1.42, 1.82, 0.72);
  addWindow(root, 1.35, 1.42, 1.82, 0.72);
  root.add(
    mesh(box(0.12, 1.28, 0.12), M.timber, [2.05, 2.32, 1.62], [0, 0, 0.2]),
  );
  root.add(mesh(box(0.82, 0.62, 0.12), M.roof, [2.02, 2.1, 1.72]));
  root.add(
    mesh(
      cylinder(0.18, 0.18, 0.09, 10),
      M.gold,
      [2.02, 2.1, 1.8],
      [Math.PI / 2, 0, 0],
    ),
  );
  root.add(mesh(box(0.58, 1.45, 0.62), M.stone, [1.3, 3.55, -0.55]));
  return finish(root);
}

function makeFestival(): THREE.Group {
  const root = group('festival pavilion');
  setFootprint(root, 6, 4);
  root.add(mesh(box(5.7, 0.18, 3.65), M.wood, [0, 0.09, 0]));
  root.add(mesh(box(4.5, 0.55, 2.65), M.teal, [0, 0.46, -0.25]));
  for (const x of [-2.55, 2.55])
    for (const z of [-1.55, 1.55])
      root.add(mesh(box(0.16, 2.82, 0.16), M.timber, [x, 1.5, z]));
  root.add(mesh(roofPrism(5.75, 3.75, 1.0), M.roof, [0, 2.82, 0]));
  root.add(mesh(box(5.86, 0.12, 0.13), M.roofDark, [0, 3.82, 0]));
  root.add(mesh(box(3.8, 0.1, 0.1), M.timber, [0, 1.95, 1.67]));
  const bunting = [M.tealLight, M.straw, M.roof, M.cream, M.teal];
  for (let i = 0; i < 9; i++) {
    const x = -2.35 + i * 0.59;
    root.add(
      mesh(
        cone(0.13, 0.28, 3),
        bunting[i % bunting.length],
        [x, 1.78 - 0.16 * (1 - Math.abs(x) / 2.35), 1.7],
        [0, 0, Math.PI],
      ),
    );
  }
  root.add(mesh(box(2.6, 0.14, 0.65), M.creamDark, [0, 1.18, -0.65]));
  root.add(mesh(box(0.18, 0.7, 0.18), M.timber, [-1.05, 0.78, -0.65]));
  root.add(mesh(box(0.18, 0.7, 0.18), M.timber, [1.05, 0.78, -0.65]));
  return finish(root);
}

function makeBridge(): THREE.Group {
  const root = group('bridge');
  setFootprint(root, 3, 8);
  const plank = box(2.65, 0.18, 0.78);
  for (let i = 0; i < 10; i++) {
    const z = -3.52 + i * 0.78;
    const y = 0.62 + 0.34 * (1 - Math.abs(z) / 3.52);
    root.add(
      mesh(
        plank,
        i % 2 ? M.wood : M.creamDark,
        [0, y, z],
        [0.03 * Math.sin(i), 0, 0],
      ),
    );
  }
  for (const x of [-1.23, 1.23]) {
    root.add(mesh(box(0.16, 0.16, 7.55), M.timber, [x, 0.66, 0]));
    for (const z of [-3.45, -2.1, -0.7, 0.7, 2.1, 3.45]) {
      const y = 0.67 + 0.34 * (1 - Math.abs(z) / 3.52);
      root.add(mesh(box(0.12, 1.02, 0.12), M.timber, [x, y + 0.46, z]));
    }
    root.add(mesh(box(0.1, 0.1, 7.62), M.tealDark, [x, 1.65, 0]));
  }
  for (const z of [-3.45, 3.45])
    root.add(mesh(box(2.9, 0.2, 0.35), M.stone, [0, 0.1, z]));
  return finish(root);
}

/** Create one of the expansion structures. Unknown names fail loudly. */
export function makeStructure(type: string): THREE.Group {
  switch (type) {
    case 'shed':
      return makeShed();
    case 'well':
      return makeWell();
    case 'kiln':
      return makeKiln();
    case 'forge':
      return makeForge();
    case 'market':
      return makeMarket();
    case 'greenhouse':
      return makeGreenhouse();
    case 'coop':
      return makeCoop();
    case 'beehive':
      return makeBeehive();
    case 'windmill':
      return makeWindmillStructure();
    case 'observatory':
      return makeObservatory();
    case 'tavern':
      return makeTavern();
    case 'festival':
      return makeFestival();
    case 'bridge':
      return makeBridge();
    default:
      throw new Error(`Unknown Moss & Mischief structure: ${type}`);
  }
}

const villagerColors: Record<
  VillagerRole,
  { body: number; trim: number; legs: number }
> = {
  ranger: { body: 0x39735c, trim: 0xc7793c, legs: 0x445547 },
  fisher: { body: 0x477f91, trim: 0xe5d8aa, legs: 0x365d65 },
  smith: { body: 0x555d60, trim: 0xa85a3e, legs: 0x343d40 },
  botanist: { body: 0x6e995e, trim: 0x9a6cac, legs: 0x42634b },
  astronomer: { body: 0x3c587f, trim: 0xe0b84d, legs: 0x303d59 },
  baker: { body: 0xe9d4ad, trim: 0xb95945, legs: 0x77644d },
};

function addVillagerAccessory(root: THREE.Group, role: VillagerRole): void {
  switch (role) {
    case 'ranger':
      root.add(mesh(cone(0.29, 0.28, 7), M.tealDark, [0, 1.6, 0]));
      root.add(mesh(cylinder(0.38, 0.38, 0.045, 10), M.tealDark, [0, 1.48, 0]));
      root.add(
        mesh(box(0.045, 0.7, 0.045), M.wood, [0.29, 0.93, -0.06], [0, 0, -0.1]),
      );
      break;
    case 'fisher':
      root.add(mesh(cylinder(0.28, 0.33, 0.2, 8), M.straw, [0, 1.56, 0]));
      root.add(mesh(cylinder(0.42, 0.42, 0.04, 10), M.straw, [0, 1.47, 0]));
      root.add(
        mesh(
          torus(0.22, 0.035, 5, 10),
          M.wood,
          [0.25, 0.87, 0],
          [0, Math.PI / 2, 0],
        ),
      );
      break;
    case 'smith':
      root.add(mesh(box(0.5, 0.55, 0.08), M.roofDark, [0, 1.03, 0.24]));
      root.add(
        mesh(box(0.36, 0.12, 0.16), M.iron, [0.3, 0.73, 0.03], [0, 0, -0.55]),
      );
      root.add(
        mesh(
          cylinder(0.045, 0.055, 0.48, 6),
          M.wood,
          [0.18, 0.53, 0.02],
          [0, 0, -0.55],
        ),
      );
      break;
    case 'botanist':
      root.add(mesh(cylinder(0.28, 0.34, 0.16, 9), M.creamDark, [0, 1.55, 0]));
      root.add(
        mesh(cylinder(0.42, 0.42, 0.045, 10), M.creamDark, [0, 1.48, 0]),
      );
      root.add(mesh(sphere(0.11, 1), M.leafLight, [0.27, 1.57, 0]));
      root.add(mesh(cone(0.12, 0.34, 7), M.teal, [0.3, 0.76, 0]));
      break;
    case 'astronomer':
      root.add(
        mesh(
          cone(0.28, 0.34, 7),
          material('astronomer cap', 0x354b72),
          [0, 1.55, 0],
        ),
      );
      root.add(mesh(sphere(0.055, 1), M.gold, [0.09, 1.58, 0.25]));
      root.add(
        mesh(
          cylinder(0.07, 0.1, 0.4, 8),
          M.gold,
          [0.29, 0.78, 0],
          [0, 0, -0.75],
        ),
      );
      break;
    case 'baker':
      root.add(mesh(cylinder(0.25, 0.3, 0.12, 9), M.white, [0, 1.54, 0]));
      root.add(mesh(sphere(0.2, 1), M.white, [0, 1.66, 0], [1.3, 0.35, 0.85]));
      root.add(mesh(box(0.48, 0.64, 0.06), M.white, [0, 1.0, 0.25]));
      root.add(
        mesh(box(0.33, 0.11, 0.18), M.straw, [0.28, 0.69, 0.05], [0, 0, 0.25]),
      );
      break;
  }
}

/** Make a compact, rig-friendly 1.7 m villager with role-specific clothing and prop. */
export function makeVillager(role: VillagerRole): THREE.Group {
  const root = group(`${role} villager`);
  root.userData.role = role;
  const colors = villagerColors[role];
  const bodyMat = material(`${role} body`, colors.body);
  const trimMat = material(`${role} trim`, colors.trim);
  const legMat = material(`${role} legs`, colors.legs);

  root.add(mesh(cylinder(0.21, 0.28, 0.58, 7), bodyMat, [0, 1.02, 0]));
  root.add(
    mesh(torus(0.215, 0.04, 5, 10), trimMat, [0, 1.27, 0], [Math.PI / 2, 0, 0]),
  );
  for (const x of [-0.12, 0.12]) {
    const leg = mesh(cylinder(0.065, 0.075, 0.48, 6), legMat, [x, 0.49, 0]);
    leg.name = x < 0 ? 'leftLeg' : 'rightLeg';
    root.add(leg);
    root.add(mesh(box(0.15, 0.1, 0.24), M.bark, [x, 0.2, 0.055]));
  }
  for (const x of [-0.28, 0.28]) {
    const arm = mesh(
      cylinder(0.06, 0.075, 0.49, 6),
      bodyMat,
      [x, 1.0, 0],
      [0, 0, x < 0 ? -0.13 : 0.13],
    );
    arm.name = x < 0 ? 'leftArm' : 'rightArm';
    root.add(arm);
    root.add(
      mesh(sphere(0.07, 1), M.skin, [x + (x < 0 ? -0.03 : 0.03), 0.75, 0]),
    );
  }
  root.add(mesh(sphere(0.21, 1), M.skin, [0, 1.43, 0], [0.9, 1.03, 0.92]));
  root.add(mesh(box(0.045, 0.04, 0.025), M.black, [-0.075, 1.45, 0.19]));
  root.add(mesh(box(0.045, 0.04, 0.025), M.black, [0.075, 1.45, 0.19]));
  addVillagerAccessory(root, role);
  return finish(root);
}

/** Create a compact renewable resource patch suitable for a single grid cell. */
export function makeResource(type: ResourceType): THREE.Group {
  const root = group(`${type} resource`);
  root.userData.resourceType = type;
  root.userData.renewable = true;
  const soil = material('resource soil', 0x654837);

  switch (type) {
    case 'ore':
      root.add(
        mesh(sphere(0.48, 1), M.stoneDark, [0, 0.25, 0], [0.62, 0.5, 0.8]),
      );
      for (const [x, z, h] of [
        [-0.2, 0.05, 0.65],
        [0.18, -0.08, 0.48],
        [0.28, 0.2, 0.36],
      ] as Array<[number, number, number]>) {
        root.add(mesh(cone(0.12, h, 5), M.iron, [x, 0.32 + h / 2, z]));
      }
      break;
    case 'clay':
      root.add(mesh(cylinder(0.58, 0.68, 0.13, 10), soil, [0, 0.065, 0]));
      for (const [x, z, s] of [
        [-0.24, 0.1, 0.3],
        [0.16, -0.14, 0.34],
        [0.27, 0.2, 0.2],
      ] as Array<[number, number, number]>) {
        root.add(
          mesh(sphere(s, 1), M.roof, [x, 0.13 + s * 0.45, z], [1, 0.52, 0.84]),
        );
      }
      break;
    case 'mushroom':
      root.add(mesh(cylinder(0.55, 0.62, 0.09, 10), soil, [0, 0.045, 0]));
      for (const [x, z, h] of [
        [-0.25, 0.1, 0.42],
        [0.14, -0.16, 0.58],
        [0.3, 0.23, 0.34],
      ] as Array<[number, number, number]>) {
        root.add(
          mesh(cylinder(0.055, 0.075, h, 7), M.cream, [x, 0.09 + h / 2, z]),
        );
        root.add(mesh(sphere(0.17, 1), M.roof, [x, 0.1 + h, z], [1, 0.42, 1]));
      }
      break;
    case 'apple':
      root.add(mesh(cylinder(0.55, 0.62, 0.09, 10), soil, [0, 0.045, 0]));
      root.add(mesh(cylinder(0.075, 0.1, 0.72, 7), M.wood, [0, 0.45, 0]));
      for (const [x, y, z] of [
        [-0.27, 0.75, 0],
        [0.2, 0.83, -0.1],
        [0.12, 0.62, 0.24],
      ] as Array<[number, number, number]>) {
        root.add(mesh(sphere(0.28, 1), M.leaf, [x, y, z]));
        root.add(
          mesh(sphere(0.09, 1), material('apple red', C.red), [
            x + 0.08,
            y - 0.08,
            z + 0.15,
          ]),
        );
      }
      break;
    case 'relic':
      root.add(mesh(sphere(0.5, 1), M.stone, [0, 0.16, 0], [1, 0.28, 0.9]));
      root.add(
        mesh(box(0.36, 0.72, 0.24), M.gold, [0, 0.52, 0], [0.12, 0.2, -0.1]),
      );
      root.add(mesh(torus(0.17, 0.04, 5, 9), M.tealLight, [0, 0.63, 0.14]));
      break;
    case 'fish':
      root.add(mesh(cylinder(0.62, 0.68, 0.08, 12), M.water, [0, 0.04, 0]));
      root.add(mesh(sphere(0.28, 1), M.teal, [0, 0.21, 0], [1.35, 0.55, 0.65]));
      root.add(
        mesh(
          cone(0.2, 0.38, 3),
          M.tealDark,
          [-0.43, 0.21, 0],
          [0, 0, -Math.PI / 2],
        ),
      );
      root.add(mesh(sphere(0.035, 1), M.black, [0.29, 0.25, 0.13]));
      break;
  }
  return finish(root);
}

function cropSoil(root: THREE.Group): void {
  root.add(
    mesh(
      cylinder(0.48, 0.55, 0.09, 10),
      material('crop soil', 0x614132),
      [0, 0.045, 0],
    ),
  );
}

/** Create carrot, wheat, pumpkin, or lavender at normalized growth stage 0..3. */
export function makeCropVariant(type: CropType, stage: number): THREE.Group {
  const growth = Math.max(0, Math.min(3, Math.floor(stage)));
  const root = group(`${type} crop stage ${growth}`);
  root.userData.cropType = type;
  root.userData.stage = growth;
  cropSoil(root);

  if (growth === 0) {
    root.add(mesh(sphere(0.08, 1), M.leafLight, [0, 0.14, 0], [1, 0.55, 0.6]));
    return finish(root);
  }

  const count = growth + 2;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.38;
    const radius = 0.08 + (i % 2) * 0.13;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (type === 'carrot') {
      const h = 0.2 + growth * 0.13;
      root.add(
        mesh(
          cone(0.045, h, 5),
          M.leaf,
          [x, 0.09 + h / 2, z],
          [0, 0, (i - 1) * 0.12],
        ),
      );
    } else if (type === 'wheat') {
      const h = 0.3 + growth * 0.18;
      root.add(
        mesh(cylinder(0.018, 0.025, h, 5), growth === 3 ? M.straw : M.leaf, [
          x,
          0.09 + h / 2,
          z,
        ]),
      );
      root.add(
        mesh(
          sphere(0.055, 1),
          growth === 3 ? M.strawLight : M.leafLight,
          [x, 0.1 + h, z],
          [0.6, 1.5, 0.6],
        ),
      );
    } else if (type === 'pumpkin') {
      const h = 0.15 + growth * 0.09;
      root.add(
        mesh(cylinder(0.018, 0.025, h, 5), M.leaf, [x, 0.09 + h / 2, z]),
      );
      root.add(
        mesh(
          sphere(0.09 + growth * 0.045, 1),
          growth === 3 ? M.roof : M.leafLight,
          [x, 0.13 + h, z],
          [1.15, 0.75, 1.15],
        ),
      );
    } else {
      const h = 0.25 + growth * 0.14;
      root.add(
        mesh(cylinder(0.018, 0.025, h, 5), M.leaf, [x, 0.09 + h / 2, z]),
      );
      root.add(
        mesh(cone(0.07, 0.18, 7), material('lavender flower', C.lavender), [
          x,
          0.19 + h,
          z,
        ]),
      );
    }
  }
  if (type === 'carrot' && growth === 3)
    root.add(
      mesh(
        cone(0.13, 0.34, 7),
        material('carrot orange', C.orange),
        [0, 0.16, 0],
        [0, 0, Math.PI],
      ),
    );
  return finish(root);
}

/** Dispose the pooled GPU resources when the entire expansion library is retired. */
export function disposeExtraModelLibrary(): void {
  geometryPool.forEach((value) => value.dispose());
  materialPool.forEach((value) => value.dispose());
  geometryPool.clear();
  materialPool.clear();
}
