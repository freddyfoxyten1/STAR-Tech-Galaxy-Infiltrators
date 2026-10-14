import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from "three";
import { audio } from "./audio";
import type { Game } from "./game";
import { ArmourKit } from "./damage";
import { Material, MeshStandardMaterial } from "three";
import { M, buildRobot, type RobotKind, type RobotRig } from "./models";
import { difficultyDef } from "./data";
import { glowSpriteTex } from "./textures";

/** normal = mission robot; target = still practice target; stealth = harmless patrol bot; live = exam bot */
export type RobotRole = "normal" | "target" | "stealth" | "live";

const tintCache = new Map<Material, Material>();
/** Repaint a robot in blue training colours (shared, cached material copies). */
export function paintTraining(rig: RobotRig): void {
  const src = new Set<Material>([M.gunmetal, M.darkMetal, M.paleMetal, M.blade, M.vent]);
  const swap = (m: Material): Material => {
    if (!src.has(m)) return m;
    let t = tintCache.get(m);
    if (!t) {
      const c = (m as MeshStandardMaterial).clone();
      c.color.multiply(new Color(0x7fb0ff));
      c.emissive.setHex(0x061a3a);
      c.emissiveIntensity = 0.5;
      tintCache.set(m, (t = c));
    }
    return t;
  };
  rig.root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) mesh.material = swap(mesh.material as Material);
  });
  rig.scrapMats = rig.scrapMats.map(swap);
}

export type RobotState = "patrol" | "suspicious" | "search" | "combat" | "stunned" | "dormant" | "dead";

interface KindDef {
  hp: number;
  walk: number;
  run: number;
  view: number;
  fov: number;
  melee: boolean;
  range: number; // preferred attack range
  dmg: number;
  rate: number;
  boltSpeed: number;
  heavy: number; // footstep weight
  turn: number;
}

export const KINDS: Record<RobotKind, KindDef> = {
  drone: { hp: 40, walk: 1.6, run: 3.6, view: 13, fov: 1.35, melee: false, range: 8, dmg: 6, rate: 1.2, boltSpeed: 20, heavy: 0.6, turn: 5 },
  sentinel: { hp: 80, walk: 1.2, run: 3.3, view: 10, fov: 1.2, melee: true, range: 1.7, dmg: 16, rate: 1.1, boltSpeed: 0, heavy: 0.8, turn: 4 },
  ripper: { hp: 130, walk: 1.5, run: 5.4, view: 12, fov: 1.25, melee: true, range: 1.9, dmg: 20, rate: 1.1, boltSpeed: 0, heavy: 1.1, turn: 4 },
  bulwark: { hp: 210, walk: 1.2, run: 2.0, view: 15, fov: 1.2, melee: false, range: 11, dmg: 15, rate: 0.9, boltSpeed: 15, heavy: 1.4, turn: 2.5 },
  warlord: { hp: 1500, walk: 1.6, run: 2.4, view: 22, fov: 3.2, melee: false, range: 9, dmg: 5, rate: 11, boltSpeed: 26, heavy: 2, turn: 2.2 },
};

const tmp = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();
/** How hard a robot is to rock back (bigger = steadier). */
const MASS: Record<RobotKind, number> = { drone: 1, sentinel: 1.1, ripper: 1.7, bulwark: 2.4, warlord: 7 };

export class Robot {
  readonly rig: RobotRig;
  readonly pos = new Vector3();
  readonly def: KindDef;
  yaw = 0;
  hp: number;
  state: RobotState = "patrol";
  suspicion = 0;
  alertT = 0;
  seenT = 0;
  readonly lastKnown = new Vector3();
  path: Vector2[] = [];
  pathT = 0;
  wp = 0;
  waitT = 0;
  fireCd = 1;
  burst = 0;
  stunT = 0;
  meleeT = 0;
  stompT = 0;
  stompCd = 3;
  readonly knock = new Vector3();
  anim = Math.random() * 10;
  stepT = 0;
  percT = Math.random() * 0.2;
  canSee = false;
  alarmRaised = false;
  flashHit = 0;
  readonly cone: Mesh;
  private readonly coneGeo: BufferGeometry;
  private coneT = 0;
  readonly ghost: Group;
  spinUp = 0;
  muzzleIdx = 0;
  summoned = false;
  deadT = 0;
  readonly home = new Vector3();
  lodAcc = 0;
  role: RobotRole = "normal";
  readonly armour: ArmourKit;
  /** difficulty multipliers (1 at the standard level) */
  private readonly dmgMul: number;
  private readonly senses: number;
  /** stagger spring: x = pitch, y = roll (radians) and their velocities */
  private stagP = 0;
  private stagR = 0;
  private stagVP = 0;
  private stagVR = 0;
  private eyeFlick = 0;
  private lowT = 0;
  private dyingT = 0;
  private dieDur = 0.6;

