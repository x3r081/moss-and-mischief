import * as THREE from 'three';
import {
  makeTree,
  makeRock,
  makeHouse,
  makeWindmill,
  makeWorkbench,
  makeCampfire,
  makeFence,
  makeCrop,
  makePlayer,
  makeGoose,
  makeChest,
  makeCrystal,
  disposeAssetLibrary,
} from './models';
import {
  growth,
  canAfford,
  RECIPES,
  type GameState,
  type Structure,
} from './state';
import { heightAt, onLand, shoreRadius } from './terrain';
export { heightAt, onLand, shoreRadius, LAND_RADIUS } from './terrain';

export type Entity = {
  id: string;
  kind:
    | 'wood'
    | 'stone'
    | 'fiber'
    | 'plot'
    | 'goose'
    | 'crystal'
    | 'lighthouse'
    | 'chest'
    | 'workbench'
    | 'campfire'
    | 'cottage';
  name: string;
  x: number;
  z: number;
  radius: number;
  object: THREE.Object3D;
};
export type WorldEvents = {
  near: (e: Entity | null) => void;
  interact: (e: Entity) => void;
  place: (type: Structure, x: number, z: number, rotation: number) => void;
  menu: (name: string) => void;
  move: (x: number, z: number, stamina: number) => void;
  ready: () => void;
  error: (message: string) => void;
};
function random(seed = 8) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const mat = (c: number) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true });

const targets = {
  goose: [-3, 4],
  ruins: [-6, -18],
  lighthouse: [17, -9],
} as const;

