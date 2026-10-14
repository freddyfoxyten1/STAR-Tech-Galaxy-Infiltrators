/**
 * Hero equipment: every hero carries their primary gun (data.ts HEROES), a secondary gun,
 * a melee weapon and two gadgets. This file holds the loadout tables and the 3D models
 * for the new kit. The player controller (player.ts) runs them.
 */
import { Group, Mesh, MeshBasicMaterial, Object3D, TorusGeometry, Vector3 } from "three";
import { M, box, cyl, rbox, sphere, type HeroId } from "./models";

export type SecondaryKind = "shotgun" | "sidearm" | "smg" | "revolver";
export type MeleeKind = "maul" | "knife" | "blade" | "axe";
export type GadgetKind = "frag" | "emp" | "decoy" | "mine" | "stim" | "smoke" | "shock" | "turret";

export interface GunDef {
  kind: SecondaryKind;
  name: string;
  damage: number;
  fireRate: number;
  mag: number;
  reserve: number;
  spread: number;
  auto: boolean;
  zoom: number;
  /** pellets per shot (shotguns) */
  pellets: number;
  /** damage fades to 25% over this distance (0 = no falloff) */
  falloff: number;
  /** how far robots hear the shot */
  noise: number;
  reload: number;
  recoil: number;
  color: number;
}

export interface MeleeDef {
  kind: MeleeKind;
  name: string;
  damage: number;
  /** seconds per swing */
  time: number;
  range: number;
  /** stun on a hit that doesn't kill */
  stun: number;
  /** damage multiplier for a hit on a robot that hasn't noticed you */
  takedown: number;
}

export interface GadgetDef {
  kind: GadgetKind;
  name: string;
  short: string;
  desc: string;
}

export const GADGETS: Record<GadgetKind, GadgetDef> = {
  frag: { kind: "frag", name: "Frag Grenade", short: "FRAG", desc: "Bounces, then explodes, blasting every robot nearby. Don't stand too close!" },
  emp: { kind: "emp", name: "EMP Grenade", short: "EMP", desc: "Silent blast that shuts down every robot in a wide circle for 6 seconds." },
  decoy: { kind: "decoy", name: "Decoy Beacon", short: "DECOY", desc: "Throw it and it beeps for 9 seconds. Robots go to check it out, even mid-fight." },
  mine: { kind: "mine", name: "Proximity Mine", short: "MINE", desc: "Arms after a second, then blows up the first robot that walks over it." },
  stim: { kind: "stim", name: "Medi-Stim", short: "STIM", desc: "Injects instantly and heals 60 health over 4 seconds." },
  smoke: { kind: "smoke", name: "Smoke Grenade", short: "SMOKE", desc: "Pours out a thick cloud for 10 seconds. Robots can't see into it or through it." },
  shock: { kind: "shock", name: "Tesla Trap", short: "TESLA", desc: "Drop it and it zaps every robot that comes close for 12 seconds, stunning and hurting them." },
  turret: { kind: "turret", name: "Sentry Turret", short: "SENTRY", desc: "A little auto-gun that shoots the nearest robot for 20 seconds. Robots go after it too." },
};

/** Store data for gadgets: how many you carry and what it costs to unlock one for the whole squad. */
export const GADGET_STORE: Record<GadgetKind, { base: number; price: number }> = {
  frag: { base: 3, price: 40 },
  decoy: { base: 2, price: 40 },
  stim: { base: 2, price: 50 },
  mine: { base: 2, price: 55 },
  smoke: { base: 2, price: 60 },
  emp: { base: 2, price: 70 },
  shock: { base: 2, price: 85 },
  turret: { base: 1, price: 120 },
};
/** Dax carries the squad's spare kit: one extra of every gadget. */
export const HERO_GADGET_BONUS: Record<HeroId, number> = { brutus: 0, hale: 0, cloya: 0, dax: 1 };
export const GADGET_ORDER: GadgetKind[] = ["frag", "stim", "decoy", "mine", "emp", "smoke", "shock", "turret"];

