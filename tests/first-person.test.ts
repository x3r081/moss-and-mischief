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
import { initialState, parseSave } from '../lib/game/state';
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
    assert.deepEqual(h.menus, []);
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
void test('blocked mouse capture falls back to drag look, and touch drags never trigger an action', () => {
  const h = inputHarness(true);
  try {
    h.w.requestLook();
    assert.equal(h.modes.at(-1), 'drag');
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
