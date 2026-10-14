import { AdditiveBlending, FogExp2, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, RingGeometry, Scene, Sprite, SpriteMaterial, Vector2, Vector3 } from "three";
import { audio } from "./audio";
import { ARMORY_BONUS, COLONY_BONUS, difficultyDef, MISSION_BONUS, RESCUE_BONUS, ROBOT_POINTS, scaledPoints, type Difficulty, type HeroStats } from "./data";
import { COLONY_EXTRACT, COLONY_HAZARDS, COLONY_MAP, COLONY_PICKUPS, COLONY_ROBOTS, COLONY_VENTS } from "./colony";
import { Fx } from "./fx";
import type { Hud } from "./hud";
import { Level } from "./level";
import { TRAINING_MAP, TrainingCourse } from "./training";
import { M, ammoCase, box, compact, medkit, type RobotKind } from "./models";
import { Player } from "./player";
import { makeBoltSprite, Robot, type Bolt } from "./robots";
import { glowSpriteTex } from "./textures";

interface Pickup {
  kind: "health" | "ammo";
  pos: Vector3;
  mesh: Group;
  taken: boolean;
  marker: Sprite;
}

interface Hazard {
  kind: "arc" | "flame" | "steam";
  pos: Vector3;
  period: number;
  offset: number;
  warn: number;
  active: number;
  radius: number;
  dps: number;
  phase: "idle" | "warn" | "active";
  hitDone: boolean;
  deco: Group;
  glow: MeshBasicMaterial;
}

export type MissionId = "freighter" | "training" | "colony";

export interface MissionResult {
  mission: MissionId;
  won: boolean;
  /** difficulty the mission was played on (real missions only) */
  difficulty?: Difficulty;
  grade?: string;
  accuracy?: number;
  firstClear?: boolean;
  bestTime?: number;
  kills: Record<RobotKind, number>;
  combatPoints: number;
  armory: boolean;
  /** what the optional objective was called ("Armory secured", "Survivors rescued") */
  extraLabel?: string;
  bonus: number;
  total: number;
  time: number;
  secured: { name: string; done: boolean }[];
  spotted: number;
}

export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

export class Game {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(74, 1, 0.05, 700);
  private ambT = 0;
  level: Level;
  mission: MissionId = "freighter";
  /** difficulty for real missions; set by start() */
  difficulty: Difficulty = "recruit";
  course: TrainingCourse | null = null;
  private readonly levels = new Map<MissionId, Level>();
  shots = 0;
  hits = 0;
  lastHitCrit = false;
  readonly fx: Fx;
  readonly player: Player;
  robots: Robot[] = [];
  readonly bolts: Bolt[] = [];
  pickups: Pickup[] = [];
  hazards: Hazard[] = [];
  alarm = 0;
  alarms = 0;
  slowFactor = 1;
  showCones = true;
  stage: Stage = 0;
  armorySecured = false;
  armoryUnlocked = false;
  kills: Record<RobotKind, number> = { drone: 0, sentinel: 0, ripper: 0, bulwark: 0, warlord: 0 };
  combatPoints = 0;
  time = 0;
  hackProgress = 0;
  hackTarget: string | null = null;
  boss: Robot | null = null;
  bossHalf = false;
  /** colony: robots the factory has built since you arrived, and the build timer */
  private factorySpawned = 0;
  private factoryT = 0;
  spottedCount = 0;
  readonly said = new Set<string>();
  private lastRoom = "";
  running = false;
  onEnd: ((r: MissionResult) => void) | null = null;
  private endT = -1;
  private pendingResult: MissionResult | null = null;
  private readonly knock = new Vector3();
  private elapsed = 0;

  constructor(public hud: Hud) {
    this.scene.add(this.camera);
    this.level = new Level();
    this.levels.set("freighter", this.level);
    this.scene.add(this.level.group);
    this.applyFog();
    this.fx = new Fx(this.scene);
    this.player = new Player(this, this.camera);
  }

  // ------------------------------------------------------------------ setup
  start(stats: HeroStats, mission: MissionId = "freighter", difficulty: Difficulty = "recruit"): void {
    this.difficulty = difficulty;
    this.useMap(mission);
    this.reset();
    this.player.equip(stats);
    if (mission === "training") {
      this.course = new TrainingCourse(this);
      this.course.start();
      this.running = true;
      this.hud.setObjectives(this.objectives());
      return;
    }
    this.course = null;
    if (mission === "colony") this.player.spawn(63.2, 15.5, Math.PI / 2);
    else this.player.spawn(54.9, 25.7, 0);
    this.spawnRobots();
    this.spawnPickups();
    this.spawnHazards();
    this.running = true;
    this.hud.setObjectives(this.objectives());
    if (mission === "colony")
      setTimeout(() => this.radio("start", `Dropship down on the landing pad. ${stats.def.name}, Helios Colony has been silent for nine days and the power's failing. Get the <b>generator</b> in the <b>Power Station</b> running: go through the Commons, then left.`), 600);
    else setTimeout(() => this.radio("start", `Dropship docked. ${stats.def.name}, the robots have taken over this freighter. Head aft to <b>Engineering</b> and shut down their control relay.`), 600);
    setTimeout(() => this.hud.hint("Robot eyes: <b style='color:#ff5a40'>RED</b> = patrolling · <b style='color:#ffc020'>YELLOW</b> = suspicious · <b style='color:#ff2010'>BRIGHT RED</b> = spotted you. Hold <b>CTRL</b> to crouch and stay hidden.", 9), 7000);
  }

  /** Swap in the map for a mission (the training station is built the first time it's needed). */
  private useMap(mission: MissionId): void {
    this.mission = mission;
    let lv = this.levels.get(mission);
    if (!lv) {
      lv = new Level(mission === "training" ? TRAINING_MAP : COLONY_MAP);
      this.levels.set(mission, lv);
    }
    if (lv !== this.level) {
      this.scene.remove(this.level.group);
      this.level = lv;
      this.scene.add(lv.group);
    }
    this.applyFog();
  }

  /** Each map has its own air: smoky dim haze on the freighter, a faint clean haze on the station. */
  private applyFog(): void {
    const f = this.level.def.fog;
    this.scene.fog = f ? new FogExp2(f[0], f[1]) : null;
  }

  /** Torn panels crackle and vents hiss when the player is close. */
  private ambientFx(dt: number): void {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 0.12;
    const p = this.player.pos;
    for (const s of this.level.sparkSpots) {
      const d = Math.abs(s.p.x - p.x) + Math.abs(s.p.z - p.z);
      if (d > 16 || Math.random() > 0.14) continue;
      this.fx.sparks(s.p, s.n, 0xffd080, 6 + ((Math.random() * 10) | 0), 2.5 + Math.random() * 2);
    }
    for (const s of this.level.steamSpots) {
      const d = Math.abs(s.p.x - p.x) + Math.abs(s.p.z - p.z);
      if (d > 18 || Math.random() > 0.5) continue;
      this.fx.puff(s.p, 0xc8d0d8, 2, s.n.clone().multiplyScalar(0.9), 0.25, 1.6, 0.15, 0.7);
    }
  }

