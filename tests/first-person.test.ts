/* oxlint-disable typescript/no-explicit-any -- Synthetic browser surfaces exercise input without a browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_VIEW,
  normalizeView,
  lookDelta,
  walkDirection,
  viewHeading,
  aimEntity,
  EYE_HEIGHT,
  visibleInTree,
} from '../lib/game/first-person';
import { makeFirstPersonRig } from '../lib/game/first-person-models';
import { initialState, parseSave, gather, farm } from '../lib/game/state';
import {
  FirstPersonMotion,
  MOTION_TIMING,
  type MotionAction,
} from '../lib/game/first-person-motion';
import { makeResourceRemains } from '../lib/game/resource-remains';
import {
  regrowthSeconds,
  resourceRegrowthSeconds,
} from '../lib/game/resource-status';
import {
  canAnimateInteraction,
  interactionSnapshot,
} from '../lib/game/interactions';
import { IslandWorld } from '../lib/game/world';
import { heightAt } from '../lib/game/terrain';

void test('first-person forward motion follows yaw and never changes elevation with pitch', () => {
  assert.deepEqual(walkDirection(0, 0, 1), { x: 0, z: -1 });
  const east = walkDirection(-Math.PI / 2, 0, 1);
  assert.ok(Math.abs(east.x - 1) < 1e-9);
  assert.ok(Math.abs(east.z) < 1e-9);
  assert.ok(
    Math.abs(Math.hypot(...Object.values(walkDirection(1, 1, 1))) - 1) < 1e-9,
  );
  assert.equal(viewHeading(0), 0);
  assert.equal(viewHeading(-Math.PI / 2), 90);
  const v = { ...DEFAULT_VIEW, yaw: 0, pitch: 0 };
  lookDelta(v, 100, 100);
  assert.ok(v.yaw < 0 && v.pitch < 0);
  lookDelta(v, 0, 1e7);
  assert.equal(v.pitch, -1.45);
  lookDelta(v, 0, -1e7);
  assert.equal(v.pitch, 1.45);
});
void test('existing saves get comfortable first-person defaults and view settings round-trip safely', () => {
  const old: any = initialState();
  delete old.view;
  old.inventory.wood = 35;
  const migrated = parseSave(JSON.stringify(old))!;
  assert.deepEqual(migrated.view, DEFAULT_VIEW);
  assert.equal(migrated.inventory.wood, 35);
  migrated.view = { yaw: 1, pitch: -0.5, fov: 90, sensitivity: 0.7, bob: true };
  assert.deepEqual(parseSave(JSON.stringify(migrated))!.view, migrated.view);
  const bad = normalizeView({
    yaw: Infinity,
    pitch: 90,
    fov: 180,
    sensitivity: -1,
    bob: 'yes',
  });
  assert.equal(bad.yaw, DEFAULT_VIEW.yaw);
  assert.equal(bad.pitch, 1.45);
  assert.equal(bad.fov, 95);
  assert.equal(bad.sensitivity, 0.3);
  assert.equal(bad.bob, false);
});
void test('crosshair selects the front object, never reaches through scenery or outside reach', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(75, 1, 0.06, 100),
    ray = new THREE.Raycaster();
  const target = new THREE.Group(),
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
  target.add(mesh);
  target.position.z = -3;
  scene.add(target);
  const entity = { id: 'target', object: target },
    cast = () => {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2(), camera);
      return ray.intersectObjects(scene.children, true);
    };
  assert.equal(aimEntity(cast(), [entity]), entity);
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 0.2),
    new THREE.MeshBasicMaterial(),
  );
  wall.position.z = -1;
  scene.add(wall);
  assert.equal(aimEntity(cast(), [entity]), null);
  wall.visible = false;
  assert.equal(aimEntity(cast(), [entity]), entity);
  target.position.z = -8;
  assert.equal(aimEntity(cast(), [entity]), null);
  target.position.z = 3;
  assert.equal(aimEntity(cast(), [entity]), null);
  target.position.z = -3;
  target.visible = false;
  assert.equal(aimEntity(cast(), [entity]), null);
});
void test('all seven held-tool silhouettes remain in front of the camera and away from the crosshair', () => {
  const rig = makeFirstPersonRig(),
    camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.025, 4);
  camera.updateMatrixWorld();
  let total = 0;
  rig.traverse((o) => {
    if (o instanceof THREE.Mesh) total++;
  });
  assert.ok(total < 90);
  for (const name of [
    'axe',
    'pickaxe',
    'seeds',
    'water',
    'build',
    'hands',
    'rod',
  ]) {
    const tool = rig.getObjectByName(`tool-${name}`)!;
    assert.ok(tool);
    const box = new THREE.Box3().setFromObject(tool);
    assert.ok(box.max.z < -0.06, name);
    let visible = 0;
    tool.updateWorldMatrix(true, true);
    tool.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(o.matrixWorld)
            .project(camera);
          if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1) visible++;
        }
      }
    });
    assert.ok(visible > 0, name + ' visible');
  }
});
function event(type: string, props: Record<string, unknown> = {}) {
  return Object.assign(new Event(type, { cancelable: true }), props);
}
function inputHarness(failLock = false) {
  const s = initialState();
  s.started = true;
  const doc: any = new EventTarget(),
    win: any = new EventTarget(),
    el: any = new EventTarget();
  doc.pointerLockElement = null;
  doc.hidden = false;
  win.matches = () => false;
  win.matchMedia = () => ({ matches: false });
  el.matches = () => false;
  el.focus = () => {};
  el.setPointerCapture = () => {};
  el.hasPointerCapture = () => false;
  el.releasePointerCapture = () => {};
  el.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
  });
  let requests = 0,
    uses = 0,
    places = 0;
  const modes: string[] = [],
    menus: string[] = [];
  el.requestPointerLock = () => {
    requests++;
    if (failLock) throw new Error('blocked');
    doc.pointerLockElement = el;
    doc.dispatchEvent(event('pointerlockchange'));
  };
  doc.exitPointerLock = () => {
    doc.pointerLockElement = null;
    doc.dispatchEvent(event('pointerlockchange'));
  };
  const oldDoc = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    oldWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'document', {
    value: doc,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: win,
    configurable: true,
  });
  const w: any = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    state: () => s,
    renderer: { domElement: el },
    abort: new AbortController(),
    keys: new Set(),
    paused: false,
    lookMode: 'free',
    expectedUnlock: false,
    requestingLock: false,
    lookRequest: 0,
    followPointer: false,
    followEdge: new THREE.Vector2(),
    wheelDelta: 0,
    lastWheel: 0,
    pointerId: null,
    pointerOrigin: new THREE.Vector2(),
    pointerLast: new THREE.Vector2(),
    pointerDragged: false,
    pointerConsumed: false,
    jump: 0,
    events: {
      look: (m: string) => modes.push(m),
      menu: (m: string) => {
        menus.push(m);
        if (['pause', 'craft'].includes(m)) w.setPaused(true);
        if (m.startsWith('tool:')) {
          s.tool = m.slice(5) as typeof s.tool;
          w.buildType = null;
        }
      },
    },
    interact: () => uses++,
    confirmBuild: () => places++,
  });
  w.bind();
  return {
    s,
    w,
    doc,
    win,
    el,
    modes,
    menus,
    counts: () => ({ requests, uses, places }),
    cleanup: () => {
      w.abort.abort();
      if (oldDoc) Object.defineProperty(globalThis, 'document', oldDoc);
      else delete (globalThis as any).document;
      if (oldWin) Object.defineProperty(globalThis, 'window', oldWin);
      else delete (globalThis as any).window;
    },
  };
}
void test('first click captures without acting; Tab frees the mouse; menus release it without recapture', () => {
  const h = inputHarness();
  try {
    h.el.dispatchEvent(
      event('pointerdown', {
        pointerType: 'mouse',
        pointerId: 1,
        button: 0,
        clientX: 500,
        clientY: 350,
      }),
    );
    h.el.dispatchEvent(
      event('pointerup', {
        pointerType: 'mouse',
        pointerId: 1,
        button: 0,
        clientX: 500,
        clientY: 350,
      }),
    );
    assert.deepEqual(h.counts(), { requests: 1, uses: 0, places: 0 });
    const yaw = h.s.view.yaw;
    h.doc.dispatchEvent(event('mousemove', { movementX: 40, movementY: 10 }));
    assert.notEqual(h.s.view.yaw, yaw);
    h.el.dispatchEvent(
      event('pointerdown', { pointerType: 'mouse', pointerId: 2, button: 0 }),
    );
    assert.equal(h.counts().uses, 1);
    h.win.dispatchEvent(event('keydown', { code: 'Tab', repeat: false }));
    assert.equal(h.doc.pointerLockElement, null);
    const freeYaw = h.s.view.yaw;
    h.doc.dispatchEvent(event('mousemove', { movementX: 40, movementY: 10 }));
    assert.equal(h.s.view.yaw, freeYaw);
    assert.equal(h.menus.length, 0);
    h.w.requestLook();
    h.win.dispatchEvent(event('keydown', { code: 'KeyC', repeat: false }));
    assert.equal(h.w.paused, true);
    assert.equal(h.doc.pointerLockElement, null);
    assert.equal(h.w.keys.size, 0);
    h.w.setPaused(false);
    assert.equal(h.counts().requests, 2);
  } finally {
    h.cleanup();
  }
});
void test('blocked mouse capture falls back to button-free look, and touch drags never trigger an action', () => {
  const h = inputHarness(true);
  try {
    h.w.requestLook();
    assert.equal(h.modes.at(-1), 'follow');
    assert.equal(h.w.requestingLock, false);
    const down = {
      pointerType: 'touch',
      pointerId: 9,
      button: 0,
      clientX: 500,
      clientY: 300,
    };
    h.el.dispatchEvent(event('pointerdown', down));
    const yaw = h.s.view.yaw;
    h.el.dispatchEvent(event('pointermove', { ...down, clientX: 600 }));
    h.el.dispatchEvent(event('pointerup', { ...down, clientX: 600 }));
    assert.notEqual(h.s.view.yaw, yaw);
    assert.equal(h.counts().uses, 0);
    h.el.dispatchEvent(event('pointerdown', down));
    h.el.dispatchEvent(event('pointerup', down));
    assert.equal(h.counts().uses, 1);
    h.el.dispatchEvent(event('pointerdown', down));
    h.el.dispatchEvent(event('pointercancel', down));
    assert.equal(h.counts().uses, 1);
    assert.equal(h.w.pointerId, null);
  } finally {
    h.cleanup();
  }
});
void test('unexpected mouse capture loss pauses and mouse movement cannot rotate a paused view', () => {
  const h = inputHarness();
  try {
    h.w.requestLook();
    h.doc.pointerLockElement = null;
    h.doc.dispatchEvent(event('pointerlockchange'));
    assert.ok(h.menus.includes('pause'));
    const yaw = h.s.view.yaw;
    h.doc.dispatchEvent(event('mousemove', { movementX: 100, movementY: 50 }));
    assert.equal(h.s.view.yaw, yaw);
  } finally {
    h.cleanup();
  }
});
void test('every resident, relic, fishing spot and community project has an unobstructed first-person approach', () => {
  const s = initialState();
  s.projects.bridge = true;
  s.projects.gate = true;
  const w: any = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    scene: new THREE.Scene(),
    state: () => s,
    entities: [],
    blockers: [],
    clouds: [],
    label: () => {},
  });
  w.createTerrain();
  w.createVillage();
  w.createNature();
  w.createExpansion();
  w.scene.updateMatrixWorld(true);
  const meshes = w.collectAimMeshes(w.scene).filter(visibleInTree),
    ray = new THREE.Raycaster();
  ray.far = 4.5;
  for (const e of w.entities.filter((e: any) =>
    [
      'npc',
      'goose',
      'crystal',
      'project',
      'lighthouse',
      'relic',
      'fish',
      'spring',
    ].includes(e.kind),
  )) {
    let found = false;
    const aimPoints: THREE.Vector3[] = [];
    e.object.traverse((o: any) => {
      if (o instanceof THREE.Mesh) {
        const box = new THREE.Box3().setFromObject(o);
        aimPoints.push(box.getCenter(new THREE.Vector3()));
      }
    });
    for (let radius = 1; radius <= 4 && !found; radius += 0.75)
      for (let n = 0; n < 16 && !found; n++) {
        const a = (n / 16) * Math.PI * 2,
          x = e.x + Math.cos(a) * radius,
          z = e.z + Math.sin(a) * radius;
        if (!w.walkable(x, z)) continue;
        const eye = new THREE.Vector3(x, heightAt(x, z) + EYE_HEIGHT, z);
        for (const target of aimPoints) {
          ray.set(eye, target.clone().sub(eye).normalize());
          if (
            aimEntity(ray.intersectObjects(meshes, false), w.entities) === e
          ) {
            found = true;
            break;
          }
        }
      }
    assert.ok(
      found,
      `${e.id} has a visible surface within reach from walkable ground`,
    );
  }
});
void test('first-person placement follows current heading, uses live feet position, and rejects occluded ground', () => {
  const s = initialState();
  s.inventory.wood = 20;
  s.inventory.stone = 20;
  s.plots = [];
  s.player = { x: 30, z: 30 };
  s.view = { ...DEFAULT_VIEW, yaw: 0, pitch: -0.3 };
  const scene = new THREE.Scene(),
    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial(),
    );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = heightAt(0, 0);
  scene.add(ground);
  scene.updateMatrixWorld(true);
  const player = new THREE.Group();
  player.position.set(0, heightAt(0, 0), 0);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.06, 100);
  camera.position.set(0, heightAt(0, 0) + EYE_HEIGHT, 0);
  camera.updateMatrixWorld(true);
  const w: any = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    state: () => s,
    scene,
    ground,
    player,
    camera,
    headOffset: 0,
    mouse: new THREE.Vector2(),
    ray: new THREE.Raycaster(),
    ghost: new THREE.Group(),
    ghostPoint: new THREE.Vector3(),
    buildType: 'workbench',
    rotation: 0,
    blockers: [],
    entities: [],
    aimMeshes: [ground],
    events: { placement: () => {} },
    lastPlacementMessage: '',
  });
  w.updateGhost();
  assert.equal(w.validGhost, true);
  assert.ok(w.ghostPoint.z < -4);
  assert.deepEqual(s.player, { x: 0, z: 0 });
  s.view.yaw = Math.PI / 2;
  w.updateGhost();
  assert.equal(w.validGhost, true);
  assert.ok(w.ghostPoint.x < -4);
  assert.ok(Math.abs(w.ghostPoint.z) < 0.1);
  s.view.yaw = 0;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 0.2),
    new THREE.MeshStandardMaterial(),
  );
  wall.position.set(0, 1.5, -2);
  scene.add(wall);
  w.aimMeshes.push(wall);
  w.updateGhost();
  assert.equal(w.validGhost, false);
  assert.match(w.lastPlacementMessage, /blocks your view/);
  s.view.pitch = 0.2;
  w.updateGhost();
  assert.equal(w.validGhost, false);
  assert.equal(w.ghost.visible, false);
});

void test('fallback follows mouse without buttons, resets on re-entry, and Tab frees it', () => {
  const h = inputHarness(true);
  try {
    h.w.requestLook();
    const move = (x: number, y = 350) =>
      h.el.dispatchEvent(
        event('pointermove', {
          pointerType: 'mouse',
          pointerId: 1,
          buttons: 0,
          clientX: x,
          clientY: y,
        }),
      );
    const start = h.s.view.yaw;
    move(500);
    assert.equal(h.s.view.yaw, start, 'first event establishes position');
    move(560, 340);
    assert.notEqual(h.s.view.yaw, start, 'no mouse button required');
    const turned = h.s.view.yaw;
    h.el.dispatchEvent(event('pointerleave'));
    h.el.dispatchEvent(event('pointerenter'));
    move(10);
    assert.equal(h.s.view.yaw, turned, 're-entry does not jump');
    assert.ok(h.w.followEdge.x < 0, 'edge continuation supports full turns');
    h.el.dispatchEvent(
      event('pointerdown', { pointerType: 'mouse', pointerId: 1, button: 0 }),
    );
    assert.equal(h.counts().uses, 1);
    h.win.dispatchEvent(event('keydown', { code: 'Tab', repeat: false }));
    move(400);
    assert.equal(h.s.view.yaw, turned);
    assert.equal(h.w.followEdge.length(), 0);
    assert.equal(h.modes.at(-1), 'free');
  } finally {
    h.cleanup();
  }
});
void test('wheel cycles all tools through hammer without opening menus, wraps, and ignores zero or paused input', () => {
  const h = inputHarness();
  try {
    const wheel = (deltaY: number, deltaMode = 0) =>
      h.el.dispatchEvent(event('wheel', { deltaY, deltaMode }));
    wheel(0);
    assert.equal(h.menus.length, 0);
    wheel(12);
    wheel(12);
    wheel(12);
    assert.equal(h.s.tool, 'axe');
    wheel(12);
    assert.equal(h.s.tool, 'pickaxe');
    wheel(100);
    wheel(100);
    wheel(100);
    assert.equal(h.s.tool, 'build');
    assert.equal(h.w.paused, false);
    h.w.buildType = 'cottage';
    wheel(100);
    assert.equal(h.s.tool, 'hands');
    assert.equal(h.w.buildType, null);
    wheel(100);
    wheel(100);
    assert.equal(h.s.tool, 'axe');
    wheel(-3, 1);
    assert.equal(h.s.tool, 'rod');
    assert.ok(
      h.menus.every((m) => m.startsWith('tool:')),
      'no build modal interrupts cycling',
    );
    h.w.setPaused(true);
    wheel(100);
    assert.equal(h.s.tool, 'rod');
    assert.equal(h.w.wheelDelta, 0);
  } finally {
    h.cleanup();
  }
});
void test('late rejected capture cannot reactivate mouse look after Tab or a menu', async () => {
  const h = inputHarness();
  try {
    let reject!: (reason: Error) => void;
    h.el.requestPointerLock = () =>
      new Promise<void>((_resolve, r) => {
        reject = r;
      });
    h.w.requestLook();
    assert.equal(h.w.lookMode, 'follow');
    h.w.releaseLook();
    reject(new Error('denied late'));
    await Promise.resolve();
    assert.equal(h.w.lookMode, 'free');
    assert.equal(h.w.requestingLock, false);
    h.doc.pointerLockElement = h.el;
    h.doc.dispatchEvent(event('pointerlockchange'));
    assert.equal(
      h.doc.pointerLockElement,
      null,
      'late granted capture also exits',
    );
  } finally {
    h.cleanup();
  }
});

void test('articulated motions have distinct visible strokes, keep tool and grip together, and return exactly to rest', () => {
  const rig = makeFirstPersonRig(),
    motion = new FirstPersonMotion(rig);
  const right = rig.getObjectByName('right-hand')!,
    left = rig.getObjectByName('left-hand')!;
  const signatures = new Set<string>();
  for (const action of Object.keys(MOTION_TIMING) as MotionAction[]) {
    const tool = rig.getObjectByName(
      `tool-${action === 'reel' ? 'rod' : action}`,
    )!;
    motion.pose(action, null);
    rig.updateMatrixWorld(true);
    const rest = right.getWorldPosition(new THREE.Vector3());
    const relativeGrip = right.matrixWorld
      .clone()
      .invert()
      .multiply(tool.matrixWorld);
    const handScale = right.scale.clone();
    motion.pose(action, MOTION_TIMING[action].impact);
    rig.updateMatrixWorld(true);
    const strike = right.getWorldPosition(new THREE.Vector3());
    assert.ok(strike.distanceTo(rest) > 0.06, action + ' visibly moves');
    signatures.add(
      strike
        .toArray()
        .map((n) => n.toFixed(3))
        .join(','),
    );
    if (action !== 'hands') {
      const atHit = right.matrixWorld
        .clone()
        .invert()
        .multiply(tool.matrixWorld);
      assert.ok(
        atHit.elements.every(
          (n, i) => Math.abs(n - relativeGrip.elements[i]) < 1e-6,
        ),
        action + ' stays gripped',
      );
    } else {
      assert.notDeepEqual(
        right.scale.toArray(),
        handScale.toArray(),
        'grasp closes the hand',
      );
      assert.ok(
        left.getWorldPosition(new THREE.Vector3()).z < -0.7,
        'both hands reach forward',
      );
    }
    for (let i = 0; i <= 20; i++) {
      motion.pose(action, i / 20);
      rig.updateMatrixWorld(true);
      rig.traverseVisible((o) => {
        if (o instanceof THREE.Mesh) {
          const bounds = new THREE.Box3().setFromObject(o);
          assert.ok(
            bounds.max.z < -0.04,
            action + ' stays ahead of near plane',
          );
          assert.ok(o.matrixWorld.elements.every(Number.isFinite));
        }
      });
    }
    motion.reset();
    rig.updateMatrixWorld(true);
    assert.ok(
      right.getWorldPosition(new THREE.Vector3()).distanceTo(rest) < 1e-8,
      action + ' returns exactly to rest',
    );
    assert.deepEqual(right.scale.toArray(), handScale.toArray());
  }
  assert.equal(signatures.size, 8);
  const pick = rig.getObjectByName('tool-pickaxe')!;
  const head = pick.children[1];
  motion.pose('pickaxe', 0.38);
  rig.updateMatrixWorld(true);
  const raised = head.getWorldPosition(new THREE.Vector3());
  motion.pose('pickaxe', 0.56);
  rig.updateMatrixWorld(true);
  const struck = head.getWorldPosition(new THREE.Vector3());
  assert.ok(
    raised.y - struck.y > 0.3,
    'pickaxe goes down from overhead into strike',
  );
  assert.ok(struck.z < raised.z, 'strike travels forward');
});
void test('harvested models are low remains, hide the entire live node, and restore saved cooldowns without shrinking geometry', () => {
  let state = initialState();
  const w: any = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    scene: new THREE.Scene(),
    state: () => state,
    entities: [],
    resourceVisuals: new Map(),
  });
  const now = Date.now();
  for (const kind of [
    'wood',
    'stone',
    'fiber',
    'ore',
    'clay',
    'mushroom',
    'apple',
  ]) {
    const live = new THREE.Group();
    const shape = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6));
    shape.position.y = 2;
    live.add(shape);
    live.position.set(w.entities.length * 2, 0, 0);
    live.scale.set(0.8, 1.1, 0.9);
    w.scene.add(live);
    w.entities.push({
      id: kind,
      kind,
      name: kind,
      object: live,
      x: live.position.x,
      z: 0,
      radius: 0.6,
    });
    const remains = makeResourceRemains(kind);
    const box = new THREE.Box3().setFromObject(remains);
    assert.ok(
      box.max.y < 0.45 && box.min.y >= -0.001,
      kind + ' visibly short and grounded',
    );
    state.depleted[kind] = now + 60000;
  }
  w.prepareResourceVisuals();
  w.syncResources(now);
  for (const e of w.entities) {
    const { live, remains } = w.resourceVisuals.get(e.id);
    assert.equal(live.visible, false);
    assert.equal(remains.visible, true);
    assert.equal(
      visibleInTree(live.children[0]),
      false,
      'harvested tree cannot block crosshair at eye height',
    );
    assert.deepEqual(
      live.scale.toArray(),
      [0.8, 1.1, 0.9],
      'original dimensions remain intact',
    );
    assert.equal(regrowthSeconds(state.depleted, e.id, now + 1000), 59);
  }
  state = parseSave(JSON.stringify(state))!;
  assert.ok(state);
  w.syncResources(now + 59000);
  assert.equal(
    w.resourceVisuals.get('wood').live.visible,
    false,
    'load respects remaining time',
  );
  w.syncResources(now + 60001);
  for (const { live, remains } of w.resourceVisuals.values()) {
    assert.equal(live.visible, true);
    assert.equal(remains.visible, false);
    assert.deepEqual(live.scale.toArray(), [0.8, 1.1, 0.9]);
  }
});
void test('harvesting occurs exactly at impact; repeated input, misses, tool changes and pause cannot award extra resources', () => {
  const s = initialState(),
    rig = makeFirstPersonRig();
  const target = {
    id: 'tree-test',
    kind: 'wood',
    name: 'Timber',
    x: 0,
    z: 0,
    radius: 0.5,
    object: new THREE.Group(),
  };
  let focused: typeof target | null = target,
    uses = 0,
    bursts = 0;
  const w: any = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    state: () => s,
    paused: false,
    action: null,
    handRig: rig,
    handMotion: new FirstPersonMotion(rig),
    updateFocus: () => focused,
    events: {
      interact: () => {
        const before = interactionSnapshot(s, target.id);
        uses++;
        gather(s, target.id, 'wood');
        return before !== interactionSnapshot(s, target.id);
      },
    },
    burst: () => bursts++,
  });
  const timber = s.inventory.wood;
  w.interact();
  w.interact();
  w.advanceAction(0.1);
  assert.equal(s.inventory.wood, timber, 'windup does not harvest');
  w.advanceAction(0.2);
  assert.equal(s.inventory.wood, timber + 4);
  assert.equal(uses, 1);
  assert.equal(bursts, 1);
  w.interact();
  w.advanceAction(0.5);
  assert.equal(uses, 1);
  assert.equal(w.action, null);
  w.interact();
  assert.equal(w.action, null);
  assert.equal(
    s.inventory.wood,
    timber + 4,
    'depleted node never swings or pays twice',
  );
  delete s.depleted[target.id];
  w.interact();
  focused = null;
  w.advanceAction(0.8);
  assert.equal(
    s.inventory.wood,
    timber + 4,
    'looking away before impact misses',
  );
  focused = target;
  w.interact();
  s.tool = 'hands';
  w.advanceAction(0.8);
  assert.equal(w.action, null);
  assert.equal(s.inventory.wood, timber + 4);
  s.tool = 'axe';
  w.interact();
  w.paused = true;
  w.advanceAction(0.8);
  assert.equal(w.action, null);
  assert.equal(s.inventory.wood, timber + 4);
});
void test('unavailable planting, watering, forage and fishing do not animate a successful action', () => {
  const s = initialState();
  const p = s.plots[0];
  s.tool = 'seeds';
  s.inventory.seed = 0;
  assert.equal(canAnimateInteraction(s, 'plot', p.id), false);
  s.inventory.seed = 10;
  assert.equal(canAnimateInteraction(s, 'plot', p.id), true);
  farm(s, p.id);
  s.tool = 'water';
  s.water = 0;
  assert.equal(canAnimateInteraction(s, 'plot', p.id), false);
  s.water = 10;
  assert.equal(canAnimateInteraction(s, 'plot', p.id), true);
  farm(s, p.id);
  assert.equal(
    canAnimateInteraction(s, 'plot', p.id),
    false,
    'already watered',
  );
  s.tool = 'hands';
  assert.equal(canAnimateInteraction(s, 'mushroom', 'mushroom-1'), false);
  s.tool = 'rod';
  assert.equal(canAnimateInteraction(s, 'fish', 'fish-1'), false);
  s.counters['talk:fisher'] = 1;
  const now = Date.now();
  s.fishing = { id: 'fish-1', biteAt: now + 1000, expiresAt: now + 8000 };
  assert.equal(canAnimateInteraction(s, 'fish', 'fish-1', now), false);
  assert.equal(canAnimateInteraction(s, 'fish', 'fish-1', now + 1000), true);
});

void test('building commits on hammer impact, rechecks the chosen footprint, and cancels safely', () => {
  const s = initialState();
  s.tool = 'build';
  const rig = makeFirstPersonRig();
  let placed = 0;
  const w: any = Object.create(IslandWorld.prototype);
  Object.assign(w, {
    state: () => s,
    paused: false,
    action: null,
    buildType: 'cottage',
    rotation: 0,
    ghostPoint: new THREE.Vector3(8, 0, 8),
    validGhost: true,
    handMotion: new FirstPersonMotion(rig),
    updateGhost: () => {},
    canPlace: () => true,
    setBuild: (type: string | null) => {
      w.buildType = type;
    },
    burst: () => {},
    events: { place: () => placed++ },
  });
  w.confirmBuild();
  w.confirmBuild();
  w.advanceAction(0.1);
  assert.equal(placed, 0);
  w.advanceAction(0.2);
  assert.equal(placed, 1);
  assert.equal(w.buildType, null);
  w.advanceAction(0.5);
  assert.equal(placed, 1);
  w.buildType = 'cottage';
  w.confirmBuild();
  w.ghostPoint.x += 3;
  w.advanceAction(0.8);
  assert.equal(
    placed,
    1,
    'moving aim before the strike never builds the old footprint',
  );
  w.confirmBuild();
  w.setBuild(null);
  w.advanceAction(0.8);
  assert.equal(placed, 1, 'cancelled plan does not build later');
});

void test('resource HUD never treats supply chest or other timed stations as harvested plants', () => {
  const now = Date.now(),
    depleted = { supplies: now + 60000, tree: now + 30000 };
  assert.equal(
    resourceRegrowthSeconds(depleted, { id: 'supplies', kind: 'chest' }, now),
    0,
  );
  assert.equal(
    resourceRegrowthSeconds(depleted, { id: 'tree', kind: 'wood' }, now),
    30,
  );
  assert.equal(resourceRegrowthSeconds(depleted, null, now), 0);
});
