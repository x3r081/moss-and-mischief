import * as THREE from 'three';

/**
 * Procedural action poses for the rig returned by makeFirstPersonRig().
 *
 * API:
 *   const motion = new FirstPersonMotion(rig);
 *   motion.pose('axe', progress); // progress is normalized 0..1
 *   motion.pose('axe', null);     // select axe and hold its exact rest pose
 *   motion.reset();               // return the selected tool to its rest pose
 *
 * The caller owns clocks, gameplay, hit tests, and action completion. Read
 * MOTION_TIMING[action].duration for seconds and .impact for
 * the normalized instant at which gameplay may apply the action. `pose` clamps
 * progress, is deterministic, and allocates no objects or arrays per frame.
 * Construct one controller per rig and reuse it for the rig's lifetime.
 */

export type MotionAction =
  | 'axe'
  | 'pickaxe'
  | 'hands'
  | 'seeds'
  | 'water'
  | 'build'
  | 'rod'
  | 'reel';

export type MotionTiming = Readonly<{
  duration: number;
  impact: number;
}>;

export const MOTION_TIMING: Readonly<Record<MotionAction, MotionTiming>> = {
  axe: { duration: 0.65, impact: 0.4 },
  pickaxe: { duration: 0.75, impact: 0.5 },
  hands: { duration: 0.65, impact: 0.48 },
  seeds: { duration: 0.7, impact: 0.46 },
  water: { duration: 0.9, impact: 0.42 },
  build: { duration: 0.6, impact: 0.43 },
  rod: { duration: 1.15, impact: 0.34 },
  reel: { duration: 0.72, impact: 0.56 },
};

type HeldTool = Exclude<MotionAction, 'reel'>;

const TOOL_NAMES: readonly HeldTool[] = [
  'axe',
  'pickaxe',
  'hands',
  'seeds',
  'water',
  'build',
  'rod',
];

type RestTransform = {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
};

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function outCubic(value: number): number {
  const t = 1 - clamp01(value);
  return 1 - t * t * t;
}

function phase(value: number, start: number, end: number): number {
  return clamp01((value - start) / (end - start));
}

function snapshot(node: THREE.Object3D): RestTransform {
  return {
    px: node.position.x,
    py: node.position.y,
    pz: node.position.z,
    rx: node.rotation.x,
    ry: node.rotation.y,
    rz: node.rotation.z,
    sx: node.scale.x,
    sy: node.scale.y,
    sz: node.scale.z,
  };
}

function restore(node: THREE.Object3D, rest: RestTransform): void {
  node.position.set(rest.px, rest.py, rest.pz);
  node.rotation.set(rest.rx, rest.ry, rest.rz);
  node.scale.set(rest.sx, rest.sy, rest.sz);
}

function requireObject(root: THREE.Object3D, name: string): THREE.Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`FirstPersonMotion: missing rig node "${name}".`);
  return node;
}

function requireGroup(root: THREE.Object3D, name: string): THREE.Group {
  const node = requireObject(root, name);
  if (!(node instanceof THREE.Group)) {
    throw new Error(`FirstPersonMotion: rig node "${name}" is not a Group.`);
  }
  return node;
}

/**
 * Reusable, allocation-free first-person action controller.
 *
 * The constructor installs elbow pivots under the rig. The right pivot owns
 * the right forearm and every held-tool group, so a tool never slides away from
 * its gripping arm. The open-hand thumb meshes originally stored root-local in
 * `tool-hands` are attached to their matching forearms and explicitly posed as
 * part of the hands action.
 */
export class FirstPersonMotion {
  readonly rig: THREE.Group;

  private readonly leftPivot: THREE.Group;
  private readonly rightPivot: THREE.Group;
  private readonly leftHand: THREE.Object3D;
  private readonly rightHand: THREE.Object3D;
  private readonly leftThumb: THREE.Object3D;
  private readonly rightThumb: THREE.Object3D;
  private readonly leftHandRest: RestTransform;
  private readonly rightHandRest: RestTransform;
  private readonly leftThumbRest: RestTransform;
  private readonly rightThumbRest: RestTransform;
  private readonly axe: THREE.Group;
  private readonly pickaxe: THREE.Group;
  private readonly hands: THREE.Group;
  private readonly seeds: THREE.Group;
  private readonly water: THREE.Group;
  private readonly build: THREE.Group;
  private readonly rod: THREE.Group;