  private reset(): void {
    this.course?.dispose();
    this.shots = 0;
    this.hits = 0;
    for (const r of this.robots) r.remove();
    this.robots = [];
    for (const b of this.bolts) this.fx.giveSprite(b.sprite);
    this.bolts.length = 0;
    for (const p of this.pickups) this.scene.remove(p.mesh, p.marker);
    this.pickups = [];
    for (const h of this.hazards) this.scene.remove(h.deco);
    this.hazards = [];
    this.fx.clear();
    this.alarm = 0;
    this.alarms = 0;
    this.stage = 0;
    this.armorySecured = false;
    this.armoryUnlocked = false;
    this.kills = { drone: 0, sentinel: 0, ripper: 0, bulwark: 0, warlord: 0 };
    this.combatPoints = 0;
    this.time = 0;
    this.hackProgress = 0;
    this.hackTarget = null;
    this.boss = null;
    this.bossHalf = false;
    this.factorySpawned = 0;
    this.factoryT = 4;
    this.spottedCount = 0;
    this.said.clear();
    this.lastRoom = "";
    this.endT = -1;
    this.pendingResult = null;
    this.knock.set(0, 0, 0);
    if (this.mission === "freighter") {
      this.level.setDoorLocked("blast", true);
      this.level.setDoorLocked("armory", true);
      this.level.relayLight.material = M.redGlow;
    }
    const col = this.level.colony;
    if (this.mission === "colony" && col) {
      this.level.setDoorLocked("c_mine", true);
      this.level.setDoorLocked("c_med", true);
      this.level.setPowered(false);
      col.genGlow.color.setHex(0xff3020);
      col.genGlow.emissive.setHex(0xff2010);
      col.podGlass.emissive.setHex(0x2a8cc0);
      const hp = Math.round(350 * difficultyDef(this.difficulty).hp);
      for (const c of col.cores) {
        c.hp = c.max = hp;
        c.glow.color.setHex(0xff3020);
        c.glow.emissive.setHex(0xff2010);
        c.glow.emissiveIntensity = 2.6;
        c.root.rotation.z = 0;
      }
    }
    for (const d of this.level.doors) d.open = 0;
  }

  addRobot(kind: RobotKind, x: number, z: number, patrol: [number, number][] = [], yaw = 0, guard = false): Robot {
    const r = new Robot(this, kind, x, z, patrol.map(([a, b]) => new Vector2(a, b)), yaw, guard);
    this.robots.push(r);
    return r;
  }

  private spawnRobots(): void {
    if (this.mission === "colony") {
      for (const [k, x, z, patrol, yaw, guard] of COLONY_ROBOTS) this.addRobot(k, x, z, patrol, yaw, guard);
      return;
    }
    const W = -Math.PI / 2; // facing -X
    const E = Math.PI / 2;
    const N = Math.PI; // facing -Z
    // Cargo Hull
    this.addRobot("drone", 50, 9.6, [[50, 9.6], [55.5, 9.6], [55.5, 13], [51, 13.5]], E);
    // Engineering
    this.addRobot("sentinel", 58.7, 11.2, [], W, true);
    this.addRobot("drone", 62, 20, [[62, 20], [58.8, 20], [58.8, 18], [62, 20]], 0);
    // Fuel Tank Two
    this.addRobot("drone", 51, 2.2, [[51, 2.2], [51, 4.4], [43, 4.4], [51, 4.4]], N);
    // Living quarters
    this.addRobot("drone", 45, 14.2, [[45, 14.2], [33, 14.2]], W);
    this.addRobot("drone", 44, 15.8, [[44, 15.8], [33.5, 15.8]], W);
    this.addRobot("ripper", 43.5, 20.5, [], N, true);
    this.addRobot("sentinel", 36, 9.5, [], 0, true);
    // Conference Room
    this.addRobot("bulwark", 23, 10, [[23, 10], [28.5, 10], [28.5, 21], [23, 21]], E);
    this.addRobot("sentinel", 22.3, 13.5, [], E, true);
    this.addRobot("ripper", 28.8, 20, [[28.8, 20], [22.5, 20]], W);
    // Forward section
    this.addRobot("drone", 12, 15.5, [[12, 15.5], [19, 15.5]], E);
    this.addRobot("drone", 18.5, 10.8, [[18.5, 10.8], [11.5, 10.8]], W);
    this.addRobot("sentinel", 15, 20.8, [], N, true);
    // Bridge: the Warlord
    this.boss = this.addRobot("warlord", 4.6, 15.5, [], E, true);
  }

  spawnPickups(custom?: [Pickup["kind"], number, number][]): Pickup[] {
    const made: Pickup[] = [];
    const list: [Pickup["kind"], number, number][] = custom ?? (this.mission === "colony" ? COLONY_PICKUPS : [
      ["ammo", 49.3, 16.4],
      ["health", 55.6, 19.4],
      ["ammo", 43, 4.4],
      ["health", 52.3, 1.5],
      ["health", 43, 29.4],
      ["ammo", 52.3, 26.6],
      ["health", 38.3, 10.4],
      ["ammo", 41.5, 10.5],
      ["ammo", 33.5, 19],
      ["health", 45.6, 19.2],
      ["ammo", 29.6, 14.5],
      ["health", 21.6, 21.5],
      ["health", 19.2, 11.6],
      ["ammo", 12.8, 20.5],
      ["ammo", 17.5, 20.5],
      ["health", 18.8, 21.8],
      ["health", 8.6, 10.6],
      ["ammo", 8.6, 20.4],
      ["ammo", 59, 18.6],
    ]);
    for (const [kind, x, z] of list) {
      const g = kind === "health" ? medkit() : ammoCase();
      compact(g);
      g.position.set(x, 0, z);
      this.scene.add(g);
      const marker = new Sprite(new SpriteMaterial({ map: glowSpriteTex(), color: kind === "health" ? 0x40ff80 : 0x40d8ff, blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0.5 }));
      marker.scale.setScalar(0.35);
      marker.position.set(x, 0.55, z);
      marker.renderOrder = 15;
      this.scene.add(marker);
      const pk: Pickup = { kind, pos: new Vector3(x, 0, z), mesh: g, taken: false, marker };
      this.pickups.push(pk);
      made.push(pk);
    }
    return made;
  }

  private spawnHazards(): void {
    const add = (kind: Hazard["kind"], x: number, z: number, offset: number): void => {
      const deco = new Group();
      const glow = new MeshBasicMaterial({ color: kind === "arc" ? 0x60e0ff : kind === "flame" ? 0xff8030 : 0xdde8f0, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false });
      if (kind === "arc") {
        box(0.5, 0.1, 0.5, M.darkMetal, 0, 0.05, 0, deco);
        box(0.12, 0.5, 0.12, M.gunGrey, 0, 0.3, 0, deco);
      } else {
        box(0.9, 0.06, 0.9, M.hazard, 0, 0.03, 0, deco);
        box(0.6, 0.08, 0.6, M.darkMetal, 0, 0.04, 0, deco);
        for (let i = 0; i < 4; i++) box(0.5, 0.09, 0.05, M.gunBlack, 0, 0.05, -0.2 + i * 0.13, deco);
      }
      const ring = new Mesh(new RingGeometry(0.1, kind === "arc" ? 1.4 : 1.0, 28), glow);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      deco.add(ring);
      deco.position.set(x, 0, z);
      this.scene.add(deco);
      const spec = kind === "arc" ? { period: 4.2, warn: 0.9, active: 0.7, radius: 1.4, dps: 30 } : kind === "flame" ? { period: 5.2, warn: 1.0, active: 1.6, radius: 1.0, dps: 35 } : { period: 4.6, warn: 0.8, active: 1.8, radius: 1.0, dps: 14 };
      this.hazards.push({ kind, pos: new Vector3(x, 0, z), offset, phase: "idle", hitDone: false, deco, glow, ...spec });
    };
    if (this.mission === "colony") {
      for (const [k, x, z, o] of COLONY_HAZARDS) add(k, x, z, o);
      return;
    }
    add("arc", 62, 12.3, 0);
    add("arc", 62, 18.7, 2.1);
    add("arc", 59.2, 13.2, 1.0);
    add("arc", 59.2, 17.8, 3.1);
    add("flame", 46, 4.4, 0);
    add("flame", 44, 4.4, 2.5);
    add("flame", 46, 29.3, 1.2);
    add("flame", 44, 29.3, 3.7);
    add("flame", 51.2, 27.6, 0.4);
    add("steam", 13, 10.8, 0);
    add("steam", 16, 10.2, 1.5);
    add("steam", 18.5, 11.3, 3.0);
  }

