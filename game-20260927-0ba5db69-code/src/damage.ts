import { Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3, type Intersection } from "three";
import { M, box, rbox, type RobotKind, type RobotRig } from "./models";

/**
 * Loose armour plates bolted onto a robot. Plates dent where they are shot and
 * break free as the robot loses health, leaving a dark gap with glowing wiring.
 */
interface Plate {
  mesh: Mesh;
  wound: Group;
  parent: Object3D;
  dented: boolean;
  gone: boolean;
  normal: Vector3; // in parent space
}

type Slot = "body" | "armL" | "armR" | "hipL" | "hipR";
interface Spec {
  slot: Slot;
  /** body: height as a fraction of the eye height offset; limbs: drop below the pivot (m, scaled) */
  y: number;
  /** direction the plate faces, radians around the robot (0 = front) */
  a: number;
  s?: number;
}

const CHEST_L: Spec = { slot: "body", y: 0, a: 0.8 };
const CHEST_R: Spec = { slot: "body", y: 0, a: -0.8 };
const UPPER: Spec = { slot: "body", y: 0.14, a: 0 };
const BACK: Spec = { slot: "body", y: 0, a: Math.PI };
const BACK_HI: Spec = { slot: "body", y: 0.12, a: Math.PI };
const SIDE_L: Spec = { slot: "body", y: -0.04, a: Math.PI / 2 };
const SIDE_R: Spec = { slot: "body", y: -0.04, a: -Math.PI / 2 };
const LOWER: Spec = { slot: "body", y: -0.16, a: 0 };
const SHOULDER_L: Spec = { slot: "armL", y: 0.02, a: Math.PI / 2, s: 0.75 };
const SHOULDER_R: Spec = { slot: "armR", y: 0.02, a: -Math.PI / 2, s: 0.75 };
const THIGH_L: Spec = { slot: "hipL", y: 0.14, a: 0, s: 0.7 };
const THIGH_R: Spec = { slot: "hipR", y: 0.14, a: 0, s: 0.7 };

const SPECS: Record<RobotKind, Spec[]> = {
  drone: [CHEST_L, CHEST_R, BACK, THIGH_L, THIGH_R],
  sentinel: [CHEST_L, CHEST_R, BACK, SIDE_L, SIDE_R, SHOULDER_L],
  ripper: [CHEST_L, CHEST_R, UPPER, BACK, SHOULDER_L, SHOULDER_R, THIGH_L, THIGH_R],
  bulwark: [CHEST_L, CHEST_R, UPPER, BACK, SIDE_L, SIDE_R, SHOULDER_L, SHOULDER_R, THIGH_L, THIGH_R],
  warlord: [CHEST_L, CHEST_R, UPPER, LOWER, BACK, BACK_HI, SIDE_L, SIDE_R, SHOULDER_L, SHOULDER_R, THIGH_L, THIGH_R],
};

let dentMat: MeshStandardMaterial | null = null;
function dented(): MeshStandardMaterial {
  if (!dentMat) {
    dentMat = M.paleMetal.clone();
    dentMat.color.setHex(0x7a6c5e);
    dentMat.roughness = 0.75;
    dentMat.emissive.setHex(0x2a0c00);
    dentMat.emissiveIntensity = 0.6;
  }
  return dentMat;
}

const ray = new Raycaster();
const UP = new Vector3(0, 1, 0);
const ZERO = new Vector3();
const tv = new Vector3();
const tm = new Matrix4();

function meshesOf(root: Object3D, directOnly: boolean): Mesh[] {
  const out: Mesh[] = [];
  if (directOnly) {
    for (const c of root.children) if ((c as Mesh).isMesh) out.push(c as Mesh);
  } else root.traverse((c) => (c as Mesh).isMesh && out.push(c as Mesh));
  return out;
}

export class ArmourKit {
  readonly plates: Plate[] = [];
  private popped = 0;

