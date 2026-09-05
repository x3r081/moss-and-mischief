import * as THREE from 'three';

/**
 * Procedural frontier assets for the warm, low-poly Moss & Mischief islands.
 *
 * World models use +Y up and rest on y=0. The first-person spear uses camera
 * coordinates (+X right, +Y up, -Z forward). Geometry and materials are pooled.
 */

export type AnimalKind = 'rabbit' | 'boar' | 'deer';

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
  woodDark: 0x5d4030,
  bark: 0x6a4936,
  leather: 0x724a35,
  stone: 0x7d8984,
  stoneDark: 0x505d5a,
  iron: 0x4b5e61,
  straw: 0xe1b75b,
  leaf: 0x4f8f5c,
  moss: 0x64954f,
  rabbit: 0xa9957d,
  rabbitLight: 0xddcbb1,
  boar: 0x65473b,
  boarDark: 0x433630,
  deer: 0xa36c45,
  deerLight: 0xe3bf88,
  skin: 0xd99a70,
  black: 0x17272a,
  fire: 0xf27a3f,
  gold: 0xdbae45,
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
  create: () => T,
): T {
  const cached = geometryPool.get(key) as T | undefined;
  if (cached) return cached;
  const result = create();
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

function triangularPrism(
  width: number,
  depth: number,
  rise: number,
): THREE.BufferGeometry {
  return geometry(`tri-prism:${width}:${depth}:${rise}`, () => {
    const x = width / 2,
      z = depth / 2;
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-x, 0, -z, x, 0, -z, 0, rise, -z, -x, 0, z, x, 0, z, 0, rise, z],
        3,
      ),
    );
    result.setIndex([
      0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2,
    ]);
    return result;
  });
}

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
  bark: material('bark', C.bark),
  leather: material('leather', C.leather),
  stone: material('stone', C.stone),
  stoneDark: material('dark stone', C.stoneDark),
  iron: material('iron', C.iron, { metalness: 0.42, roughness: 0.58 }),
  straw: material('straw', C.straw),
  leaf: material('leaf', C.leaf),
  moss: material('moss', C.moss),
  skin: material('skin', C.skin),
  black: material('black', C.black),
  gold: material('gold', C.gold, { metalness: 0.28 }),
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

function namedGroup(name: string): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
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

function atHeight(root: THREE.Group, targetHeight: number): THREE.Group {
  onGround(root);
  const bounds = new THREE.Box3().setFromObject(root);
  const height = bounds.max.y - bounds.min.y;
  if (height > 0) root.scale.y *= targetHeight / height;
  root.userData.height = targetHeight;
  root.updateMatrixWorld(true);
  return root;
}

function addEye(parent: THREE.Object3D, x: number, y: number, z: number): void {
  parent.add(mesh(sphere(0.027, 1), M.black, [x, y, z]));
}

function makeLeg(
  index: number,
  x: number,
  y: number,
  z: number,
  height: number,
  radius: number,
  surface: THREE.Material,
): THREE.Group {
  const leg = namedGroup(`leg-${index}`);
  leg.position.set(x, y, z);
  leg.add(
    mesh(cylinder(radius * 0.8, radius, height, 6), surface, [
      0,
      -height / 2,
      0,
    ]),
  );
  leg.add(
    mesh(box(radius * 1.65, radius * 0.72, radius * 2.1), M.woodDark, [
      0,
      -height - radius * 0.2,
      0.025,
    ]),
  );
  return leg;
}

function makeRabbit(): THREE.Group {
  const root = namedGroup('animal-rabbit');
  root.userData.animalKind = 'rabbit';
  const fur = material('rabbit fur', C.rabbit),
    pale = material('rabbit pale fur', C.rabbitLight);
  const body = mesh(sphere(0.28, 1), fur, [0, 0.34, 0], [0.82, 0.88, 1.25]);
  body.name = 'body';
  root.add(body);
  const head = mesh(sphere(0.2, 1), fur, [0, 0.5, 0.3], [0.92, 1, 0.9]);
  head.name = 'head';
  root.add(head);
  for (const [i, x] of [-0.09, 0.09].entries()) {
    const ear = namedGroup(`ear-${i}`);
    ear.position.set(x, 0.64, 0.27);
    ear.rotation.z = x < 0 ? -0.13 : 0.13;
    ear.add(mesh(sphere(0.16, 1), fur, [0, 0.1, 0], [0.38, 1.25, 0.3]));
    ear.add(mesh(sphere(0.12, 1), pale, [0, 0.1, 0.025], [0.19, 1.05, 0.12]));
    root.add(ear);
    addEye(root, x * 1.35, 0.53, 0.46);
  }
  root.add(mesh(sphere(0.045, 1), M.terracottaDark, [0, 0.46, 0.48]));
  root.add(mesh(sphere(0.13, 1), pale, [0, 0.34, -0.31]));
  root.add(makeLeg(0, -0.16, 0.25, 0.15, 0.16, 0.045, fur));
  root.add(makeLeg(1, 0.16, 0.25, 0.15, 0.16, 0.045, fur));
  root.add(makeLeg(2, -0.17, 0.25, -0.15, 0.15, 0.055, fur));
  root.add(makeLeg(3, 0.17, 0.25, -0.15, 0.15, 0.055, fur));
  return onGround(root);
}

