import {
  AdditiveBlending,
  Box3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { audio } from "./audio";
import type { HeroStats } from "./data";
import type { Game } from "./game";
import { GADGETS, buildGadget, buildMelee, buildSecondary, gadgetPlaced, gadgetRestY, gadgetSettles, type GadgetKind } from "./equipment";
import { M, box, buildFPArm, buildShield, buildWeapon, cyl, sphere } from "./models";
import type { Robot } from "./robots";
import { emblemTex, glowSpriteTex } from "./textures";

const STAND_EYE = 1.62;
const CROUCH_EYE = 1.02;
const RADIUS = 0.34;

/** 0 = primary gun, 1 = secondary gun, 2 = melee weapon */
export type Slot = 0 | 1 | 2;

/** Everything the fire code needs to know about a gun. */
interface GunSpec {
  name: string;
  model: string;
  damage: number;
  fireRate: number;
  magMax: number;
  reserveMax: number;
  spread: number;
  auto: boolean;
  zoom: number;
  pellets: number;
  falloff: number;
  noise: number;
  reload: number;
  recoil: number;
  color: number;
  rotary: boolean;
  adsY: number;
  /** aiming looks through a magnified scope (sniper rifle, or the Precision Optic) */
  scope: boolean;
  /** attachment spread multipliers from the hip and aiming down sights */
  hipMul: number;
  adsMul: number;
}

/** A thrown or placed gadget out in the world. */
export interface Device {
  kind: GadgetKind;
  mesh: Group;
  pos: Vector3;
  vel: Vector3;
  t: number;
  landed: boolean;
  armT: number;
  beepT: number;
}

export interface Grenade {
  mesh: Mesh;
  pos: Vector3;
  vel: Vector3;
  t: number;
}

export class Player {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  yaw = 0;
  pitch = 0;
  crouch = 0;
  hp = 100;
  maxHp = 100;
  mag = 0;
  reserve = 0;
  reloadT = 0;
  fireCd = 0;
  spin = 0;
  abilityT = 0; // active time left
  abilityCd = 0; // cooldown left
  flashlight = false;
  ads = 0;
  sprinting = false;
  moving = false;
  lastHurt = 99;
  stats!: HeroStats;
  readonly keys = new Set<string>();
  mouseDown = false;
  rightDown = false;

  /** A fresh press of the fire button. */
  queuePress(): void {
    this.pressT = 0.25;
  }

  clearPress(): void {
    this.pressT = 0;
  }
  useHeld = false;
  dead = false;
  sens = 1;
  private stepT = 0;
  private bob = 0;
  private recoil = 0;
  /** 0..1: how far into the scope view you are (only for scoped guns) */
  get scopeK(): number {
    if (!this.gun?.scope || this.dead) return 0;
    return Math.max(0, Math.min(1, (this.ads - 0.7) / 0.24));
  }
  /** recoil kick, for the scope overlay */
  get kickK(): number {
    return this.recoil;
  }
  private swayX = 0;
  private swayY = 0;
  private triggerLatch = false;
  /** a click is remembered briefly so a quick tap between frames (or during the fire cooldown) still shoots */
  private pressT = 0;
  private kick = new Vector3();
  readonly grenades: Grenade[] = [];
  bonusHp = 0;
  /** how many times the special ability has been used (training checks this) */
  abilityUses = 0;
  // ---- equipment ----
  /** the weapon in hand */
  slot: Slot = 0;
  /** secondary gun ammo (mag / reserve are the primary gun's) */
  mag2 = 0;
  reserve2 = 0;
  /** gadgets left, and how many of each were used (training checks these) */
  readonly gadgets: [number, number] = [0, 0];
  readonly gadgetUses: [number, number] = [0, 0];
  meleeUses = 0;
  /** what dealt the last blow: the training course checks weapon lessons with this */
  lastAttack: "gun" | "melee" | "gadget" = "gun";
  readonly devices: Device[] = [];
  private meleeT = 0;
  private meleeHit = false;
  private throwT = 0;
  private gadgetCd = 0;
  private stimT = 0;
  private reloadSlot: Slot = 0;
  private specs: [GunSpec, GunSpec] | null = null;

  // first-person view model
  readonly vmScene = new Scene();
  readonly vmCamera = new PerspectiveCamera(60, 1, 0.01, 10);
  private readonly vm = new Group();
  private readonly gunHolder = new Group();
  private weapon: { root: Group; muzzle: Object3D; spinner?: Object3D } | null = null;
  private weapon2: { root: Group; muzzle: Object3D } | null = null;
  /** one view-model group per slot: primary, secondary, melee */
  private holders: Group[] = [];
  private shield: Group | null = null;
  private readonly muzzleFlash: Sprite;
  private flashT = 0;
  readonly light: SpotLight;
  readonly muzzleWorld = new Vector3();

  constructor(private readonly game: Game, private readonly camera: PerspectiveCamera) {
    this.vmScene.add(new HemisphereLight(0xc8d8ff, 0x302820, 2.2));
    const d = new DirectionalLight(0xffffff, 2.4);
    d.position.set(1, 2, 1);
    this.vmScene.add(d);
    const rim = new DirectionalLight(0x7fe8ff, 2);
    rim.position.set(-2, 0.5, -1);
    this.vmScene.add(rim);
    this.vmScene.add(this.vmCamera);
    this.vmCamera.add(this.vm);
    this.vm.add(this.gunHolder);
    this.muzzleFlash = new Sprite(new SpriteMaterial({ map: glowSpriteTex(), color: 0xffd080, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    this.muzzleFlash.scale.setScalar(0.25);
    this.muzzleFlash.visible = false;
    this.light = new SpotLight(0xfff4e0, 0, 28, 0.42, 0.45, 1.2);
    this.light.position.set(0, 0, 0);
    camera.add(this.light);
    camera.add(this.light.target);
    this.light.target.position.set(0, 0, -5);
  }

  equip(stats: HeroStats): void {
    this.stats = stats;
    this.gunHolder.clear();
    this.shield?.removeFromParent();
    this.shield = null;
    const h = stats.def;
    const lo = stats.loadout;
    this.holders = [new Group(), new Group(), new Group()];
    for (const g of this.holders) this.gunHolder.add(g);
    // ---- primary gun, gloved hands and sleeves with the squad badge
    const hp = this.holders[0];
    this.weapon = buildWeapon(h.weapon);
    hp.add(this.weapon.root);
    this.weapon.root.rotation.y = Math.PI;
    const right = buildFPArm(false);
    right.position.set(0.0, -0.1, h.weapon === "rotary" ? 0.2 : h.weapon === "pistol" ? 0.08 : 0.1);
    right.rotation.set(0.6, 0.32, 0);
    hp.add(right);
    if (h.id !== "brutus") {
      const left = buildFPArm(true);
      left.position.set(-0.03, -0.06, h.weapon === "sniper" ? -0.35 : h.weapon === "rotary" ? -0.12 : -0.28);
      left.rotation.set(0.5, -0.6, 0);
      hp.add(left);
    } else {
      this.shield = buildShield();
      this.shield.scale.setScalar(0.9);
      this.vm.add(this.shield);
    }
    if (h.weapon === "rotary") this.weapon.root.scale.setScalar(1.1);
    this.fitAttachments(this.weapon, stats.fitted, "");
    // ---- secondary gun
    const hs = this.holders[1];
    const sk = lo.secondary.kind;
    this.weapon2 = buildSecondary(sk);
    this.weapon2.root.rotation.y = Math.PI;
    this.fitAttachments(this.weapon2, stats.fitted, "s_");
    hs.add(this.weapon2.root);
    const r2 = buildFPArm(false);
    r2.position.set(0.0, -0.1, 0.08);
    r2.rotation.set(0.6, 0.32, 0);
    hs.add(r2);
    if (h.id !== "brutus") {
      const l2 = buildFPArm(true);
      const long = sk === "shotgun" || sk === "smg";
      l2.position.set(long ? -0.03 : -0.05, long ? -0.06 : -0.13, sk === "shotgun" ? -0.32 : sk === "smg" ? -0.08 : 0.07);
      l2.rotation.set(long ? 0.5 : 0.7, long ? -0.6 : -0.4, 0);
      hs.add(l2);
    }
    // ---- melee weapon, held up and forward in the right hand
    const hm = this.holders[2];
    const mel = buildMelee(lo.melee.kind);
    mel.position.set(0.0, -0.08, 0.05);
    mel.rotation.set(lo.melee.kind === "knife" ? -0.7 : -1.05, 0, 0.3);
    if (lo.melee.kind !== "knife") mel.scale.setScalar(0.78);
    hm.add(mel);
    const r3 = buildFPArm(false);
    r3.position.set(0.0, -0.1, 0.08);
    r3.rotation.set(0.6, 0.32, 0);
    hm.add(r3);
    hm.position.set(-0.02, 0.0, 0.02);
    // ---- the numbers the fire code reads
    const colour = h.weapon === "sniper" ? 0x7ff4ff : h.weapon === "pistol" ? 0xffa050 : h.weapon === "rotary" ? 0x9fff8a : 0x6fe8ff;
    const d2 = lo.secondary;
    const pm = stats.primaryMods;
    const sm = stats.secondaryMods;
    this.specs = [
      {
        name: h.weaponName,
        model: h.weapon,
        damage: stats.damage,
        fireRate: h.fireRate,
        magMax: stats.mag,
        reserveMax: stats.reserve,
        spread: h.spread,
        auto: h.auto,
        zoom: h.zoom + pm.zoom,
        pellets: 1,
        falloff: 0,
        noise: 18 * pm.noise,
        reload: (h.weapon === "rotary" ? 2.3 : h.weapon === "sniper" ? 1.9 : 1.5) * pm.reload,
        recoil: (h.weapon === "sniper" ? 1.5 : h.weapon === "pistol" ? 1 : 0.35) * pm.recoil,
        color: colour,
        rotary: h.weapon === "rotary",
        adsY: h.weapon === "sniper" ? -0.13 : h.weapon === "rotary" ? -0.17 : h.weapon === "rifle" ? -0.134 : -0.1,
        scope: h.weapon === "sniper" || stats.fitted.includes("optic"),
        hipMul: pm.hipSpread,
        adsMul: pm.adsSpread,
      },
      {
        name: d2.name,
        model: d2.kind,
        damage: d2.damage * stats.dmgScale,
        fireRate: d2.fireRate,
        magMax: Math.round(d2.mag * stats.magScale),
        reserveMax: d2.reserve,
        spread: d2.spread,
        auto: d2.auto,
        zoom: d2.zoom,
        pellets: d2.pellets,
        falloff: d2.falloff,
        noise: d2.noise,
        reload: d2.reload,
        recoil: d2.recoil,
        color: d2.color,
        rotary: false,
        adsY: d2.kind === "shotgun" ? -0.11 : -0.1,
        scope: false,
        hipMul: sm.hipSpread,
        adsMul: sm.adsSpread,
      },
    ];
    this.slot = 0;
    this.showHolder();
    this.gunHolder.position.set(0.22, -0.2, -0.64);
    sphere(0.001, M.darkMetal, 0, 0, 0, this.gunHolder);
  }

  /** Show the store attachments on a gun model: suppressor, laser sight, optic, drum magazine. */
  private fitAttachments(w: { root: Group; muzzle: Object3D }, fitted: string[], pre: string): void {
    const has = (id: string): boolean => fitted.includes(pre + id);
    const m = w.muzzle.position;
    w.root.updateMatrixWorld(true);
    const bb = new Box3();
    for (const c of w.root.children) if ((c as Mesh).isMesh) bb.expandByObject(c);
    const top = Number.isFinite(bb.max.y) ? bb.max.y : 0.08;
    if (has("suppressor")) {
      cyl(0.03, 0.03, 0.2, M.gunmetal, m.x, m.y, m.z + 0.1, w.root, 12).rotation.x = Math.PI / 2;
      for (const z of [0.02, 0.18]) cyl(0.032, 0.032, 0.012, M.gunBlack, m.x, m.y, m.z + z, w.root, 12).rotation.x = Math.PI / 2;
      m.z += 0.2;
    }
    if (has("laser")) {
      box(0.03, 0.03, 0.08, M.gunBlack, m.x + 0.045, m.y - 0.035, m.z - 0.16, w.root);
      box(0.012, 0.012, 0.004, M.redGlow, m.x + 0.045, m.y - 0.035, m.z - 0.119, w.root);
      const beam = new Mesh(new CylinderGeometry(0.0015, 0.0015, 3, 4), new MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }));
      beam.rotation.x = Math.PI / 2;
      beam.position.set(m.x + 0.045, m.y - 0.035, m.z - 0.12 + 1.5);
      w.root.add(beam);
    }
    if (has("optic") && !pre) {
      const y = top + 0.035;
      cyl(0.025, 0.025, 0.16, M.gunBlack, 0, y, -0.02, w.root, 12).rotation.x = Math.PI / 2;
      cyl(0.03, 0.025, 0.03, M.gunBlack, 0, y, 0.07, w.root, 12).rotation.x = Math.PI / 2;
      cyl(0.026, 0.026, 0.004, M.cyanGlow, 0, y, 0.087, w.root, 12).rotation.x = Math.PI / 2;
      box(0.02, 0.03, 0.04, M.gunGrey, 0, top + 0.012, -0.02, w.root);
    }
    if (has("stabiliser") && !pre) {
      box(0.05, 0.02, 0.05, M.gunGrey, m.x, m.y, m.z + 0.02, w.root);
      m.z += 0.04;
    }
    if (has("drum")) {
      const drum = cyl(0.06, 0.06, 0.05, M.polymer, 0, -0.12, 0.06, w.root, 16);
      drum.rotation.z = Math.PI / 2;
    }
  }

  // ------------------------------------------------------------------ equipment
  /** The gun in hand (null while holding the melee weapon). */
  get gun(): GunSpec | null {
    return this.specs && this.slot !== 2 ? this.specs[this.slot] : null;
  }
  get weaponName(): string {
    return this.slot === 2 ? this.stats.loadout.melee.name : (this.gun?.name ?? "");
  }
  get curMag(): number {
    return this.slot === 1 ? this.mag2 : this.mag;
  }
  get curReserve(): number {
    return this.slot === 1 ? this.reserve2 : this.reserve;
  }
  get curMagMax(): number {
    return this.gun?.magMax ?? 1;
  }
  gadgetKind(i: 0 | 1): GadgetKind {
    return this.stats.loadout.gadgets[i].kind;
  }
  gadgetMax(i: 0 | 1): number {
    return this.stats.loadout.gadgets[i].count + this.stats.gadgetBonus;
  }
  slotName(s: Slot): string {
    return s === 2 ? this.stats.loadout.melee.name : (this.specs?.[s].name ?? "");
  }

  private showHolder(): void {
    const vis = this.meleeT > 0 ? 2 : this.slot;
    this.holders.forEach((g, i) => (g.visible = i === vis));
    const muzzle = this.slot === 1 ? this.weapon2?.muzzle : this.weapon?.muzzle;
    if (muzzle && this.muzzleFlash.parent !== muzzle) muzzle.add(this.muzzleFlash);
  }

  /** Switch weapons (1 / 2 / 3 or the mouse wheel). */
  selectSlot(s: Slot, silent = false): void {
    if (s === this.slot || (this.dead && !silent)) return;
    this.slot = s;
    this.reloadT = 0;
    this.fireCd = Math.max(this.fireCd, silent ? 0 : 0.22 * this.stats.handling);
    this.triggerLatch = true;
    this.showHolder();
    if (!silent) {
      this.gunHolder.position.y -= 0.32;
      this.gunHolder.rotation.x -= 0.5;
      audio.weaponSwap();
    }
  }

  cycleSlot(dir: number): void {
    this.selectSlot((((this.slot + dir) % 3) + 3) % 3 as Slot);
  }

  /** Swing the melee weapon (V from any weapon, or click while holding it). */
  melee(): void {
    if (this.dead || this.meleeT > 0 || this.throwT > 0) return;
    const d = this.stats.loadout.melee;
    this.meleeT = d.time;
    this.meleeHit = false;
    this.meleeUses++;
    this.reloadT = 0;
    this.showHolder();
    audio.swing(d.kind);
  }

  private strike(): void {
    const g = this.game;
    const d = this.stats.loadout.melee;
    const f = this.forward().setY(0).normalize();
    let best: Robot | null = null;
    let bestD = 1e9;
    for (const r of g.robots) {
      if (!r.alive) continue;
      const to = r.pos.clone().sub(this.pos).setY(0);
      const dist = to.length() - r.rig.radius;
      if (dist > d.range) continue;
      if (dist > 0.35 && to.normalize().dot(f) < 0.55) continue;
      // only real walls block a swing (you can reach over desks and low cover)
      let blocked = false;
      const steps = Math.ceil((dist + r.rig.radius) / 0.2);
      for (let k = 1; k < steps && !blocked; k++) {
        const u = k / steps;
        if (g.level.solid(Math.floor(this.pos.x + (r.pos.x - this.pos.x) * u), Math.floor(this.pos.z + (r.pos.z - this.pos.z) * u))) blocked = true;
      }
      if (blocked) continue;
      if (dist < bestD) {
        bestD = dist;
        best = r;
      }
    }
    if (best) {
      const unaware = best.state !== "combat" && best.state !== "dormant" && !best.canSee && best.kind !== "warlord";
      let dmg = d.damage * this.stats.dmgScale * (unaware ? d.takedown : 1);
      if (this.overdrive) dmg *= 1.25;
      const hitP = best.center;
      this.lastAttack = "melee";
      best.damage(dmg, false, true, hitP, f.clone());
      if (best.alive) {
        best.stun(d.stun);
        best.knock.addScaledVector(f, d.kind === "maul" || d.kind === "axe" ? 5 : 2.5);
      }
      const col = d.kind === "blade" ? 0x9ff4ff : d.kind === "maul" ? 0xffb050 : 0xffe0a0;
      g.fx.sparks(hitP, f.clone().negate(), col, 20, 5);
      g.fx.flash(hitP, col, 6, 0.06);
      audio.meleeHit(d.kind);
      g.hud.hitmarker(unaware, !best.alive);
      if (unaware) g.hud.floatText(hitP.clone().setY(hitP.y + 0.6), best.alive ? `SNEAK ATTACK ×${d.takedown}` : "SILENT TAKEDOWN", 1.2);
      if (!(unaware && !best.alive)) g.noise(this.pos, 6, 0.5);
      this.kick.set((Math.random() - 0.5) * 0.02, 0.02, 0);
      return;
    }
    // the colony factory's power cores can be smashed too
    for (const c of g.level.colony?.cores ?? []) {
      if (c.hp <= 0) continue;
      const to = new Vector3(c.pos.x - this.pos.x, 0, c.pos.z - this.pos.z);
      if (to.length() - 0.85 > d.range || to.normalize().dot(f) < 0.5) continue;
      this.lastAttack = "melee";
      g.damageCore(c, d.damage * this.stats.dmgScale, c.pos.clone(), f.clone());
      audio.meleeHit(d.kind);
      return;
    }
  }

  /** Throw or use gadget 1 (G) or gadget 2 (T). */
  useGadget(i: 0 | 1): void {
    if (this.dead || this.throwT > 0 || this.gadgetCd > 0 || this.meleeT > 0) return;
    const kind = this.gadgetKind(i);
    const def = GADGETS[kind];
    if (this.gadgets[i] <= 0) {
      audio.empty();
      this.game.hud.hint(`No ${def.name}s left. Ammo cases restock your gadgets.`, 2.2);
      return;
    }
    this.gadgets[i]--;
    this.gadgetUses[i]++;
    this.gadgetCd = 0.7;
    this.reloadT = 0;
    if (kind === "stim") {
      this.stimT = 4;
      this.throwT = 0.35;
      audio.stim();
      this.game.hud.hint("<b style='color:#40ff80'>MEDI-STIM</b>: healing", 1.6);
      return;
    }
    this.throwT = 0.42;
    const dir = this.forward();
    const mesh = buildGadget(kind);
    const p = this.eye.addScaledVector(dir, 0.45);
    p.y -= 0.12;
    const place = gadgetPlaced(kind);
    const vel = dir.clone().multiplyScalar(place ? 5.5 : 13.5).add(new Vector3(0, place ? 1.2 : 3.2, 0));
    mesh.position.copy(p);
    this.game.scene.add(mesh);
    const life: Record<GadgetKind, number> = { frag: 1.8, emp: 2.0, decoy: 9.5, mine: 90, stim: 0, smoke: 10, shock: 12, turret: 20 };
    this.devices.push({ kind, mesh, pos: p, vel, t: life[kind], landed: false, armT: kind === "turret" ? 0.8 : 1.1, beepT: 0 });
    audio.throwGadget();
  }

  refillGadgets(): void {
    this.gadgets[0] = Math.max(this.gadgets[0], this.gadgetMax(0));
    this.gadgets[1] = Math.max(this.gadgets[1], this.gadgetMax(1));
  }

  /** An ammo case: tops up both guns and one gadget. Returns the pickup text, or null if nothing was needed. */
  takeAmmo(mul: number): string | null {
    if (!this.specs) return null;
    const out: string[] = [];
    const [a, b] = this.specs;
    if (this.reserve < a.reserveMax * 2) {
      const amt = Math.round(a.magMax * 1.5 * mul);
      this.reserve += amt;
      out.push(`+${amt} AMMO`);
    }
    if (this.reserve2 < b.reserveMax * 2) {
      const amt = Math.round(b.magMax * mul);
      this.reserve2 += amt;
      if (!out.length) out.push(`+${amt} ${b.name.toUpperCase()} AMMO`);
    }
    for (const i of [0, 1] as const) {
      if (this.gadgets[i] < this.gadgetMax(i)) {
        this.gadgets[i]++;
        out.push(`+1 ${GADGETS[this.gadgetKind(i)].short}`);
        break;
      }
    }
    return out.length ? out.join(" · ") : null;
  }

  private updateDevices(dt: number): void {
    const g = this.game;
    for (let i = this.devices.length - 1; i >= 0; i--) {
      const d = this.devices[i];
      let bounced = false;
      if (!d.landed) {
        d.vel.y -= 14 * dt;
        const next = d.pos.clone().addScaledVector(d.vel, dt);
        if (g.level.solid(Math.floor(next.x), Math.floor(d.pos.z))) {
          d.vel.x *= -0.45;
          bounced = true;
        }
        if (g.level.solid(Math.floor(d.pos.x), Math.floor(next.z))) {
          d.vel.z *= -0.45;
          bounced = true;
        }
        d.pos.addScaledVector(d.vel, dt);
        if (d.pos.y > 3.3) {
          d.pos.y = 3.3;
          d.vel.y = -Math.abs(d.vel.y) * 0.3;
        }
        const rest = gadgetRestY(d.kind);
        if (d.pos.y < rest + 0.01) {
          d.pos.y = rest;
          if (Math.abs(d.vel.y) > 1.5) bounced = true;
          d.vel.y = Math.abs(d.vel.y) * 0.35;
          d.vel.x *= 0.6;
          d.vel.z *= 0.6;
          if (gadgetSettles(d.kind) && Math.hypot(d.vel.x, d.vel.z) < 1.4) {
            d.landed = true;
            d.vel.set(0, 0, 0);
            d.mesh.rotation.set(0, d.mesh.rotation.y, 0);
          }
        }
        if (!d.landed) {
          d.mesh.rotation.x += dt * 9;
          d.mesh.rotation.z += dt * 5;
        }
        d.mesh.position.copy(d.pos);
      }
      let remove = false;
      if (d.kind === "frag") {
        d.t -= dt;
        if (Math.random() < 0.5) g.fx.puff(d.pos, 0x777777, 1, new Vector3(0, 0.4, 0), 0.05, 0.3, 0.05, 0.12);
        if (d.t <= 0) {
          g.blast(d.pos.clone().setY(Math.max(0.3, d.pos.y)), 115, 4.8, 42);
          remove = true;
        }
      } else if (d.kind === "emp") {
        d.t -= dt;
        if (bounced || d.t <= 0 || d.pos.y <= gadgetRestY("emp") + 0.02) {
          g.empBlast(d.pos.clone().setY(Math.max(0.3, d.pos.y)));
          remove = true;
        }
      } else if (d.kind === "decoy") {
        if (d.landed) {
          d.t -= dt;
          d.beepT -= dt;
          if (d.beepT <= 0) {
            d.beepT = 0.8;
            g.noise(d.pos, 17, 0.8);
            audio.decoyBeep(d.pos.distanceTo(this.pos));
            g.fx.flash(d.pos.clone().setY(0.3), 0xff3020, 5, 0.12);
          }
          if (d.t <= 0) {
            g.fx.puff(d.pos.clone().setY(0.1), 0x555555, 8, new Vector3(0, 0.6, 0), 0.3, 0.6, 0.1, 0.3);
            remove = true;
          }
        }
      } else if (d.kind === "mine") {
        if (d.landed) {
          d.t -= dt;
          if (d.armT > 0) {
            d.armT -= dt;
            if (d.armT <= 0) audio.hackTick(1);
          } else {
            d.beepT -= dt;
            if (d.beepT <= 0) {
              d.beepT = 1.1;
              g.fx.flash(d.pos.clone().setY(0.15), 0xff2010, 3, 0.08);
            }
            const hit = g.robots.some((r) => r.alive && r.state !== "dormant" && Math.hypot(r.pos.x - d.pos.x, r.pos.z - d.pos.z) < 1.9 + r.rig.radius * 0.5);
            if (hit) {
              g.blast(d.pos.clone().setY(0.35), 140, 3.8, 42);
              remove = true;
            }
          }
          if (d.t <= 0) remove = true;
        }
      } else if (d.kind === "smoke") {
        // a thick cloud for 10 seconds: robots can't see into or through it (game.smokeBlocks)
        if (d.landed) {
          d.t -= dt;
          d.beepT -= dt;
          if (d.beepT <= 0 && d.t > 0.6) {
            d.beepT = 0.09;
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 2.6;
            const grow = Math.min(1, (10 - d.t) / 1.2);
            g.fx.puff(new Vector3(d.pos.x + Math.cos(a) * r * grow, 0.3 + Math.random() * 1.6, d.pos.z + Math.sin(a) * r * grow), 0x9a9a98, 2, new Vector3(0, 0.25, 0), 0.8, 2.4, 1.2, 2.6);
          }
          if (d.t <= 0) remove = true;
        }
      } else if (d.kind === "shock") {
        // Tesla Trap: zaps every robot that comes close
        if (d.landed) {
          if (d.armT > 0) d.armT -= dt;
          else {
            d.t -= dt;
            d.beepT -= dt;
            if (d.beepT <= 0) {
              d.beepT = 0.45;
              const top = d.pos.clone().setY(0.3);
              let zapped = 0;
              for (const r of g.robots) {
                if (!r.alive || r.state === "dormant") continue;
                if (Math.hypot(r.pos.x - d.pos.x, r.pos.z - d.pos.z) > 3.2 + r.rig.radius * 0.5) continue;
                const c = r.center;
                let prev = top;
                for (let k = 1; k <= 4; k++) {
                  const q = top.clone().lerp(c, k / 4);
                  if (k < 4) q.add(new Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
                  g.fx.tracer(prev, q, 0x9ff4ff, 0.025, 0.08);
                  prev = q;
                }
                g.fx.sparks(c, new Vector3(0, 1, 0), 0x9ff4ff, 6, 3);
                this.lastAttack = "gadget";
                r.damage(12, false, false);
                if (r.alive) r.stun(1.2);
                zapped++;
              }
              if (zapped) audio.electric(d.pos.distanceTo(this.pos));
              else if (Math.random() < 0.4) g.fx.sparks(top, new Vector3(0, 1, 0), 0x9ff4ff, 3, 2);
            }
            if (d.t <= 0) remove = true;
          }
        }
      } else if (d.kind === "turret") {
        // Sentry Turret: shoots the nearest robot it can see
        if (d.landed) {
          const head = d.mesh.userData.head as Object3D | undefined;
          if (d.armT > 0) {
            d.armT -= dt;
            if (d.armT <= 0) audio.hackDone();
          } else {
            d.t -= dt;
            d.beepT -= dt;
            let target: Robot | null = null;
            let best = 15;
            for (const r of g.robots) {
              if (!r.alive || r.state === "dormant" || r.role === "stealth") continue;
              const dist = Math.hypot(r.pos.x - d.pos.x, r.pos.z - d.pos.z);
              if (dist < best && g.level.sight(d.pos.x, d.pos.z, r.pos.x, r.pos.z, 0.5)) {
                best = dist;
                target = r;
              }
            }
            if (target && head) {
              const want = Math.atan2(target.pos.x - d.pos.x, target.pos.z - d.pos.z) - d.mesh.rotation.y;
              head.rotation.y += Math.atan2(Math.sin(want - head.rotation.y), Math.cos(want - head.rotation.y)) * Math.min(1, dt * 10);
            }
            if (target && d.beepT <= 0) {
              d.beepT = 0.2;
              const from = d.pos.clone().setY(0.4);
              const c = target.center;
              g.fx.tracer(from, c, 0xffd070, 0.015, 0.05);
              g.fx.flash(from, 0xffd070, 3, 0.04);
              this.lastAttack = "gadget";
              target.damage(9, false, false, c, c.clone().sub(from).normalize());
              if (target.alive && target.state !== "combat") target.alert(d.pos, false);
              audio.shoot("smg");
              g.noise(d.pos, 10, 0.6);
            }
            if (d.t <= 0) {
              g.fx.puff(d.pos.clone().setY(0.3), 0x555555, 10, new Vector3(0, 0.6, 0), 0.3, 0.7, 0.1, 0.3);
              remove = true;
            }
          }
        }
      }
      if (remove) {
        d.mesh.removeFromParent();
        this.devices.splice(i, 1);
      }
    }
  }

  spawn(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.crouch = 0;
    this.maxHp = this.stats.hp;
    this.bonusHp = this.stats.startArmour;
    this.hp = this.maxHp + this.bonusHp;
    this.mag = this.stats.mag;
    this.reserve = this.stats.reserve;
    this.reloadT = 0;
    this.abilityT = 0;
    this.abilityCd = 0;
    this.dead = false;
    this.lastHurt = 99;
    this.flashlight = false;
    this.light.intensity = 0;
    for (const g of this.grenades) g.mesh.removeFromParent();
    this.grenades.length = 0;
    for (const d of this.devices) d.mesh.removeFromParent();
    this.devices.length = 0;
    this.mag2 = this.specs ? this.specs[1].magMax : 0;
    this.reserve2 = this.specs ? this.specs[1].reserveMax : 0;
    this.gadgets[0] = this.gadgetMax(0);
    this.gadgets[1] = this.gadgetMax(1);
    this.gadgetUses[0] = this.gadgetUses[1] = 0;
    this.meleeUses = 0;
    this.meleeT = 0;
    this.throwT = 0;
    this.gadgetCd = 0;
    this.stimT = 0;
    this.spin = 0;
    this.slot = 1;
    this.selectSlot(0, true);
  }

  get eyeH(): number {
    return STAND_EYE + (CROUCH_EYE - STAND_EYE) * this.crouch;
  }
  get crouching(): boolean {
    return this.crouch > 0.5;
  }
  get eye(): Vector3 {
    return new Vector3(this.pos.x, this.eyeH, this.pos.z);
  }
  forward(out = new Vector3()): Vector3 {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }
  get abilityActive(): boolean {
    return this.abilityT > 0;
  }
  get shieldUp(): boolean {
    return this.stats.def.id === "brutus" && this.abilityT > 0;
  }
  get overdrive(): boolean {
    return this.stats.def.id === "hale" && this.abilityT > 0;
  }
  get scanning(): boolean {
    return this.stats.def.id === "cloya" && this.abilityT > 0;
  }

  onMouseMove(dx: number, dy: number): void {
    const s = 0.0022 * this.sens * (1 - this.ads * 0.45);
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * s));
    this.swayX += dx * 0.00025;
    this.swayY += dy * 0.00025;
  }

  toggleFlashlight(): void {
    this.flashlight = !this.flashlight;
    this.light.intensity = this.flashlight ? 60 : 0;
    audio.click();
  }

  reload(): void {
    const gun = this.gun;
    if (!gun || this.reloadT > 0 || this.meleeT > 0 || this.curMag >= gun.magMax || this.curReserve <= 0) return;
    this.reloadT = gun.reload;
    this.reloadSlot = this.slot;
    audio.reload();
  }

  useAbility(): void {
    if (this.abilityCd > 0 || this.dead) return;
    this.abilityUses++;
    const id = this.stats.def.id;
    audio.ability(id);
    this.abilityCd = this.stats.abilityCd;
    this.abilityT = this.stats.abilityDur;
    if (id === "brutus") this.game.shieldBash();
    if (id === "cloya") this.game.hud.flashScan();
    if (id === "dax") {
      const dir = this.forward();
      const m = new Mesh(new SphereGeometry(0.09, 10, 8), M.cyanGlow);
      const p = this.eye.addScaledVector(dir, 0.5);
      m.position.copy(p);
      this.game.scene.add(m);
      this.grenades.push({ mesh: m, pos: p, vel: dir.multiplyScalar(13).add(new Vector3(0, 3, 0)), t: 1.3 });
    }
  }

  damage(amount: number, from: Vector3 | null): number {
    if (this.dead) return 0;
    let dmg = amount * this.stats.damageTaken * (this.game.mission === "training" ? 0.4 : 1);
    if (from && this.shieldUp) {
      const f = this.forward();
      const to = from.clone().sub(this.pos).setY(0).normalize();
      f.setY(0).normalize();
      if (f.dot(to) > 0.35) {
        dmg *= 0.1;
        audio.shieldBlock();
      }
    }
    this.hp -= dmg;
    this.lastHurt = 0;
    if (dmg > 1) {
      audio.hurt();
      this.game.hud.hurt(from ? from.clone() : null, dmg / this.maxHp);
      this.kick.set((Math.random() - 0.5) * 0.04, 0.03, 0);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return dmg;
  }

  heal(n: number): void {
    this.hp = Math.min(this.maxHp + this.bonusHp, this.hp + n);
  }

  update(dt: number, locked: boolean): void {
    const g = this.game;
    this.lastHurt += dt;
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    if (this.abilityT > 0) this.abilityT = Math.max(0, this.abilityT - dt);
    this.gadgetCd = Math.max(0, this.gadgetCd - dt);
    if (this.throwT > 0) this.throwT = Math.max(0, this.throwT - dt);
    if (this.stimT > 0) {
      this.stimT -= dt;
      if (!this.dead) this.heal(15 * dt);
    }
    if (this.meleeT > 0) {
      const d = this.stats.loadout.melee;
      this.meleeT = Math.max(0, this.meleeT - dt);
      if (!this.meleeHit && 1 - this.meleeT / d.time >= 0.38) {
        this.meleeHit = true;
        this.strike();
      }
      if (this.meleeT <= 0) this.showHolder();
    }
    // regenerate slowly up to 40% when out of combat
    const cap = this.maxHp * this.stats.regenCap;
    if (this.lastHurt > 6 && this.hp < cap) this.hp = Math.min(cap, this.hp + dt * this.stats.regenRate);

    // ---- movement ----
    const k = this.keys;
    const fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const str = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const wantCrouch = k.has("ControlLeft") || k.has("ControlRight") || k.has("KeyC");
    this.crouch += ((wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.sprinting = (k.has("ShiftLeft") || k.has("ShiftRight")) && fwd > 0 && !wantCrouch && this.ads < 0.3;
    let speed = this.stats.def.speed;
    if (this.sprinting) speed *= 1.55;
    if (this.crouching) speed *= 0.5;
    if (this.overdrive) speed *= 1.45;
    if (this.ads > 0.5) speed *= 0.6;
    if (this.shieldUp) speed *= 0.85;
    speed *= g.slowFactor;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const wx = (-sy * fwd + cy * str) * speed;
    const wz = (-cy * fwd - sy * str) * speed;
    const len = Math.hypot(fwd, str);
    const tx = len > 0 ? wx / Math.max(1, len) : 0;
    const tz = len > 0 ? wz / Math.max(1, len) : 0;
    const acc = Math.min(1, dt * 12);
    this.vel.x += (tx - this.vel.x) * acc;
    this.vel.z += (tz - this.vel.z) * acc;
    this.vel.x += this.kick.x * 0; // placeholder for knockback handled below
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      this.pos.x += (this.vel.x * dt) / steps;
      this.pos.z += (this.vel.z * dt) / steps;
      g.level.collide(this.pos, RADIUS);
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moving = hs > 0.5;
    if (this.moving) {
      this.bob += dt * hs * 1.9;
      this.stepT -= dt * hs;
      if (this.stepT <= 0) {
        this.stepT = 2.1;
        audio.playerStep(this.sprinting);
        if (!this.crouching) g.noise(this.pos, this.sprinting ? 9 * this.stats.sprintNoise : 3.2, 0.35);
      }
    }

    // ---- aim ----
    this.ads += ((this.rightDown && this.reloadT <= 0 && !this.sprinting ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    const baseFov = 74;
    const zoom = this.gun?.zoom ?? 1;
    this.camera.fov = baseFov / (1 + (zoom - 1) * this.ads);
    this.camera.updateProjectionMatrix();

    // ---- weapon ----
    this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0 && this.specs) {
        const sp = this.specs[this.reloadSlot === 1 ? 1 : 0];
        if (this.reloadSlot === 1) {
          const take = Math.min(sp.magMax - this.mag2, this.reserve2);
          this.mag2 += take;
          this.reserve2 -= take;
        } else {
          const take = Math.min(sp.magMax - this.mag, this.reserve);
          this.mag += take;
          this.reserve -= take;
        }
      }
    }
    this.pressT -= dt;
    if (!locked || this.dead) this.pressT = 0;
    const trigger = (this.mouseDown || this.pressT > 0) && locked && !this.dead;
    const gun = this.gun;
    {
      // the rotary barrels spin up while firing, and also while aiming so you are ready to shoot
      const was = this.spin;
      const spinUp = !!gun?.rotary && this.meleeT <= 0 && (trigger || (this.rightDown && locked && !this.dead));
      this.spin += ((spinUp ? 1 : 0) - this.spin) * Math.min(1, dt * (spinUp ? 3.5 : 1.5));
      if (spinUp && was < 0.05) audio.spin();
      if (this.weapon?.spinner) this.weapon.spinner.rotation.z += dt * this.spin * 40;
    }
    if (this.slot === 2) {
      if (trigger && (!this.triggerLatch || this.pressT > 0)) {
        this.melee();
        this.triggerLatch = true;
        this.pressT = 0;
      }
    } else if (gun && trigger && this.reloadT <= 0 && this.meleeT <= 0 && this.throwT <= 0) {
      const ready = gun.rotary ? this.spin > 0.8 : true;
      if (this.curMag <= 0) {
        if (!this.triggerLatch) {
          audio.empty();
          this.reload();
        }
        this.triggerLatch = true;
        this.pressT = 0;
      } else if (ready && this.fireCd <= 0 && (gun.auto || !this.triggerLatch || this.pressT > 0)) {
        const rate = gun.fireRate * (this.overdrive ? 1.6 : 1);
        this.fireCd = 1 / rate;
        this.fire(gun);
        this.triggerLatch = true;
        this.pressT = 0;
      }
    }
    if (!this.mouseDown) this.triggerLatch = false;
    this.updateDevices(dt);

    // ---- grenades ----
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      gr.t -= dt;
      gr.vel.y -= 14 * dt;
      const next = gr.pos.clone().addScaledVector(gr.vel, dt);
      if (g.level.solid(Math.floor(next.x), Math.floor(gr.pos.z))) gr.vel.x *= -0.5;
      if (g.level.solid(Math.floor(gr.pos.x), Math.floor(next.z))) gr.vel.z *= -0.5;
      gr.pos.addScaledVector(gr.vel, dt);
      if (gr.pos.y < 0.1) {
        gr.pos.y = 0.1;
        gr.vel.y = Math.abs(gr.vel.y) * 0.4;
        gr.vel.x *= 0.7;
        gr.vel.z *= 0.7;
      }
      gr.mesh.position.copy(gr.pos);
      g.fx.puff(gr.pos, 0x55e6ff, 1, new Vector3(), 0.2, 0.3, 0.12, 0.02, true);
      if (gr.t <= 0) {
        gr.mesh.removeFromParent();
        this.grenades.splice(i, 1);
        g.pulseBlast(gr.pos);
      }
    }

    // ---- camera ----
    this.camera.position.set(this.pos.x, this.eyeH + Math.sin(this.bob * 2) * 0.03 * (this.moving ? 1 : 0), this.pos.z);
    this.kick.multiplyScalar(Math.max(0, 1 - dt * 10));
    this.camera.rotation.set(this.pitch + this.kick.y + this.recoil * 0.02, this.yaw + this.kick.x, 0, "YXZ");
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.updateViewModel(dt);
  }

  private fire(gun: GunSpec): void {
    const g = this.game;
    if (this.slot === 1) this.mag2--;
    else this.mag--;
    this.lastAttack = "gun";
    this.recoil = Math.min(1.5, this.recoil + gun.recoil);
    this.flashT = 0.05;
    audio.shoot(gun.model);
    const adsK = 1 - (gun.pellets > 1 ? 0.35 : 0.8);
    const spread = gun.spread * (gun.hipMul * (1 - this.ads) + gun.adsMul * adsK * this.ads) * (this.crouching ? 0.7 : 1) * (this.moving ? 1.6 : 1);
    const origin = this.camera.position.clone();
    const dmg = gun.damage * (this.overdrive ? 1.25 : 1);
    this.computeMuzzleWorld();
    const shots0 = g.shots;
    const hits0 = g.hits;
    for (let i = 0; i < gun.pellets; i++) {
      const dir = this.forward();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      const hit = g.hitscan(origin, dir, 80, dmg, gun.falloff);
      if (i < 4) g.fx.tracer(this.muzzleWorld, hit, gun.color, gun.model === "sniper" ? 0.03 : 0.018, gun.model === "sniper" ? 0.18 : 0.06);
    }
    // a shotgun blast counts as one shot (and one hit) for accuracy
    if (gun.pellets > 1) {
      g.shots = shots0 + 1;
      g.hits = hits0 + (g.hits > hits0 ? 1 : 0);
    }
    g.fx.flash(this.muzzleWorld, gun.color, 6, 0.05);
    g.noise(this.pos, gun.noise, 1);
  }

  private computeMuzzleWorld(): void {
    const w = this.slot === 1 ? this.weapon2 : this.weapon;
    if (!w) return;
    this.vmCamera.updateMatrixWorld(true);
    const local = w.muzzle.getWorldPosition(new Vector3());
    // vm camera sits at the origin, so its world space == main camera local space
    this.camera.updateMatrixWorld(true);
    this.muzzleWorld.copy(this.camera.localToWorld(local));
  }

  private updateViewModel(dt: number): void {
    this.vmCamera.fov = 60;
    this.vmCamera.aspect = this.camera.aspect;
    this.vmCamera.updateProjectionMatrix();
    this.swayX *= Math.max(0, 1 - dt * 8);
    this.swayY *= Math.max(0, 1 - dt * 8);
    const bobX = Math.cos(this.bob) * 0.012 * (this.moving ? 1 : 0);
    const bobY = Math.abs(Math.sin(this.bob)) * 0.014 * (this.moving ? 1 : 0);
    const adsK = this.ads;
    const hipX = 0.25;
    const hipY = -0.23;
    const adsX = 0;
    const adsY = this.gun?.adsY ?? hipY;
    let x = hipX + (adsX - hipX) * adsK - this.swayX + bobX;
    let y = hipY + (adsY - hipY) * adsK + this.swayY - bobY;
    let z = -0.64 + this.recoil * 0.05;
    let rx = this.recoil * 0.08;
    let ry = 0;
    if (this.sprinting) {
      x += 0.05;
      y -= 0.06;
      ry = 0.6;
      rx -= 0.25;
    }
    if (this.reloadT > 0) {
      const p = Math.sin(Math.min(1, this.reloadT / (this.gun?.reload ?? 1.5)) * Math.PI);
      y -= 0.15 * p;
      rx -= 0.7 * p;
    }
    if (this.throwT > 0) {
      const p = Math.sin((this.throwT / 0.42) * Math.PI);
      y -= 0.2 * p;
      rx -= 0.6 * p;
    }
    // melee swing: wind up to the right, then a fast chop across and down
    const hm = this.holders[2];
    if (hm) {
      let mx = 0;
      let mrx = 0;
      let mrz = 0;
      if (this.meleeT > 0) {
        const u = 1 - this.meleeT / this.stats.loadout.melee.time;
        if (u < 0.3) {
          const k = u / 0.3;
          mx = 0.08 * k;
          mrx = 0.35 * k;
          mrz = -0.55 * k;
        } else if (u < 0.55) {
          const k = (u - 0.3) / 0.25;
          mx = 0.08 - 0.34 * k;
          mrx = 0.35 - 1.25 * k;
          mrz = -0.55 + 1.75 * k;
        } else {
          const k = 1 - (u - 0.55) / 0.45;
          mx = -0.26 * k;
          mrx = -0.9 * k;
          mrz = 1.2 * k;
        }
      }
      hm.position.x = -0.02 + mx;
      hm.rotation.set(mrx, 0, mrz);
    }
    if (this.dead) y -= 0.5;
    // looking through a scope: the gun and hands step aside so the lens fills the view
    this.vm.visible = this.scopeK < 0.85;
    this.gunHolder.position.lerp(new Vector3(x, y, z), Math.min(1, dt * 18));
    this.gunHolder.rotation.x += (rx - this.gunHolder.rotation.x) * Math.min(1, dt * 14);
    this.gunHolder.rotation.y += (ry - this.gunHolder.rotation.y) * Math.min(1, dt * 10);
    if (this.shield) {
      const up = this.shieldUp ? 1 : 0;
      const target = new Vector3(-0.28 + up * 0.2, -0.45 + up * 0.35, -0.55 + up * 0.08);
      this.shield.position.lerp(target, Math.min(1, dt * 10));
      this.shield.rotation.y += (Math.PI + 0.5 - up * 0.45 - this.shield.rotation.y) * Math.min(1, dt * 10);
    }
    this.flashT -= dt;
    this.muzzleFlash.visible = this.flashT > 0;
    if (this.muzzleFlash.visible) {
      this.muzzleFlash.material.rotation = Math.random() * 6;
      this.muzzleFlash.scale.setScalar(0.18 + Math.random() * 0.12);
    }
  }
}

export { MeshBasicMaterial };