export class IslandWorld {
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  entities: Entity[] = [];
  player = makePlayer();
  near: Entity | null = null;
  stamina = 100;
  paused = true;
  buildType: Structure | null = null;
  rotation = 0;
  private ghost: THREE.Group | null = null;
  private validGhost = false;
  private ghostPoint = new THREE.Vector3();
  private keys = new Set<string>();
  private destination: THREE.Vector3 | null = null;
  private destinationEntity: Entity | null = null;
  private ray = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.7);
  private target = new THREE.Vector3(0, 0, 2);
  private cameraAngle = 0.65;
  private zoom = 18;
  private drag = false;
  private downX = 0;
  private downY = 0;
  private ground!: THREE.Mesh;
  private water!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private sun = new THREE.DirectionalLight(0xffe1a0, 3.3);
  private ambient = new THREE.HemisphereLight(0xc9eeea, 0x65834b, 2.15);
  private ring!: THREE.Mesh;
  private marker!: THREE.Mesh;
  private windmill!: THREE.Group;
  private goose!: THREE.Group;
  private lighthouse!: THREE.Group;
  private beacon!: THREE.Mesh;
  private plantGroups = new Map<
    string,
    { group: THREE.Group; stage: number; watered: boolean }
  >();
  private placed = new Map<string, THREE.Group>();
  private blockers: { id?: string; x: number; z: number; r: number }[] = [];
  private bedGeometry = new THREE.BoxGeometry(1.3, 0.12, 1.3);
  private rimGeometry = new THREE.BoxGeometry(1.45, 0.13, 0.08);
  private drySoil = mat(0x6f4b31);
  private wetSoil = mat(0x493c2b);
  private rimMaterial = mat(0xa48452);
  private fireflies!: THREE.Points;
  private clouds: THREE.Group[] = [];
  private particles: {
    mesh: THREE.Mesh;
    life: number;
    vx: number;
    vy: number;
    vz: number;
  }[] = [];
  private last = 0;
  private frame = 0;
  private clock = 0;
  private lastUi = 0;
  private jump = 0;
  private jumpSpeed = 0;
  private swing = 0;
  private resizeObserver: ResizeObserver;
  private abort = new AbortController();
  private resourceGeo = new THREE.IcosahedronGeometry(0.09, 0);
  private resourceMat = new THREE.MeshBasicMaterial({ color: 0xffd781 });

  constructor(
    private host: HTMLElement,
    private state: () => GameState,
    private events: WorldEvents,
  ) {
    const aspect = host.clientWidth / Math.max(host.clientHeight, 1);
    this.camera = new THREE.OrthographicCamera(
      -18 * aspect,
      18 * aspect,
      18,
      -18,
      0.1,
      220,
    );
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D island. Move with WASD or click the ground; E to interact.',
    );
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xa4d8d5);
    this.scene.fog = new THREE.FogExp2(0xa4d8d5, 0.0075);
    this.sun.position.set(-18, 36, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -38,
      right: 38,
      top: 38,
      bottom: -38,
      near: 1,
      far: 100,
    });
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.bias = -0.0001;
    this.scene.add(this.sun, this.ambient);
    this.createTerrain();
    this.createVillage();
    this.createNature();
    this.createAtmosphere();
    const p = this.state().player;
    this.player.position.set(p.x, heightAt(p.x, p.z), p.z);
    this.player.rotation.y = Math.PI * 0.8;
    this.scene.add(this.player);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 0.89, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffe2a0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.sync();
    this.recoverPlayer();
    this.setQuality(this.state().quality);
    this.bind();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.events.error(
          'The graphics connection paused. Reload to resume your saved adventure.',
        );
      },
      { signal: this.abort.signal },
    );
    this.frame = requestAnimationFrame(this.tick);
    this.events.ready();
  }

  private addMesh(
    g: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private placeObject(group: THREE.Group, x: number, z: number, scale = 1) {
    group.position.set(x, heightAt(x, z), z);
    group.scale.setScalar(scale);
    this.scene.add(group);
    return group;
  }
  private entity(
    id: string,
    kind: Entity['kind'],
    name: string,
    x: number,
    z: number,
    object: THREE.Object3D,
    radius = 1,
  ) {
    this.entities.push({ id, kind, name, x, z, object, radius });
  }
  private createTerrain() {
    const segments = 144,
      rings = 36,
      vertices: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const color = new THREE.Color();
    for (let r = 0; r <= rings; r++)
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2,
          d = (r / rings) * shoreRadius(a),
          x = Math.cos(a) * d,
          z = Math.sin(a) * d;
        vertices.push(x, heightAt(x, z), z);
        const edge = r / rings;
        const n = Math.sin(x * 0.6) * Math.sin(z * 0.45) * 0.04;
        color.set(edge > 0.95 ? 0xc9b783 : edge > 0.9 ? 0x9eaa65 : 0x629748);
        color.offsetHSL(n, n * 0.3, n * 0.7);
        colors.push(color.r, color.g, color.b);
        if (r < rings && i < segments) {
          const k = r * (segments + 1) + i;
          indices.push(
            k,
            k + segments + 1,
            k + 1,
            k + 1,
            k + segments + 1,
            k + segments + 2,
          );
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.ground = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const edgePos: number[] = [],
      edgeIndex: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        r = shoreRadius(a);
      edgePos.push(
        Math.cos(a) * r,
        heightAt(Math.cos(a) * r, Math.sin(a) * r),
        Math.sin(a) * r,
        Math.cos(a) * r,
        -2.6,
        Math.sin(a) * r,
      );
      if (i < segments) {
        const k = i * 2;
        edgeIndex.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const cliff = new THREE.BufferGeometry();
    cliff.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(edgePos, 3),
    );
    cliff.setIndex(edgeIndex);
    cliff.computeVertexNormals();
    this.addMesh(cliff, mat(0x92947a), 0, 0, 0);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `varying vec3 p;void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader: `varying vec3 p;uniform float time;void main(){float d=length(p.xz);float a=atan(p.z,p.x);float coast=25.+sin(a*3.+.4)*1.7+cos(a*5.)*.9;float near=1.-smoothstep(coast,coast+15.,d);vec3 col=mix(vec3(.08,.37,.42),vec3(.25,.70,.66),near);float w=sin(p.x*.7+p.z*.65+time*.65)*sin(p.z*1.3-p.x*.4-time*.4);col+=max(0.,pow(abs(w),18.))*.1;float foam=(1.-smoothstep(.15,.75,abs(d-coast-.6-sin(a*19.+time)*.12)))*.55;col=mix(col,vec3(.79,.92,.81),foam);gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
      }),
    );
    // Shader includes must begin on their own source line.
    this.water.material.fragmentShader =
      this.water.material.fragmentShader.replace(';#include', ';\n#include');
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.65;
    this.scene.add(this.water);
    const pathMat = mat(0xc9b58a);
    const path = (points: number[][], width: number) => {
      const curve = new THREE.CatmullRomCurve3(
        points.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + 0.035, z)),
      );
      const ps = curve.getPoints(90),
        vs: number[] = [],
        ix: number[] = [];
      for (let i = 0; i < ps.length; i++) {
        const t = curve.getTangent(i / (ps.length - 1));
        vs.push(
          ps[i].x - t.z * width,
          ps[i].y,
          ps[i].z + t.x * width,
          ps[i].x + t.z * width,
          ps[i].y,
          ps[i].z - t.x * width,
        );
        if (i < ps.length - 1) {
          const k = i * 2;
          ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3));
      g.setIndex(ix);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, pathMat);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    path(
      [
        [-6, 1],
        [-3, 4],
        [0, 8],
        [3, 10],
        [6, 8],
        [11, 5],
        [14, 0],
        [17, -8],
      ],
      0.9,
    );
    path(
      [
        [0, 8],
        [-1, 1],
        [-3, -7],
        [-6, -17],
      ],
      0.65,
    );
    path(
      [
        [-3, 4],
        [-11, 5],
        [-16, 1],
      ],
      0.65,
    );
    path(
      [
        [3, 10],
        [3, 17],
        [7, 23],
      ],
      0.7,
    );
  }
  private createVillage() {
    const house = this.placeObject(makeHouse(), -7, 0);
    house.rotation.y = 0.12;
    this.blockers.push({ x: -7, z: 0, r: 3 });
    this.windmill = this.placeObject(makeWindmill(), -14, -8, 0.9);
    this.blockers.push({ x: -14, z: -8, r: 1.65 });
    this.goose = this.placeObject(makeGoose(), -3, 4, 1.1);
    this.goose.rotation.y = 0.6;
    this.entity('mayor', 'goose', 'Mayor Honk', -3, 4, this.goose, 0.65);
    // A mayoral ribbon. Authority is mostly accessories.
    const ribbon = this.addMesh(
      new THREE.BoxGeometry(0.1, 0.38, 0.05),
      mat(0x326884),
      0,
      0.64,
      0.48,
      this.goose,
    );
    ribbon.rotation.z = 0.3;
    this.placeObject(makeFence(), -9, 5, 0.8);
    this.placeObject(makeFence(), -13, 3, 0.8).rotation.y = -0.8;
    this.placeObject(makeFence(), 8, 2, 0.8);
    this.placeObject(makeFence(), 11, 5, 0.8).rotation.y = Math.PI / 2;
    const chest = this.placeObject(makeChest(), 6, 18);
    chest.rotation.y = -0.4;
    this.entity('supplies', 'chest', 'Washed-up supplies', 6, 18, chest, 0.7);
    const dockMat = mat(0x967247);
    for (let i = 0; i < 12; i++)
      this.addMesh(
        new THREE.BoxGeometry(3, 0.15, 0.47),
        dockMat,
        7,
        -0.18,
        22 + i * 0.5,
      );
    for (const x of [5.7, 8.3])
      for (const z of [23, 26, 28])
        this.addMesh(
          new THREE.CylinderGeometry(0.13, 0.18, 2, 7),
          dockMat,
          x,
          -0.5,
          z,
        );
    this.lighthouse = new THREE.Group();
    this.placeObject(this.lighthouse, 17, -9);
    this.blockers.push({ x: 17, z: -9, r: 1.8 });
    const white = mat(0xeae2be),
      red = mat(0xc96d46),
      dark = mat(0x385b60);
    this.addMesh(
      new THREE.CylinderGeometry(1.15, 1.8, 6, 12),
      white,
      0,
      3,
      0,
      this.lighthouse,
    );
    this.addMesh(
      new THREE.CylinderGeometry(1.28, 1.38, 1.1, 12),
      red,
      0,
      4.2,
      0,
      this.lighthouse,
    );
    this.addMesh(
      new THREE.CylinderGeometry(1.6, 1.6, 0.22, 12),
      dark,
      0,
      6,
      0,
      this.lighthouse,
    );
    this.addMesh(
      new THREE.CylinderGeometry(0.88, 0.88, 1.1, 10),
      new THREE.MeshStandardMaterial({
        color: 0x9dddc6,
        roughness: 0.2,
        metalness: 0.2,
      }),
      0,
      6.6,
      0,
      this.lighthouse,
    );
    this.addMesh(
      new THREE.ConeGeometry(1.45, 1, 12),
      red,
      0,
      7.5,
      0,
      this.lighthouse,
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.addMesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5),
        dark,
        Math.sin(a) * 1.15,
        6.7,
        Math.cos(a) * 1.15,
        this.lighthouse,
      );
    }
    this.addMesh(
      new THREE.BoxGeometry(0.7, 1.4, 0.15),
      dark,
      0,
      0.7,
      1.7,
      this.lighthouse,
    );
    this.beacon = this.addMesh(
      new THREE.SphereGeometry(0.5, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffdc72,
        emissive: 0xffb532,
        emissiveIntensity: 4,
      }),
      0,
      6.7,
      0,
      this.lighthouse,
    );
    this.beacon.visible = false;
    this.entity(
      'lighthouse',
      'lighthouse',
      'The sleepy lighthouse',
      17,
      -9,
      this.lighthouse,
      1.8,
    );
    // Weathered standing stones form the ruins around the sun crystal.
    const stone = mat(0x84958c);
    for (const [x, z, h] of [
      [-9, -18, 3.3],
      [-3, -18, 2.7],
      [-9, -15, 1.5],
      [-3, -15, 1.2],
    ]) {
      this.addMesh(
        new THREE.CylinderGeometry(0.55, 0.7, h, 5),
        stone,
        x,
        heightAt(x, z) + h / 2,
        z,
      );
      this.blockers.push({ x, z, r: 0.7 });
    }
    const lintel = this.addMesh(
      new THREE.BoxGeometry(6.6, 0.65, 1.15),
      stone,
      -6,
      heightAt(-6, -18) + 3,
      -18,
    );
    lintel.rotation.z = -0.09;
    const crystal = this.placeObject(makeCrystal(), -6, -17, 1.2);
    this.entity('crystal', 'crystal', 'The sun crystal', -6, -17, crystal, 0.8);
    // Small chimney puffs use one material and low detail geometry.
    const smoke = new THREE.Group();
    smoke.position.set(-5.5, heightAt(-7, 0) + 5.2, -0.55);
    const smat = new THREE.MeshBasicMaterial({
      color: 0xfff0cf,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    for (let i = 0; i < 5; i++) {
      const puff = this.addMesh(
        new THREE.IcosahedronGeometry(0.3 + i * 0.12, 1),
        smat,
        Math.sin(i) * 0.2,
        i * 0.55,
        0,
        smoke,
      );
      puff.castShadow = false;
    }
    this.scene.add(smoke);
    this.clouds.push(smoke);
  }
  private createNature() {
    const rand = random(29);
    let treeIndex = 0,
      rockIndex = 0;
    const clear = (x: number, z: number) =>
      Math.hypot(x, z) > 5 &&
      !(x > -11 && x < 13 && z > -3 && z < 12) &&
      !(x > -9 && x < -3 && z < -13) &&
      Math.hypot(x + 14, z + 8) > 4 &&
      Math.hypot(x - 17, z + 9) > 4 &&
      Math.abs(x + z * 0.17) > 2;
    for (let i = 0; i < 160; i++) {
      const a = rand() * Math.PI * 2,
        r = 7 + rand() * 17,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (
        !onLand(x, z, 2) ||
        !clear(x, z) ||
        this.blockers.some((b) => Math.hypot(b.x - x, b.z - z) < 2.4)
      )
        continue;
      const tree = this.placeObject(
        makeTree(i % 3 === 0 ? 'pine' : 'oak', i + 20),
        x,
        z,
        0.75 + rand() * 0.28,
      );
      this.entity(
        `tree-${treeIndex++}`,
        'wood',
        'Gather timber',
        x,
        z,
        tree,
        0.55,
      );
      this.blockers.push({ x, z, r: 0.55 });
      if (treeIndex >= 41) break;
    }
    // Guaranteed approachable gathering patches next to the arrival point.
    for (const [x, z] of [
      [-5, 10],
      [12, 10],
      [-12, 8],
      [3, -5],
    ]) {
      const t = this.placeObject(makeTree('oak', ++treeIndex), x, z, 0.8);
      this.entity(
        `tree-near-${treeIndex}`,
        'wood',
        'Gather timber',
        x,
        z,
        t,
        0.5,
      );
      this.blockers.push({ x, z, r: 0.55 });
    }
    for (let i = 0; i < 23; i++) {
      const a = rand() * Math.PI * 2,
        r = 12 + rand() * 11,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (!onLand(x, z, 1) || !clear(x, z)) continue;
      const rock = this.placeObject(makeRock(i + 3), x, z, 0.65 + rand() * 0.5);
      this.entity(
        `rock-${rockIndex++}`,
        'stone',
        'Gather stone',
        x,
        z,
        rock,
        0.7,
      );
      this.blockers.push({ x, z, r: 0.75 });
    }
    for (const [x, z] of [
      [4, 12],
      [-4, 12],
      [12, 6],
    ]) {
      const rock = this.placeObject(makeRock(++rockIndex), x, z, 0.85);
      this.entity(
        `rock-near-${rockIndex}`,
        'stone',
        'Gather stone',
        x,
        z,
        rock,
        0.75,
      );
      this.blockers.push({ x, z, r: 0.75 });
    }
    const grassGeo = new THREE.BufferGeometry();
    grassGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.1, 0, 0, 0.1, 0, 0, 0, 0.5, 0.04, 0, 0, -0.1, 0, 0, 0.1, 0.04,
          0.36, 0,
        ],
        3,
      ),
    );
    grassGeo.computeVertexNormals();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x709c44,
      side: THREE.DoubleSide,
      roughness: 1,
    });
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, 5000);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < 8000 && n < 5000; i++) {
      const x = (rand() - 0.5) * 52,
        z = (rand() - 0.5) * 52;
      if (
        !onLand(x, z, 1.8) ||
        (!clear(x, z) && rand() < 0.94) ||
        Math.abs(x + z * 0.17) < 1.6
      )
        continue;
      dummy.position.set(x, heightAt(x, z) + 0.01, z);
      dummy.rotation.y = rand() * Math.PI;
      dummy.scale.setScalar(0.35 + rand() * 0.8);
      dummy.updateMatrix();
      grass.setMatrixAt(n, dummy.matrix);
      grass.setColorAt(
        n,
        new THREE.Color().setHSL(
          0.2 + rand() * 0.075,
          0.39,
          0.29 + rand() * 0.13,
        ),
      );
      n++;
    }
    grass.count = n;
    grass.receiveShadow = true;
    this.scene.add(grass);
    const flowerGeo = new THREE.IcosahedronGeometry(0.11, 0),
      flowerMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, 260);
    n = 0;
    for (let i = 0; i < 1500 && n < 260; i++) {
      const x = (rand() - 0.5) * 45,
        z = (rand() - 0.5) * 45;
      if (!onLand(x, z, 3) || !clear(x, z)) continue;
      dummy.position.set(x, heightAt(x, z) + 0.25, z);
      dummy.scale.set(0.7, 1, 0.7);
      dummy.updateMatrix();
      flowers.setMatrixAt(n, dummy.matrix);
      flowers.setColorAt(
        n,
        new THREE.Color([0xf1d068, 0xedbdab, 0xdbd9af, 0x9eb2ce][n % 4]),
      );
      n++;
    }
    flowers.count = n;
    this.scene.add(flowers);
    for (const [x, z] of [
      [-2, 11],
      [10, 12],
      [-10, 11],
      [7, -4],
      [13, -4],
      [-15, -13],
      [2, -13],
    ]) {
      const g = new THREE.Group();
      const green = mat(0x71944d),
        purple = mat(0xb6a4ce);
      for (let i = 0; i < 6; i++) {
        const a = i * 2.4;
        this.addMesh(
          new THREE.ConeGeometry(0.18, 0.8, 5),
          green,
          Math.cos(a) * 0.3,
          0.4,
          Math.sin(a) * 0.3,
          g,
        );
        this.addMesh(
          new THREE.IcosahedronGeometry(0.16, 0),
          purple,
          Math.cos(a) * 0.3,
          0.85,
          Math.sin(a) * 0.3,
          g,
        );
      }
      this.placeObject(g, x, z);
      this.entity(
        `fiber-${x}-${z}`,
        'fiber',
        'Forage wildflowers',
        x,
        z,
        g,
        0.6,
      );
    }
    // Offshore rocky islets lend depth beyond the playable island.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2,
        r = 34 + rand() * 14;
      const rock = makeRock(i + 500);
      rock.position.set(Math.cos(a) * r, -1.2, Math.sin(a) * r);
      rock.scale.set(3 + rand() * 2, 2 + rand() * 2, 3 + rand() * 2);
      this.scene.add(rock);
    }
  }
  private createAtmosphere() {
    const rand = random(90),
      ps = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      ps[i * 3] = (rand() - 0.5) * 45;
      ps[i * 3 + 1] = 1.2 + rand() * 4;
      ps[i * 3 + 2] = (rand() - 0.5) * 45;
    }
    this.fireflies = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(ps, 3),
      ),
      new THREE.PointsMaterial({
        color: 0xffedb4,
        size: 0.065,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    this.scene.add(this.fireflies);
    const cloudmat = new THREE.MeshBasicMaterial({
      color: 0xe9f3db,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      cloud.position.set((i - 3) * 17, 14 + rand() * 5, -27 - rand() * 15);
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(
          new THREE.IcosahedronGeometry(2, 1),
          cloudmat,
        );
        puff.position.set(j * 2, Math.sin(j) * 0.6, 0);
        puff.scale.set(1.4, 0.5, 1);
        cloud.add(puff);
      }
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }
  private bind() {
    const signal = this.abort.signal;
    const el = this.renderer.domElement;
    window.addEventListener(
      'keydown',
      (e) => {
        if (
          (e.target as HTMLElement)?.matches(
            'input,textarea,select,[role="dialog"] *',
          )
        )
          return;
        if (
          ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
            e.code,
          )
        )
          e.preventDefault();
        this.keys.add(e.code);
        if (e.repeat) return;
        if (e.code === 'Escape') {
          if (this.buildType) {
            this.setBuild(null);
            this.events.menu('cancel-build');
            return;
          }
          this.events.menu('escape');
        }
        if (this.paused) return;
        if (e.code === 'KeyE') this.interact();
        if (e.code === 'KeyB') this.events.menu('build');
        if (e.code === 'KeyC') this.events.menu('craft');
        if (e.code === 'KeyJ') this.events.menu('journal');
        if (e.code === 'KeyI') this.events.menu('inventory');
        if (e.code === 'KeyR' && this.buildType) this.rotation += Math.PI / 2;
        if (e.code === 'Space' && this.jump <= 0) this.jumpSpeed = 5;
        if (e.code.startsWith('Digit')) this.events.menu(e.code);
      },
      { signal },
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), {
      signal,
    });
    window.addEventListener(
      'blur',
      () => {
        this.keys.clear();
        this.destination = null;
      },
      { signal },
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    el.addEventListener(
      'pointerdown',
      (e) => {
        this.downX = e.clientX;
        this.downY = e.clientY;
        this.drag = e.button === 2;
        el.setPointerCapture(e.pointerId);
      },
      { signal },
    );
    el.addEventListener(
      'pointermove',
      (e) => {
        if (this.drag) {
          this.cameraAngle -= e.movementX * 0.006;
          return;
        }
        this.screenPoint(e.clientX, e.clientY);
        if (this.buildType) this.updateGhost();
      },
      { signal },
    );
    el.addEventListener(
      'pointerup',
      (e) => {
        if (this.drag) {
          this.drag = false;
          return;
        }
        if (
          this.paused ||
          Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 10
        )
          return;
        this.screenPoint(e.clientX, e.clientY);
        if (this.buildType) {
          this.updateGhost();
          if (this.validGhost) {
            this.events.place(
              this.buildType,
              this.ghostPoint.x,
              this.ghostPoint.z,
              this.rotation,
            );
            this.setBuild(null);
          }
          return;
        }
        const hit = this.ray.intersectObjects(
          this.entities.filter((n) => n.object.visible).map((n) => n.object),
          true,
        )[0];
        let clicked: Entity | undefined;
        if (hit)
          clicked = this.entities.find((n) => {
            let o: THREE.Object3D | null = hit.object;
            while (o) {
              if (o === n.object) return true;
              o = o.parent;
            }
            return false;
          });
        if (clicked) {
          if (
            Math.hypot(
              clicked.x - this.player.position.x,
              clicked.z - this.player.position.z,
            ) <
            3 + clicked.radius
          ) {
            this.events.interact(clicked);
            this.swing = 0.4;
          } else {
            this.destination = new THREE.Vector3(clicked.x, 0, clicked.z);
            this.destinationEntity = clicked;
          }
        } else {
          const hits = this.ray.intersectObject(this.ground);
          if (hits.length && onLand(hits[0].point.x, hits[0].point.z, 1)) {
            this.destination = hits[0].point.clone();
            this.destinationEntity = null;
            this.marker.position.set(
              this.destination.x,
              heightAt(this.destination.x, this.destination.z) + 0.07,
              this.destination.z,
            );
            this.marker.visible = true;
          }
        }
      },
      { signal },
    );
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = THREE.MathUtils.clamp(this.zoom + e.deltaY * 0.012, 9, 27);
        this.resize();
      },
      { signal, passive: false },
    );
  }
  private screenPoint(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.mouse, this.camera);
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.left = (-this.zoom * w) / h;
    this.camera.right = (this.zoom * w) / h;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }
  setQuality(q: 'high' | 'low') {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, q === 'low' ? 1 : 1.6),
    );
    this.renderer.shadowMap.enabled = q === 'high';
    this.resize();
  }
  setPaused(p: boolean) {
    this.paused = p;
    this.keys.clear();
    this.destination = null;
    this.destinationEntity = null;
    if (this.marker) this.marker.visible = false;
  }
  setMovement(x: number, z: number) {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.keys.delete(k);
    if (x < -0.2) this.keys.add('KeyA');
    if (x > 0.2) this.keys.add('KeyD');
    if (z < -0.2) this.keys.add('KeyW');
    if (z > 0.2) this.keys.add('KeyS');
  }
  interact() {
    if (this.paused) return;
    if (this.near) {
      this.events.interact(this.near);
      this.swing = 0.4;
      this.burst(this.near.x, this.near.z);
    }
  }
  setBuild(type: Structure | null) {
    this.buildType = type;
    this.rotation = 0;
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
      });
      this.ghost = null;
    }
    if (type) {
      this.ghost = this.buildModel(type);
      this.ghost.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = (o.material as THREE.MeshStandardMaterial).clone();
          m.transparent = true;
          m.opacity = 0.48;
          m.depthWrite = false;
          o.material = m;
          o.castShadow = false;
        }
      });
      this.scene.add(this.ghost);
      this.ghost.visible = false;
    }
  }
  private buildModel(type: Structure) {
    return type === 'cottage'
      ? makeHouse()
      : type === 'workbench'
        ? makeWorkbench()
        : type === 'campfire'
          ? makeCampfire()
          : type === 'fence'
            ? makeFence()
            : new THREE.Group();
  }
  canPlace(type: Structure, x: number, z: number) {
    const radius =
      type === 'cottage'
        ? 3.4
        : type === 'fence'
          ? 2.1
          : type === 'garden'
            ? 2.2
            : 1.25;
    if (
      !onLand(x, z, radius + 1) ||
      this.state().buildings.length >= 120 ||
      Math.hypot(x - this.player.position.x, z - this.player.position.z) <
        radius + 0.5 ||
      Math.hypot(x - this.player.position.x, z - this.player.position.z) > 12
    )
      return false;
    if (this.blockers.some((b) => Math.hypot(x - b.x, z - b.z) < radius + b.r))
      return false;
    if (
      this.state().plots.some(
        (p) => Math.hypot(x - p.x, z - p.z) < radius + 0.6,
      )
    )
      return false;
    if (
      this.entities.some(
        (e) =>
          ['goose', 'crystal', 'chest'].includes(e.kind) &&
          Math.hypot(x - e.x, z - e.z) < radius + 1,
      )
    )
      return false;
    return true;
  }
  private updateGhost() {
    if (!this.ghost || !this.buildType) return;
    const hit = this.ray.intersectObject(this.ground)[0];
    if (!hit) {
      this.ghost.visible = false;
      return;
    }
    const x = Math.round(hit.point.x * 2) / 2,
      z = Math.round(hit.point.z * 2) / 2;
    this.ghostPoint.set(x, heightAt(x, z), z);
    this.ghost.position.copy(this.ghostPoint);
    this.ghost.rotation.y = this.rotation;
    this.ghost.visible = true;
    this.validGhost =
      this.canPlace(this.buildType, x, z) &&
      canAfford(this.state(), RECIPES[this.buildType].cost);
    if (this.buildType === 'garden' && this.ghost.children.length === 0) {
      const bed = this.addMesh(
        new THREE.BoxGeometry(4, 0.12, 1.25),
        mat(0x6ea781),
        0,
        0.08,
        0,
        this.ghost,
      );
      (bed.material as THREE.Material).transparent = true;
      (bed.material as THREE.Material).opacity = 0.5;
    }
    this.ghost.traverse((o) => {
      if (o instanceof THREE.Mesh)
        (o.material as THREE.MeshStandardMaterial).emissive.set(
          this.validGhost ? 0x164b29 : 0x8f1725,
        );
    });
  }
  sync() {
    const state = this.state();
    for (const [id, g] of this.placed) {
      if (!state.buildings.some((b) => b.id === id)) {
        this.scene.remove(g);
        this.placed.delete(id);
        this.entities = this.entities.filter((e) => e.id !== id);
        this.blockers = this.blockers.filter((b) => b.id !== id);
      }
    }
    for (const [id, p] of this.plantGroups) {
      if (!state.plots.some((plot) => plot.id === id)) {
        this.scene.remove(p.group);
        this.plantGroups.delete(id);
        this.entities = this.entities.filter((e) => e.id !== id);
      }
    }
    for (const b of state.buildings) {
      if (this.placed.has(b.id)) continue;
      const model = this.placeObject(this.buildModel(b.type), b.x, b.z);
      model.rotation.y = b.rotation;
      this.placed.set(b.id, model);
      if (b.type !== 'garden') {
        this.blockers.push({
          id: b.id,
          x: b.x,
          z: b.z,
          r: b.type === 'cottage' ? 3.2 : b.type === 'fence' ? 1.8 : 0.9,
        });
        if (
          b.type === 'workbench' ||
          b.type === 'campfire' ||
          b.type === 'cottage'
        )
          this.entity(
            b.id,
            b.type,
            RECIPES[b.type].name,
            b.x,
            b.z,
            model,
            b.type === 'cottage' ? 3 : 0.9,
          );
      }
    }
    for (const p of state.plots) {
      const stage =
        p.planted === null ? -1 : Math.min(3, Math.floor(growth(p) * 3));
      const existing = this.plantGroups.get(p.id);
      if (existing?.stage === stage && existing.watered === p.watered) continue;
      if (existing) {
        this.scene.remove(existing.group);
        this.entities = this.entities.filter((e) => e.id !== p.id);
      }
      const g = new THREE.Group();
      const bed = this.addMesh(
        this.bedGeometry,
        p.watered ? this.wetSoil : this.drySoil,
        0,
        0.04,
        0,
        g,
      );
      bed.receiveShadow = true;
      const rim = this.rimMaterial;
      for (const z of [-0.67, 0.67])
        this.addMesh(this.rimGeometry, rim, 0, 0.08, z, g);
      if (stage >= 0) {
        const crop = makeCrop(stage);
        crop.scale.setScalar(0.85);
        g.add(crop);
      }
      this.placeObject(g, p.x, p.z);
      this.plantGroups.set(p.id, { group: g, stage, watered: p.watered });
      this.entity(
        p.id,
        'plot',
        stage < 0
          ? 'Plant a seed'
          : stage === 3
            ? 'Harvest carrots'
            : p.watered
              ? 'Carrots are growing'
              : 'Water the seedlings',
        p.x,
        p.z,
        g,
        0.5,
      );
    }
    const crystal = this.entities.find((e) => e.id === 'crystal');
    if (crystal) crystal.object.visible = !state.stats.explored;
    this.beacon.visible = state.won;
    for (const e of this.entities) {
      if (['wood', 'stone', 'fiber'].includes(e.kind)) {
        const depleted = (state.depleted[e.id] ?? 0) > Date.now();
        e.object.scale.setScalar(
          (e.object.userData.originalScale ??= e.object.scale.x) *
            (depleted ? 0.65 : 1),
        );
      }
    }
  }
  burst(x: number, z: number) {
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(this.resourceGeo, this.resourceMat);
      mesh.position.set(x, heightAt(x, z) + 0.5, z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        life: 1,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 3,
      });
    }
  }
  private recoverPlayer() {
    const p = this.player.position,
      valid = (x: number, z: number) =>
        onLand(x, z, 1) &&
        !this.blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 0.4);
    if (valid(p.x, p.z)) return;
    for (let r = 0.6; r < 55; r += 0.6)
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2,
          x = p.x + Math.cos(a) * r,
          z = p.z + Math.sin(a) * r;
        if (valid(x, z)) {
          p.set(x, heightAt(x, z), z);
          this.state().player = { x, z };
          return;
        }
      }
  }
  recenter() {
    const p = this.player.position;
    this.target.set(p.x, 0, p.z);
    this.cameraAngle = 0.65;
    this.zoom = 16;
    this.resize();
  }
  travelHint(place: keyof typeof targets) {
    const [x, z] = targets[place];
    this.destination = new THREE.Vector3(x, 0, z);
    this.destinationEntity = null;
  }
  private tick = (stamp: number) => {
    const dt = Math.min((stamp - this.last) / 1000 || 0.016, 0.05);
    this.last = stamp;
    this.clock += dt;
    this.water.material.uniforms.time.value = this.clock;
    const s = this.state();
    if (!this.paused) {
      s.elapsed += dt;
      let mx = 0,
        mz = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz--;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz++;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx--;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx++;
      let dx =
          mx * Math.cos(this.cameraAngle) + mz * Math.sin(this.cameraAngle),
        dz = -mx * Math.sin(this.cameraAngle) + mz * Math.cos(this.cameraAngle);
      if (mx || mz) {
        this.destination = null;
        this.marker.visible = false;
      } else if (this.destination) {
        dx = this.destination.x - this.player.position.x;
        dz = this.destination.z - this.player.position.z;
        const stop = this.destinationEntity
          ? 2.1 + this.destinationEntity.radius
          : 0.2;
        if (Math.hypot(dx, dz) < stop) {
          if (this.destinationEntity) {
            this.events.interact(this.destinationEntity);
            this.swing = 0.4;
          }
          this.destination = null;
          this.destinationEntity = null;
          this.marker.visible = false;
          dx = dz = 0;
        }
      }
      const moving = Math.hypot(dx, dz) > 0.01,
        sprint = this.keys.has('ShiftLeft') && this.stamina > 8;
      this.stamina = THREE.MathUtils.clamp(
        this.stamina + (moving && sprint ? -15 : 14) * dt,
        0,
        100,
      );
      if (moving) {
        const len = Math.hypot(dx, dz),
          speed = (sprint ? 7 : 4.6) * dt;
        dx = (dx / len) * speed;
        dz = (dz / len) * speed;
        const p = this.player.position;
        const allowed = (x: number, z: number) =>
          onLand(x, z, 0.8) &&
          !this.blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 0.25);
        let moved = false;
        if (allowed(p.x + dx, p.z)) {
          p.x += dx;
          moved = true;
        }
        if (allowed(p.x, p.z + dz)) {
          p.z += dz;
          moved = true;
        }
        if (!moved && this.destination) {
          this.destination = null;
          this.destinationEntity = null;
          this.marker.visible = false;
        }
        const angle = Math.atan2(dx, dz);
        this.player.rotation.y +=
          Math.atan2(
            Math.sin(angle - this.player.rotation.y),
            Math.cos(angle - this.player.rotation.y),
          ) * Math.min(1, dt * 12);
      }
      if (this.jumpSpeed !== 0 || this.jump > 0) {
        this.jumpSpeed -= 14 * dt;
        this.jump = Math.max(0, this.jump + this.jumpSpeed * dt);
        if (this.jump === 0) this.jumpSpeed = 0;
      }
      this.player.position.y =
        heightAt(this.player.position.x, this.player.position.z) +
        this.jump +
        (moving
          ? Math.abs(Math.sin(this.clock * 12)) * 0.065
          : Math.sin(this.clock * 2) * 0.015);
      for (const [name, phase] of [
        ['leftLeg', 0],
        ['rightLeg', Math.PI],
        ['leftArm', Math.PI],
        ['rightArm', 0],
      ] as const) {
        const limb = this.player.getObjectByName(name);
        if (limb)
          limb.rotation.x = moving
            ? Math.sin(this.clock * (sprint ? 16 : 11) + phase) * 0.6
            : Math.sin(this.clock * 2 + phase) * 0.04;
      }
      if (this.swing > 0) {
        this.swing -= dt;
        const arm = this.player.getObjectByName('rightArm');
        if (arm) arm.rotation.x = -Math.sin(this.swing * 14) * 1.5;
      }
      if (this.clock - this.lastUi > 0.16) {
        s.player = { x: this.player.position.x, z: this.player.position.z };
        this.events.move(s.player.x, s.player.z, this.stamina);
        let best: Entity | null = null,
          dist = Infinity;
        for (const e of this.entities) {
          if (!e.object.visible) continue;
          const d = Math.hypot(e.x - s.player.x, e.z - s.player.z) - e.radius;
          if (d < 2.7 && d < dist) {
            best = e;
            dist = d;
          }
        }
        if (this.near !== best) {
          this.near = best;
          this.events.near(best);
        }
        this.lastUi = this.clock;
        this.sync();
      }
    }
    const goal = this.paused
      ? new THREE.Vector3(0, 0, 2)
      : new THREE.Vector3(
          this.player.position.x * 0.87,
          0,
          this.player.position.z * 0.87 - 1,
        );
    this.target.lerp(goal, 1 - Math.exp(-dt * 2));
    this.camera.position.set(
      this.target.x + Math.sin(this.cameraAngle) * 38,
      32,
      this.target.z + Math.cos(this.cameraAngle) * 38,
    );
    this.camera.lookAt(this.target.x, 0.4, this.target.z);
    const rotor = this.windmill.getObjectByName('rotor');
    if (rotor) rotor.rotation.z = -this.clock * 0.18;
    this.goose.rotation.y = 0.5 + Math.sin(this.clock * 0.55) * 0.2;
    this.goose.position.y =
      heightAt(-3, 4) + Math.abs(Math.sin(this.clock * 1.5)) * 0.045;
    this.ring.visible = !!this.near && !this.paused && !this.buildType;
    if (this.near) {
      this.ring.position.set(
        this.near.x,
        heightAt(this.near.x, this.near.z) + 0.08,
        this.near.z,
      );
      this.ring.scale.setScalar(
        this.near.radius + 0.55 + Math.sin(this.clock * 3) * 0.025,
      );
    }
    this.fireflies.rotation.y = Math.sin(this.clock * 0.05) * 0.025;
    this.fireflies.position.y = Math.sin(this.clock * 0.6) * 0.16;
    for (let i = 0; i < this.clouds.length; i++)
      this.clouds[i].position.x += dt * (i === 0 ? 0.018 : 0.1);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy -= 5 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.max(0, p.life));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
    // A gentle eight-minute daylight cycle keeps the island readable at dusk.
    const daylight = 0.78 + Math.cos((s.elapsed / 480) * Math.PI * 2) * 0.22;
    this.sun.intensity = 3.3 * daylight;
    this.ambient.intensity = 1.7 + daylight * 0.45;
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resizeObserver.disconnect();
    const geos = new Set<THREE.BufferGeometry>(),
      mats = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        geos.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          mats.add(m);
      }
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    disposeAssetLibrary();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