export interface Loadout {
  secondary: GunDef;
  melee: MeleeDef;
  gadgets: [{ kind: GadgetKind; count: number }, { kind: GadgetKind; count: number }];
}

export const LOADOUTS: Record<HeroId, Loadout> = {
  brutus: {
    secondary: { kind: "shotgun", name: "Breacher Shotgun", damage: 13, fireRate: 1.25, mag: 6, reserve: 36, spread: 0.075, auto: false, zoom: 1.15, pellets: 8, falloff: 14, noise: 20, reload: 2.1, recoil: 1.5, color: 0xffb060 },
    melee: { kind: "maul", name: "Shock Maul", damage: 75, time: 0.85, range: 2.5, stun: 1.6, takedown: 3 },
    gadgets: [{ kind: "frag", count: 3 }, { kind: "stim", count: 2 }],
  },
  hale: {
    secondary: { kind: "sidearm", name: "Service Pistol", damage: 22, fireRate: 5, mag: 15, reserve: 75, spread: 0.01, auto: false, zoom: 1.25, pellets: 1, falloff: 0, noise: 15, reload: 1.2, recoil: 0.8, color: 0x7fe8ff },
    melee: { kind: "knife", name: "Combat Knife", damage: 48, time: 0.42, range: 1.95, stun: 0.4, takedown: 3 },
    gadgets: [{ kind: "frag", count: 3 }, { kind: "mine", count: 2 }],
  },
  cloya: {
    secondary: { kind: "smg", name: "Whisper SMG", damage: 9, fireRate: 12, mag: 30, reserve: 150, spread: 0.028, auto: true, zoom: 1.2, pellets: 1, falloff: 0, noise: 4, reload: 1.4, recoil: 0.25, color: 0xb890ff },
    melee: { kind: "blade", name: "Energy Blade", damage: 55, time: 0.5, range: 2.05, stun: 0.6, takedown: 4 },
    gadgets: [{ kind: "emp", count: 2 }, { kind: "decoy", count: 2 }],
  },
  dax: {
    secondary: { kind: "revolver", name: "Hand Cannon", damage: 48, fireRate: 2, mag: 6, reserve: 36, spread: 0.008, auto: false, zoom: 1.3, pellets: 1, falloff: 0, noise: 20, reload: 1.8, recoil: 1.4, color: 0xffd060 },
    melee: { kind: "axe", name: "Breaching Axe", damage: 68, time: 0.75, range: 2.3, stun: 1.0, takedown: 3 },
    gadgets: [{ kind: "frag", count: 4 }, { kind: "mine", count: 3 }],
  },
};