  constructor(private readonly rig: RobotRig, kind: RobotKind) {
    const root = rig.root;
    // measure the robot while it stands at the origin, unrotated
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const size = Math.min(0.6, Math.max(0.17, rig.radius * 0.72));
    for (const sp of SPECS[kind]) {
      const parent = rig[sp.slot];
      const targets = sp.slot === "body" ? meshesOf(parent, true) : meshesOf(parent, false);
      if (!targets.length) continue;
      const pw = parent.getWorldPosition(new Vector3());
      const y = sp.slot === "body" ? rig.eyeHeight + sp.y * rig.height : pw.y - sp.y * (rig.height / 2);
      const axis = sp.slot === "body" ? new Vector3(0, y, 0) : new Vector3(pw.x, y, pw.z);
      const dir = new Vector3(Math.sin(sp.a), 0, Math.cos(sp.a));
      ray.set(axis.clone().addScaledVector(dir, 4), dir.clone().negate());
      ray.far = 4;
      const hits: Intersection[] = ray.intersectObjects(targets, false);
      if (!hits.length) continue;
      const hit = hits[0];
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone();
      // keep plates facing mostly outward, never into the robot
      n.lerp(dir, 0.5).normalize();
      const s = size * (sp.s ?? 1);
      const w = s;
      const h = s * 1.12;
      const th = 0.025 + s * 0.06;
      // world transform → parent space
      const inv = new Matrix4().copy(parent.matrixWorld).invert();
      const localP = hit.point.clone().addScaledVector(n, th / 2 + 0.008).applyMatrix4(inv);
      const localN = n.clone().transformDirection(inv);
      const up = Math.abs(localN.dot(UP)) > 0.95 ? new Vector3(0, 0, 1) : UP;
      tm.lookAt(localN, ZERO, up);
      const plate = rbox(w, h, th, M.paleMetal, 0, 0, 0, undefined, th * 0.35);
      plate.position.copy(localP);
      plate.quaternion.setFromRotationMatrix(tm);
      parent.add(plate);
      // the gap left behind: dark frame + glowing wiring
      const wound = new Group();
      wound.position.copy(localP).addScaledVector(localN, -th * 0.6);
      wound.quaternion.copy(plate.quaternion);
      rbox(w * 0.82, h * 0.82, 0.02, M.cable, 0, 0, 0, wound, 0.006);
      box(w * 0.55, 0.018, 0.03, M.redGlow, 0, h * 0.12, 0.012, wound);
      box(0.018, h * 0.45, 0.03, M.redGlow, w * 0.18, -h * 0.08, 0.012, wound);
      wound.visible = false;
      parent.add(wound);
      this.plates.push({ mesh: plate, wound, parent, dented: false, gone: false, normal: localN });
    }
  }

  get remaining(): number {
    return this.plates.length - this.popped;
  }

  /** The attached plate nearest to a world point. */
  nearest(p: Vector3, preferDented = false): Plate | null {
    let best: Plate | null = null;
    let bd = Infinity;
    for (const pl of this.plates) {
      if (pl.gone) continue;
      const d = pl.mesh.getWorldPosition(tv).distanceToSquared(p) - (preferDented && pl.dented ? 0.6 : 0);
      if (d < bd) {
        bd = d;
        best = pl;
      }
    }
    return best;
  }

  /** Buckle a plate inward and scorch it. */
  dent(pl: Plate): void {
    if (pl.dented) {
      pl.mesh.rotation.z += (Math.random() - 0.5) * 0.12;
      return;
    }
    pl.dented = true;
    pl.mesh.material = dented();
    pl.mesh.position.addScaledVector(pl.normal, -0.012);
    pl.mesh.rotateX((Math.random() - 0.5) * 0.35);
    pl.mesh.rotateY((Math.random() - 0.5) * 0.35);
    pl.mesh.scale.set(0.96, 0.93, 0.8);
  }

  /** Detach a plate and return it (in world space) so it can be flung. */
  pop(pl: Plate, scene: Object3D): Mesh {
    pl.gone = true;
    this.popped++;
    pl.wound.visible = true;
    scene.attach(pl.mesh);
    return pl.mesh;
  }

  /** How many plates should be gone at this health fraction (all gone by ~15% health). */
  target(hpFrac: number): number {
    return Math.min(this.plates.length, Math.floor(((1 - hpFrac) / 0.85) * this.plates.length + 0.0001));
  }

  get poppedCount(): number {
    return this.popped;
  }

  /** A random open wound (world position), for sparks and smoke. */
  woundPos(out: Vector3): Vector3 | null {
    const open = this.plates.filter((p) => p.gone);
    if (!open.length) return null;
    return open[(Math.random() * open.length) | 0].wound.getWorldPosition(out);
  }

  outward(pl: Plate, out: Vector3): Vector3 {
    return out.copy(pl.normal).transformDirection(pl.parent.matrixWorld);
  }
}