function makeBoar(): THREE.Group {
  const root = namedGroup('animal-boar');
  root.userData.animalKind = 'boar';
  const fur = material('boar fur', C.boar),
    dark = material('boar dark fur', C.boarDark);
  const body = mesh(sphere(0.38, 1), fur, [0, 0.45, 0], [0.92, 0.78, 1.35]);
  body.name = 'body';
  root.add(body);
  const head = mesh(sphere(0.28, 1), fur, [0, 0.48, 0.43], [0.9, 0.82, 1.05]);
  head.name = 'head';
  root.add(head);
  root.add(
    mesh(
      cylinder(0.12, 0.16, 0.2, 8),
      dark,
      [0, 0.43, 0.68],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  root.add(mesh(box(0.04, 0.032, 0.018), M.black, [-0.045, 0.45, 0.79]));
  root.add(mesh(box(0.04, 0.032, 0.018), M.black, [0.045, 0.45, 0.79]));
  addEye(root, -0.16, 0.57, 0.61);
  addEye(root, 0.16, 0.57, 0.61);
  for (const [i, x] of [-0.19, 0.19].entries()) {
    const ear = namedGroup(`ear-${i}`);
    ear.position.set(x, 0.68, 0.39);
    ear.add(
      mesh(
        cone(0.09, 0.2, 4),
        dark,
        [0, 0.07, 0],
        [1, 1, 0.65],
        [0, 0, x < 0 ? 0.45 : -0.45],
      ),
    );
    root.add(ear);
  }
  root.add(
    mesh(
      cone(0.045, 0.17, 7),
      M.cream,
      [-0.15, 0.37, 0.72],
      [1, 1, 1],
      [Math.PI / 2, 0, 0.25],
    ),
  );
  root.add(
    mesh(
      cone(0.045, 0.17, 7),
      M.cream,
      [0.15, 0.37, 0.72],
      [1, 1, 1],
      [Math.PI / 2, 0, -0.25],
    ),
  );
  root.add(makeLeg(0, -0.24, 0.34, 0.23, 0.24, 0.065, dark));
  root.add(makeLeg(1, 0.24, 0.34, 0.23, 0.24, 0.065, dark));
  root.add(makeLeg(2, -0.24, 0.34, -0.25, 0.24, 0.065, dark));
  root.add(makeLeg(3, 0.24, 0.34, -0.25, 0.24, 0.065, dark));
  return onGround(root);
}

function addAntler(root: THREE.Group, side: -1 | 1): void {
  const antler = namedGroup(`antler-${side < 0 ? 0 : 1}`);
  antler.position.set(side * 0.1, 0.95, 0.34);
  antler.add(
    mesh(
      cylinder(0.018, 0.028, 0.28, 5),
      M.woodDark,
      [side * 0.035, 0.12, 0],
      [1, 1, 1],
      [0, 0, side * -0.24],
    ),
  );
  antler.add(
    mesh(
      cylinder(0.014, 0.022, 0.16, 5),
      M.woodDark,
      [side * 0.11, 0.22, 0],
      [1, 1, 1],
      [0, 0, side * -0.75],
    ),
  );
  antler.add(
    mesh(
      cylinder(0.012, 0.018, 0.13, 5),
      M.woodDark,
      [side * 0.065, 0.27, 0.015],
      [1, 1, 1],
      [0.4, 0, side * -0.32],
    ),
  );
  root.add(antler);
}

function makeDeer(): THREE.Group {
  const root = namedGroup('animal-deer');
  root.userData.animalKind = 'deer';
  const fur = material('deer fur', C.deer),
    pale = material('deer pale fur', C.deerLight);
  const body = mesh(sphere(0.4, 1), fur, [0, 0.62, 0], [0.72, 0.75, 1.35]);
  body.name = 'body';
  root.add(body);
  root.add(
    mesh(
      cylinder(0.12, 0.17, 0.44, 7),
      fur,
      [0, 0.82, 0.36],
      [1, 1, 1],
      [-0.34, 0, 0],
    ),
  );
  const head = mesh(sphere(0.23, 1), fur, [0, 0.98, 0.52], [0.78, 0.86, 1.08]);
  head.name = 'head';
  root.add(head);
  root.add(mesh(sphere(0.12, 1), pale, [0, 0.93, 0.69], [0.88, 0.65, 0.8]));
  root.add(mesh(sphere(0.035, 1), M.black, [0, 0.95, 0.79]));
  addEye(root, -0.115, 1.03, 0.69);
  addEye(root, 0.115, 1.03, 0.69);
  for (const [i, x] of [-0.15, 0.15].entries()) {
    const ear = namedGroup(`ear-${i}`);
    ear.position.set(x, 1.08, 0.48);
    ear.add(
      mesh(
        cone(0.085, 0.23, 4),
        fur,
        [0, 0.06, 0],
        [0.72, 1, 0.58],
        [0, 0, x < 0 ? 0.7 : -0.7],
      ),
    );
    root.add(ear);
  }
  addAntler(root, -1);
  addAntler(root, 1);
  root.add(makeLeg(0, -0.19, 0.48, 0.28, 0.43, 0.05, fur));
  root.add(makeLeg(1, 0.19, 0.48, 0.28, 0.43, 0.05, fur));
  root.add(makeLeg(2, -0.2, 0.48, -0.27, 0.43, 0.052, fur));
  root.add(makeLeg(3, 0.2, 0.48, -0.27, 0.43, 0.052, fur));
  root.add(mesh(sphere(0.09, 1), pale, [0, 0.68, -0.52]));
  return atHeight(root, 1.18);
}

/** Create a named, animation-ready rabbit, boar, or deer. */
export function makeAnimal(kind: AnimalKind): THREE.Group {
  switch (kind) {
    case 'rabbit':
      return makeRabbit();
    case 'boar':
      return makeBoar();
    case 'deer':
      return makeDeer();
  }
}

/** Camera-local spear model compatible with the existing held-tool layout. */
export function makeSpear(): THREE.Group {
  const root = namedGroup('tool-spear');
  root.position.set(0.4, -0.52, -0.67);
  root.rotation.z = -0.18;
  root.frustumCulled = false;
  root.add(mesh(cylinder(0.023, 0.034, 0.44, 7), M.wood));
  root.add(mesh(cylinder(0.045, 0.045, 0.09, 8), M.leather, [0, -0.14, 0]));
  root.add(mesh(cylinder(0.035, 0.043, 0.08, 7), M.tealDark, [0, 0.23, 0]));
  root.add(mesh(cone(0.075, 0.14, 5), M.iron, [0, 0.34, 0], [0.68, 1, 0.55]));
  root.add(
    mesh(
      torus(0.04, 0.009, 4, 9),
      M.cream,
      [0, 0.18, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.frustumCulled = false;
  });
  return root;
}

/** Create a 1.7-unit multiplayer explorer with named limbs for walk animation. */
export function makeExplorer(color: number): THREE.Group {
  const root = namedGroup('explorer');
  const safeColor = Number.isFinite(color) ? color & 0xffffff : C.teal;
  const coat = material(`explorer coat ${safeColor}`, safeColor),
    coatDark = material(
      `explorer coat dark ${safeColor}`,
      new THREE.Color(safeColor).multiplyScalar(0.68).getHex(),
    );
  root.userData.color = safeColor;
  const body = mesh(cylinder(0.21, 0.28, 0.58, 7), coat, [0, 1.02, 0]);
  body.name = 'body';
  root.add(body);
  for (const [i, x] of [-0.12, 0.12].entries()) {
    const leg = namedGroup(`leg-${i}`);
    leg.position.set(x, 0.72, 0);
    leg.add(mesh(cylinder(0.065, 0.078, 0.48, 6), coatDark, [0, -0.24, 0]));
    leg.add(mesh(box(0.15, 0.1, 0.25), M.leather, [0, -0.52, 0.055]));
    root.add(leg);
  }
  for (const [i, x] of [-0.28, 0.28].entries()) {
    const arm = namedGroup(`arm-${i}`);
    arm.position.set(x, 1.25, 0);
    arm.rotation.z = x < 0 ? 0.12 : -0.12;
    arm.add(mesh(cylinder(0.06, 0.075, 0.48, 6), coat, [0, -0.24, 0]));
    arm.add(mesh(sphere(0.07, 1), M.skin, [0, -0.5, 0]));
    root.add(arm);
  }
  const head = mesh(sphere(0.21, 1), M.skin, [0, 1.44, 0], [0.9, 1.02, 0.92]);
  head.name = 'head';
  root.add(head);
  addEye(root, -0.075, 1.46, 0.19);
  addEye(root, 0.075, 1.46, 0.19);
  root.add(mesh(cylinder(0.14, 0.18, 0.17, 8), M.straw, [0, 1.67, 0]));
  root.add(mesh(cylinder(0.38, 0.38, 0.045, 12), M.straw, [0, 1.59, 0]));
  const pack = mesh(box(0.34, 0.43, 0.18), M.leather, [0, 1.04, -0.29]);
  pack.name = 'backpack';
  root.add(pack);
  root.add(mesh(box(0.045, 0.54, 0.04), M.gold, [0, 1.04, -0.395]));
  return atHeight(root, 1.7);
}

function makeCave(): THREE.Group {
  const root = namedGroup('landmark-cave');
  root.userData.landmarkKind = 'cave';
  root.add(mesh(sphere(1.5, 1), M.stoneDark, [0, 0.82, 0], [1.42, 0.72, 1.05]));
  root.add(mesh(sphere(1.1, 1), M.black, [0, 0.66, 0.82], [0.72, 0.76, 0.38]));
  root.add(
    mesh(sphere(0.58, 1), M.stone, [-1.28, 0.32, 0.38], [1.2, 0.62, 0.9]),
  );
  root.add(
    mesh(sphere(0.48, 1), M.stone, [1.35, 0.27, 0.3], [1.05, 0.58, 0.85]),
  );
  root.add(
    mesh(sphere(0.62, 1), M.moss, [-0.65, 1.27, 0.1], [1.15, 0.16, 0.72]),
  );
  return onGround(root);
}

function makeCamp(): THREE.Group {
  const root = namedGroup('landmark-camp');
  root.userData.landmarkKind = 'camp';
  root.add(
    mesh(
      triangularPrism(2.25, 1.75, 1.45),
      M.teal,
      [-0.55, 0, -0.25],
      [1, 1, 1],
      [0, Math.PI / 2, 0],
    ),
  );
  root.add(mesh(box(0.12, 1.55, 0.12), M.wood, [-0.55, 0.78, 0.65]));
  root.add(mesh(box(0.12, 1.55, 0.12), M.wood, [-0.55, 0.78, -1.15]));
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    root.add(
      mesh(
        sphere(0.13, 1),
        M.stone,
        [0.95 + Math.cos(angle) * 0.38, 0.1, 0.35 + Math.sin(angle) * 0.38],
        [1.1, 0.65, 0.9],
      ),
    );
  }
  root.add(
    mesh(
      cone(0.28, 0.65, 7),
      material('camp flame', C.fire, {
        emissive: 0xd94a22,
        emissiveIntensity: 1.5,
      }),
      [0.95, 0.43, 0.35],
    ),
  );
  root.add(
    mesh(
      cylinder(0.07, 0.09, 0.82, 7),
      M.woodDark,
      [0.95, 0.2, 0.35],
      [1, 1, 1],
      [Math.PI / 2, 0, Math.PI / 4],
    ),
  );
  root.add(
    mesh(
      cylinder(0.07, 0.09, 0.82, 7),
      M.woodDark,
      [0.95, 0.2, 0.35],
      [1, 1, 1],
      [Math.PI / 2, 0, -Math.PI / 4],
    ),
  );
  return onGround(root);
}

function makeRuins(): THREE.Group {
  const root = namedGroup('landmark-ruins');
  root.userData.landmarkKind = 'ruins';
  root.add(mesh(box(3.5, 0.16, 2.6), M.stoneDark, [0, 0.08, 0]));
  for (const x of [-1.35, 1.35]) {
    root.add(mesh(cylinder(0.24, 0.3, 2.1, 7), M.stone, [x, 1.13, -0.65]));
    root.add(mesh(box(0.68, 0.18, 0.62), M.creamDark, [x, 2.23, -0.65]));
  }
  root.add(
    mesh(
      box(3.35, 0.34, 0.7),
      M.stone,
      [0, 2.44, -0.65],
      [1, 1, 1],
      [0, 0, -0.04],
    ),
  );
  root.add(
    mesh(
      cylinder(0.24, 0.3, 1.1, 7),
      M.stone,
      [-1.25, 0.63, 0.75],
      [1, 1, 1],
      [0, 0, 0.12],
    ),
  );
  root.add(
    mesh(
      cylinder(0.24, 0.3, 0.65, 7),
      M.stone,
      [1.2, 0.4, 0.72],
      [1, 1, 1],
      [0, 0, -0.3],
    ),
  );
  root.add(
    mesh(sphere(0.45, 1), M.moss, [0.55, 0.19, -0.35], [1.5, 0.18, 0.8]),
  );
  return onGround(root);
}

function makeTreasure(): THREE.Group {
  const root = namedGroup('landmark-treasure');
  root.userData.landmarkKind = 'treasure';
  root.add(mesh(box(1.45, 0.62, 0.82), M.wood, [0, 0.31, 0]));
  root.add(
    mesh(
      cylinder(0.42, 0.42, 1.45, 9),
      M.terracotta,
      [0, 0.62, 0],
      [1, 1, 1],
      [0, 0, Math.PI / 2],
    ),
  );
  root.add(mesh(box(1.45, 0.4, 0.42), M.terracotta, [0, 0.42, 0]));
  for (const x of [-0.55, 0.55])
    root.add(mesh(box(0.1, 0.82, 0.88), M.iron, [x, 0.47, 0]));
  root.add(mesh(box(0.22, 0.3, 0.08), M.gold, [0, 0.5, 0.45]));
  for (const [x, z] of [
    [-0.78, 0.38],
    [0.72, 0.42],
    [0.55, -0.55],
    [-0.5, -0.5],
  ] as Array<[number, number]>) {
    root.add(
      mesh(
        cylinder(0.1, 0.1, 0.045, 10),
        M.gold,
        [x, 0.04, z],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      ),
    );
  }
  root.add(
    mesh(
      cone(0.17, 0.62, 6),
      M.tealLight,
      [0.55, 0.38, -0.25],
      [0.62, 1, 0.62],
      [0.12, 0, -0.18],
    ),
  );
  return onGround(root);
}

/** Create a cave, camp, ruins, or treasure landmark. */
export function makeLandmark(kind: string): THREE.Group {
  switch (kind) {
    case 'cave':
      return makeCave();
    case 'camp':
      return makeCamp();
    case 'ruins':
      return makeRuins();
    case 'treasure':
      return makeTreasure();
    default:
      throw new Error(`Unknown frontier landmark: ${kind}`);
  }
}

/** Small additive ornament for visually communicating upgrade level 0..3. */
export function makeUpgradeOrnament(level: number): THREE.Group {
  const root = namedGroup('upgrade-ornament');
  const value = Math.max(
    0,
    Math.min(3, Math.floor(Number.isFinite(level) ? level : 0)),
  );
  root.userData.level = value;
  if (value >= 1) {
    root.add(mesh(box(0.08, 0.72, 0.08), M.wood, [0, 0.36, 0]));
    root.add(
      mesh(
        cone(0.18, 0.36, 3),
        M.teal,
        [0.15, 0.57, 0],
        [1, 1, 1],
        [0, 0, -Math.PI / 2],
      ),
    );
  }
  if (value >= 2) {
    root.add(
      mesh(sphere(0.14, 1), M.moss, [-0.15, 0.09, 0.04], [1.4, 0.42, 0.8]),
    );
    root.add(
      mesh(sphere(0.1, 1), M.leaf, [0.15, 0.12, -0.03], [1.2, 0.55, 0.7]),
    );
  }
  if (value >= 3) {
    root.add(
      mesh(cone(0.09, 0.42, 6), M.tealLight, [-0.22, 0.25, 0], [0.72, 1, 0.72]),
    );
    root.add(
      mesh(cone(0.075, 0.32, 6), M.gold, [0.23, 0.19, 0.02], [0.72, 1, 0.72]),
    );
  }
  return onGround(root);
}

/** Dispose shared GPU resources after all frontier model instances are removed. */
export function disposeFrontierModels(): void {
  geometryPool.forEach((value) => value.dispose());
  materialPool.forEach((value) => value.dispose());
  geometryPool.clear();
  materialPool.clear();
}