// ================================================================ models (built facing +Z, grip near the origin)
const purpleGlow = new MeshBasicMaterial({ color: 0xc8a0ff });
export function buildSecondary(kind: SecondaryKind): { root: Group; muzzle: Object3D } {
  const root = new Group();
  const muzzle = new Object3D();
  const B = M.gunBlack;
  const G = M.gunGrey;
  if (kind === "shotgun") {
    rbox(0.08, 0.1, 0.34, B, 0, 0, 0.02, root, 0.014);
    cyl(0.021, 0.021, 0.46, G, 0, 0.025, 0.38, root, 10).rotation.x = Math.PI / 2;
    cyl(0.018, 0.018, 0.4, B, 0, -0.025, 0.34, root, 10).rotation.x = Math.PI / 2; // tube magazine
    const pump = rbox(0.07, 0.055, 0.16, M.polymer, 0, -0.03, 0.34, root, 0.014);
    for (let i = 0; i < 5; i++) box(0.074, 0.058, 0.01, B, 0, -0.03, 0.28 + i * 0.03, root);
    void pump;
    const grip = rbox(0.05, 0.15, 0.065, M.polymer, 0, -0.1, -0.08, root, 0.012);
    grip.rotation.x = 0.35;
    rbox(0.06, 0.1, 0.24, M.polymer, 0, -0.02, -0.3, root, 0.02);
    rbox(0.065, 0.13, 0.04, M.rubber, 0, -0.03, -0.43, root, 0.012);
    for (let i = 0; i < 4; i++) cyl(0.011, 0.011, 0.018, M.barrelRed, 0.045, 0.0, -0.05 + i * 0.03, root, 6).rotation.z = Math.PI / 2; // shells on the side
    box(0.014, 0.006, 0.18, M.orangeGlow, 0, 0.052, 0.04, root);
    muzzle.position.set(0, 0.025, 0.62);
  } else if (kind === "smg") {
    rbox(0.065, 0.1, 0.26, B, 0, 0, 0.0, root, 0.012);
    rbox(0.07, 0.03, 0.2, G, 0, 0.06, 0.0, root, 0.008);
    cyl(0.028, 0.028, 0.26, M.gunmetal, 0, 0.01, 0.26, root, 12).rotation.x = Math.PI / 2; // suppressor
    for (let i = 0; i < 3; i++) cyl(0.03, 0.03, 0.01, B, 0, 0.01, 0.16 + i * 0.09, root, 12).rotation.x = Math.PI / 2;
    rbox(0.04, 0.22, 0.05, M.polymer, 0, -0.14, 0.05, root, 0.008).rotation.x = -0.08;
    const grip = rbox(0.045, 0.13, 0.055, M.polymer, 0, -0.09, -0.08, root, 0.012);
    grip.rotation.x = 0.3;
    // folding wire stock
    for (const s of [-1, 1]) box(0.008, 0.008, 0.2, G, s * 0.025, 0.0, -0.22, root);
    rbox(0.06, 0.09, 0.02, M.rubber, 0, -0.01, -0.32, root, 0.006);
    box(0.014, 0.006, 0.12, purpleGlow, 0, 0.078, 0.0, root);
    muzzle.position.set(0, 0.01, 0.4);
  } else if (kind === "revolver") {
    rbox(0.06, 0.07, 0.14, G, 0, 0.02, 0.0, root, 0.012);
    const drum = cyl(0.045, 0.045, 0.08, B, 0, 0.02, 0.07, root, 12);
    drum.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(0.011, 0.011, 0.082, M.orangeGlow, Math.cos(a) * 0.028, 0.02 + Math.sin(a) * 0.028, 0.07, root, 6).rotation.x = Math.PI / 2;
    }
    rbox(0.045, 0.05, 0.26, G, 0, 0.035, 0.24, root, 0.01);
    rbox(0.03, 0.02, 0.24, B, 0, 0.068, 0.24, root, 0.006);
    cyl(0.017, 0.017, 0.03, B, 0, 0.035, 0.38, root, 8).rotation.x = Math.PI / 2;
    const grip = rbox(0.05, 0.15, 0.07, M.wood, 0, -0.09, -0.06, root, 0.018);
    grip.rotation.x = 0.35;
    box(0.02, 0.03, 0.05, B, 0, 0.07, -0.05, root); // hammer
    muzzle.position.set(0, 0.035, 0.4);
  } else {
    // sidearm
    rbox(0.062, 0.06, 0.24, G, 0, 0.03, 0.03, root, 0.012);
    for (let i = 0; i < 5; i++) box(0.064, 0.035, 0.006, B, 0, 0.035, -0.06 + i * 0.012, root);
    rbox(0.058, 0.05, 0.2, B, 0, -0.02, 0.03, root, 0.01);
    const grip = rbox(0.052, 0.15, 0.075, M.polymer, 0, -0.1, -0.05, root, 0.014);
    grip.rotation.x = 0.22;
    box(0.014, 0.006, 0.12, M.cyanGlow, 0, 0.061, 0.03, root);
    cyl(0.016, 0.016, 0.03, B, 0, 0.03, 0.16, root, 10).rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.03, 0.17);
  }
  root.add(muzzle);
  return { root, muzzle };
}