  constructor(
    private readonly game: Game,
    readonly kind: RobotKind,
    x: number,
    z: number,
    readonly patrol: Vector2[],
    yaw = 0,
    public guard = false,
  ) {
    this.rig = buildRobot(kind);
    // real missions scale the robots by the chosen difficulty (training stays at the standard level)
    const dif = difficultyDef(game.mission === "training" ? "recruit" : game.difficulty);
    const k = KINDS[kind];
    this.dmgMul = dif.dmg;
    this.senses = dif.senses;
    this.def = { ...k, hp: Math.round(k.hp * dif.hp), dmg: Math.round(k.dmg * dif.dmg * 10) / 10, rate: k.rate * dif.rate, walk: k.walk * dif.speed, run: k.run * dif.speed, view: k.view * dif.senses, turn: k.turn * dif.speed };
    this.hp = this.def.hp;
    this.pos.set(x, 0, z);
    this.home.set(x, 0, z);
    this.yaw = yaw;
    this.rig.root.position.copy(this.pos);
    game.scene.add(this.rig.root);
    // floor view cone
    const SEG = 18;
    this.coneGeo = new BufferGeometry();
    this.coneGeo.setAttribute("position", new BufferAttribute(new Float32Array((SEG + 2) * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < SEG; i++) idx.push(0, i + 1, i + 2);
    this.coneGeo.setIndex(idx);
    this.cone = new Mesh(this.coneGeo, new MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }));
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 2;
    game.scene.add(this.cone);
    // scan ghost: see-through silhouette
    this.ghost = new Group();
    const gm = new MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, blending: AdditiveBlending });
    this.rig.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        const c = new Mesh(m.geometry, gm);
        c.matrixAutoUpdate = false;
        c.userData.src = m;
        c.renderOrder = 20;
        this.ghost.add(c);
      }
    });
    this.ghost.visible = false;
    game.scene.add(this.ghost);
    // loose armour plates (added after the scan ghost so torn-off plates never show in it)
    this.armour = new ArmourKit(this.rig, kind);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    if (kind === "warlord") this.state = "dormant";
  }

  get alive(): boolean {
    return this.state !== "dead";
  }
  get eyePos(): Vector3 {
    return new Vector3(this.pos.x, this.rig.eyeHeight + 0.2, this.pos.z);
  }
  get center(): Vector3 {
    return new Vector3(this.pos.x, this.rig.height * 0.55, this.pos.z);
  }
  get alerted(): boolean {
    return this.state === "combat";
  }

  /** Ray test against the body and the glowing chest eye. Returns distance and whether the eye was hit. */
  hitTest(o: Vector3, d: Vector3): { t: number; crit: boolean } | null {
    if (!this.alive) return null;
    const eye = this.rig.eye.getWorldPosition(tmp2);
    const er = this.rig.radius * 0.28 + 0.05;
    const te = raySphere(o, d, eye, er);
    if (te !== null) return { t: te, crit: true };
    // stacked spheres along the body
    let best: number | null = null;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const y = this.rig.height * (0.25 + (i / (n - 1)) * 0.5);
      tmp.set(this.pos.x, y, this.pos.z);
      const t = raySphere(o, d, tmp, this.rig.radius * (i === 1 ? 1.05 : 0.85));
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best !== null ? { t: best, crit: false } : null;
  }

  alert(at: Vector3, instant = true): void {
    if (!this.alive || this.state === "dormant") return;
    this.lastKnown.copy(at);
    if (instant) {
      if (this.state !== "combat") this.enterCombat();
      this.alertT = 8;
    } else if (this.state !== "combat") {
      this.state = "search";
      this.suspicion = Math.max(this.suspicion, 0.6);
      this.alertT = 10;
      this.pathT = 0;
    }
  }

  hear(at: Vector3, strength: number): void {
    if (!this.alive || this.state === "dormant" || this.state === "stunned") return;
    if (this.state === "combat") {
      this.lastKnown.copy(at);
      this.alertT = Math.max(this.alertT, 5);
      return;
    }
    this.lastKnown.copy(at);
    this.suspicion = Math.min(0.95, Math.max(this.suspicion, strength));
    if (this.state !== "search") audio.suspicious(this.pos.distanceTo(this.game.player.pos));
    this.state = "search";
    this.alertT = 7;
    this.pathT = 0;
  }

  private enterCombat(): void {
    const first = this.state !== "combat";
    this.state = "combat";
    this.suspicion = 1;
    this.alertT = 8;
    this.pathT = 0;
    if (first) {
      audio.alert(this.pos.distanceTo(this.game.player.pos));
      this.game.onRobotSpotted(this);
    }
  }

  damage(n: number, crit: boolean, fromPlayer = true, hitP?: Vector3, hitD?: Vector3): void {
    if (!this.alive) return;
    if (this.role === "stealth") {
      // the patrol bot is armoured training kit: shooting it just counts as being caught
      if (fromPlayer) this.game.onRobotSpotted(this);
      return;
    }
    if (this.state === "dormant") {
      if (!fromPlayer) return;
      this.game.wakeBoss();
    }
    this.hp -= n;
    this.flashHit = 0.08;
    if (hitP && hitD) this.reactToHit(n, crit, hitP, hitD);
    if (this.hp <= 0) {
      this.die();
      return;
    }
    // armour breaks away as health drops (nearest the shots, or anywhere for blasts)
    const at = hitP ?? this.center.add(tmp3.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(this.rig.radius * 2));
    const want = this.armour.target(this.hp / this.def.hp);
    let guard = 0;
    while (this.armour.poppedCount < want && guard++ < 16) this.popPlate(at, hitD);
    if (fromPlayer) this.alert(this.game.player.pos, true);
    void crit;
  }

  /** Stagger, sparks-side reactions and dents for a bullet that struck the robot. */
  private reactToHit(n: number, crit: boolean, p: Vector3, d: Vector3): void {
    const m = MASS[this.kind];
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const lx = d.x * c - d.z * s;
    const lz = d.x * s + d.z * c;
    const imp = (Math.min(1.4, n / 12) * 2.6) / m;
    this.stagVP += lz * imp;
    this.stagVR -= lx * imp;
    const big = crit || n >= 28;
    if (big) {
      this.eyeFlick = 0.3;
      if (this.kind === "drone" || this.kind === "sentinel" || this.kind === "ripper") {
        const h = Math.hypot(d.x, d.z) || 1;
        const f = this.kind === "ripper" ? 1.8 : 2.8;
        this.knock.x += (d.x / h) * f;
        this.knock.z += (d.z / h) * f;
      }
    }
    const pl = this.armour.nearest(p);
    if (pl && pl.mesh.getWorldPosition(tmp3).distanceTo(p) < this.rig.radius * 1.6) this.armour.dent(pl);
  }

  private popPlate(at: Vector3, d?: Vector3): void {
    const pl = this.armour.nearest(at, true);
    if (!pl) return;
    const g = this.game;
    const out = this.armour.outward(pl, new Vector3());
    const mesh = this.armour.pop(pl, g.scene);
    const v = out.multiplyScalar(2.2 + Math.random() * 1.5);
    if (d) v.addScaledVector(d, 1.6);
    v.y += 2.2 + Math.random() * 1.8;
    g.fx.fling(mesh, v, 2.4 + Math.random() * 0.6);
    g.fx.sparks(mesh.position, out.normalize(), 0xffd070, 16, 5);
    audio.plateClang(mesh.position.distanceTo(g.player.pos), this.kind === "warlord" || this.kind === "bulwark");
  }

  stun(t: number): void {
    if (!this.alive || this.state === "dormant") return;
    this.stunT = Math.max(this.stunT, this.kind === "warlord" ? t * 0.35 : t);
    if (this.kind !== "warlord") this.state = "stunned";
  }

  private die(): void {
    this.state = "dead";
    this.hp = 0;
    // points and objectives count at once; the body buckles for a moment before bursting apart
    this.dieDur = this.kind === "warlord" ? 1.6 : this.kind === "bulwark" ? 0.85 : 0.6;
    this.dyingT = this.dieDur;
    this.eyeFlick = this.dieDur;
    this.game.scene.remove(this.cone);
    this.game.scene.remove(this.ghost);
    audio.fizz(this.pos.distanceTo(this.game.player.pos));
    this.game.onRobotKilled(this);
  }

  /** Collapse: knees buckle, the body slumps forward and fizzes, then it bursts into scrap. */
  private updateDying(dt: number): void {
    if (this.dyingT <= 0) return;
    this.dyingT -= dt;
    this.anim += dt;
    this.eyeFlick = Math.max(this.eyeFlick, 0.1);
    this.stepStagger(dt);
    const r = this.rig;
    const k = 1 - Math.max(0, this.dyingT) / this.dieDur;
    const e = k * k * (3 - 2 * k);
    const shake = (Math.random() - 0.5) * 0.04 * (1 - k * 0.5);
    if (r.kneeL && r.kneeR) {
      const sg = r.reverseKnee ? -1 : 1;
      r.kneeL.rotation.x = sg * 1.15 * e;
      r.kneeR.rotation.x = sg * 1.0 * e;
      r.hipL.rotation.x = -0.55 * e;
      r.hipR.rotation.x = -0.45 * e;
    }
    r.body.position.y = -r.height * (this.kind === "sentinel" ? 0.1 : 0.2) * e;
    r.body.rotation.x = 0.5 * e + this.stagP + shake;
    r.body.rotation.z = 0.12 * e * (this.anim % 2 > 1 ? 1 : -1) * 0.5 + this.stagR + shake;
    r.armL.rotation.z = 0.5 * e;
    r.armR.rotation.z = -0.5 * e;
    if (Math.random() < dt * 22) {
      const wp = this.armour.woundPos(tmp3) ?? this.center;
      this.game.fx.sparks(wp, tmp2.set(Math.random() - 0.5, 1, Math.random() - 0.5), 0xffd080, 5, 3.5);
    }
    if (Math.random() < dt * 8) this.game.fx.puff(this.center, 0x2a2a2a, 1, tmp2.set(0, 1, 0), 0.4, 1.2, 0.3, 0.9);
    this.updateEye(dt);
    if (this.dyingT <= 0) this.breakApart();
  }

  private breakApart(): void {
    const c = this.center;
    const big = this.kind === "warlord" || this.kind === "bulwark";
    this.game.fx.explosion(c, big);
    audio.explode(c.distanceTo(this.game.player.pos), big);
    this.game.fx.scrap(this.rig.root, c.clone().setY(0.4), big ? 6 : 4.5, this.rig.scrapMats, this.rig.height, this.rig.radius);
    this.game.scene.remove(this.rig.root);
  }

  private stepStagger(dt: number): void {
    let t = Math.min(dt, 0.2);
    while (t > 0) {
      const h = Math.min(t, 1 / 60);
      t -= h;
      this.stagVP += (-this.stagP * 150 - this.stagVP * 15) * h;
      this.stagVR += (-this.stagR * 150 - this.stagVR * 15) * h;
      this.stagP += this.stagVP * h;
      this.stagR += this.stagVR * h;
    }
    this.stagP = Math.max(-0.5, Math.min(0.5, this.stagP));
    this.stagR = Math.max(-0.5, Math.min(0.5, this.stagR));
  }

  remove(): void {
    this.game.scene.remove(this.rig.root, this.cone, this.ghost);
  }

  // ---------------------------------------------------------------------------
  update(dt: number): void {
    if (!this.alive) {
      this.updateDying(dt);
      return;
    }
    const g = this.game;
    const p = g.player;
    const k = this.def;
    this.anim += dt;
    this.flashHit -= dt;
    this.eyeFlick -= dt;
    this.stepStagger(dt);
    // badly damaged: smoke and sparks pour from the gaps in the armour
    if (this.hp < this.def.hp * 0.35) {
      this.lowT -= dt;
      if (this.lowT <= 0) {
        this.lowT = 0.1 + Math.random() * 0.2;
        const wp = this.armour.woundPos(tmp3) ?? this.center;
        g.fx.puff(wp, 0x262626, 1, tmp2.set(0, 1.1, 0), 0.35, 1.3, 0.2, 0.8);
        if (Math.random() < 0.4) g.fx.sparks(wp, tmp2.set(Math.random() - 0.5, 0.6, Math.random() - 0.5), 0xffc060, 4, 3);
        if (Math.random() < 0.08) audio.fizz(this.pos.distanceTo(p.pos) + 4);
      }
    }
    if (this.role === "target") {
      // practice target: stands still, never looks or shoots
      this.state = this.stunT > 0 ? "stunned" : "patrol";
      this.stunT = Math.max(0, this.stunT - dt);
      this.animate(dt, false, 0);
      this.updateEye(dt);
      this.cone.visible = false;
      this.ghost.visible = p.scanning && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 40;
      if (this.ghost.visible) {
        this.rig.root.updateMatrixWorld(true);
        for (const c of this.ghost.children) c.matrix.copy((c.userData.src as Mesh).matrixWorld);
      }
      return;
    }
    const distP = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);

    // ---- perception (10 Hz) ----
    this.percT -= dt;
    if (this.percT <= 0 && this.state !== "dormant" && this.state !== "stunned" && g.time > 3) {
      const step = 0.1;
      this.percT = step;
      this.canSee = this.perceive(distP);
      if (this.canSee) {
        this.lastKnown.copy(p.pos);
        const range = this.viewRange();
        const closeness = 1 - Math.min(1, distP / range);
        const rate = (0.9 + closeness * 3.2) * (g.alarm > 0 ? 2.5 : 1) * this.senses;
        const before = this.suspicion;
        this.suspicion = Math.min(1, this.suspicion + rate * step);
        if (this.state === "patrol" && this.suspicion > 0.05) {
          this.state = "suspicious";
          if (before < 0.05) audio.suspicious(distP);
        }
        if (this.suspicion >= 1) this.enterCombat();
        if (this.state === "combat") {
          this.alertT = 8;
          this.seenT += step;
          if (!this.alarmRaised && (this.kind === "drone" || this.seenT > 4) && g.alarm <= 0) {
            this.alarmRaised = true;
            g.triggerAlarm(this);
          }
        }
      } else {
        this.seenT = Math.max(0, this.seenT - step);
        if (this.state === "suspicious") {
          this.suspicion -= 0.12 * step;
          if (this.suspicion <= 0.4) {
            this.state = "search";
            this.alertT = 6;
            this.pathT = 0;
          }
        }
      }
    }

    // ---- state behaviour ----
    let moveTarget: Vector3 | null = null;
    let speed = k.walk;
    let face: Vector3 | null = null;
    if (this.state === "stunned") {
      this.stunT -= dt;
      if (Math.random() < dt * 8) g.fx.sparks(this.center.add(new Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6)), new Vector3(0, 1, 0), 0x6fe8ff, 4, 2);
      if (this.stunT <= 0) {
        this.state = "combat";
        this.alertT = 6;
      }
    } else if (this.state === "dormant") {
      // Warlord waits, powered down
    } else if (this.state === "patrol") {
      if (this.guard || this.patrol.length === 0) {
        if (this.pos.distanceTo(this.home) > 0.6) {
          moveTarget = this.home;
        } else {
          // slowly scan left and right around the guard post
          this.yaw += Math.sin(this.anim * 0.5) * dt * 0.5;
        }
      } else {
        const w = this.patrol[this.wp % this.patrol.length];
        tmp.set(w.x, 0, w.y);
        if (Math.hypot(tmp.x - this.pos.x, tmp.z - this.pos.z) < 0.5) {
          if (this.waitT <= 0) this.waitT = 1.5 + Math.random() * 1.5;
          this.waitT -= dt;
          if (this.waitT <= 0) this.wp++;
          this.yaw += Math.sin(this.anim * 1.3) * dt * 0.8;
        } else moveTarget = tmp.clone();
      }
      this.suspicion = Math.max(0, this.suspicion - dt * 0.15);
    } else if (this.state === "suspicious") {
      face = p.pos;
      this.alertT = 6;
    } else if (this.state === "search") {
      moveTarget = this.lastKnown;
      speed = (k.walk + k.run) * 0.5;
      this.alertT -= dt;
      if (Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) < 1.0) {
        this.yaw += dt * 1.5;
        moveTarget = null;
      }
      if (this.alertT <= 0) {
        this.state = "patrol";
        this.suspicion = 0;
        this.path = [];
      }
    } else if (this.state === "combat") {
      this.alertT -= dt;
      if (!this.canSee && this.alertT <= 0) {
        this.state = "search";
        this.alertT = 8;
      }
      face = this.canSee ? p.pos : this.lastKnown;
      speed = k.run;
      moveTarget = this.combatMove(distP);
      this.attack(dt, distP);
    }

    // ---- locomotion ----
    let moving = false;
    if (moveTarget && this.state !== "stunned") {
      this.pathT -= dt;
      const direct = Math.hypot(moveTarget.x - this.pos.x, moveTarget.z - this.pos.z) < 5 && g.level.sight(this.pos.x, this.pos.z, moveTarget.x, moveTarget.z, 0.5);
      let next: Vector3 | null = null;
      if (direct) {
        next = moveTarget;
        this.path = [];
      } else {
        if (this.pathT <= 0 || this.path.length === 0) {
          this.pathT = 0.7 + Math.random() * 0.3;
          this.path = g.level.findPath(this.pos.x, this.pos.z, moveTarget.x, moveTarget.z);
        }
        while (this.path.length && Math.hypot(this.path[0].x - this.pos.x, this.path[0].y - this.pos.z) < 0.45) this.path.shift();
        // skip ahead when a later node is directly visible
        if (this.path.length > 1 && g.level.sight(this.pos.x, this.pos.z, this.path[1].x, this.path[1].y, 0.5)) this.path.shift();
        if (this.path.length) next = tmp2.set(this.path[0].x, 0, this.path[0].y).clone();
      }
      if (next) {
        const dx = next.x - this.pos.x;
        const dz = next.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const s = Math.min(d, speed * dt * g.robotSlow(this));
          this.pos.x += (dx / d) * s;
          this.pos.z += (dz / d) * s;
          moving = true;
          if (!face) face = next;
        }
      }
    }
    // knockback
    if (this.knock.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    }
    // separation from other robots
    for (const o of g.robots) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const min = this.rig.radius + o.rig.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
      }
    }
    // keep off the player
    {
      const dx = this.pos.x - p.pos.x;
      const dz = this.pos.z - p.pos.z;
      const min = this.rig.radius + 0.4;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) {
        this.pos.x += (dx / d) * (min - d);
        this.pos.z += (dz / d) * (min - d);
      }
    }
    g.level.collide(this.pos, Math.min(this.rig.radius, 0.45));

    if (face) {
      const want = Math.atan2(face.x - this.pos.x, face.z - this.pos.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += Math.sign(d) * Math.min(Math.abs(d), k.turn * dt * (this.state === "stunned" ? 0 : 1));
    }

    this.animate(dt, moving, speed);
    this.updateEye(dt);
    this.updateCone(dt, distP);
    this.ghost.visible = p.scanning && distP < 40;
    if (this.ghost.visible) {
      this.rig.root.updateMatrixWorld(true);
      for (const c of this.ghost.children) c.matrix.copy((c.userData.src as Mesh).matrixWorld);
    }
  }

  private viewRange(): number {
    const p = this.game.player;
    let r = this.def.view * (this.role === "stealth" ? 0.7 : 1);
    if (p.crouching) r *= 0.6;
    if (p.flashlight) r *= 1.35;
    if (p.sprinting) r *= 1.1;
    if (this.state === "combat" || this.state === "search") r *= 1.4;
    return r;
  }

  private perceive(distP: number): boolean {
    const p = this.game.player;
    if (p.dead) return false;
    const range = this.viewRange();
    if (distP > range) return false;
    const toP = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let d = toP - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    let fov = this.def.fov * (p.flashlight ? 1.25 : 1);
    if (this.state === "combat") fov = Math.PI * 1.6;
    const close = distP < 1.8 + this.rig.radius;
    if (!close && Math.abs(d) > fov / 2) return false;
    return this.game.level.sight(this.pos.x, this.pos.z, p.pos.x, p.pos.z, p.eyeH) && !this.game.smokeBlocks(this.pos, p.pos);
  }

  private combatMove(distP: number): Vector3 | null {
    const k = this.def;
    const p = this.game.player;
    if (k.melee) {
      if (this.guard && this.home.distanceTo(p.pos) > 11 && this.kind === "sentinel") return this.home;
      return distP > k.range * 0.8 ? (this.canSee ? p.pos : this.lastKnown) : null;
    }
    if (!this.canSee) return this.lastKnown;
    if (this.kind === "warlord") return distP > k.range ? p.pos : null;
    if (distP > k.range + 3) return p.pos;
    if (distP < k.range - 3) {
      // back off
      const away = this.pos.clone().sub(p.pos).setY(0).normalize().multiplyScalar(3).add(this.pos);
      return away;
    }
    // strafe a little
    const side = Math.sin(this.anim * 0.8) > 0 ? 1 : -1;
    const f = new Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
    return new Vector3(this.pos.x + f.z * side * 2, 0, this.pos.z - f.x * side * 2);
  }

  private attack(dt: number, distP: number): void {
    const g = this.game;
    const p = g.player;
    const k = this.def;
    this.fireCd -= dt;
    if (k.melee) {
      this.meleeT -= dt;
      if (distP < k.range + 0.3 && this.fireCd <= 0) {
        this.fireCd = 1 / k.rate;
        this.meleeT = 0.35;
        p.damage(k.dmg, this.pos.clone());
        audio.robotHit(distP);
        g.fx.sparks(p.eye.addScaledVector(p.forward(), 0.6), new Vector3(0, 0, 0), 0xfff0c0, 10, 4);
      }
      return;
    }
    if (!this.canSee) {
      this.spinUp = Math.max(0, this.spinUp - dt);
      return;
    }
    if (this.kind === "warlord") {
      // stomp when the player is close
      this.stompCd -= dt;
      if (this.stompT > 0) {
        this.stompT -= dt;
        if (this.stompT <= 0) {
          g.fx.puff(new Vector3(this.pos.x, 0.2, this.pos.z), 0x8a8a8a, 40, new Vector3(0, 0.5, 0), 8, 0.8, 0.5, 1.8);
          g.fx.burst(new Vector3(this.pos.x, 0.3, this.pos.z), 0xffb060, 30, 8, 0.4, 0.4);
          audio.explode(distP, true);
          if (distP < 5) {
            p.damage(28 * this.dmgMul, this.pos.clone());
            g.knockPlayer(this.pos, 9);
          }
        }
        return;
      }
      if (distP < 4 && this.stompCd <= 0) {
        this.stompT = 0.7;
        this.stompCd = 5;
        audio.servo(distP);
        return;
      }
      // gatling: spin up, burst, cool down
      if (this.burst <= 0 && this.fireCd <= 0) {
        this.spinUp += dt;
        if (this.spinUp > 0.8) {
          this.burst = 26;
          this.spinUp = 0.8;
        }
      }
      if (this.burst > 0 && this.fireCd <= 0) {
        this.fireCd = 1 / k.rate;
        this.burst--;
        this.shootBolt(0.07, 0xff6030, 0.11);
        audio.gatling(distP);
        if (this.burst <= 0) {
          this.fireCd = 2.2;
          this.spinUp = 0;
        }
      }
      return;
    }
    const aimed = this.facingPlayer(0.35);
    if (this.fireCd <= 0 && aimed && distP < k.view * 1.6) {
      if (this.kind === "bulwark") {
        this.burst = this.burst > 0 ? this.burst - 1 : 2;
        this.fireCd = this.burst > 0 ? 0.28 : 1 / k.rate + 0.8;
        this.shootBolt(0.04, 0xff4020, 0.16);
        audio.robotShot(distP, true);
      } else {
        this.fireCd = 1 / k.rate + Math.random() * 0.4;
        this.shootBolt(0.05, 0xff3020, 0.09);
        audio.robotShot(distP, false);
      }
    }
  }

  private facingPlayer(tol: number): boolean {
    const p = this.game.player;
    const want = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < tol;
  }

  private shootBolt(spread: number, color: number, size: number): void {
    const g = this.game;
    const m = this.rig.muzzles[this.muzzleIdx++ % this.rig.muzzles.length];
    const from = m.getWorldPosition(new Vector3());
    const target = g.player.eye.add(new Vector3(0, -0.25, 0));
    // lead slightly
    target.addScaledVector(g.player.vel, from.distanceTo(target) / this.def.boltSpeed * 0.5);
    const dir = target.sub(from).normalize();
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    g.spawnBolt(from, dir.multiplyScalar(this.def.boltSpeed), this.def.dmg, color, size, this.kind === "bulwark" ? 1.2 : 0);
    g.fx.glow(from, color, 0.5, 0.06);
  }

  private animate(dt: number, moving: boolean, speed: number): void {
    const r = this.rig;
    r.root.position.set(this.pos.x, 0, this.pos.z);
    r.root.rotation.y = this.yaw;
    const stride = moving ? Math.min(1, speed / 2.5) : 0;
    const f = this.anim * (this.kind === "drone" ? 7 : this.kind === "warlord" ? 3.2 : 5) * (0.6 + stride * 0.5);
    if (this.kind === "sentinel") {
      r.body.position.y = 0.12 + Math.sin(this.anim * 2.5) * 0.05;
      const spin = this.state === "combat" ? 9 : 1.2;
      r.hipL.rotation.y += dt * spin;
      r.hipR.rotation.y -= dt * spin * 0.8;
      const swing = this.meleeT > 0 ? Math.sin(this.meleeT * 20) * 1.2 : 0;
      r.armL.rotation.y = swing + Math.sin(this.anim * 3) * 0.1;
      r.armR.rotation.y = -swing - Math.sin(this.anim * 3) * 0.1;
      r.body.rotation.z = 0;
    } else {
      const sw = Math.sin(f) * 0.5 * stride;
      r.hipL.rotation.x = sw;
      r.hipR.rotation.x = -sw;
      if (r.kneeL && r.kneeR) {
        // knees bend on the lifting leg
        const k = r.reverseKnee ? -1 : 1;
        r.kneeL.rotation.x = k * Math.max(0, Math.sin(f + 1.2)) * 0.7 * stride;
        r.kneeR.rotation.x = k * Math.max(0, Math.sin(f + 1.2 + Math.PI)) * 0.7 * stride;
      }
      r.body.position.y = Math.abs(Math.cos(f)) * 0.05 * stride;
      const aim = this.state === "combat" && !this.def.melee ? this.rig.aim : 0;
      if (this.kind === "drone") {
        r.armL.rotation.x = -sw * 0.8 + (this.state === "combat" ? -0.6 : 0);
        r.armR.rotation.x = sw * 0.8 + (this.state === "combat" ? -0.6 : 0);
      } else if (this.kind === "ripper") {
        const jab = this.meleeT > 0 ? -1.4 : this.state === "combat" ? -0.9 : 0;
        r.armL.rotation.x = -sw * 0.4 + jab;
        r.armR.rotation.x = sw * 0.4 + (this.meleeT > 0 ? -0.3 : jab);
      } else {
        const stomp = this.stompT > 0 ? -0.8 : 0;
        r.armL.rotation.x += (aim + stomp - r.armL.rotation.x) * Math.min(1, dt * 6);
        r.armR.rotation.x += (aim + stomp - r.armR.rotation.x) * Math.min(1, dt * 6);
        if (this.kind === "warlord" && this.stompT > 0) r.body.position.y = 0.3 * Math.sin((0.7 - this.stompT) / 0.7 * Math.PI);
      }
      if (this.state === "stunned") {
        r.body.rotation.z = Math.sin(this.anim * 30) * 0.05;
      } else r.body.rotation.z = 0;
    }
    // hit stagger (and a limp once badly damaged)
    const limp = this.hp < this.def.hp * 0.35 ? Math.max(0, Math.sin(f)) * 0.07 * stride : 0;
    r.body.rotation.x = this.stagP;
    r.body.rotation.z += this.stagR + limp;
    r.armL.rotation.z = this.stagR * 1.4 - this.stagP * 0.9;
    r.armR.rotation.z = this.stagR * 1.4 + this.stagP * 0.9;
    const spinSpeed = this.kind === "ripper" ? (this.state === "combat" ? 30 : 4) : this.kind === "warlord" ? this.spinUp * 35 + (this.burst > 0 ? 30 : 0) : 0;
    if (this.kind === "ripper") for (const s of r.spinners) s.rotation.y += dt * spinSpeed;
    if (this.kind === "warlord") for (const s of r.spinners) s.rotation.z += dt * spinSpeed;
    if (this.kind === "sentinel" && this.state === "combat" && Math.random() < dt * 6) this.game.fx.sparks(this.center, new Vector3(0, 0.5, 0), 0xfff0c0, 2, 3);
    if (moving) {
      this.stepT -= dt * speed;
      if (this.stepT <= 0) {
        this.stepT = this.kind === "warlord" ? 2.4 : 1.4;
        const d = this.pos.distanceTo(this.game.player.pos);
        if (this.kind !== "sentinel") audio.step(d, this.def.heavy);
        else audio.servo(d);
      }
    }
  }

  private updateEye(dt: number): void {
    const m = this.rig.eyeMat;
    const t = this.anim;
    let c = this.role === "target" ? 0x40c8ff : 0xff2010;
    let i = 1.4;
    if (this.state === "suspicious" || this.state === "search") {
      c = 0xffc020;
      i = 2 + Math.sin(t * 14) * 1.2;
    } else if (this.state === "combat") {
      c = 0xff1000;
      i = 5;
    } else if (this.state === "stunned") {
      c = 0x40c0ff;
      i = Math.random() * 4;
    } else if (this.state === "dormant") {
      c = 0x801000;
      i = 0.6 + Math.sin(t * 1.5) * 0.3;
    }
    if (this.flashHit > 0) {
      c = 0xffffff;
      i = 6;
    } else if (this.eyeFlick > 0 || (this.hp < this.def.hp * 0.35 && Math.random() < 0.08)) {
      i = Math.random() < 0.5 ? 0.2 : i * 1.5;
      m.emissiveIntensity = i;
    }
    m.emissive.setHex(c);
    m.color.setHex(c);
    m.emissiveIntensity += (i - m.emissiveIntensity) * Math.min(1, dt * 20);
  }

  private updateCone(dt: number, distP: number): void {
    const mat = this.cone.material as MeshBasicMaterial;
    const show = this.state !== "dormant" && this.state !== "stunned" && distP < 30 && this.game.showCones;
    this.cone.visible = show;
    if (!show) return;
    const col = this.state === "combat" ? 0xff2010 : this.state === "patrol" ? 0xff5030 : 0xffc020;
    mat.color.setHex(col);
    mat.opacity = this.state === "combat" ? 0.06 : 0.1 + this.suspicion * 0.08;
    this.coneT -= dt;
    if (this.coneT > 0) return;
    this.coneT = distP < 12 ? 0.08 : 0.22;
    const pos = this.coneGeo.attributes.position as BufferAttribute;
    const SEG = 18;
    const range = this.viewRange();
    const fov = this.state === "combat" ? Math.PI * 1.6 : this.def.fov * (this.game.player.flashlight ? 1.25 : 1);
    const o = new Vector3(this.pos.x, 0.5, this.pos.z);
    pos.setXYZ(0, this.pos.x, 0.03, this.pos.z);
    const d = new Vector3();
    for (let i = 0; i <= SEG; i++) {
      const a = this.yaw - fov / 2 + (fov * i) / SEG;
      d.set(Math.sin(a), 0, Math.cos(a));
      const hit = this.game.level.raycast(o, d, range);
      pos.setXYZ(i + 1, this.pos.x + d.x * hit.t, 0.03, this.pos.z + d.z * hit.t);
    }
    pos.needsUpdate = true;
  }
}

function raySphere(o: Vector3, d: Vector3, c: Vector3, r: number): number | null {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

// ------------------------------------------------------------------ bolts
export interface Bolt {
  sprite: Sprite;
  core: Mesh | null;
  pos: Vector3;
  vel: Vector3;
  dmg: number;
  life: number;
  splash: number;
  color: Color;
}

export function makeBoltSprite(color: number, size: number): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glowSpriteTex(), color, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size * 4);
  return s;
}