  // ------------------------------------------------------------------ helpers used by player/robots
  noise(pos: Vector3, radius: number, strength: number): void {
    if (radius <= 0) return;
    for (const r of this.robots) {
      if (!r.alive) continue;
      const d = r.pos.distanceTo(pos);
      if (d < radius) r.hear(pos, Math.min(0.9, strength * (1 - d / radius) + 0.4));
    }
  }

  hitscan(o: Vector3, d: Vector3, max: number, dmg: number, falloff = 0): Vector3 {
    const wall = this.level.raycast(o, d, max);
    let best: Robot | null = null;
    let bestT = wall.t;
    let crit = false;
    for (const r of this.robots) {
      const h = r.hitTest(o, d);
      if (h && h.t < bestT) {
        bestT = h.t;
        best = r;
        crit = h.crit;
      }
    }
    // colony: the factory's glowing power cores can be shot
    let core: import("./level").ColonyCore | null = null;
    for (const c of this.level.colony?.cores ?? []) {
      if (c.hp <= 0) continue;
      const oc = o.clone().sub(c.pos);
      const b = oc.dot(d);
      const disc = b * b - (oc.lengthSq() - 0.62 * 0.62);
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t <= 0 || t >= bestT + 0.95) continue;
      // the core's own stand is the only thing allowed to be "in front" of it
      const wp = o.clone().addScaledVector(d, wall.t);
      if (t > bestT && Math.hypot(wp.x - c.pos.x, wp.z - c.pos.z) > 1.3) continue;
      if (best && t > bestT) continue;
      core = c;
      bestT = t;
      best = null;
    }
    const p = o.clone().addScaledVector(d, bestT);
    this.shots++;
    this.lastHitCrit = crit && !core;
    if (core) {
      this.hits++;
      this.damageCore(core, dmg, p, d);
      return p;
    }
    if (best) {
      this.hits++;
      const amount = dmg * (crit ? 2 : 1) * (falloff > 0 ? Math.max(0.25, 1 - bestT / falloff) : 1);
      best.damage(amount, crit, true, p, d);
      this.fx.sparks(p, d.clone().negate(), crit ? 0xfff080 : 0xffb050, crit ? 22 : 12, 5);
      audio.hitmarker(crit);
      audio.robotHit(bestT * 0.3);
      this.hud.hitmarker(crit, !best.alive);
      if (best === this.boss) this.hud.setBoss(best.hp / best.def.hp);
    } else {
      this.fx.sparks(p, wall.normal, 0x9fe8ff, 8, 3);
      this.fx.puff(p, 0x555555, 2, wall.normal.clone().multiplyScalar(0.6), 0.3, 0.6, 0.1, 0.4);
    }
    return p;
  }

  spawnBolt(from: Vector3, vel: Vector3, dmg: number, color: number, size: number, splash: number): void {
    const sprite = this.fx.takeSprite(color, size * 4);
    sprite.position.copy(from);
    this.bolts.push({ sprite, core: null, pos: from.clone(), vel, dmg, life: 3, splash, color: sprite.material.color.clone() });
  }

  knockPlayer(from: Vector3, force: number): void {
    const d = this.player.pos.clone().sub(from).setY(0).normalize().multiplyScalar(force);
    this.knock.copy(d);
  }

  robotSlow(_r: Robot): number {
    return 1;
  }

  shieldBash(): void {
    const p = this.player;
    const f = p.forward().setY(0).normalize();
    this.fx.puff(p.eye.addScaledVector(f, 1), 0x9fe8ff, 20, f.clone().multiplyScalar(4), 1.5, 0.4, 0.3, 0.8, true);
    for (const r of this.robots) {
      if (!r.alive || r.state === "dormant") continue;
      const to = r.pos.clone().sub(p.pos).setY(0);
      const d = to.length();
      if (d < 3.6 + r.rig.radius && to.normalize().dot(f) > 0.3) {
        r.damage(30, false);
        if (r.alive) {
          r.stun(1.6);
          r.knock.copy(to.multiplyScalar(r.kind === "warlord" ? 1 : 8));
        }
      }
    }
  }

  /** A frag grenade or mine going off: hurts robots (and you, if you're too close) with walls and cover blocking it. */
  blast(pos: Vector3, dmg: number, radius: number, selfDmg: number): void {
    const p = this.player;
    audio.explode(pos.distanceTo(p.pos), true);
    this.fx.explosion(pos, true);
    this.fx.flash(pos, 0xffa040, 26, 0.25);
    this.fx.burst(pos, 0xffc060, 40, 7, 0.45, 0.3);
    const open = (to: Vector3, len: number): boolean => {
      const d = to.clone().sub(pos);
      const l = d.length();
      if (l < 0.3) return true;
      return this.level.raycast(pos, d.normalize(), l).t >= Math.min(l, len) - 0.35;
    };
    let hitAny = false;
    let killed = false;
    for (const r of this.robots) {
      if (!r.alive) continue;
      const c = r.center;
      const dist = Math.max(0, c.distanceTo(pos) - r.rig.radius * 0.6);
      if (dist > radius || !open(c, c.distanceTo(pos) - r.rig.radius)) continue;
      const k = 1 - dist / radius;
      p.lastAttack = "gadget";
      r.damage(dmg * (0.35 + 0.65 * k), false, true);
      hitAny = true;
      if (!r.alive) killed = true;
      else r.knock.add(c.clone().sub(pos).setY(0).normalize().multiplyScalar(6 * k));
    }
    for (const c of this.level.colony?.cores ?? []) {
      if (c.hp <= 0) continue;
      const dist = c.pos.distanceTo(pos) - 0.6;
      if (dist < radius) {
        p.lastAttack = "gadget";
        this.damageCore(c, dmg * 0.7 * (1 - Math.max(0, dist) / radius), c.pos.clone(), c.pos.clone().sub(pos).normalize());
      }
    }
    if (hitAny) this.hud.hitmarker(false, killed);
    const self = new Vector3(p.pos.x, 0.9, p.pos.z);
    const sd = self.distanceTo(pos);
    const sr = radius * 0.75;
    if (!p.dead && sd < sr && open(self, sd)) p.damage(selfDmg * (1 - sd / sr), pos.clone());
    if (sd < sr) this.knockPlayer(pos, 4);
    this.noise(pos, 22, 1);
  }

  /** Is the line between two points hidden by a smoke cloud (or is either end inside one)? */
  smokeBlocks(a: Vector3, b: Vector3): boolean {
    for (const d of this.player.devices) {
      if (d.kind !== "smoke" || !d.landed || d.t <= 0.8) continue;
      const r = 2.9 * Math.min(1, (10 - d.t) / 1.2);
      if (r < 0.5) continue;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      const u = Math.max(0, Math.min(1, ((d.pos.x - a.x) * abx + (d.pos.z - a.z) * abz) / len2));
      if (Math.hypot(a.x + abx * u - d.pos.x, a.z + abz * u - d.pos.z) < r) return true;
    }
    return false;
  }

  /** EMP: a silent shockwave that shuts down every robot in range for a few seconds. */
  empBlast(pos: Vector3): void {
    const p = this.player;
    audio.pulse(pos.distanceTo(p.pos));
    this.fx.burst(pos, 0x55e6ff, 60, 9, 0.5, 0.35);
    this.fx.flash(pos, 0x55e6ff, 22, 0.3);
    const ring = new Mesh(new RingGeometry(0.85, 1, 48), new MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.15, pos.z);
    this.scene.add(ring);
    let t = 0;
    const grow = (): void => {
      t += 0.016;
      ring.scale.setScalar(1 + t * 24);
      (ring.material as MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 2.4);
      if (t < 0.38) requestAnimationFrame(grow);
      else this.scene.remove(ring);
    };
    grow();
    let n = 0;
    for (const r of this.robots) {
      if (!r.alive || r.state === "dormant") continue;
      if (r.pos.distanceTo(pos) < 7.5) {
        r.stun(6);
        this.fx.sparks(r.center, new Vector3(0, 1, 0), 0x9ff4ff, 10, 3);
        n++;
      }
    }
    if (n) this.hud.hint(`<b style='color:#7fe8ff'>EMP</b>: ${n} robot${n === 1 ? "" : "s"} shut down`, 2);
  }

  pulseBlast(pos: Vector3): void {
    audio.pulse(pos.distanceTo(this.player.pos));
    this.fx.burst(pos, 0x55e6ff, 80, 10, 0.6, 0.5);
    this.fx.burst(pos, 0xffffff, 20, 4, 0.3, 1.0);
    this.fx.flash(pos, 0x55e6ff, 20, 0.3);
    const ring = new Mesh(new RingGeometry(0.8, 1, 40), new MeshBasicMaterial({ color: 0x80f0ff, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.1, pos.z);
    this.scene.add(ring);
    let t = 0;
    const grow = (): void => {
      t += 0.016;
      ring.scale.setScalar(1 + t * 20);
      (ring.material as MeshBasicMaterial).opacity = Math.max(0, 0.8 - t * 2.5);
      if (t < 0.35) requestAnimationFrame(grow);
      else this.scene.remove(ring);
    };
    grow();
    for (const r of this.robots) {
      if (!r.alive || r.state === "dormant") continue;
      const d = r.pos.distanceTo(pos);
      if (d < 6.5) {
        r.damage(40 * (1 - d / 9), false);
        r.stun(4.5);
      }
    }
    this.noise(pos, 14, 0.8);
  }

  onRobotSpotted(r: Robot): void {
    if (this.course) {
      this.course.onSpotted(r);
      return;
    }
    this.spottedCount++;
    this.hud.spotted();
    if (!this.said.has("spotted") && r.kind !== "warlord") this.radio("spotted", "They've seen you! Take it down fast, or break line of sight before it raises the alarm.");
  }

  onRobotKilled(r: Robot): void {
    if (this.course) {
      this.course.onKilled(r);
      return;
    }
    const pts = scaledPoints(ROBOT_POINTS[r.kind], this.difficulty);
    this.kills[r.kind]++;
    this.combatPoints += pts;
    this.hud.floatText(r.center.add(new Vector3(0, 0.5, 0)), `+${pts}`, r.kind === "warlord" ? 2 : 1);
    this.hud.setScore(this.combatPoints + (this.armorySecured ? this.armoryPoints : 0));
    this.noise(r.pos, 10, 0.7);
    if (r === this.boss) {
      this.hud.setBoss(-1);
      this.stage = 3;
      this.hud.setObjectives(this.objectives());
      this.radio("bossdead", "The Warlord is down! Get to the <b>main console</b> at the front of the Bridge and take control of the ship.");
    }
  }

  triggerAlarm(src: Robot | null): void {
    if (this.alarm > 0 || this.course) return;
    this.alarm = 22;
    this.alarms++;
    audio.alarm();
    this.hud.alarm(true);
    const at = src ? src.pos : this.player.pos;
    for (const r of this.robots) if (r.alive && r !== src && r.pos.distanceTo(at) < 22) r.alert(this.player.pos, false);
    if (this.alarms <= 2 && this.stage < 4) this.reinforce(this.alarms === 1 ? 1 : 2);
    if (!this.said.has("alarm" + this.alarms)) this.radio("alarm" + this.alarms, "Alarm triggered! More robots are on the way. Break line of sight and hide until it calms down.");
  }

  private reinforce(n: number): void {
    // drones crawl out of the nearest maintenance vent away from the player
    const vents: [number, number][] = this.mission === "colony" ? COLONY_VENTS : [[50, 22], [44, 14.5], [26, 8], [26, 22], [12, 15.5], [60, 11]];
    const p = this.player.pos;
    const sorted = vents.filter(([x, z]) => Math.hypot(x - p.x, z - p.z) > 9).sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.z) - Math.hypot(b[0] - p.x, b[1] - p.z));
    for (let i = 0; i < n && i < sorted.length; i++) {
      const [x, z] = sorted[i];
      const r = this.addRobot("drone", x, z, [], 0, false);
      r.alert(p, false);
      this.fx.puff(new Vector3(x, 0.5, z), 0x444444, 20, new Vector3(0, 1, 0), 1.5, 1.2, 0.4, 1.4);
    }
  }

  wakeBoss(): void {
    const b = this.boss;
    if (!b || !b.alive || b.state !== "dormant") return;
    b.state = "combat";
    b.alertT = 999;
    b.lastKnown.copy(this.player.pos);
    b.guard = false;
    audio.bossRoar();
    this.stage = Math.max(this.stage, 2) as Stage;
    this.hud.setObjectives(this.objectives());
    this.hud.setBoss(1, "UNIT V1.20 · WARLORD");
    this.radio("boss", "That's <b>Unit V1.20, the Warlord</b>! Stay behind the consoles and hit its glowing chest eye!");
  }

  radio(key: string, text: string): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    audio.radio();
    this.hud.radio(this.course ? "INSTRUCTOR" : "MISSION CONTROL", text);
  }

  objectives(): { text: string; done: boolean; optional?: boolean; active?: boolean }[] {
    if (this.course) return this.course.objectives();
    const s = this.stage;
    if (this.mission === "colony") {
      const left = this.level.colony?.cores.filter((c) => c.hp > 0).length ?? 0;
      const cl: { text: string; done: boolean; optional?: boolean; active?: boolean }[] = [
        { text: "Restore power at the Power Station generator", done: s > 0, active: s === 0 },
        { text: "Go down the mine and find the robot signal", done: s > 1, active: s === 1 },
        { text: s === 2 ? `Destroy the factory's power cores (${left} left)` : "Destroy the Robot Factory's power cores", done: s > 2, active: s === 2 },
        { text: "Extract: get back to the landing pad airlock", done: s > 4, active: s === 4 },
      ];
      if (s >= 1) cl.splice(1, 0, { text: "Optional: Rescue survivors in the Medical Bay", done: this.armorySecured, optional: true });
      return cl;
    }
    const list: { text: string; done: boolean; optional?: boolean; active?: boolean }[] = [
      { text: "Secure Engineering: shut down the robot relay", done: s > 0, active: s === 0 },
      { text: "Reach the Bridge", done: s > 1, active: s === 1 },
      { text: "Secure the Bridge: defeat the Warlord", done: s > 2, active: s === 2 },
      { text: "Take control at the main console", done: s > 3, active: s === 3 },
      { text: "Extract: return to the dropship", done: s > 4, active: s === 4 },
    ];
    if (s >= 1) list.splice(1, 0, { text: "Optional: Secure the Armory", done: this.armorySecured, optional: true });
    return list;
  }

  objectiveTarget(): Vector3 | null {
    if (this.course) return this.course.target();
    const col = this.level.colony;
    if (this.mission === "colony" && col) {
      if (this.stage === 0) return col.powerConsolePos;
      if (this.stage === 1) return col.factoryPos;
      if (this.stage === 2) {
        const p = this.player.pos;
        const live = col.cores.filter((c) => c.hp > 0).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
        return live[0] ? live[0].pos.clone().setY(0) : null;
      }
      return this.stage === 4 ? this.level.airlockPos : null;
    }
    switch (this.stage) {
      case 0:
        return this.level.relayPos;
      case 1:
        return new Vector3(8.5, 0, 15.5);
      case 2:
        return this.boss && this.boss.alive ? this.boss.pos : null;
      case 3:
        return this.level.bridgeConsolePos;
      case 4:
        return this.level.airlockPos;
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------ main update
  update(dt: number, locked: boolean): void {
    if (!this.running) return;
    this.elapsed += dt;
    const p = this.player;
    if (this.endT < 0) this.time += dt;
    // knockback
    if (this.knock.lengthSq() > 0.01) {
      p.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.level.collide(p.pos, 0.34);
    }
    this.slowFactor = 1;
    this.updateHazards(dt);
    p.update(dt, locked && this.endT < 0);
    this.level.updateLights(dt, this.camera.position);
    for (const r of this.robots) {
      // far, calm robots think at a lower rate
      const far = r.state === "patrol" && Math.abs(r.pos.x - p.pos.x) + Math.abs(r.pos.z - p.pos.z) > 26;
      r.lodAcc += dt;
      if (far && r.lodAcc < 0.1) continue;
      r.update(r.lodAcc);
      r.lodAcc = 0;
    }
    this.updateBolts(dt);
    this.updatePickups(dt);
    const actors = [{ x: p.pos.x, z: p.pos.z }, ...this.robots.filter((r) => r.alive && r.state !== "dormant").map((r) => ({ x: r.pos.x, z: r.pos.z }))];
    for (const id of this.level.updateDoors(dt, actors)) {
      const d = this.level.doors.find((x) => x.id === id)!;
      audio.door(Math.hypot(d.cx - p.pos.x, d.cz - p.pos.z));
    }
    for (const a of this.level.animated) a.update(this.elapsed);
    this.ambientFx(dt);
    this.fx.update(dt);
    // alarm
    if (this.alarm > 0) {
      const anySee = this.robots.some((r) => r.alive && r.canSee && r.state === "combat");
      this.alarm -= dt * (anySee ? 0.25 : 1);
      if (Math.floor(this.alarm / 2.2) !== Math.floor((this.alarm + dt) / 2.2) && this.alarm > 0) audio.alarm();
      if (this.alarm <= 0) {
        this.hud.alarm(false);
        this.hud.hint("The alarm has died down.", 3);
      }
    }
    // tension for the music
    const combat = this.robots.some((r) => r.alive && r.state === "combat");
    const sus = this.robots.some((r) => r.alive && (r.state === "suspicious" || r.state === "search"));
    audio.setTension(combat || this.alarm > 0 ? 1 : sus ? 0.35 : 0);
    this.missionLogic(dt);
    // boss mechanics
    const b = this.boss;
    if (b && b.alive && b.state !== "dormant") {
      this.hud.setBoss(b.hp / b.def.hp);
      if (!this.bossHalf && b.hp < b.def.hp * 0.5) {
        this.bossHalf = true;
        this.radio("bosshalf", "It's calling in backup drones! Keep hitting that eye!");
        for (const [x, z] of [[2.5, 11.5], [2.5, 19.5]]) {
          const r = this.addRobot("drone", x, z, [], 0);
          r.alert(p.pos, true);
          this.fx.puff(new Vector3(x, 1, z), 0x444444, 20, new Vector3(0, 1, 0), 1.5, 1.2, 0.4, 1.4);
        }
      }
    }
    // death / end (in training you just go back to the start of the room)
    if (p.dead && this.course && this.endT < 0) this.course.onPlayerDown();
    if (p.dead && this.endT < 0) {
      audio.lose();
      this.endT = 2.2;
      this.pendingResult = this.result(false);
      this.hud.dead();
    }
    if (this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0 && this.pendingResult) {
        this.running = false;
        this.onEnd?.(this.pendingResult);
      }
    }
    this.hud.update(this, dt);
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      const t = (this.elapsed + h.offset) % h.period;
      const idleLen = h.period - h.warn - h.active;
      const prev = h.phase;
      h.phase = t < idleLen ? "idle" : t < idleLen + h.warn ? "warn" : "active";
      const dist = Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z);
      if (h.phase !== prev) {
        if (h.phase === "warn") {
          h.hitDone = false;
          if (h.kind !== "arc") audio.hiss(dist);
        }
        if (h.phase === "active") {
          if (h.kind === "arc") audio.electric(dist);
          else if (h.kind === "flame") audio.flame(dist);
          else audio.steam(dist);
        }
      }
      h.glow.opacity = h.phase === "idle" ? 0.08 : h.phase === "warn" ? 0.25 + Math.sin(this.elapsed * 30) * 0.15 : 0.5;
      const top = new Vector3(h.pos.x, 0.2, h.pos.z);
      if (h.phase === "warn") {
        if (h.kind === "arc" && Math.random() < dt * 20) this.fx.sparks(new Vector3(h.pos.x, 0.6, h.pos.z), new Vector3(0, 1, 0), 0x80e8ff, 2, 2);
        if (h.kind !== "arc" && Math.random() < dt * 15) this.fx.puff(top, h.kind === "flame" ? 0x553322 : 0xaaaaaa, 1, new Vector3(0, 1, 0), 0.3, 0.6, 0.1, 0.4);
      }
      if (h.phase === "active") {
        if (h.kind === "arc") {
          if (Math.random() < dt * 25) {
            // jagged lightning from the reactor core to the strike plate
            const a = new Vector3(this.level.reactorPos.x, 1.75, this.level.reactorPos.z);
            const b = new Vector3(h.pos.x, 0.55, h.pos.z);
            let prevP = a;
            for (let i = 1; i <= 5; i++) {
              const q = a.clone().lerp(b, i / 5);
              if (i < 5) q.add(new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
              this.fx.tracer(prevP, q, 0x9ff4ff, 0.03, 0.06);
              prevP = q;
            }
            this.fx.sparks(b, new Vector3(0, 1, 0), 0x9ff4ff, 5, 3);
            this.fx.flash(b, 0x80e0ff, 8, 0.08);
          }
        } else if (h.kind === "flame") {
          this.fx.puff(top, 0xff7a20, 5, new Vector3(0, 4.5, 0), 1.2, 0.5, 0.35, 0.9, true);
          this.fx.puff(top.clone().setY(0.9), 0xffd070, 2, new Vector3(0, 3, 0), 0.8, 0.35, 0.3, 0.6, true);
          if (Math.random() < dt * 8) this.fx.puff(top.clone().setY(1.8), 0x222222, 1, new Vector3(0, 1.5, 0), 0.5, 1.2, 0.5, 1.4);
        } else {
          this.fx.puff(top, 0xdde6ee, 4, new Vector3(0, 3.5, 0), 1.3, 0.9, 0.3, 1.6);
        }
        // damage player
        if (dist < h.radius) {
          if (h.kind === "arc") {
            if (!h.hitDone) {
              h.hitDone = true;
              p.damage(h.dps, null);
            }
          } else {
            p.damage(h.dps * dt, null);
            if (h.kind === "steam") this.slowFactor = 0.55;
          }
          if (!this.said.has("hazard")) this.hud.hint("Hazard! Watch the floor plates: they flash before they go off.", 4);
          this.said.add("hazard");
        }
        // hazards hurt robots too
        for (const r of this.robots) {
          // only robots that are chasing you get caught by hazards (they don't patrol into them)
          if (!r.alive || r.state === "dormant" || r.state === "patrol" || r.state === "suspicious") continue;
          if (Math.hypot(r.pos.x - h.pos.x, r.pos.z - h.pos.z) < h.radius + r.rig.radius * 0.5) r.damage(h.kind === "arc" ? dt * 40 : h.dps * dt, false, false);
        }
      }
    }
  }

  private updateBolts(dt: number): void {
    const p = this.player;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      let hit = false;
      const steps = 3;
      for (let s = 0; s < steps && !hit; s++) {
        b.pos.addScaledVector(b.vel, dt / steps);
        // player capsule
        const cx = Math.max(0.3, Math.min(p.eyeH, b.pos.y));
        const d = Math.hypot(b.pos.x - p.pos.x, b.pos.y - cx, b.pos.z - p.pos.z);
        if (d < 0.42 && !p.dead) {
          p.damage(b.dmg, b.pos.clone().sub(b.vel.clone().normalize().multiplyScalar(3)));
          hit = true;
          break;
        }
        if (b.pos.y < 0 || b.pos.y > 3.4 || this.level.solid(Math.floor(b.pos.x), Math.floor(b.pos.z)) || this.propHit(b.pos)) {
          hit = true;
          this.fx.sparks(b.pos, b.vel.clone().normalize().negate(), b.color.getHex(), 6, 3);
        }
      }
      if (hit && b.splash > 0) {
        this.fx.burst(b.pos, 0xff6030, 18, 4, 0.35, 0.35);
        const d = b.pos.distanceTo(p.eye);
        if (d < b.splash + 0.6 && d > 0.45) p.damage(b.dmg * 0.4, b.pos.clone());
      }
      b.sprite.position.copy(b.pos);
      if (hit || b.life <= 0) {
        this.fx.giveSprite(b.sprite);
        this.bolts.splice(i, 1);
      } else if (Math.random() < 0.5) this.fx.add.emit(b.pos, new Vector3(), b.color, 0.12, 0.12, 0.02);
    }
  }

  private propHit(p: Vector3): boolean {
    for (const b of this.level.props) if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ && p.y < b.h) return true;
    return false;
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const h = p.stats.def;
    for (const k of this.pickups) {
      if (k.taken) continue;
      k.mesh.rotation.y += dt * 1.5;
      k.mesh.position.y = 0.1 + Math.sin(this.elapsed * 2 + k.pos.x) * 0.06;
      const d = Math.hypot(p.pos.x - k.pos.x, p.pos.z - k.pos.z);
      k.marker.visible = d > 3 && d < 12;
      k.marker.material.opacity = 0.35 + Math.sin(this.elapsed * 4) * 0.15;
      if (d < 1.1) {
        if (k.kind === "health" && p.hp < p.maxHp + p.bonusHp) {
          p.heal(40 * p.stats.healMul);
          k.taken = true;
          this.hud.hint(`+${Math.round(40 * p.stats.healMul)} HEALTH`, 1.5);
        } else if (k.kind === "ammo") {
          const got = p.takeAmmo(h.pickupMul);
          if (got) {
            k.taken = true;
            this.hud.hint(got, 1.8);
          }
        }
        if (k.taken) {
          audio.pickup(k.kind);
          this.scene.remove(k.mesh, k.marker);
          this.fx.burst(k.pos.clone().setY(0.4), k.kind === "health" ? 0x40ff80 : 0x40d8ff, 20, 2, 0.4, 0.2);
        }
      }
    }
  }

  private missionLogic(dt: number): void {
    const p = this.player;
    const room = this.level.roomAt(p.pos.x, p.pos.z);
    const rid = room?.id ?? "";
    if (rid !== this.lastRoom && room) {
      this.lastRoom = rid;
      this.hud.roomName(room.name);
      this.course?.onRoom(rid);
      if (this.course) {
        /* training rooms are handled by the course */
      } else if (rid === "fcorr" && this.stage >= 1 && !this.armorySecured) this.radio("armoryhint", "The <b>Armory</b> is behind the sealed door on your left. Hack it for extra ammo and armour, or head straight for the Bridge.");
      if (rid === "armory" && !this.armorySecured) {
        this.armorySecured = true;
        p.bonusHp = 30;
        p.hp = Math.min(p.maxHp + p.bonusHp, p.hp + 30);
        p.reserve = Math.max(p.reserve, p.stats.reserve * 1.5);
        p.reserve2 = Math.max(p.reserve2, p.stats.loadout.secondary.reserve * 1.5);
        p.refillGadgets();
        audio.upgrade();
        this.hud.setScore(this.combatPoints + this.armoryPoints);
        this.hud.floatText(p.eye.addScaledVector(p.forward(), 2), `ARMORY SECURED +${this.armoryPoints}`, 1.5);
        this.hud.setObjectives(this.objectives());
        this.radio("armory", `Armory secured! Ammo and gadgets restocked, armour boosted, and <b>+${this.armoryPoints} points</b>.`);
      }
      if (rid === "bridge" && this.stage <= 2) {
        if (this.stage < 2) this.stage = 1;
        this.wakeBoss();
      }
      if (rid === "cargo" && this.stage === 0 && !this.said.has("cargo")) {
        this.said.add("cargo");
      }
      if (rid === "airlock" && this.stage === 4) this.win();
      if (this.mission === "colony") this.colonyEnter(rid);
    }
    if (this.course) {
      this.course.update(dt);
      this.runInteraction(dt, this.course.interaction());
      return;
    }
    if (this.mission === "colony") {
      this.colonyLogic(dt);
      return;
    }
    // blast door hint
    if (this.stage === 0 && Math.hypot(p.pos.x - 48, p.pos.z - 15) < 2.6) this.radio("blast", "That blast door is sealed tight. The relay in <b>Engineering</b> controls it.");
    if (p.hp < p.maxHp * 0.35 && !this.said.has("lowhp")) this.radio("lowhp", "You're hurt! Health packs glow <b style='color:#40ff80'>green</b>. Out of combat, your suit slowly patches you up.");

    // interactions (hold E)
    let target: { id: string; pos: Vector3; time: number; label: string } | null = null;
    const near = (v: Vector3, r: number): boolean => Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < r;
    if (this.stage === 0 && near(this.level.relayPos, 2.0)) target = { id: "relay", pos: this.level.relayPos, time: 3, label: "shut down the robot relay" };
    else if (this.stage >= 1 && !this.armoryUnlocked && near(this.level.armoryTerminalPos, 2.0)) target = { id: "armory", pos: this.level.armoryTerminalPos, time: 2.5, label: "hack the Armory door" };
    else if (this.stage === 3 && near(this.level.bridgeConsolePos, 2.2)) target = { id: "console", pos: this.level.bridgeConsolePos, time: 3.5, label: "take control of the ship" };
    this.runInteraction(dt, target);
  }

  /** Shared "hold E" handling for terminals, relays and consoles. */
  private runInteraction(dt: number, target: { id: string; pos: Vector3; time: number; label: string } | null): void {
    const p = this.player;
    if (!target) {
      this.hackProgress = Math.max(0, this.hackProgress - dt * 2);
      this.hackTarget = null;
      this.hud.prompt(null, 0);
      return;
    }
    if (this.hackTarget !== target.id) this.hackProgress = 0;
    this.hackTarget = target.id;
    if (p.useHeld && !p.dead) {
      const before = this.hackProgress;
      this.hackProgress += (dt * p.stats.hackMul) / target.time;
      if (Math.floor(before * 10) !== Math.floor(this.hackProgress * 10)) audio.hackTick(this.hackProgress);
    } else this.hackProgress = Math.max(0, this.hackProgress - dt * 0.5);
    this.hud.prompt(`Hold <b>E</b> to ${target.label}`, this.hackProgress);
    if (this.hackProgress >= 1) {
      this.hackProgress = 0;
      audio.hackDone();
      if (this.course) this.course.onHack(target.id);
      else this.completeHack(target.id);
    }
  }

  private completeHack(id: string): void {
    const col = this.level.colony;
    if (id === "power" && col) {
      this.stage = 1;
      this.level.setPowered(true);
      this.level.setDoorLocked("c_mine", false);
      col.genGlow.color.setHex(0x60f0ff);
      col.genGlow.emissive.setHex(0x20c8ff);
      this.fx.burst(col.generatorPos.clone().setY(1.8), 0x60f0ff, 60, 5, 0.6, 0.35);
      this.fx.flash(col.generatorPos.clone().setY(1.8), 0x60f0ff, 30, 0.5);
      audio.upgrade();
      this.radio("power", "Power's back! The domes are lighting up and the <b>mine</b> blast door is open. The robot signal is coming from deep underground: west through the <b>Hydroponics Dome</b> and the <b>Refinery</b>.");
      setTimeout(() => this.radio("medhint", "Wait... we're picking up faint life signs in the <b>Medical Bay</b>, south of the Commons. If you have time, hack its door."), 9000);
    } else if (id === "medbay") {
      this.armoryUnlocked = true;
      this.level.setDoorLocked("c_med", false);
      this.hud.hint("Medical Bay door unlocked", 2);
    } else if (id === "relay") {
      this.stage = 1;
      this.level.relayLight.material = M.greenGlow;
      this.level.setDoorLocked("blast", false);
      this.fx.burst(this.level.relayPos.clone().setY(1.2), 0x40ff80, 40, 4, 0.5, 0.3);
      this.radio("relay", "Relay's down! The blast door to the Living Quarters is open. Push forward to the <b>Bridge</b> at the front of the ship.");
    } else if (id === "armory") {
      this.armoryUnlocked = true;
      this.level.setDoorLocked("armory", false);
      this.hud.hint("Armory door unlocked", 2);
    } else if (id === "console") {
      this.stage = 4;
      this.radio("console", "The ship is ours! Every robot left is coming for you. <b>Get back to the dropship!</b>");
      this.alarm = 0;
      this.triggerAlarm(null);
      this.alarm = 9999;
      // extraction reinforcements
      const spawns: [RobotKind, number, number][] = [["ripper", 26, 9], ["drone", 26, 22], ["drone", 16, 15.5], ["ripper", 40, 14.5], ["drone", 50, 11], ["sentinel", 52, 18], ["drone", 35, 14.5]];
      for (const [k, x, z] of spawns) {
        const r = this.addRobot(k, x, z, [], 0);
        r.alert(this.player.pos, false);
      }
    }
    this.hud.setObjectives(this.objectives());
  }

  /** Called by the training course when the last lesson is done. */
  finishMission(): void {
    this.win();
  }

  private win(): void {
    if (this.endT >= 0) return;
    this.stage = 5;
    audio.win();
    this.endT = 1.2;
    this.pendingResult = this.result(true);
    this.hud.fade();
  }

  result(won: boolean): MissionResult {
    if (this.course) return this.course.result(won);
    const armory = this.armorySecured ? this.armoryPoints : 0;
    if (this.mission === "colony") {
      const cb = won ? scaledPoints(COLONY_BONUS, this.difficulty) : 0;
      return {
        mission: "colony",
        won,
        difficulty: this.difficulty,
        kills: { ...this.kills },
        combatPoints: this.combatPoints,
        armory: this.armorySecured,
        extraLabel: "Survivors rescued",
        bonus: cb,
        total: this.combatPoints + armory + cb,
        time: this.time,
        spotted: this.spottedCount,
        secured: [
          { name: "Power Station", done: this.stage >= 1 },
          { name: "Survivors (optional)", done: this.armorySecured },
          { name: "Robot Factory", done: this.stage >= 4 },
          { name: "Extraction", done: won },
        ],
      };
    }
    const bonus = won ? scaledPoints(MISSION_BONUS, this.difficulty) : 0;
    return {
      mission: "freighter",
      won,
      difficulty: this.difficulty,
      kills: { ...this.kills },
      combatPoints: this.combatPoints,
      armory: this.armorySecured,
      extraLabel: "Armory secured",
      bonus,
      total: this.combatPoints + armory + bonus,
      time: this.time,
      spotted: this.spottedCount,
      secured: [
        { name: "Engineering", done: this.stage >= 1 },
        { name: "Armory (optional)", done: this.armorySecured },
        { name: "Bridge", done: this.stage >= 4 },
        { name: "Extraction", done: won },
      ],
    };
  }

  stop(): void {
    this.running = false;
  }

  /** Armory reward after the difficulty multiplier. */
  get armoryPoints(): number {
    return scaledPoints(this.mission === "colony" ? RESCUE_BONUS : ARMORY_BONUS, this.difficulty);
  }

  // ------------------------------------------------------------------ Mission 2: Remote Colony
  private colonyEnter(rid: string): void {
    const p = this.player;
    const col = this.level.colony;
    if (!col) return;
    if (rid === "c_commons") {
      if (this.stage === 0) this.radio("commons", "This was the colony's heart... tables still set. No sign of the colonists. Stay sharp.");
      else if (!this.armoryUnlocked) this.radio("medhint2", "The <b>Medical Bay</b> door is on the south wall of the Commons. Hack its terminal to reach the survivors.");
    }
    if (rid === "c_green" && this.stage === 0) this.radio("green", "The Hydroponics Dome. The <b>Power Station</b> is through the door on the north side.");
    if (rid === "c_ref" && this.stage === 1) this.radio("refinery", "An ore refinery, and it's running. Something down here is using the colony's ore. Watch the <b>flame vents</b>.");
    if (rid === "c_med" && !this.armorySecured && this.armoryUnlocked) {
      this.armorySecured = true;
      p.hp = Math.min(p.maxHp + p.bonusHp, p.hp + 50);
      p.reserve = Math.max(p.reserve, p.stats.reserve * 1.5);
      p.reserve2 = Math.max(p.reserve2, p.stats.loadout.secondary.reserve * 1.5);
      p.refillGadgets();
      col.podGlass.emissive.setHex(0x30d860);
      audio.upgrade();
      this.hud.setScore(this.combatPoints + this.armoryPoints);
      this.hud.floatText(p.eye.addScaledVector(p.forward(), 2), `SURVIVORS RESCUED +${this.armoryPoints}`, 1.5);
      this.hud.setObjectives(this.objectives());
      this.radio("rescue", `Survivors found, safe in cryo sleep! Their medical station patched you up and you grabbed their ammo: <b>+${this.armoryPoints} points</b>. We'll pick them up after the fight.`);
    }
    if (rid === "c_fact" && this.stage === 1) {
      this.stage = 2;
      this.factoryT = 3;
      audio.bossRoar();
      this.hud.setBoss(1, "ROBOT FACTORY · 3 POWER CORES");
      this.hud.setObjectives(this.objectives());
      this.radio("factory", "It's a <b>robot factory</b>! They've been building an army out of the colony's ore. Shoot its <b>three glowing power cores</b> before it builds more!");
      for (const r of this.robots) if (r.alive && r.pos.x < 12) r.alert(p.pos, false);
    }
    if (rid === "c_airlock" && this.stage === 4) this.win();
  }

  damageCore(c: import("./level").ColonyCore, dmg: number, p: Vector3, d: Vector3): void {
    const col = this.level.colony!;
    c.hp -= dmg;
    this.fx.sparks(p, d.clone().negate(), 0xff6040, 14, 5);
    audio.hitmarker(false);
    this.hud.hitmarker(false, c.hp <= 0);
    this.noise(c.pos, 12, 0.6);
    if (this.stage < 2) {
      this.stage = 2;
      this.hud.setObjectives(this.objectives());
    }
    if (c.hp > 0) {
      c.glow.emissiveIntensity = 1.2 + 1.4 * (c.hp / c.max) + Math.random() * 0.8;
    } else {
      c.hp = 0;
      c.glow.color.setHex(0x221512);
      c.glow.emissive.setHex(0x000000);
      c.root.rotation.z = 0.06;
      this.fx.explosion(c.pos, true);
      this.fx.burst(c.pos, 0xff5030, 60, 7, 0.7, 0.4);
      this.fx.flash(c.pos, 0xff5030, 30, 0.4);
      audio.explode(c.pos.distanceTo(this.player.pos), true);
      const pts = scaledPoints(20, this.difficulty);
      this.combatPoints += pts;
      this.hud.setScore(this.combatPoints + (this.armorySecured ? this.armoryPoints : 0));
      this.hud.floatText(c.pos.clone().add(new Vector3(0, 0.6, 0)), `CORE DOWN +${pts}`, 1.5);
    }
    const left = col.cores.filter((k) => k.hp > 0);
    this.hud.setBoss(left.length ? col.cores.reduce((a, k) => a + Math.max(0, k.hp), 0) / col.cores.reduce((a, k) => a + k.max, 0) : -1, `ROBOT FACTORY · ${left.length} POWER CORE${left.length === 1 ? "" : "S"}`);
    if (c.hp <= 0) {
      if (left.length) this.radio("core" + left.length, left.length === 2 ? "Core destroyed! Two to go." : "One core left! Take it out!");
      else this.factoryDown();
    }
    this.hud.setObjectives(this.objectives());
  }

  private factoryDown(): void {
    this.stage = 4;
    this.hud.setBoss(-1);
    this.radio("factorydown", "The factory's dead! But every robot left in the colony is coming for you. <b>Get back to the landing pad!</b>");
    this.alarm = 0;
    this.triggerAlarm(null);
    this.alarm = 9999;
    for (const [k, x, z] of COLONY_EXTRACT) {
      const r = this.addRobot(k, x, z, [], 0);
      r.alert(this.player.pos, false);
    }
    this.hud.setObjectives(this.objectives());
  }

  private colonyLogic(dt: number): void {
    const p = this.player;
    const col = this.level.colony;
    if (!col) return;
    // live cores pulse and spin; the factory keeps building while you're inside
    for (const c of col.cores) {
      if (c.hp <= 0) continue;
      for (let i = 0; i < c.spin.length; i++) c.spin[i].rotation.y += dt * (1.6 + i * 0.9);
      if (c.hp >= c.max) c.glow.emissiveIntensity = 2.3 + Math.sin(this.elapsed * 4 + c.pos.z) * 0.5;
    }
    if (this.stage === 2) {
      this.factoryT -= dt;
      const live = this.robots.filter((r) => r.alive).length;
      if (this.factoryT <= 0) {
        this.factoryT = this.difficulty === "elite" ? 7 : this.difficulty === "veteran" ? 8 : 9.5;
        if (live < 14 && this.factorySpawned < 10) {
          const bay = col.bays[this.factorySpawned % col.bays.length];
          const kind: RobotKind = this.factorySpawned % 3 === 2 ? "ripper" : "drone";
          this.factorySpawned++;
          const r = this.addRobot(kind, bay.x, bay.z, [], 0);
          r.alert(p.pos, false);
          this.fx.puff(bay.clone().setY(0.6), 0x555555, 24, new Vector3(0, 1.4, 0), 1.2, 1.2, 0.4, 1.3);
          this.fx.flash(bay.clone().setY(1.5), 0xff6030, 12, 0.3);
          audio.door(bay.distanceTo(p.pos));
          if (this.factorySpawned === 1) this.hud.hint("The factory is building robots at its assembly bays! Destroy the power cores to stop it.", 4);
        }
      }
    }
    // hints
    if (this.stage === 0 && Math.hypot(p.pos.x - 25.5, p.pos.z - 15.5) < 2.6) this.radio("minedoor", "The mine's blast door has no power. Get the <b>generator</b> running first.");
    if (this.stage === 0 && Math.hypot(p.pos.x - col.medTerminalPos.x, p.pos.z - col.medTerminalPos.z) < 2.2) this.radio("mednopower", "The Medical Bay door is dead: no power. Restore the <b>generator</b> first.");
    if (p.hp < p.maxHp * 0.35 && !this.said.has("lowhp")) this.radio("lowhp", "You're hurt! Health packs glow <b style='color:#40ff80'>green</b>. Out of combat, your suit slowly patches you up.");
    // interactions (hold E)
    let target: { id: string; pos: Vector3; time: number; label: string } | null = null;
    const near = (v: Vector3, r: number): boolean => Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < r;
    if (this.stage === 0 && near(col.powerConsolePos, 2.1)) target = { id: "power", pos: col.powerConsolePos, time: 3, label: "restart the colony generator" };
    else if (this.stage >= 1 && !this.armoryUnlocked && near(col.medTerminalPos, 2.2)) target = { id: "medbay", pos: col.medTerminalPos, time: 2.5, label: "hack the Medical Bay door" };
    this.runInteraction(dt, target);
  }
}