  private active: MotionAction = 'hands';

  constructor(rig: THREE.Group) {
    this.rig = rig;

    const leftForearm = requireGroup(rig, 'left-forearm');
    const rightForearm = requireGroup(rig, 'right-forearm');
    this.leftHand = requireObject(rig, 'left-hand');
    this.rightHand = requireObject(rig, 'right-hand');

    this.axe = requireGroup(rig, 'tool-axe');
    this.pickaxe = requireGroup(rig, 'tool-pickaxe');
    this.hands = requireGroup(rig, 'tool-hands');
    this.seeds = requireGroup(rig, 'tool-seeds');
    this.water = requireGroup(rig, 'tool-water');
    this.build = requireGroup(rig, 'tool-build');
    this.rod = requireGroup(rig, 'tool-rod');

    const priorLeftPivot = rig.getObjectByName('fp-motion-left-pivot');
    const priorRightPivot = rig.getObjectByName('fp-motion-right-pivot');
    this.leftPivot =
      priorLeftPivot instanceof THREE.Group
        ? priorLeftPivot
        : this.createPivot('fp-motion-left-pivot', -0.4);
    this.rightPivot =
      priorRightPivot instanceof THREE.Group
        ? priorRightPivot
        : this.createPivot('fp-motion-right-pivot', 0.4);

    rig.updateMatrixWorld(true);
    if (leftForearm.parent !== this.leftPivot)
      this.leftPivot.attach(leftForearm);
    if (rightForearm.parent !== this.rightPivot)
      this.rightPivot.attach(rightForearm);
    this.attachTool(this.axe);
    this.attachTool(this.pickaxe);
    this.attachTool(this.hands);
    this.attachTool(this.seeds);
    this.attachTool(this.water);
    this.attachTool(this.build);
    this.attachTool(this.rod);

    const existingLeftThumb = rig.getObjectByName('fp-left-thumb');
    const existingRightThumb = rig.getObjectByName('fp-right-thumb');
    if (existingLeftThumb && existingRightThumb) {
      this.leftThumb = existingLeftThumb;
      this.rightThumb = existingRightThumb;
    } else {
      const firstThumb = this.hands.children[0];
      const secondThumb = this.hands.children[1];
      if (!firstThumb || !secondThumb) {
        throw new Error(
          'FirstPersonMotion: tool-hands must contain two thumb meshes.',
        );
      }
      const left =
        firstThumb.position.x <= secondThumb.position.x
          ? firstThumb
          : secondThumb;
      const right = left === firstThumb ? secondThumb : firstThumb;
      left.name = 'fp-left-thumb';
      right.name = 'fp-right-thumb';
      rig.updateMatrixWorld(true);
      leftForearm.attach(left);
      rightForearm.attach(right);
      this.leftThumb = left;
      this.rightThumb = right;
    }

    this.leftHandRest = snapshot(this.leftHand);
    this.rightHandRest = snapshot(this.rightHand);
    this.leftThumbRest = snapshot(this.leftThumb);
    this.rightThumbRest = snapshot(this.rightThumb);
    this.pose('hands', null);
  }

  /** Select an action and pose it at normalized progress, or rest on null. */
  pose(action: MotionAction, progress: number | null): void {
    this.active = action;
    this.selectTool(action);
    this.restoreRest();
    if (progress === null || !Number.isFinite(progress)) return;

    const t = clamp01(progress);
    if (t === 0 || t === 1) return;
    switch (action) {
      case 'axe':
        this.poseAxe(t);
        break;
      case 'pickaxe':
        this.posePickaxe(t);
        break;
      case 'hands':
        this.poseHands(t);
        break;
      case 'seeds':
        this.poseSeeds(t);
        break;
      case 'water':
        this.poseWater(t);
        break;
      case 'build':
        this.poseBuild(t);
        break;
      case 'rod':
        this.poseRod(t);
        break;
      case 'reel':
        this.poseReel(t);
        break;
    }
  }

