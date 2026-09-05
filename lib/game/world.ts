import * as THREE from 'three';
import {
  makeTree,
  makeRock,
  makeHouse,
  makeWindmill,
  makeWorkbench,
  makeCampfire,
  makeFence,
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
import {
  makeStructure,
  makeVillager,
  makeResource,
  makeCropVariant,
  disposeExtraModelLibrary,
} from './extra-models';
import {
  NPCS,
  REGIONS,
  RELIC_LOCATIONS,
  PROJECT_LOCATIONS,
  CROPS,
  type Crop,
  type Tool,
} from './catalog';
import { placement, footprint, circleHits } from './placement';
import {
  makeFirstPersonRig,
  disposeFirstPersonModels,
} from './first-person-models';
import {
  EYE_HEIGHT,
  INTERACTION_REACH,
  lookDelta,
  walkDirection,
  aimEntity,
  visibleInTree,
  type LookMode,
} from './first-person';
import { heightAt, onLand, shoreRadius } from './terrain';
import {
  makeResourceRemains,
  disposeResourceRemains,
} from './resource-remains';
import { RESOURCE_KINDS, harvestedLabel } from './resource-status';
import { canAnimateInteraction } from './interactions';
import {
  FirstPersonMotion,
  MOTION_TIMING,
  type MotionAction,
} from './first-person-motion';
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
    | 'cottage'
    | 'npc'
    | 'ore'
    | 'clay'
    | 'mushroom'
    | 'apple'
    | 'fish'
    | 'relic'
    | 'project'
    | 'spring'
    | 'station'
    | 'production'
    | 'market';
  name: string;
  x: number;
  z: number;
  radius: number;
  object: THREE.Object3D;
};
export type WorldEvents = {
  near: (e: Entity | null) => void;
  look: (mode: LookMode) => void;
  placement: (valid: boolean, message: string) => void;
  interact: (e: Entity, actionTime?: number) => boolean;
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

export class IslandWorld {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  entities: Entity[] = [];
  player = new THREE.Group();
  near: Entity | null = null;
  stamina = 100;
  paused = true;
  buildType: Structure | null = null;
  rotation = 0;
  private ghost: THREE.Group | null = null;
  private validGhost = false;
  private ghostPoint = new THREE.Vector3();
  private keys = new Set<string>();
  private ray = new THREE.Raycaster();
  private mouse = new THREE.Vector2(0, 0);
  private lookMode: LookMode = 'free';
  private expectedUnlock = false;
  private requestingLock = false;
  private lookRequest = 0;
  private followPointer = false;
  private followEdge = new THREE.Vector2();
  private wheelDelta = 0;
  private lastWheel = 0;
  private pointerId: number | null = null;
  private pointerOrigin = new THREE.Vector2();
  private pointerLast = new THREE.Vector2();
  private pointerDragged = false;
  private pointerConsumed = false;
  private staticAimMeshes: THREE.Mesh[] = [];
  private aimMeshes: THREE.Mesh[] = [];
  private lastAim = 0;
  private lastBuildAim = 0;
  private viewScene = new THREE.Scene();
  private viewCamera = new THREE.PerspectiveCamera(72, 1, 0.025, 4);
  private handRig = makeFirstPersonRig();
  private handMotion = new FirstPersonMotion(this.handRig);
  private ground!: THREE.Mesh;
  private water!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private sun = new THREE.DirectionalLight(0xffe1a0, 3.3);
  private ambient = new THREE.HemisphereLight(0xc9eeea, 0x65834b, 2.15);
  private ring!: THREE.Mesh;
  private windmill!: THREE.Group;
  private goose!: THREE.Group;
  private lighthouse!: THREE.Group;
  private beacon!: THREE.Mesh;
  private plantGroups = new Map<
    string,
    { group: THREE.Group; stage: number; watered: boolean; crop: Crop }
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
  private grid: THREE.InstancedMesh | null = null;
  private gridCenter = new THREE.Vector2(999, 999);
  private lastPlacementMessage = '';
  private resourceVisuals = new Map<
    string,
    { live: THREE.Object3D; remains: THREE.Group }
  >();
  private equipped: Tool | null = null;
  private last = 0;
  private frame = 0;
  private clock = 0;
  private lastUi = 0;
  private jump = 0;
  private headOffset = 0;
  private jumpSpeed = 0;
  private action: {
    tool: Tool;
    motion: MotionAction;
    elapsed: number;
    hit: boolean;
    requestedAt: number;
    target?: Entity;
    building?: { type: Structure; x: number; z: number; rotation: number };
  } | null = null;
  private actionMaterials = new Map<Tool, THREE.MeshBasicMaterial>();
  private chipGeo = new THREE.BoxGeometry(0.13, 0.045, 0.065);
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
    this.camera = new THREE.PerspectiveCamera(
      this.state().view.fov,
      aspect,
      0.06,
      220,
    );
    this.camera.rotation.order = 'YXZ';
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
      'First-person island. Click to capture the mouse, WASD to move, aim and press E to use your tool. Tab releases the mouse. Escape pauses.',
    );
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xa4d8d5);
    this.scene.fog = new THREE.FogExp2(0xa4d8d5, 0.009);
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
    this.scene.add(this.sun, this.sun.target, this.ambient);
    this.createTerrain();
    this.createVillage();
    this.createNature();
    this.createExpansion();
    this.prepareResourceVisuals();
    this.createAtmosphere();
    this.staticAimMeshes = this.collectAimMeshes(this.scene);
    this.rebuildAimMeshes();
    const p = this.state().player;
    this.player.position.set(p.x, heightAt(p.x, p.z), p.z);
    this.viewScene.add(new THREE.HemisphereLight(0xfff6d6, 0x536951, 2.6));
    const handLight = new THREE.DirectionalLight(0xffe4b6, 2.4);
    handLight.position.set(-1, 2, 1);
    this.viewScene.add(handLight, this.handRig);
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
      rings = 72,
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
        fragmentShader: `varying vec3 p;uniform float time;void main(){float d=length(p.xz);float a=atan(p.z,p.x);float coast=53.+sin(a*3.+.4)*3.5+cos(a*5.)*1.8;float near=1.-smoothstep(coast,coast+15.,d);vec3 col=mix(vec3(.08,.37,.42),vec3(.25,.70,.66),near);float w=sin(p.x*.7+p.z*.65+time*.65)*sin(p.z*1.3-p.x*.4-time*.4);col+=max(0.,pow(abs(w),18.))*.1;float foam=(1.-smoothstep(.15,.75,abs(d-coast-.6-sin(a*19.+time)*.12)))*.55;col=mix(col,vec3(.79,.92,.81),foam);gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
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
    for (const [x, z, angle] of [
      [-9, 5, 0],
      [-13, 3, -0.8],
      [8, 2, 0],
      [11, 5, Math.PI / 2],
    ]) {
      for (const offset of [-1.2, 0, 1.2])
        this.blockers.push({
          x: x + Math.cos(angle) * offset,
          z: z - Math.sin(angle) * offset,
          r: 0.35,
        });
    }
    const chest = this.placeObject(makeChest(), 6, 18);
    chest.rotation.y = -0.4;
    this.entity('supplies', 'chest', 'Washed-up supplies', 6, 18, chest, 0.7);
    const dockMat = mat(0x967247);
    for (let i = 0; i < 12; i++)
      this.addMesh(
        new THREE.BoxGeometry(3, 0.15, 0.47),
        dockMat,
        7,
        0.35,
        50 + i * 0.5,
      );
    for (const x of [5.7, 8.3])
      for (const z of [50, 53, 55])
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
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, 15000);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < 24000 && n < 15000; i++) {
      const x = (rand() - 0.5) * 110,
        z = (rand() - 0.5) * 110;
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
        r = 64 + rand() * 20;
      const rock = makeRock(i + 500);
      rock.position.set(Math.cos(a) * r, -1.2, Math.sin(a) * r);
      rock.scale.set(3 + rand() * 2, 2 + rand() * 2, 3 + rand() * 2);
      this.scene.add(rock);
    }
  }
  private label(text: string, x: number, z: number, color = '#f6e8bd') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#173c32';
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 72, 18);
    ctx.fill();
    ctx.font = '600 28px Georgia';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 54);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
      }),
    );
    sprite.position.set(x, heightAt(x, z) + 3.7, z);
    sprite.scale.set(5.8, 1.1, 1);
    this.scene.add(sprite);
  }
  private createExpansion() {
    const rand = random(270),
      stone = mat(0x777d75),
      wood = mat(0x84613d),
      trail = mat(0xbfa875);
    for (const [key, r] of Object.entries(REGIONS)) {
      if (key === 'homestead') continue;
      this.label(r.name, r.x, r.z - 3);
      // Narrow stepping-stone trails connect broad clearings for new homesteads.
      const length = Math.hypot(r.x, r.z - 7);
      for (let i = 0; i < length; i += 2) {
        const f = i / length,
          x = r.x * f,
          z = 7 + (r.z - 7) * f;
        if (Math.hypot(x, z) < 20) continue;
        const tile = this.addMesh(
          new THREE.CylinderGeometry(0.62, 0.72, 0.055, 7),
          trail,
          x,
          heightAt(x, z) + 0.025,
          z,
        );
        tile.rotation.y = rand() * 6;
      }
    }
    for (const [key, n] of Object.entries(NPCS)) {
      if (n.role === 'mayor') continue;
      const person = this.placeObject(makeVillager(n.role), n.x, n.z, 1.15);
      person.rotation.y = 0.4;
      this.blockers.push({ x: n.x, z: n.z, r: 0.4 });
      this.entity(key, 'npc', `Talk to ${n.name}`, n.x, n.z, person, 0.6);
      this.label(n.name, n.x, n.z);
      const shelter = this.placeObject(
        makeStructure(
          key === 'ranger'
            ? 'shed'
            : key === 'fisher'
              ? 'market'
              : key === 'smith'
                ? 'forge'
                : key === 'botanist'
                  ? 'greenhouse'
                  : key === 'astronomer'
                    ? 'observatory'
                    : 'tavern',
        ),
        n.x + 4,
        n.z - 5,
        0.72,
      );
      shelter.rotation.y = -0.3;
      this.blockers.push({ x: n.x + 4, z: n.z - 5, r: 2.1 });
    }
    for (let i = 0; i < 145; i++) {
      const a = rand() * Math.PI * 2,
        r = 27 + rand() * 22,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (
        !onLand(x, z, 3) ||
        Math.abs(z + 29) < 2 ||
        Math.abs(z + 41) < 2 ||
        (Math.abs(x) < 5 && z < -23) ||
        Object.values(NPCS).some((n) => Math.hypot(x - n.x, z - n.z) < 10) ||
        RELIC_LOCATIONS.some((n) => Math.hypot(x - n.x, z - n.z) < 3) ||
        Object.values(PROJECT_LOCATIONS).some(
          (n) => Math.hypot(x - n.x, z - n.z) < 5,
        )
      )
        continue;
      const t = this.placeObject(
        makeTree(z < 0 ? 'pine' : 'oak', i + 300),
        x,
        z,
        0.8 + rand() * 0.25,
      );
      this.entity(`outer-tree-${i}`, 'wood', 'Gather timber', x, z, t, 0.6);
      this.blockers.push({ x, z, r: 0.55 });
    }
    const resource = (
      kind: 'ore' | 'clay' | 'mushroom' | 'apple',
      x: number,
      z: number,
      i: number,
    ) => {
      const obj = this.placeObject(makeResource(kind), x, z);
      this.entity(`${kind}-${i}`, kind, `Gather ${kind}`, x, z, obj, 0.7);
    };
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      resource('ore', 29 + Math.cos(a) * 7, -20 + Math.sin(a) * 7, i);
      resource('clay', 24 + Math.cos(a) * 6, -12 + Math.sin(a) * 4, i);
      resource('mushroom', -29 + Math.cos(a) * 7, -8 + Math.sin(a) * 7, i);
    }
    for (let i = 0; i < 8; i++) {
      const x = -36 + (i % 4) * 4,
        z = 18 + Math.floor(i / 4) * 9;
      const tree = this.placeObject(makeTree('oak', i + 900), x, z, 1.05);
      tree.traverse((o) => {
        if (o instanceof THREE.Mesh && o.position.y > 1) {
          o.userData.orchard = true;
        }
      });
      this.blockers.push({ x, z, r: 0.55 });
      resource('apple', x + 1.2, z + 1.2, i);
    }
    // A shallow turquoise pond, reeds, and four marked fishing places.
    const pond = this.addMesh(
      new THREE.CylinderGeometry(5.8, 6.2, 0.1, 48),
      new THREE.MeshStandardMaterial({
        color: 0x4fa5a9,
        roughness: 0.18,
        metalness: 0.3,
      }),
      34,
      heightAt(34, 25) + 0.02,
      25,
    );
    pond.scale.z = 0.66;
    this.blockers.push({ x: 34, z: 25, r: 4.2 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2,
        x = 34 + Math.cos(a) * 6,
        z = 25 + Math.sin(a) * 4;
      this.addMesh(
        new THREE.ConeGeometry(0.13, 0.85, 5),
        mat(0x79965d),
        x,
        heightAt(x, z) + 0.4,
        z,
      );
    }
    for (const [i, pt] of [
      [29, 25],
      [34, 30],
      [39, 25],
      [34, 20],
    ].entries()) {
      const [x, z] = pt;
      const g = this.placeObject(makeResource('fish'), x, z);
      this.entity(`fish-${i}`, 'fish', 'Cast or reel your line', x, z, g, 0.7);
    }
    for (const r of RELIC_LOCATIONS) {
      const g = this.placeObject(makeResource('relic'), r.x, r.z);
      this.entity(r.id, 'relic', r.name, r.x, r.z, g, 0.8);
    }
    // The public spring stays available before a well can be built.
    const spring = this.placeObject(makeStructure('well'), 1, 11, 0.8);
    this.entity('spring', 'spring', 'Refill watering can', 1, 11, spring, 0.9);
    this.blockers.push({ x: 1, z: 11, r: 0.75 });
    this.label('Village spring', 1, 11);
    for (const [key, p] of Object.entries(PROJECT_LOCATIONS)) {
      if (key === 'lighthouse') continue;
      const g = new THREE.Group();
      if (key === 'bridge') {
        g.add(makeStructure('bridge'));
        g.rotation.y = Math.PI / 2;
      } else if (key === 'gate') {
        for (const x of [-2, 2])
          this.addMesh(new THREE.BoxGeometry(0.75, 4, 0.85), stone, x, 2, 0, g);
        this.addMesh(new THREE.BoxGeometry(4.8, 0.7, 0.9), stone, 0, 4.2, 0, g);
      } else {
        this.addMesh(
          new THREE.CylinderGeometry(1, 1.2, 0.25, 8),
          stone,
          0,
          0.13,
          0,
          g,
        );
        this.addMesh(
          new THREE.CylinderGeometry(0.15, 0.15, 1.7, 8),
          wood,
          0,
          1,
          0,
          g,
        );
      }
      const gem = this.addMesh(
        new THREE.OctahedronGeometry(0.45),
        new THREE.MeshStandardMaterial({
          color: 0xf3ce78,
          emissive: 0x815220,
          emissiveIntensity: 0.75,
        }),
        0,
        2.6,
        0,
        g,
      );
      gem.name = 'project-light';
      this.placeObject(g, p.x, p.z);
      this.entity(
        key,
        'project',
        p.name,
        p.x,
        p.z,
        g,
        key === 'gate' ? 2 : 1.5,
      );
      this.label(p.name, p.x, p.z);
    }
    // Cliffs describe the progression boundaries; the central project opens the crossing.
    for (const z of [-30, -42])
      for (let x = -49; x <= 49; x += 4) {
        if (Math.abs(x - (z === -30 ? 0 : -5)) < 4 || !onLand(x, z, 2))
          continue;
        const cliff = this.placeObject(makeRock(x + z + 3000), x, z);
        cliff.scale.set(2.7, 1.5 + rand(), 1.4);
        this.blockers.push({ x, z, r: 2.1 });
      }
  }
  private walkable(x: number, z: number) {
    const s = this.state();
    return (
      onLand(x, z, 0.8) &&
      (z >= -29 || s.projects.bridge) &&
      (z >= -41 || s.projects.gate) &&
      !this.blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 0.25) &&
      !s.buildings
        .filter((b) => b.type !== 'garden')
        .some((b) =>
          circleHits(footprint(b.type, b.x, b.z, b.rotation), {
            x,
            z,
            r: 0.28,
          }),
        )
    );
  }
  private prepareResourceVisuals() {
    for (const e of this.entities) {
      if (!RESOURCE_KINDS.includes(e.kind)) continue;
      const live = e.object,
        parent = live.parent!;
      const root = new THREE.Group();
      root.position.copy(live.position);
      live.position.set(0, 0, 0);
      const remains = makeResourceRemains(e.kind);
      remains.visible = false;
      root.add(live, remains);
      parent.add(root);
      e.object = root;
      this.resourceVisuals.set(e.id, { live, remains });
    }
  }
  private syncResources(now = Date.now()) {
    const s = this.state();
    for (const e of this.entities) {
      const visual = this.resourceVisuals.get(e.id);
      if (!visual) continue;
      const depleted = (s.depleted[e.id] ?? 0) > now;
      visual.live.visible = !depleted;
      visual.remains.visible = depleted;
      e.object.userData.harvested = depleted;
      e.object.userData.harvestedLabel = harvestedLabel(e.kind);
    }
  }
  private equipTool() {
    const tool = this.state().tool;
    if (tool === this.equipped) return;
    this.cancelAction();
    this.equipped = tool;
    this.handMotion.pose(tool, null);
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
    const signal = this.abort.signal,
      el = this.renderer.domElement;
    const emitMode = (mode: LookMode) => {
      this.lookMode = mode;
      this.events.look(mode);
    };
    document.addEventListener(
      'pointerlockchange',
      () => {
        this.requestingLock = false;
        if (document.pointerLockElement === el) {
          if (this.paused || this.lookMode === 'free') {
            this.releaseLook();
            return;
          }
          this.expectedUnlock = false;
          emitMode('locked');
        } else {
          const unexpected =
            this.lookMode === 'locked' && !this.expectedUnlock && !this.paused;
          this.expectedUnlock = false;
          this.keys.clear();
          emitMode('free');
          if (unexpected) this.events.menu('pause');
        }
      },
      { signal },
    );
    document.addEventListener(
      'pointerlockerror',
      () => {
        this.requestingLock = false;
        // Button-free follow look is already active while capture is pending.
      },
      { signal },
    );
    document.addEventListener(
      'mousemove',
      (e) => {
        if (!this.paused && document.pointerLockElement === el) {
          this.turn(e.movementX, e.movementY);
        }
      },
      { signal },
    );
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
          [
            'Space',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'Tab',
          ].includes(e.code) &&
          this.state().started
        )
          e.preventDefault();
        if (e.code === 'Escape' && !e.repeat) {
          if (this.buildType) {
            this.setBuild(null);
            this.events.menu('cancel-build');
          }
          this.events.menu('pause');
          return;
        }
        if (this.paused) return;
        if (e.code === 'Tab' && !e.repeat) {
          if (this.lookMode !== 'free') this.releaseLook();
          else this.requestLook();
          return;
        }
        this.keys.add(e.code);
        if (e.repeat) return;
        if (e.code === 'KeyE') {
          if (this.buildType) this.confirmBuild();
          else this.interact();
        }
        if (e.code === 'KeyB') this.events.menu('build');
        if (e.code === 'KeyC') this.events.menu('craft');
        if (e.code === 'KeyJ') this.events.menu('journal');
        if (e.code === 'KeyI') this.events.menu('inventory');
        if (e.code === 'KeyR') {
          if (this.buildType) this.rotateBuild();
          else if (this.state().tool === 'seeds')
            this.events.menu('cycle-crop');
        }
        if (e.code === 'Enter' && this.buildType) this.confirmBuild();
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
        this.pointerId = null;
        if (!this.paused && this.state().started) this.events.menu('pause');
      },
      { signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && this.state().started) this.events.menu('pause');
      },
      { signal },
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (this.paused) return;
        if (document.pointerLockElement === el) {
          if (e.button === 0) {
            if (this.buildType) this.confirmBuild();
            else this.interact();
          }
          return;
        }
        if (this.pointerId !== null) return;
        this.pointerConsumed = false;
        if (
          e.pointerType === 'mouse' &&
          this.lookMode === 'free' &&
          e.button === 0
        ) {
          this.pointerConsumed = true;
          this.requestLook();
          return;
        }
        if (e.pointerType === 'mouse' && this.lookMode === 'follow') {
          if (e.button === 0) {
            if (this.buildType) this.confirmBuild();
            else this.interact();
          }
          return;
        }
        if (e.pointerType !== 'mouse') {
          this.followPointer = false;
          this.followEdge.set(0, 0);
          emitMode('touch');
        } else if (e.button !== 0 && e.button !== 2) return;
        this.pointerId = e.pointerId;
        this.pointerOrigin.set(e.clientX, e.clientY);
        this.pointerLast.copy(this.pointerOrigin);
        this.pointerDragged = false;
        el.setPointerCapture(e.pointerId);
      },
      { signal },
    );
    el.addEventListener(
      'pointermove',
      (e) => {
        if (this.paused || document.pointerLockElement === el) return;
        if (e.pointerType === 'mouse' && this.lookMode === 'touch')
          this.useMouseLook();
        if (e.pointerType === 'mouse' && this.lookMode === 'follow') {
          if (this.followPointer)
            this.turn(
              e.clientX - this.pointerLast.x,
              e.clientY - this.pointerLast.y,
            );
          this.pointerLast.set(e.clientX, e.clientY);
          this.followPointer = true;
          const r = el.getBoundingClientRect();
          const edge = (v: number, min: number, max: number) =>
            v < min + 32
              ? -Math.max(0, 1 - (v - min) / 32)
              : v > max - 32
                ? Math.max(0, 1 - (max - v) / 32)
                : 0;
          this.followEdge.set(
            edge(e.clientX, r.left, r.right),
            edge(e.clientY, r.top, r.bottom),
          );
          return;
        }
        if (this.pointerId !== e.pointerId) return;
        const dx = e.clientX - this.pointerLast.x,
          dy = e.clientY - this.pointerLast.y;
        this.pointerLast.set(e.clientX, e.clientY);
        if (
          Math.hypot(
            e.clientX - this.pointerOrigin.x,
            e.clientY - this.pointerOrigin.y,
          ) > 5
        )
          this.pointerDragged = true;
        this.turn(dx, dy);
      },
      { signal },
    );
    const resetFollow = () => {
      this.followPointer = false;
      this.followEdge.set(0, 0);
      this.wheelDelta = 0;
    };
    el.addEventListener('pointerenter', resetFollow, { signal });
    el.addEventListener('pointerleave', resetFollow, { signal });
    const endPointer = (e: PointerEvent) => {
      if (this.pointerConsumed) {
        this.pointerConsumed = false;
        return;
      }
      if (this.pointerId !== e.pointerId) return;
      this.pointerId = null;
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
      if (
        e.type === 'pointercancel' ||
        this.paused ||
        this.pointerDragged ||
        e.button === 2
      )
        return;
      const r = el.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        return;
      if (this.buildType) this.confirmBuild();
      else this.interact();
    };
    el.addEventListener('pointerup', endPointer, { signal });
    el.addEventListener('pointercancel', endPointer, { signal });
    el.addEventListener(
      'wheel',
      (e) => {
        if (this.paused) return;
        e.preventDefault();
        if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return;
        const now = performance.now();
        if (
          now - this.lastWheel > 180 ||
          Math.sign(e.deltaY) !== Math.sign(this.wheelDelta)
        )
          this.wheelDelta = 0;
        this.lastWheel = now;
        this.wheelDelta +=
          e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
        if (Math.abs(this.wheelDelta) < 40) return;
        const direction = Math.sign(this.wheelDelta);
        this.wheelDelta = 0;
        const tools: Tool[] = [
          'axe',
          'pickaxe',
          'seeds',
          'water',
          'build',
          'hands',
          'rod',
        ];
        const next =
          (tools.indexOf(this.state().tool) + direction + tools.length) %
          tools.length;
        // Cycling through the hammer must not open a modal or rotate a preview.
        this.events.menu(`tool:${tools[next]}`);
      },
      { signal, passive: false },
    );
  }
  requestLook() {
    if (
      this.paused ||
      this.requestingLock ||
      document.pointerLockElement === this.renderer.domElement
    )
      return;
    if (window.matchMedia('(pointer: coarse)').matches) {
      this.useMouseLook(true);
      return;
    }
    const el = this.renderer.domElement;
    el.focus({ preventScroll: true });
    // Start useful mouse look immediately, even in hosts that deny or ignore capture.
    this.useMouseLook();
    if (typeof el.requestPointerLock !== 'function') return;
    this.requestingLock = true;
    const request = this.lookRequest;
    try {
      const result = el.requestPointerLock();
      if (result && typeof result.catch === 'function')
        void result.catch(() => {
          if (request === this.lookRequest) this.requestingLock = false;
        });
    } catch {
      this.requestingLock = false;
    }
  }
  releaseLook() {
    this.lookRequest++;
    this.requestingLock = false;
    this.expectedUnlock = true;
    this.keys.clear();
    this.pointerId = null;
    this.followPointer = false;
    this.followEdge.set(0, 0);
    this.wheelDelta = 0;
    this.lookMode = 'free';
    this.events.look('free');
    if (document.pointerLockElement === this.renderer.domElement)
      document.exitPointerLock();
  }
  useMouseLook(touch = false) {
    this.releaseLook();
    this.lookMode = touch ? 'touch' : 'follow';
    this.events.look(this.lookMode);
  }
  private turn(dx: number, dy: number) {
    if (this.paused) return;
    lookDelta(this.state().view, dx, dy);
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = this.state().view.fov;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.handRig.scale.x = Math.min(1, w / h / 1.45);
    this.viewCamera.updateProjectionMatrix();
  }
  setQuality(q: 'high' | 'low') {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, q === 'low' ? 1 : 1.6),
    );
    this.renderer.shadowMap.enabled = q === 'high';
    this.resize();
  }
  updateView() {
    this.resize();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.keys.clear();
    this.pointerId = null;
    if (paused) {
      this.releaseLook();
      this.cancelAction();
    }
  }
  hop() {
    if (!this.paused && this.jump <= 0) this.jumpSpeed = 5;
  }
  setMovement(x: number, z: number) {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.keys.delete(k);
    if (x < -0.2) this.keys.add('KeyA');
    if (x > 0.2) this.keys.add('KeyD');
    if (z < -0.2) this.keys.add('KeyW');
    if (z > 0.2) this.keys.add('KeyS');
  }
  private collectAimMeshes(root: THREE.Object3D) {
    const list: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        if (materials.some((m) => !m.transparent || m.opacity > 0.3))
          list.push(o);
      }
    });
    return list;
  }
  private rebuildAimMeshes() {
    this.aimMeshes = [...this.staticAimMeshes];
    for (const g of this.placed.values())
      this.aimMeshes.push(...this.collectAimMeshes(g));
    for (const p of this.plantGroups.values())
      this.aimMeshes.push(...this.collectAimMeshes(p.group));
  }
  private centerHits(reach = INTERACTION_REACH) {
    const state = this.state();
    this.camera.position.set(
      this.player.position.x,
      this.player.position.y + EYE_HEIGHT,
      this.player.position.z,
    );
    this.camera.rotation.set(state.view.pitch, state.view.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
    this.ray.setFromCamera(this.mouse, this.camera);
    this.ray.far = reach;
    return this.ray.intersectObjects(
      this.aimMeshes.filter(visibleInTree),
      false,
    );
  }
  private updateFocus() {
    const focused = aimEntity(this.centerHits(), this.entities);
    if (this.near !== focused) {
      this.near = focused;
      this.events.near(focused);
    }
    return focused;
  }
  interact() {
    if (this.paused || this.action) return;
    const target = this.updateFocus();
    if (!target) {
      if (this.state().tool === 'build') this.events.menu('build');
      return;
    }
    const s = this.state();
    if (!canAnimateInteraction(s, target.kind, target.id)) {
      this.events.interact(target);
      return;
    }
    this.action = {
      tool: s.tool,
      motion: s.tool === 'rod' && s.fishing?.id === target.id ? 'reel' : s.tool,
      elapsed: 0,
      hit: false,
      target,
      requestedAt: Date.now(),
    };
  }
  private cancelAction() {
    this.action = null;
    this.handMotion?.reset();
  }
  private advanceAction(dt: number) {
    const action = this.action;
    if (!action) return;
    if (this.paused || this.state().tool !== action.tool) {
      this.cancelAction();
      return;
    }
    action.elapsed += dt;
    const timing = MOTION_TIMING[action.motion];
    const progress = Math.min(1, action.elapsed / timing.duration);
    this.handMotion.pose(action.motion, progress);
    if (!action.hit && progress >= timing.impact) {
      // Latch before calling game/UI callbacks: an impact can only apply once.
      action.hit = true;
      if (action.target) {
        const current = this.updateFocus();
        if (
          current?.id === action.target.id &&
          !(this.state().depleted[current.id] > Date.now())
        ) {
          const changed = this.events.interact(
            current,
            action.motion === 'reel' ? action.requestedAt : undefined,
          );
          if (changed) this.burst(current.x, current.z, action.tool);
        }
      } else if (action.building) {
        this.updateGhost();
        const b = action.building;
        if (
          this.buildType === b.type &&
          this.rotation === b.rotation &&
          this.validGhost &&
          Math.hypot(this.ghostPoint.x - b.x, this.ghostPoint.z - b.z) < 0.75 &&
          this.canPlace(b.type, b.x, b.z, b.rotation)
        ) {
          this.events.place(b.type, b.x, b.z, b.rotation);
          this.burst(b.x, b.z, 'build');
          this.setBuild(null);
        }
      }
    }
    if (progress >= 1 && this.action === action) this.cancelAction();
  }
  setBuild(type: Structure | null) {
    this.buildType = type;
    this.rotation = 0;
    this.validGhost = false;
    this.lastPlacementMessage = '';
    this.gridCenter.set(999, 999);
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (o.userData.previewFootprint) o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
      this.ghost = null;
    }
    if (this.grid) this.grid.visible = !!type;
    if (!type) {
      this.events.placement(false, '');
      return;
    }
    this.ghost = this.buildModel(type);
    const [w, d] = RECIPES[type].size!;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.045, d),
      new THREE.MeshStandardMaterial({ color: 0x6eef9b }),
    );
    plate.position.y = 0.04;
    plate.userData.previewFootprint = true;
    this.ghost.add(plate);
    this.ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = (o.material as THREE.MeshStandardMaterial).clone();
        if (o === plate) (o.material as THREE.Material).dispose();
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
        o.material = m;
        o.castShadow = false;
      }
    });
    this.scene.add(this.ghost);
    this.ghost.visible = false;
    if (!this.grid) {
      this.grid = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.91, 0.91),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        625,
      );
      this.grid.frustumCulled = false;
      this.scene.add(this.grid);
    }
    this.updateGrid();
    this.events.placement(
      false,
      'Look down at the grid. Green cells fit this building.',
    );
  }
  private buildModel(type: Structure) {
    if (type === 'garden') return new THREE.Group();
    return type === 'cottage'
      ? makeHouse()
      : type === 'workbench'
        ? makeWorkbench()
        : type === 'campfire'
          ? makeCampfire()
          : type === 'fence'
            ? makeFence()
            : makeStructure(type);
  }
  private placementResult(
    type: Structure,
    x: number,
    z: number,
    rotation = this.rotation,
  ) {
    this.state().player = {
      x: this.player.position.x,
      z: this.player.position.z,
    };
    return placement(this.state(), type, x, z, rotation, [
      ...this.blockers,
      ...this.entities
        .filter(
          (e) =>
            [
              'goose',
              'npc',
              'crystal',
              'chest',
              'project',
              'spring',
              'lighthouse',
              'relic',
              'fish',
              'ore',
              'clay',
              'mushroom',
              'apple',
              'fiber',
            ].includes(e.kind) && e.object.visible,
        )
        .map((e) => ({ x: e.x, z: e.z, r: e.radius + 0.35 })),
    ]);
  }
  canPlace(type: Structure, x: number, z: number, rotation = this.rotation) {
    return this.placementResult(type, x, z, rotation).ok;
  }
  rotateBuild() {
    this.rotation = (this.rotation + Math.PI / 2) % (Math.PI * 2);
    this.gridCenter.set(999, 999);
    this.updateGhost();
    this.updateGrid();
  }
  confirmBuild() {
    if (this.paused || !this.buildType || this.action) return;
    this.updateGhost();
    if (this.validGhost) {
      this.action = {
        tool: this.state().tool,
        motion: 'build',
        elapsed: 0,
        hit: false,
        requestedAt: Date.now(),
        building: {
          type: this.buildType,
          x: this.ghostPoint.x,
          z: this.ghostPoint.z,
          rotation: this.rotation,
        },
      };
    }
  }
  private updateGrid() {
    if (!this.grid || !this.buildType) return;
    const p = this.state().player;
    if (Math.hypot(p.x - this.gridCenter.x, p.z - this.gridCenter.y) < 0.7)
      return;
    this.gridCenter.set(p.x, p.z);
    const obj = new THREE.Object3D();
    let n = 0;
    for (let i = -12; i <= 12; i++)
      for (let j = -12; j <= 12; j++) {
        const x = Math.round(p.x) + i,
          z = Math.round(p.z) + j;
        obj.position.set(x, heightAt(x, z) + 0.08, z);
        obj.rotation.x = -Math.PI / 2;
        obj.scale.setScalar(Math.hypot(i, j) <= 14 && onLand(x, z, 1) ? 1 : 0);
        obj.updateMatrix();
        this.grid.setMatrixAt(n, obj.matrix);
        this.grid.setColorAt(
          n,
          new THREE.Color(
            this.canPlace(this.buildType, x, z) ? 0x8ef1a1 : 0xe38562,
          ),
        );
        n++;
      }
    this.grid.instanceMatrix.needsUpdate = true;
    if (this.grid.instanceColor) this.grid.instanceColor.needsUpdate = true;
  }
  private updateGhost() {
    this.validGhost = false;
    if (!this.ghost || !this.buildType) return;
    this.camera.rotation.set(
      this.state().view.pitch,
      this.state().view.yaw,
      0,
      'YXZ',
    );
    this.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(this.mouse, this.camera);
    this.ray.far = 30;
    const hit = this.ray.intersectObject(this.ground)[0];
    if (!hit) {
      this.ghost.visible = false;
      this.events.placement(false, 'Look down at solid ground within 14m.');
      return;
    }
    const x = Math.round(hit.point.x * 2) / 2,
      z = Math.round(hit.point.z * 2) / 2;
    this.ghostPoint.set(x, heightAt(x, z), z);
    this.ghost.position.copy(this.ghostPoint);
    this.ghost.rotation.y = this.rotation;
    this.ghost.visible = true;
    const check = this.placementResult(this.buildType, x, z);
    if (check.ok) {
      const obstruction = this.centerHits(30)[0];
      if (
        obstruction &&
        obstruction.object !== this.ground &&
        obstruction.distance < hit.distance - 0.15
      ) {
        check.ok = false;
        check.reason = 'Something blocks your view. Step to a clear spot.';
      }
    }
    const affordable = canAfford(this.state(), RECIPES[this.buildType].cost);
    this.validGhost = check.ok && affordable;
    const reason =
      check.ok && !affordable
        ? 'Gather the missing materials before placing.'
        : check.reason;
    if (reason !== this.lastPlacementMessage) {
      this.lastPlacementMessage = reason;
      this.events.placement(this.validGhost, reason);
    }
    this.ghost.traverse((o) => {
      if (o instanceof THREE.Mesh)
        (o.material as THREE.MeshStandardMaterial).emissive?.set(
          this.validGhost ? 0x1b6838 : 0x8f1725,
        );
    });
  }
  sync() {
    let changed = false;
    const state = this.state();
    for (const [id, g] of this.placed) {
      if (!state.buildings.some((b) => b.id === id)) {
        this.scene.remove(g);
        this.placed.delete(id);
        changed = true;
        this.entities = this.entities.filter((e) => e.id !== id);
        this.blockers = this.blockers.filter((b) => b.id !== id);
      }
    }
    for (const [id, p] of this.plantGroups) {
      if (!state.plots.some((plot) => plot.id === id)) {
        this.scene.remove(p.group);
        this.plantGroups.delete(id);
        changed = true;
        this.entities = this.entities.filter((e) => e.id !== id);
      }
    }
    for (const b of state.buildings) {
      if (this.placed.has(b.id)) continue;
      const model = this.placeObject(this.buildModel(b.type), b.x, b.z);
      model.rotation.y = b.rotation;
      this.placed.set(b.id, model);
      changed = true;
      if (b.type !== 'garden' && b.type !== 'fence') {
        const kind: Entity['kind'] =
          b.type === 'cottage'
            ? 'cottage'
            : b.type === 'well'
              ? 'spring'
              : b.type === 'market'
                ? 'market'
                : ['coop', 'beehive'].includes(b.type)
                  ? 'production'
                  : 'station';
        this.entity(
          b.id,
          kind,
          RECIPES[b.type].name,
          b.x,
          b.z,
          model,
          Math.max(...RECIPES[b.type].size!) / 2,
        );
      }
    }
    for (const p of state.plots) {
      const stage =
        p.planted === null ? -1 : Math.min(3, Math.floor(growth(p) * 3));
      const existing = this.plantGroups.get(p.id);
      if (
        existing?.stage === stage &&
        existing.watered === p.watered &&
        existing.crop === p.crop
      )
        continue;
      if (existing) {
        this.scene.remove(existing.group);
        this.entities = this.entities.filter((e) => e.id !== p.id);
      }
      changed = true;
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
        const crop = makeCropVariant(p.crop, stage);
        crop.scale.setScalar(0.85);
        g.add(crop);
      }
      this.placeObject(g, p.x, p.z);
      this.plantGroups.set(p.id, {
        group: g,
        stage,
        watered: p.watered,
        crop: p.crop,
      });
      this.entity(
        p.id,
        'plot',
        stage < 0
          ? 'Plant a seed'
          : stage === 3
            ? `Harvest ${CROPS[p.crop].name.toLowerCase()}`
            : p.watered
              ? `${CROPS[p.crop].name} is growing`
              : 'Water the seedlings',
        p.x,
        p.z,
        g,
        0.5,
      );
    }
    const crystal = this.entities.find((e) => e.id === 'crystal');
    if (crystal) crystal.object.visible = !state.stats.explored;
    this.beacon.visible = state.projects.lighthouse;
    for (const e of this.entities) {
      if (e.kind === 'relic')
        e.object.visible = !state.collected.includes(e.id);
      if (e.kind === 'project') {
        e.object.userData.complete =
          state.projects[e.id as keyof typeof state.projects];
        const c = e.object.getObjectByName('project-light') as
          | THREE.Mesh
          | undefined;
        if (c)
          (c.material as THREE.MeshStandardMaterial).emissive.set(
            e.object.userData.complete ? 0x55c8a2 : 0x815220,
          );
      }
    }
    if (changed) this.rebuildAimMeshes();
    this.equipTool();
    this.syncResources();
  }
  burst(x: number, z: number, tool?: Tool) {
    let surface = this.resourceMat;
    if (tool) {
      const colors = {
        axe: 0xc79358,
        pickaxe: 0xa6b6b4,
        hands: 0x9cc878,
        seeds: 0xe2bb69,
        water: 0x80dfe9,
        build: 0xffd781,
        rod: 0x80dfe9,
      };
      if (!this.actionMaterials.has(tool))
        this.actionMaterials.set(
          tool,
          new THREE.MeshBasicMaterial({ color: colors[tool] }),
        );
      surface = this.actionMaterials.get(tool)!;
    }
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(
        tool === 'axe' ? this.chipGeo : this.resourceGeo,
        surface,
      );
      mesh.position.set(x, heightAt(x, z) + (tool === 'axe' ? 1.2 : 0.45), z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
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
      valid = (x: number, z: number) => onLand(x, z, 1) && this.walkable(x, z);
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
  private tick = (stamp: number) => {
    const dt = Math.min((stamp - this.last) / 1000 || 0.016, 0.05);
    this.last = stamp;
    this.clock += dt;
    this.water.material.uniforms.time.value = this.clock;
    const s = this.state();
    if (!this.paused) {
      s.elapsed += dt;
      if (this.lookMode === 'follow' && this.followPointer)
        this.turn(this.followEdge.x * dt * 650, this.followEdge.y * dt * 450);
      let strafe = 0,
        forward = 0;
      if (this.keys.has('KeyW')) forward++;
      if (this.keys.has('KeyS')) forward--;
      if (this.keys.has('KeyA')) strafe--;
      if (this.keys.has('KeyD')) strafe++;
      const turnRate = 90 * dt;
      if (this.keys.has('ArrowLeft')) this.turn(-turnRate * 6, 0);
      if (this.keys.has('ArrowRight')) this.turn(turnRate * 6, 0);
      if (this.keys.has('ArrowUp')) this.turn(0, -turnRate * 6);
      if (this.keys.has('ArrowDown')) this.turn(0, turnRate * 6);
      let { x: dx, z: dz } = walkDirection(s.view.yaw, strafe, forward);
      const moving = Math.hypot(dx, dz) > 0.01,
        sprint =
          (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) &&
          this.stamina > 8;
      this.stamina = THREE.MathUtils.clamp(
        this.stamina + (moving && sprint ? -15 : 14) * dt,
        0,
        100,
      );
      if (moving) {
        const len = Math.hypot(dx, dz),
          speed = (sprint ? 5.8 : 3.6) * dt;
        dx = (dx / len) * speed;
        dz = (dz / len) * speed;
        const p = this.player.position;
        const allowed = (x: number, z: number) => this.walkable(x, z);
        if (allowed(p.x + dx, p.z)) {
          p.x += dx;
        }
        if (allowed(p.x, p.z + dz)) {
          p.z += dz;
        }
      }
      if (this.jumpSpeed !== 0 || this.jump > 0) {
        this.jumpSpeed -= 14 * dt;
        this.jump = Math.max(0, this.jump + this.jumpSpeed * dt);
        if (this.jump === 0) this.jumpSpeed = 0;
      }
      this.player.position.y =
        heightAt(this.player.position.x, this.player.position.z) + this.jump;
      s.player = { x: this.player.position.x, z: this.player.position.z };
      this.headOffset =
        s.view.bob && moving
          ? Math.sin(this.clock * (sprint ? 13 : 9)) * 0.025
          : 0;
      this.camera.position.set(
        s.player.x,
        this.player.position.y + EYE_HEIGHT + this.headOffset,
        s.player.z,
      );
      this.camera.rotation.set(s.view.pitch, s.view.yaw, 0, 'YXZ');
      this.advanceAction(dt);
      this.handRig.position.set(
        moving && !this.action ? Math.sin(this.clock * 7) * 0.012 : 0,
        moving && !this.action ? Math.abs(Math.sin(this.clock * 7)) * 0.008 : 0,
        0,
      );
      if (this.clock - this.lastAim > 0.065) {
        this.updateFocus();
        this.lastAim = this.clock;
      }
      if (this.clock - this.lastUi > 0.16) {
        s.player = { x: this.player.position.x, z: this.player.position.z };
        this.events.move(s.player.x, s.player.z, this.stamina);
        this.lastUi = this.clock;
        this.sync();
      }
    }
    if (
      this.buildType &&
      !this.paused &&
      this.clock - this.lastBuildAim > 0.05
    ) {
      this.updateGrid();
      this.updateGhost();
      this.lastBuildAim = this.clock;
    }
    this.sun.position.set(
      this.player.position.x - 18,
      36,
      this.player.position.z + 15,
    );
    this.sun.target.position.set(
      this.player.position.x,
      0,
      this.player.position.z,
    );
    if (!s.started) {
      this.camera.position.set(22, 18, 28);
      this.camera.lookAt(0, 1, 3);
    } else if (this.paused) {
      this.camera.position.set(
        this.player.position.x,
        this.player.position.y + EYE_HEIGHT + this.headOffset,
        this.player.position.z,
      );
      this.camera.rotation.set(s.view.pitch, s.view.yaw, 0, 'YXZ');
    }
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
    if (s.started) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
      this.renderer.autoClear = true;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    this.releaseLook();
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
    this.scene.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    disposeAssetLibrary();
    disposeExtraModelLibrary();
    disposeFirstPersonModels();
    disposeResourceRemains();
    this.resourceGeo.dispose();
    this.resourceMat.dispose();
    this.chipGeo.dispose();
    this.actionMaterials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