/** Melee weapons: handle at the origin, the business end up along +Y. */
export function buildMelee(kind: MeleeKind): Group {
  const g = new Group();
  if (kind === "knife") {
    cyl(0.018, 0.02, 0.12, M.rubber, 0, 0, 0, g, 8);
    box(0.07, 0.014, 0.03, M.gunGrey, 0, 0.065, 0, g);
    const blade = box(0.034, 0.2, 0.008, M.chrome, 0.004, 0.17, 0, g);
    void blade;
    box(0.01, 0.2, 0.009, M.cyanGlow, -0.013, 0.17, 0, g);
    const tip = box(0.024, 0.024, 0.008, M.chrome, 0.004, 0.275, 0, g);
    tip.rotation.z = Math.PI / 4;
  } else if (kind === "blade") {
    cyl(0.02, 0.022, 0.16, M.gunBlack, 0, 0, 0, g, 10);
    for (let i = 0; i < 3; i++) cyl(0.023, 0.023, 0.01, M.gunGrey, 0, -0.05 + i * 0.05, 0, g, 10);
    rbox(0.08, 0.03, 0.04, M.gunGrey, 0, 0.09, 0, g, 0.01);
    box(0.03, 0.46, 0.012, M.cyanGlow, 0, 0.34, 0, g);
    box(0.05, 0.46, 0.004, purpleGlow, 0, 0.34, 0, g);
    sphere(0.02, M.cyanGlow, 0, 0.57, 0, g, 8);
  } else if (kind === "maul") {
    cyl(0.022, 0.024, 0.56, M.gunBlack, 0, 0.15, 0, g, 10);
    cyl(0.028, 0.028, 0.12, M.rubber, 0, -0.06, 0, g, 10);
    rbox(0.2, 0.12, 0.12, M.gunmetal, 0, 0.47, 0, g, 0.02);
    for (const s of [-1, 1]) {
      rbox(0.04, 0.13, 0.13, M.darkMetal, s * 0.11, 0.47, 0, g, 0.01);
      box(0.012, 0.1, 0.1, M.orangeGlow, s * 0.132, 0.47, 0, g);
    }
    for (let i = 0; i < 3; i++) box(0.205, 0.012, 0.124, M.orangeGlow, 0, 0.43 + i * 0.04, 0, g);
  } else {
    // axe
    cyl(0.02, 0.022, 0.52, M.wood, 0, 0.14, 0, g, 8);
    cyl(0.025, 0.025, 0.1, M.rubber, 0, -0.06, 0, g, 8);
    const head = rbox(0.18, 0.1, 0.03, M.gunmetal, 0.07, 0.4, 0, g, 0.01);
    void head;
    box(0.02, 0.13, 0.032, M.chrome, 0.16, 0.4, 0, g);
    const spike = box(0.08, 0.035, 0.03, M.darkMetal, -0.05, 0.4, 0, g);
    void spike;
    box(0.19, 0.02, 0.034, M.hazard, 0.07, 0.36, 0, g);
  }
  return g;
}

