import * as THREE from 'three';

/**
 * Moss & Mischief procedural prop library.
 *
 * Convention: +Y is up, +Z is forward, and every returned Group rests on y=0.
 * Geometry and materials are shared between instances so a grove stays cheap.
 */

type MatOptions = {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
};

const materials = new Map<string, THREE.MeshStandardMaterial>();
const geometries = new Map<string, THREE.BufferGeometry>();

const C = {
  bark: 0x6d4735,
  barkDark: 0x47352f,
  wood: 0x96633f,
  timber: 0x7a4d35,
  cream: 0xf2d8a7,
  roof: 0xc65b35,
  roofDark: 0x823d32,
  moss: 0x438454,
  leaf: 0x257665,
  leafLight: 0x68a85a,
  pine: 0x246252,
  straw: 0xe1ad4c,
  strawLight: 0xf3cc69,
  stone: 0x74807c,
  stoneDark: 0x515d5a,
  metal: 0x536568,
  teal: 0x197a78,
  tealDark: 0x11545b,
  orange: 0xe36b35,
  skin: 0xd99968,
  leather: 0x70442f,
  white: 0xf7eee0,
  black: 0x172528,
  waterBlue: 0x70c9cc,
};

function material(
  key: string,
  color: number,
  options: MatOptions = {},
): THREE.MeshStandardMaterial {
  const cacheKey = `${key}:${JSON.stringify(options)}`;
  let value = materials.get(cacheKey);
  if (!value) {
    value = new THREE.MeshStandardMaterial({
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
    materials.set(cacheKey, value);
  }
  return value;
}

function geometry<T extends THREE.BufferGeometry>(
  key: string,
  create: () => T,
): T {
  const cached = geometries.get(key) as T | undefined;
  if (cached) return cached;
  const created = create();
  created.computeVertexNormals();
  geometries.set(key, created);
  return created;
}

const box = (x = 1, y = 1, z = 1) =>
  geometry(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const cyl = (rTop: number, rBottom: number, h: number, sides = 7) =>
  geometry(
    `cyl:${rTop}:${rBottom}:${h}:${sides}`,
    () => new THREE.CylinderGeometry(rTop, rBottom, h, sides),
  );
const sphere = (radius = 1, detail = 1) =>
  geometry(
    `ico:${radius}:${detail}`,
    () => new THREE.IcosahedronGeometry(radius, detail),
  );
const cone = (radius: number, h: number, sides = 7) =>
  geometry(
    `cone:${radius}:${h}:${sides}`,
    () => new THREE.ConeGeometry(radius, h, sides),
  );

const torus = (r: number, tube: number, radial = 5, tubular = 12) =>
  geometry(
    `torus:${r}:${tube}:${radial}:${tubular}`,
    () => new THREE.TorusGeometry(r, tube, radial, tubular),
  );

function mesh(
  g: THREE.BufferGeometry,
  m: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const result = new THREE.Mesh(g, m);
  result.position.set(...position);
  result.scale.set(...scale);
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

function onGround(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y) > 1e-5) {
    for (const child of root.children) child.position.y -= bounds.min.y;
    root.updateMatrixWorld(true);
  }
  return root;
}

function rng(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function addBolt(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
): void {
  parent.add(
    mesh(
      cyl(0.045, 0.045, 0.055, 6),
      material('iron', C.metal, { metalness: 0.35 }),
      [x, y, z],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
}

export function makeTree(kind: 'oak' | 'pine' = 'oak', seed = 1): THREE.Group {
  const root = group(`${kind}Tree`);
  const random = rng(seed);
  const height = kind === 'oak' ? 4.6 + random() * 1.5 : 5.3 + random() * 1.6;
  const bark = material('bark', C.bark);
  const moss = material('moss', C.moss);

  root.rotation.y = random() * Math.PI * 2;
  root.add(
    mesh(
      cyl(0.23, 0.38, height * 0.56, 7),
      bark,
      [0, height * 0.28, 0],
      [1, 1, 1],
      [0, 0, (random() - 0.5) * 0.05],
    ),
  );

  if (kind === 'oak') {
    const canopyY = height * 0.72;
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3 + random() * 0.4;
      const branch = mesh(
        cyl(0.1, 0.17, 1.6, 6),
        bark,
        [Math.cos(angle) * 0.42, height * 0.53, Math.sin(angle) * 0.42],
        [1, 1, 1],
        [Math.sin(angle) * 0.78, 0, -Math.cos(angle) * 0.78],
      );
      root.add(branch);
    }
    const leafMats = [
      material('leaf', C.leaf),
      material('leafLight', C.leafLight),
      material('leafMoss', C.moss),
    ];
    const lobes: Array<[number, number, number, number]> = [
      [0, canopyY + 0.35, 0, 1.35],
      [-1.05, canopyY, 0.2, 1.05],
      [0.95, canopyY - 0.05, 0.35, 1.12],
      [0.15, canopyY + 0.05, -1.0, 1.0],
      [-0.2, canopyY - 0.2, 0.95, 0.95],
    ];
    lobes.forEach(([x, y, z, s], i) => {
      const jitter = 0.88 + random() * 0.24;
      root.add(
        mesh(
          sphere(1, 1),
          leafMats[(i + Math.floor(random() * 3)) % 3],
          [x, y, z],
          [s * jitter, s * (0.78 + random() * 0.18), s * jitter],
        ),
      );
    });
  } else {
    const needles = [
      material('pine', C.pine),
      material('pineMoss', C.moss),
      material('pineLight', 0x3f8264),
    ];
    for (let i = 0; i < 4; i++) {
      const y = height * (0.47 + i * 0.125);
      const radius = 1.48 - i * 0.26 + random() * 0.12;
      root.add(
        mesh(
          cone(radius, 2.0, 8),
          needles[i % needles.length],
          [0, y, 0],
          [1, 1, 1],
          [0, random() * Math.PI, 0],
        ),
      );
    }
  }

  root.add(mesh(sphere(0.32, 1), moss, [-0.16, 0.25, 0.25], [1.2, 0.65, 0.55]));
  return onGround(root);
}

export function makeRock(seed = 1): THREE.Group {
  const root = group('rock');
  const random = rng(seed);
  const stoneMats = [
    material('stone', C.stone),
    material('stoneDark', C.stoneDark),
    material('stoneWarm', 0x8b8171),
  ];
  const count = 2 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const size = (i === 0 ? 0.8 : 0.35) + random() * 0.45;
    const rock = mesh(
      sphere(1, 1),
      stoneMats[Math.floor(random() * stoneMats.length)],
      [(random() - 0.5) * 1.15, size * 0.48, (random() - 0.5) * 0.75],
      [size, size * (0.62 + random() * 0.25), size * (0.72 + random() * 0.35)],
      [random(), random() * Math.PI, random()],
    );
    root.add(rock);
  }
  root.add(
    mesh(
      sphere(0.45, 1),
      material('rockMoss', C.moss),
      [-0.2, 0.56, 0],
      [1.1, 0.14, 0.75],
      [0.1, 0, -0.15],
    ),
  );
  return onGround(root);
}

export function makeHouse(): THREE.Group {
  const root = group('cottage');
  const plaster = material('creamPlaster', C.cream);
  const timber = material('timber', C.timber);
  const roof = material('orangeRoof', C.roof);
  const darkRoof = material('roofDark', C.roofDark);
  const glass = material('warmWindow', 0xffbd62, {
    emissive: 0xff8d32,
    emissiveIntensity: 1.15,
    roughness: 0.3,
  });

  root.add(mesh(box(5, 2.8, 4), plaster, [0, 1.4, 0]));
  root.add(
    mesh(
      box(5.7, 0.28, 3.15),
      roof,
      [0, 3.48, -0.82],
      [1, 1, 1],
      [Math.PI * 0.27, 0, 0],
    ),
  );
  root.add(
    mesh(
      box(5.7, 0.28, 3.15),
      roof,
      [0, 3.48, 0.82],
      [1, 1, 1],
      [-Math.PI * 0.27, 0, 0],
    ),
  );
  root.add(mesh(box(5.8, 0.18, 0.25), darkRoof, [0, 4.4, 0]));

  // Half-timbered cottage frontage.
  [-2.28, 0, 2.28].forEach((x) =>
    root.add(mesh(box(0.18, 2.9, 0.2), timber, [x, 1.45, 2.06])),
  );
  root.add(mesh(box(4.75, 0.18, 0.2), timber, [0, 2.72, 2.06]));
  root.add(
    mesh(
      box(2.25, 0.14, 0.18),
      timber,
      [-1.15, 1.45, 2.08],
      [1, 1, 1],
      [0, 0, 0.64],
    ),
  );
  root.add(
    mesh(
      box(2.25, 0.14, 0.18),
      timber,
      [1.15, 1.45, 2.08],
      [1, 1, 1],
      [0, 0, -0.64],
    ),
  );

  const door = group('door');
  door.add(
    mesh(box(1.05, 1.95, 0.16), material('doorWood', C.wood), [0, 0.975, 0]),
  );
  door.add(mesh(box(0.08, 1.78, 0.05), timber, [0, 0.95, 0.1]));
  door.add(
    mesh(
      cyl(0.07, 0.07, 0.08, 8),
      material('brass', 0xb98532, { metalness: 0.5 }),
      [0.34, 0.98, 0.13],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  door.position.set(0, 0, 2.08);
  root.add(door);

  for (const x of [-1.55, 1.55]) {
    root.add(mesh(box(0.98, 0.92, 0.1), timber, [x, 1.55, 2.09]));
    root.add(mesh(box(0.78, 0.72, 0.12), glass, [x, 1.55, 2.16]));
    root.add(mesh(box(0.07, 0.72, 0.06), timber, [x, 1.55, 2.24]));
    root.add(mesh(box(0.78, 0.07, 0.06), timber, [x, 1.55, 2.24]));
    root.add(mesh(box(1.2, 0.12, 0.28), timber, [x, 1.02, 2.18]));
  }

  root.add(
    mesh(
      box(0.65, 1.8, 0.75),
      material('chimneyStone', 0x806d5d),
      [1.45, 4.25, -0.55],
    ),
  );
  root.add(mesh(box(0.85, 0.18, 0.95), darkRoof, [1.45, 5.13, -0.55]));
  root.add(
    mesh(
      box(5.3, 0.16, 4.25),
      material('foundation', C.stoneDark),
      [0, 0.08, 0],
    ),
  );
  return onGround(root);
}

export function makeWindmill(): THREE.Group {
  const root = group('windmill');
  const cream = material('windmillCream', 0xe7d4a9);
  const timber = material('timber', C.timber);
  const straw = material('straw', C.straw);

  root.add(mesh(cyl(1.15, 1.7, 5.25, 9), cream, [0, 2.625, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    root.add(
      mesh(
        box(0.14, 4.8, 0.13),
        timber,
        [Math.cos(a) * 1.15, 2.55, Math.sin(a) * 1.15],
        [1, 1, 1],
        [0, a, 0],
      ),
    );
  }
  root.add(
    mesh(
      cone(1.65, 1.7, 9),
      straw,
      [0, 5.7, 0],
      [1, 1, 1],
      [0, Math.PI / 9, 0],
    ),
  );
  root.add(
    mesh(box(0.8, 1.5, 0.12), material('doorWood', C.wood), [0, 0.75, 1.52]),
  );

  const rotor = group('rotor');
  rotor.position.set(0, 6, 1.64);
  rotor.add(
    mesh(
      cyl(0.25, 0.25, 0.55, 10),
      material('iron', C.metal, { metalness: 0.35 }),
      [0, 0, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  for (let i = 0; i < 4; i++) {
    const arm = group(`sail${i + 1}`);
    arm.rotation.z = (i * Math.PI) / 2 + Math.PI / 8;
    arm.add(mesh(box(0.13, 2.75, 0.16), timber, [0, 1.38, 0]));
    arm.add(
      mesh(
        box(0.82, 2.0, 0.08),
        material('sailCloth', 0xf0dfb9),
        [0.38, 1.75, -0.03],
        [1, 1, 1],
        [0, 0, -0.08],
      ),
    );
    for (let rung = 0; rung < 4; rung++)
      arm.add(
        mesh(box(0.84, 0.06, 0.12), timber, [0.35, 0.92 + rung * 0.48, 0.07]),
      );
    rotor.add(arm);
  }
  root.add(rotor);
  return onGround(root);
}

export function makeWorkbench(): THREE.Group {
  const root = group('workbench');
  const wood = material('workbenchWood', C.wood);
  const iron = material('iron', C.metal, { metalness: 0.35 });
  root.add(mesh(box(2.25, 0.22, 0.9), wood, [0, 1.08, 0]));
  [-0.85, 0.85].forEach((x) => {
    root.add(
      mesh(
        box(0.18, 1.05, 0.18),
        wood,
        [x, 0.53, -0.28],
        [1, 1, 1],
        [0, 0, x * 0.04],
      ),
    );
    root.add(
      mesh(
        box(0.18, 1.05, 0.18),
        wood,
        [x, 0.53, 0.28],
        [1, 1, 1],
        [0, 0, x * 0.04],
      ),
    );
  });
  root.add(
    mesh(box(1.9, 0.12, 0.55), material('shelfWood', C.bark), [0, 0.48, 0]),
  );
  root.add(mesh(box(0.15, 0.55, 0.7), iron, [0.72, 1.42, 0]));
  root.add(mesh(box(0.55, 0.14, 0.14), iron, [0.72, 1.68, 0]));
  root.add(
    mesh(
      cyl(0.16, 0.12, 0.62, 7),
      material('bottle', C.waterBlue, { metalness: 0.05 }),
      [-0.7, 1.5, 0],
    ),
  );
  addBolt(root, -0.92, 1.2, 0.47);
  addBolt(root, 0.92, 1.2, 0.47);
  return onGround(root);
}

export function makeCampfire(): THREE.Group {
  const root = group('campfire');
  const stone = material('stone', C.stone);
  for (let i = 0; i < 9; i++) {
    const a = (i * Math.PI * 2) / 9;
    root.add(
      mesh(
        sphere(0.2, 1),
        stone,
        [Math.cos(a) * 0.62, 0.17, Math.sin(a) * 0.62],
        [1.25, 0.78, 0.95],
        [i * 0.4, a, 0],
      ),
    );
  }
  root.add(
    mesh(
      cyl(0.11, 0.14, 1.25, 7),
      material('charredWood', C.barkDark),
      [0, 0.26, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, Math.PI / 4],
    ),
  );
  root.add(
    mesh(
      cyl(0.11, 0.14, 1.25, 7),
      material('charredWood', C.barkDark),
      [0, 0.26, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, -Math.PI / 4],
    ),
  );
  root.add(
    mesh(
      cone(0.48, 1.18, 7),
      material('fireOrange', 0xff6a28, {
        emissive: 0xff3c08,
        emissiveIntensity: 1.8,
      }),
      [0, 0.76, 0],
    ),
  );
  root.add(
    mesh(
      cone(0.25, 0.72, 7),
      material('fireGold', 0xffcf4a, {
        emissive: 0xff9b1f,
        emissiveIntensity: 2.2,
      }),
      [0.08, 0.62, 0.02],
    ),
  );
  return onGround(root);
}

export function makeFence(): THREE.Group {
  const root = group('fence');
  const wood = material('fenceWood', 0x9c6a42);
  for (const x of [-1.8, 0, 1.8]) {
    root.add(
      mesh(
        box(0.22, 1.35, 0.24),
        wood,
        [x, 0.675, 0],
        [1, 1, 1],
        [0, 0, x * 0.018],
      ),
    );
    root.add(
      mesh(
        cone(0.19, 0.38, 4),
        wood,
        [x, 1.54, 0],
        [1, 1, 1],
        [0, Math.PI / 4, 0],
      ),
    );
  }
  root.add(
    mesh(
      box(3.85, 0.18, 0.18),
      wood,
      [0, 0.55, 0.02],
      [1, 1, 1],
      [0, 0, 0.035],
    ),
  );
  root.add(
    mesh(
      box(3.85, 0.18, 0.18),
      wood,
      [0, 1.12, -0.02],
      [1, 1, 1],
      [0, 0, -0.035],
    ),
  );
  return onGround(root);
}

export function makeCrop(stage: number): THREE.Group {
  const root = group('crop');
  const growth = Math.max(0, Math.min(3, Math.floor(stage)));
  const soil = material('soil', 0x614132);
  const green = material('cropGreen', 0x4d9b56);
  const gold = material('cropGold', C.strawLight);
  root.add(mesh(cyl(0.48, 0.55, 0.1, 10), soil, [0, 0.05, 0]));
  if (growth === 0) {
    root.add(
      mesh(
        sphere(0.08, 1),
        material('seedling', 0x7ebc55),
        [0, 0.16, 0],
        [1, 0.65, 0.4],
      ),
    );
    return onGround(root);
  }
  const stalkCount = 2 + growth * 2;
  for (let i = 0; i < stalkCount; i++) {
    const a = i * 2.4;
    const r = 0.08 + (i % 3) * 0.07;
    const h = 0.25 + growth * 0.24 + (i % 2) * 0.08;
    root.add(
      mesh(
        cyl(0.025, 0.035, h, 5),
        green,
        [Math.cos(a) * r, h / 2 + 0.1, Math.sin(a) * r],
        [1, 1, 1],
        [0.06 * Math.sin(a), 0, 0.08 * Math.cos(a)],
      ),
    );
    root.add(
      mesh(
        sphere(0.09, 1),
        growth === 3 ? gold : green,
        [Math.cos(a) * r, h + 0.12, Math.sin(a) * r],
        [0.55, 1.25, 0.55],
        [0, a, 0.3],
      ),
    );
  }
  if (growth === 3)
    root.add(
      mesh(
        sphere(0.22, 1),
        material('cropFruit', C.orange),
        [0.04, 0.38, 0.03],
        [1, 0.82, 1],
      ),
    );
  return onGround(root);
}

export function makePlayer(): THREE.Group {
  const root = group('player');
  const coat = material('playerCoat', C.teal);
  const coatDark = material('playerCoatDark', C.tealDark);
  const skin = material('skin', C.skin);
  const leather = material('leather', C.leather);
  const straw = material('straw', C.straw);

  const torso = mesh(cyl(0.23, 0.3, 0.62, 7), coat, [0, 1.02, 0]);
  torso.name = 'torso';
  root.add(torso);

  const leftLeg = group('leftLeg');
  leftLeg.position.set(-0.13, 0.68, 0);
  leftLeg.add(mesh(cyl(0.07, 0.085, 0.52, 6), coatDark, [0, -0.25, 0]));
  leftLeg.add(mesh(box(0.16, 0.1, 0.28), leather, [0, -0.52, 0.06]));
  root.add(leftLeg);
  const rightLeg = leftLeg.clone();
  rightLeg.name = 'rightLeg';
  rightLeg.position.x = 0.13;
  root.add(rightLeg);

  for (const side of [-1, 1]) {
    const arm = group(side < 0 ? 'leftArm' : 'rightArm');
    arm.position.set(side * 0.28, 1.26, 0);
    arm.rotation.z = side * -0.14;
    arm.add(mesh(cyl(0.065, 0.085, 0.52, 6), coat, [0, -0.24, 0]));
    arm.add(mesh(sphere(0.075, 1), skin, [0, -0.53, 0], [1, 1.1, 1]));
    root.add(arm);
  }

  root.add(mesh(sphere(0.22, 1), skin, [0, 1.48, 0], [0.9, 1.05, 0.92]));
  root.add(
    mesh(
      torus(0.23, 0.055, 5, 12),
      material('scarf', C.orange),
      [0, 1.31, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  root.add(mesh(box(0.31, 0.42, 0.18), leather, [0, 1.06, -0.3]));
  root.add(
    mesh(
      box(0.045, 0.55, 0.045),
      material('brass', 0xb98532, { metalness: 0.5 }),
      [0, 1.05, -0.405],
    ),
  );
  root.add(mesh(cyl(0.13, 0.18, 0.18, 8), straw, [0, 1.7, 0]));
  root.add(mesh(cyl(0.43, 0.43, 0.055, 12), straw, [0, 1.62, 0]));
  root.add(
    mesh(box(0.08, 0.055, 0.03), material('eye', C.black), [-0.085, 1.5, 0.19]),
  );
  root.add(
    mesh(box(0.08, 0.055, 0.03), material('eye', C.black), [0.085, 1.5, 0.19]),
  );
  return onGround(root);
}

export function makeGoose(): THREE.Group {
  const root = group('goose');
  const white = material('gooseWhite', C.white);
  const orange = material('gooseOrange', C.orange);
  const eye = material('eye', C.black);
  root.add(
    mesh(sphere(0.36, 1), white, [0, 0.56, 0], [0.9, 1.05, 1.28], [0.08, 0, 0]),
  );
  root.add(
    mesh(
      sphere(0.3, 1),
      white,
      [0, 0.58, -0.2],
      [1.1, 0.78, 1.15],
      [0.2, 0, 0.2],
    ),
  );
  root.add(
    mesh(
      cyl(0.105, 0.16, 0.52, 7),
      white,
      [0, 0.86, 0.25],
      [1, 1, 1],
      [-0.25, 0, 0],
    ),
  );
  root.add(mesh(sphere(0.2, 1), white, [0, 1.1, 0.34], [0.85, 0.92, 1.05]));
  root.add(
    mesh(
      cone(0.11, 0.34, 5),
      orange,
      [0, 1.07, 0.57],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
  );
  for (const x of [-0.075, 0.075]) {
    root.add(mesh(sphere(0.025, 1), eye, [x, 1.17, 0.48]));
    root.add(mesh(cyl(0.026, 0.03, 0.38, 5), orange, [x, 0.2, 0.02]));
    root.add(
      mesh(
        box(0.13, 0.045, 0.25),
        orange,
        [x, 0.035, 0.09],
        [1, 1, 1],
        [0, x * 2, 0],
      ),
    );
  }
  const leftWing = mesh(
    sphere(0.26, 1),
    white,
    [-0.28, 0.6, -0.03],
    [0.4, 0.82, 1.1],
    [0, 0, 0.25],
  );
  leftWing.name = 'leftWing';
  root.add(leftWing);
  const rightWing = leftWing.clone();
  rightWing.name = 'rightWing';
  rightWing.position.x = 0.28;
  rightWing.rotation.z = -0.25;
  root.add(rightWing);
  return onGround(root);
}

export function makeChest(): THREE.Group {
  const root = group('chest');
  const wood = material('chestWood', C.wood);
  const iron = material('iron', C.metal, { metalness: 0.35 });
  root.add(mesh(box(1.25, 0.58, 0.72), wood, [0, 0.29, 0]));
  const lid = group('lid');
  lid.position.set(0, 0.58, -0.35);
  lid.add(
    mesh(
      cyl(0.38, 0.38, 1.25, 8),
      wood,
      [0, 0, 0.35],
      [1, 1, 1],
      [0, 0, Math.PI / 2],
    ),
  );
  lid.add(mesh(box(1.25, 0.38, 0.38), wood, [0, -0.19, 0.35]));
  root.add(lid);
  [-0.48, 0.48].forEach((x) =>
    root.add(mesh(box(0.1, 0.7, 0.78), iron, [x, 0.38, 0])),
  );
  root.add(
    mesh(
      box(0.2, 0.32, 0.08),
      material('brass', 0xb98532, { metalness: 0.5 }),
      [0, 0.52, 0.4],
    ),
  );
  root.add(mesh(torus(0.08, 0.025, 5, 10), iron, [0, 0.42, 0.46]));
  return onGround(root);
}

export function makeCrystal(): THREE.Group {
  const root = group('crystal');
  const crystal = material('crystalGlow', 0x63ddd0, {
    emissive: 0x1abbb1,
    emissiveIntensity: 1.35,
    roughness: 0.24,
    metalness: 0.08,
  });
  const base = material('crystalBase', C.stoneDark);
  root.add(mesh(sphere(0.48, 1), base, [0, 0.2, 0], [1.35, 0.45, 1.1]));
  const shards: Array<[number, number, number, number, number]> = [
    [0, 0.82, 0, 0.34, 1.38],
    [-0.35, 0.58, 0.06, 0.22, 0.86],
    [0.31, 0.5, -0.1, 0.18, 0.72],
    [0.15, 0.4, 0.28, 0.13, 0.55],
  ];
  shards.forEach(([x, y, z, r, h], i) =>
    root.add(
      mesh(
        cone(r, h, 6),
        crystal,
        [x, y, z],
        [1, 1, 1],
        [i * 0.08, i * 0.65, (i - 1.5) * 0.16],
      ),
    ),
  );
  return onGround(root);
}

/** Dispose shared GPU resources when the entire library is no longer in use. */
export function disposeAssetLibrary(): void {
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  geometries.clear();
  materials.clear();
}