  /** Restore the currently selected tool and both arms to their exact rest pose. */
  reset(): void {
    this.selectTool(this.active);
    this.restoreRest();
  }

  private createPivot(name: string, x: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, -0.66, -0.52);
    pivot.frustumCulled = false;
    this.rig.add(pivot);
    return pivot;
  }

  private attachTool(tool: THREE.Group): void {
    if (tool.parent !== this.rightPivot) this.rightPivot.attach(tool);
  }

  private selectTool(action: MotionAction): void {
    for (let i = 0; i < TOOL_NAMES.length; i++) {
      const name = TOOL_NAMES[i];
      this.tool(name).visible =
        (name === action || (name === 'rod' && action === 'reel')) &&
        name !== 'hands';
    }
    const showHands = action === 'hands';
    this.hands.visible = false;
    this.leftThumb.visible = showHands;
    this.rightThumb.visible = showHands;
  }

  private tool(action: MotionAction): THREE.Group {
    switch (action) {
      case 'axe':
        return this.axe;
      case 'pickaxe':
        return this.pickaxe;
      case 'hands':
        return this.hands;
      case 'seeds':
        return this.seeds;
      case 'water':
        return this.water;
      case 'build':
        return this.build;
      case 'rod':
        return this.rod;
      case 'reel':
        return this.rod;
    }
  }

  private restoreRest(): void {
    this.leftPivot.position.set(-0.4, -0.66, -0.52);
    this.leftPivot.rotation.set(0, 0, 0);
    this.leftPivot.scale.set(1, 1, 1);
    this.rightPivot.position.set(0.4, -0.66, -0.52);
    this.rightPivot.rotation.set(0, 0, 0);
    this.rightPivot.scale.set(1, 1, 1);
    restore(this.leftHand, this.leftHandRest);
    restore(this.rightHand, this.rightHandRest);
    restore(this.leftThumb, this.leftThumbRest);
    restore(this.rightThumb, this.rightThumbRest);
  }

  private setLeft(
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
  ): void {
    this.leftPivot.position.set(x - 0.4, y - 0.66, z - 0.52);
    this.leftPivot.rotation.set(rx, ry, rz);
  }

  private setRight(
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
  ): void {
    this.rightPivot.position.set(x + 0.4, y - 0.66, z - 0.52);
    this.rightPivot.rotation.set(rx, ry, rz);
  }

  private poseAxe(t: number): void {
    let p: number;
    if (t < 0.28) {
      p = smooth(phase(t, 0, 0.28));
      this.setRight(
        0.07 * p,
        0.12 * p,
        0.04 * p,
        -(-0.3 * p),
        0.18 * p,
        -0.52 * p,
      );
    } else if (t < 0.43) {
      p = outCubic(phase(t, 0.28, 0.43));
      this.setRight(
        mix(0.07, -0.1, p),
        mix(0.12, -0.13, p),
        mix(0.04, -0.18, p),
        -mix(-0.3, 0.38, p),
        mix(0.18, -0.2, p),
        mix(-0.52, 0.78, p),
      );
    } else if (t < 0.64) {
      p = smooth(phase(t, 0.43, 0.64));
      this.setRight(
        mix(-0.1, 0.025, p),
        mix(-0.13, -0.015, p),
        mix(-0.18, -0.07, p),
        -mix(0.38, 0.12, p),
        mix(-0.2, -0.05, p),
        mix(0.78, 0.28, p),
      );
    } else {
      p = smooth(phase(t, 0.64, 1));
      this.setRight(
        0.025 * (1 - p),
        -0.015 * (1 - p),
        -0.07 * (1 - p),
        -(0.12 * (1 - p)),
        -0.05 * (1 - p),
        0.28 * (1 - p),
      );
    }
    this.setLeft(
      -0.015 * Math.sin(Math.PI * t),
      0.025 * Math.sin(Math.PI * t),
      -0.025 * Math.sin(Math.PI * t),
      -(-0.08 * Math.sin(Math.PI * t)),
      0,
      0.04 * Math.sin(Math.PI * t),
    );
  }

  private posePickaxe(t: number): void {
    let p: number;
    if (t < 0.38) {
      p = smooth(phase(t, 0, 0.38));
      this.setRight(
        -0.04 * p,
        0.25 * p,
        0.08 * p,
        -(-0.72 * p),
        0.05 * p,
        -0.12 * p,
      );
      this.setLeft(
        0.13 * p,
        0.18 * p,
        -0.02 * p,
        -(-0.48 * p),
        -0.08 * p,
        0.2 * p,
      );
    } else if (t < 0.56) {
      p = outCubic(phase(t, 0.38, 0.56));
      this.setRight(
        mix(-0.04, 0.01, p),
        mix(0.25, -0.16, p),
        mix(0.08, -0.22, p),
        -mix(-0.72, 0.46, p),
        mix(0.05, -0.04, p),
        mix(-0.12, 0.08, p),
      );
      this.setLeft(
        mix(0.13, 0.04, p),
        mix(0.18, -0.08, p),
        mix(-0.02, -0.13, p),
        -mix(-0.48, 0.24, p),
        -0.08 * (1 - p),
        mix(0.2, 0.07, p),
      );
    } else if (t < 0.73) {
      p = smooth(phase(t, 0.56, 0.73));
      this.setRight(
        0.01 * (1 - p),
        mix(-0.16, -0.04, p),
        mix(-0.22, -0.08, p),
        -mix(0.46, 0.16, p),
        -0.04 * (1 - p),
        0.08 * (1 - p),
      );
      this.setLeft(
        0.04 * (1 - p),
        mix(-0.08, -0.02, p),
        mix(-0.13, -0.05, p),
        -mix(0.24, 0.08, p),
        0,
        0.07 * (1 - p),
      );
    } else {
      p = smooth(phase(t, 0.73, 1));
      this.setRight(
        0,
        -0.04 * (1 - p),
        -0.08 * (1 - p),
        -(0.16 * (1 - p)),
        0,
        0,
      );
      this.setLeft(
        0,
        -0.02 * (1 - p),
        -0.05 * (1 - p),
        -(0.08 * (1 - p)),
        0,
        0,
      );
    }
  }

  private poseHands(t: number): void {
    let reach = 0;
    let grip = 0;
    let pull = 0;
    let recover = 0;
    if (t < 0.3) {
      reach = smooth(phase(t, 0, 0.3));
    } else if (t < 0.5) {
      reach = 1;
      grip = smooth(phase(t, 0.3, 0.5));
    } else if (t < 0.76) {
      reach = 1;
      grip = 1;
      pull = smooth(phase(t, 0.5, 0.76));
    } else {
      recover = smooth(phase(t, 0.76, 1));
      reach = 1 - recover;
      grip = 1 - recover;
      pull = 1 - recover;
    }
    const forward = reach * (1 - 0.72 * pull);
    this.setLeft(
      0.17 * forward,
      0.12 * reach - 0.07 * pull,
      -0.2 * reach + 0.13 * pull,
      -0.28 * reach + 0.16 * pull,
      -0.08 * reach,
      0.2 * reach,
    );
    this.setRight(
      -0.17 * forward,
      0.12 * reach - 0.07 * pull,
      -0.2 * reach + 0.13 * pull,
      -0.28 * reach + 0.16 * pull,
      0.08 * reach,
      -0.2 * reach,
    );
    this.leftHand.scale.set(
      this.leftHandRest.sx * (1 - 0.1 * grip),
      this.leftHandRest.sy * (1 + 0.06 * grip),
      this.leftHandRest.sz * (1 - 0.18 * grip),
    );
    this.rightHand.scale.set(
      this.rightHandRest.sx * (1 - 0.1 * grip),
      this.rightHandRest.sy * (1 + 0.06 * grip),
      this.rightHandRest.sz * (1 - 0.18 * grip),
    );
    this.leftThumb.rotation.z = this.leftThumbRest.rz + 0.42 * grip;
    this.rightThumb.rotation.z = this.rightThumbRest.rz - 0.42 * grip;
  }

  private poseSeeds(t: number): void {
    let p: number;
    if (t < 0.25) {
      p = smooth(phase(t, 0, 0.25));
      this.setRight(
        0.04 * p,
        0.09 * p,
        -0.08 * p,
        -0.18 * p,
        0.2 * p,
        -0.32 * p,
      );
      this.setLeft(0.13 * p, 0.08 * p, -0.13 * p, -0.18 * p, 0, 0.16 * p);
    } else if (t < 0.58) {
      p = outCubic(phase(t, 0.25, 0.58));
      this.setRight(
        mix(0.04, -0.12, p),
        mix(0.09, 0.02, p),
        mix(-0.08, -0.2, p),
        mix(-0.18, 0.1, p),
        mix(0.2, -0.34, p),
        mix(-0.32, 0.48, p),
      );
      this.setLeft(
        mix(0.13, 0.19, p),
        mix(0.08, 0.03, p),
        mix(-0.13, -0.17, p),
        mix(-0.18, -0.04, p),
        0.08 * p,
        mix(0.16, 0.28, p),
      );
    } else {
      p = smooth(phase(t, 0.58, 1));
      this.setRight(
        -0.12 * (1 - p),
        0.02 * (1 - p),
        -0.2 * (1 - p),
        0.1 * (1 - p),
        -0.34 * (1 - p),
        0.48 * (1 - p),
      );
      this.setLeft(
        0.19 * (1 - p),
        0.03 * (1 - p),
        -0.17 * (1 - p),
        -0.04 * (1 - p),
        0.08 * (1 - p),
        0.28 * (1 - p),
      );
    }
  }

  private poseWater(t: number): void {
    let amount: number;
    if (t < 0.28) amount = smooth(phase(t, 0, 0.28));
    else if (t < 0.74) amount = 1;
    else amount = 1 - smooth(phase(t, 0.74, 1));
    const pourPulse =
      t >= 0.28 && t < 0.74
        ? Math.sin(phase(t, 0.28, 0.74) * Math.PI * 4) * 0.025
        : 0;
    this.setRight(
      -0.04 * amount,
      0.12 * amount + pourPulse,
      -0.15 * amount,
      -0.1 * amount,
      0.05 * amount,
      -0.92 * amount + pourPulse,
    );
    this.setLeft(
      0.13 * amount,
      0.08 * amount,
      -0.12 * amount,
      -0.18 * amount,
      0,
      0.22 * amount,
    );
  }

  private poseBuild(t: number): void {
    let p: number;
    if (t < 0.3) {
      p = smooth(phase(t, 0, 0.3));
      this.setRight(
        0.03 * p,
        0.17 * p,
        0.03 * p,
        -(-0.5 * p),
        0.04 * p,
        -0.18 * p,
      );
    } else if (t < 0.5) {
      p = outCubic(phase(t, 0.3, 0.5));
      this.setRight(
        mix(0.03, -0.035, p),
        mix(0.17, -0.12, p),
        mix(0.03, -0.17, p),
        -mix(-0.5, 0.36, p),
        mix(0.04, -0.08, p),
        mix(-0.18, 0.18, p),
      );
    } else if (t < 0.68) {
      p = smooth(phase(t, 0.5, 0.68));
      this.setRight(
        mix(-0.035, 0.01, p),
        mix(-0.12, -0.025, p),
        mix(-0.17, -0.06, p),
        -mix(0.36, 0.1, p),
        -0.08 * (1 - p),
        0.18 * (1 - p),
      );
    } else {
      p = smooth(phase(t, 0.68, 1));
      this.setRight(
        0.01 * (1 - p),
        -0.025 * (1 - p),
        -0.06 * (1 - p),
        -(0.1 * (1 - p)),
        0,
        0,
      );
    }
    const support = Math.sin(Math.PI * t);
    this.setLeft(
      0.07 * support,
      0.04 * support,
      -0.08 * support,
      -(-0.12 * support),
      0,
      0.12 * support,
    );
  }

  private poseRod(t: number): void {
    let p: number;
    if (t < 0.2) {
      p = smooth(phase(t, 0, 0.2));
      this.setRight(
        0.08 * p,
        0.15 * p,
        0.1 * p,
        -(-0.42 * p),
        0.26 * p,
        -0.28 * p,
      );
      this.setLeft(0.12 * p, 0.09 * p, -0.04 * p, -(-0.24 * p), 0, 0.18 * p);
    } else if (t < 0.42) {
      p = outCubic(phase(t, 0.2, 0.42));
      this.setRight(
        mix(0.08, -0.1, p),
        mix(0.15, 0.03, p),
        mix(0.1, -0.25, p),
        -mix(-0.42, 0.24, p),
        mix(0.26, -0.34, p),
        mix(-0.28, 0.34, p),
      );
      this.setLeft(
        mix(0.12, 0.2, p),
        mix(0.09, 0.02, p),
        mix(-0.04, -0.16, p),
        -mix(-0.24, -0.02, p),
        0.08 * p,
        mix(0.18, 0.3, p),
      );
    } else if (t < 0.55) {
      p = smooth(phase(t, 0.42, 0.55));
      this.setRight(
        mix(-0.1, -0.045, p),
        mix(0.03, 0.015, p),
        mix(-0.25, -0.16, p),
        -mix(0.24, 0.1, p),
        mix(-0.34, -0.18, p),
        mix(0.34, 0.18, p),
      );
      this.setLeft(
        mix(0.2, 0.13, p),
        0.02 * (1 - p),
        mix(-0.16, -0.1, p),
        -(-0.02 * (1 - p)),
        0.08 * (1 - p),
        mix(0.3, 0.2, p),
      );
    } else if (t < 0.88) {
      p = phase(t, 0.55, 0.88);
      const crank = Math.sin(p * Math.PI * 6);
      this.setRight(
        -0.045,
        0.015 + 0.012 * crank,
        -0.16,
        -0.1,
        -0.18,
        0.18 + 0.08 * crank,
      );
      this.setLeft(
        0.13,
        0.025 * crank,
        -0.1,
        -(-0.08 * crank),
        0.05 * crank,
        0.2 + 0.18 * crank,
      );
    } else {
      p = smooth(phase(t, 0.88, 1));
      this.setRight(
        -0.045 * (1 - p),
        0.015 * (1 - p),
        -0.16 * (1 - p),
        -(0.1 * (1 - p)),
        -0.18 * (1 - p),
        0.18 * (1 - p),
      );
      this.setLeft(0.13 * (1 - p), 0, -0.1 * (1 - p), -0, 0, 0.2 * (1 - p));
    }
  }

  private poseReel(t: number): void {
    let amount: number;
    if (t < 0.18) amount = smooth(phase(t, 0, 0.18));
    else if (t < 0.84) amount = 1;
    else amount = 1 - smooth(phase(t, 0.84, 1));
    const cycle = phase(t, 0.18, 0.84);
    const crank = t >= 0.18 && t < 0.84 ? Math.sin(cycle * Math.PI * 6) : 0;
    this.setRight(
      -0.035 * amount,
      (0.015 + 0.012 * crank) * amount,
      -0.13 * amount,
      0.08 * amount,
      -0.14 * amount,
      (0.14 + 0.08 * crank) * amount,
    );
    this.setLeft(
      0.12 * amount,
      0.025 * crank * amount,
      -0.09 * amount,
      -0.08 * crank * amount,
      0.05 * crank * amount,
      (0.18 + 0.18 * crank) * amount,
    );
  }
}