/** The thrown or placed gadget in the world (roughly real size). */
export function buildGadget(kind: GadgetKind): Group {
  const g = new Group();
  if (kind === "frag") {
    sphere(0.075, M.oliveDark, 0, 0, 0, g, 12);
    const band = new Mesh(new TorusGeometry(0.075, 0.012, 6, 16), M.gunBlack);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    cyl(0.025, 0.03, 0.04, M.gunGrey, 0, 0.085, 0, g, 8);
    box(0.012, 0.06, 0.02, M.gunGrey, 0.03, 0.07, 0, g);
    sphere(0.012, M.orangeGlow, 0, 0.11, 0, g, 6);
  } else if (kind === "emp") {
    cyl(0.055, 0.055, 0.14, M.gunmetal, 0, 0, 0, g, 12);
    for (const y of [-0.04, 0.04]) cyl(0.058, 0.058, 0.015, M.cyanGlow, 0, y, 0, g, 12);
    cyl(0.03, 0.03, 0.03, M.gunBlack, 0, 0.085, 0, g, 8);
  } else if (kind === "decoy") {
    cyl(0.07, 0.08, 0.05, M.gunBlack, 0, 0.025, 0, g, 12);
    cyl(0.005, 0.005, 0.22, M.gunGrey, 0.03, 0.14, 0, g, 4);
    sphere(0.018, M.redGlow, 0.03, 0.26, 0, g, 6);
    box(0.1, 0.012, 0.03, M.orangeGlow, 0, 0.052, 0, g);
  } else if (kind === "mine") {
    cyl(0.15, 0.17, 0.05, M.oliveDark, 0, 0.025, 0, g, 16);
    cyl(0.07, 0.07, 0.03, M.gunBlack, 0, 0.06, 0, g, 12);
    sphere(0.025, M.redGlow, 0, 0.08, 0, g, 8);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      box(0.05, 0.02, 0.02, M.hazard, Math.cos(a) * 0.12, 0.052, Math.sin(a) * 0.12, g).rotation.y = -a;
    }
  } else if (kind === "smoke") {
    cyl(0.05, 0.05, 0.15, M.gunGrey, 0, 0, 0, g, 12);
    cyl(0.052, 0.052, 0.03, M.greenGlow, 0, 0.03, 0, g, 12);
    cyl(0.03, 0.03, 0.03, M.gunBlack, 0, 0.09, 0, g, 8);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      box(0.012, 0.012, 0.012, M.gunBlack, Math.cos(a) * 0.05, -0.05, Math.sin(a) * 0.05, g);
    }
  } else if (kind === "shock") {
    cyl(0.16, 0.18, 0.05, M.gunmetal, 0, 0.025, 0, g, 16);
    cyl(0.04, 0.06, 0.2, M.gunBlack, 0, 0.14, 0, g, 10);
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(new TorusGeometry(0.07 - i * 0.012, 0.012, 6, 16), M.chrome);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08 + i * 0.05;
      g.add(ring);
    }
    sphere(0.04, M.cyanGlow, 0, 0.26, 0, g, 10);
    box(0.3, 0.012, 0.03, M.hazard, 0, 0.052, 0, g);
  } else if (kind === "turret") {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.012, 0.016, 0.34, M.gunGrey, Math.cos(a) * 0.12, 0.15, Math.sin(a) * 0.12, g, 5);
      leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    }
    cyl(0.05, 0.06, 0.08, M.gunBlack, 0, 0.3, 0, g, 10);
    const head = new Group();
    head.position.y = 0.38;
    rbox(0.16, 0.1, 0.2, M.oliveDark, 0, 0, 0, head, 0.02);
    cyl(0.015, 0.015, 0.24, M.gunBlack, 0.03, 0, 0.18, head, 6).rotation.x = Math.PI / 2;
    cyl(0.015, 0.015, 0.24, M.gunBlack, -0.03, 0, 0.18, head, 6).rotation.x = Math.PI / 2;
    box(0.06, 0.03, 0.01, M.redGlow, 0, 0.02, 0.101, head);
    g.add(head);
    g.userData.head = head;
  } else {
    cyl(0.02, 0.02, 0.14, M.white, 0, 0, 0, g, 8);
    cyl(0.021, 0.021, 0.05, M.greenGlow, 0, 0.02, 0, g, 8);
    cyl(0.004, 0.004, 0.05, M.chrome, 0, 0.095, 0, g, 4);
  }
  return g;
}

/** Gadgets that are set down (they settle and stay) rather than exploding. */
export function gadgetSettles(kind: GadgetKind): boolean {
  return kind === "mine" || kind === "decoy" || kind === "smoke" || kind === "shock" || kind === "turret";
}
/** Gadgets that are placed near your feet rather than thrown far. */
export function gadgetPlaced(kind: GadgetKind): boolean {
  return kind === "mine" || kind === "shock" || kind === "turret";
}

/** A little upward offset for resting gadgets so they sit on the floor. */
export function gadgetRestY(kind: GadgetKind): number {
  return kind === "frag" ? 0.075 : kind === "emp" ? 0.07 : kind === "smoke" ? 0.075 : 0;
}

export const tmpV = new Vector3();
