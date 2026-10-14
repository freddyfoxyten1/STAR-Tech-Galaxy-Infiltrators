import type { HeroId, WeaponKind } from "./models";
import { GADGET_STORE, HERO_GADGET_BONUS, LOADOUTS, type GadgetKind, type GunDef, type MeleeDef } from "./equipment";
import { gunMods, type WeaponSlotKey } from "./store";

export interface HeroDef {
  id: HeroId;
  name: string;
  age: string;
  role: string;
  roleTag: string;
  blurb: string;
  weapon: WeaponKind;
  weaponName: string;
  ability: string;
  abilityDesc: string;
  hp: number;
  speed: number;
  damage: number;
  fireRate: number; // shots / second
  mag: number;
  reserve: number;
  spread: number;
  auto: boolean;
  abilityDur: number;
  abilityCd: number;
  hackMul: number;
  pickupMul: number;
  zoom: number;
  stats: { health: number; power: number; speed: number; stealth: number };
}

export const HEROES: HeroDef[] = [
  {
    id: "brutus",
    name: "BRUTUS",
    age: "40",
    role: "Enforcer",
    roleTag: "HEAVY DEFENCE",
    blurb: "A veteran shield-bearer. Soaks up robot fire and knocks enemies flat.",
    weapon: "pistol",
    weaponName: "Heavy Blaster Pistol",
    ability: "SHIELD UP",
    abilityDesc: "Raise the riot shield to block robot fire from the front and bash nearby robots back.",
    hp: 170,
    speed: 4.3,
    damage: 34,
    fireRate: 3.2,
    mag: 12,
    reserve: 72,
    spread: 0.012,
    auto: false,
    abilityDur: 7,
    abilityCd: 16,
    hackMul: 1,
    pickupMul: 1,
    zoom: 1.25,
    stats: { health: 5, power: 3, speed: 2, stealth: 2 },
  },
  {
    id: "hale",
    name: "HALE",
    age: "42",
    role: "Assault",
    roleTag: "SPEED",
    blurb: "Squad leader and point man. Fast on his feet and faster on the trigger.",
    weapon: "rifle",
    weaponName: "Pulse Rifle",
    ability: "OVERDRIVE",
    abilityDesc: "Run faster and fire faster with extra damage for a few seconds.",
    hp: 120,
    speed: 5.1,
    damage: 15,
    fireRate: 9,
    mag: 36,
    reserve: 216,
    spread: 0.018,
    auto: true,
    abilityDur: 6,
    abilityCd: 18,
    hackMul: 1,
    pickupMul: 1,
    zoom: 1.4,
    stats: { health: 3, power: 3, speed: 5, stealth: 3 },
  },
  {
    id: "cloya",
    name: "CLOYA",
    age: "21+",
    role: "Recon / Tech",
    roleTag: "ADVANCED TECH",
    blurb: "Signals specialist. Sees robots through walls and cracks their systems in seconds.",
    weapon: "sniper",
    weaponName: "Precision Rifle",
    ability: "SCAN",
    abilityDesc: "Reveal every robot nearby through walls. Hacks doors and consoles twice as fast.",
    hp: 100,
    speed: 4.9,
    damage: 62,
    fireRate: 1.6,
    mag: 8,
    reserve: 56,
    spread: 0.003,
    auto: false,
    abilityDur: 9,
    abilityCd: 18,
    hackMul: 2,
    pickupMul: 1,
    zoom: 2.4,
    stats: { health: 2, power: 4, speed: 4, stealth: 5 },
  },
  {
    id: "dax",
    name: "DAX",
    age: "32",
    role: "Demolitions",
    roleTag: "SUPPORT",
    blurb: "Carries the squad's spare ammo and a heavy rotary gun. Stuns crowds with pulse grenades.",
    weapon: "rotary",
    weaponName: "Rotary Blaster",
    ability: "PULSE GRENADE",
    abilityDesc: "Throw a grenade that stuns every robot in the blast. Health and ammo pickups give Dax 50% more.",
    hp: 140,
    speed: 4.5,
    damage: 9,
    fireRate: 14,
    mag: 90,
    reserve: 360,
    spread: 0.03,
    auto: true,
    abilityDur: 0,
    abilityCd: 12,
    hackMul: 1,
    pickupMul: 1.5,
    zoom: 1.25,
    stats: { health: 4, power: 5, speed: 2, stealth: 1 },
  },
];

export const UPGRADE_COSTS = [40, 80, 140];
export type UpgradeKey = "health" | "damage" | "ability";
export const UPGRADES: { key: UpgradeKey; name: string; desc: string }[] = [
  { key: "health", name: "Armour Plating", desc: "+15% max health per level" },
  { key: "damage", name: "Weapon Tuning", desc: "+12% weapon damage per level" },
  { key: "ability", name: "Ability Core", desc: "Ability lasts longer and recharges 15% faster per level" },
];

export type GearKey = "mags" | "plating" | "boots" | "belt" | "pouch" | "harness" | "injector" | "decrypter" | "battery" | "hands";
export const GEAR: { key: GearKey; name: string; desc: string; cost: number }[] = [
  { key: "mags", name: "Extended Magazines", desc: "30% bigger magazines for every hero", cost: 60 },
  { key: "boots", name: "Silent Boots", desc: "Sprinting makes far less noise", cost: 70 },
  { key: "plating", name: "Reinforced Undersuit", desc: "Take 15% less damage from robots", cost: 90 },
  { key: "belt", name: "Gadget Belt", desc: "Carry +1 of both gadgets for every hero", cost: 80 },
  { key: "harness", name: "Ammo Harness", desc: "Carry 50% more spare ammo for every gun", cost: 60 },
  { key: "pouch", name: "Medkit Pouch", desc: "Health packs heal 50% more", cost: 65 },
  { key: "decrypter", name: "Hacking Module", desc: "Hack doors, terminals and consoles 40% faster", cost: 55 },
  { key: "hands", name: "Quick Hands", desc: "Reload and switch weapons 25% faster", cost: 75 },
  { key: "battery", name: "Shield Battery", desc: "Start every mission with +25 bonus armour", cost: 85 },
  { key: "injector", name: "Auto-Injector", desc: "Out of combat your suit heals you back to 70% (not 40%), twice as fast", cost: 100 },
];

export const ROBOT_POINTS = { drone: 5, sentinel: 10, ripper: 15, bulwark: 20, warlord: 50 } as const;
export const MISSION_BONUS = 50;

export type Difficulty = "recruit" | "veteran" | "elite";
export interface DifficultyDef {
  key: Difficulty;
  name: string;
  tag: string;
  desc: string;
  /** robot health, damage, attack rate, move speed, how far/fast they notice you */
  hp: number;
  dmg: number;
  rate: number;
  speed: number;
  senses: number;
  /** every point reward is multiplied by this */
  points: number;
  colour: string;
}
export const DIFFICULTIES: DifficultyDef[] = [
  { key: "recruit", name: "RECRUIT", tag: "STANDARD", desc: "Standard robots. The best way to learn the freighter.", hp: 1, dmg: 1, rate: 1, speed: 1, senses: 1, points: 1, colour: "#7fe8ff" },
  { key: "veteran", name: "VETERAN", tag: "TOUGHER ROBOTS", desc: "Robots have 40% more armour, hit 35% harder, fire faster and spot you sooner.", hp: 1.4, dmg: 1.35, rate: 1.15, speed: 1.08, senses: 1.15, points: 1.5, colour: "#ffc060" },
  { key: "elite", name: "ELITE", tag: "BRUTAL", desc: "Robots have almost double armour and damage, move faster and are very hard to sneak past.", hp: 1.9, dmg: 1.8, rate: 1.3, speed: 1.15, senses: 1.3, points: 2, colour: "#ff6a50" },
];
export function difficultyDef(k: Difficulty | undefined): DifficultyDef {
  return DIFFICULTIES.find((d) => d.key === k) ?? DIFFICULTIES[0];
}
/** A reward after the difficulty multiplier. */
export function scaledPoints(base: number, k: Difficulty | undefined): number {
  return Math.round(base * difficultyDef(k).points);
}
export const ARMORY_BONUS = 25;
/** Mission 2 (Remote Colony): completion bonus, and the optional survivor rescue. */
export const COLONY_BONUS = 75;
export const RESCUE_BONUS = 30;

export interface SaveData {
  points: number;
  lifetime: number;
  hero: HeroId;
  upgrades: Record<HeroId, Record<UpgradeKey, number>>;
  gear: Record<GearKey, boolean>;
  missionsWon: number;
  bestScore: number;
  trainingDone: boolean;
  trainingBest: number;
  trainingOffered: boolean;
  sens: number;
  sfx: number;
  music: number;
  quality: "high" | "low";
  log: string[];
  /** robots destroyed on real missions, per type (shown in the Robot Database) */
  kills: Record<"drone" | "sentinel" | "ripper" | "bulwark" | "warlord", number>;
  /** chosen difficulty for real missions (training always runs at Recruit) */
  difficulty: Difficulty;
  /** Mission 1 wins per difficulty */
  wins: Record<Difficulty, number>;
  /** Mission 2 (Remote Colony) wins per difficulty, and best score there */
  colonyWins: Record<Difficulty, number>;
  colonyBest: number;
  /** Armory Store: gadgets unlocked for the whole squad (each hero's own two are always free) */
  gadgetsOwned: GadgetKind[];
  /** which gadget each hero carries in G and T */
  gadgetSlots: Record<HeroId, [GadgetKind, GadgetKind]>;
  /** weapon overhaul levels (0-3) */
  weaponLvl: Record<HeroId, Record<WeaponSlotKey, number>>;
  /** attachments bought, and the ones taken off */
  attachOwned: Record<HeroId, string[]>;
  attachOff: Record<HeroId, string[]>;
}

const KEY = "startech-gi-save-v1";

function defaultGadgets(id: HeroId): [GadgetKind, GadgetKind] {
  const g = LOADOUTS[id].gadgets;
  return [g[0].kind, g[1].kind];
}
function wl(): Record<WeaponSlotKey, number> {
  return { primary: 0, secondary: 0, melee: 0 };
}

/** Can this hero carry this gadget? (their own two are always allowed; others need a squad unlock) */
export function gadgetAvailable(s: SaveData, id: HeroId, k: GadgetKind): boolean {
  return defaultGadgets(id).includes(k) || s.gadgetsOwned.includes(k);
}
export function gadgetCount(id: HeroId, k: GadgetKind): number {
  return GADGET_STORE[k].base + HERO_GADGET_BONUS[id];
}

function fresh(): SaveData {
  const up = (): Record<UpgradeKey, number> => ({ health: 0, damage: 0, ability: 0 });
  return {
    points: 0,
    lifetime: 0,
    hero: "hale",
    upgrades: { brutus: up(), hale: up(), cloya: up(), dax: up() },
    gear: { mags: false, plating: false, boots: false, belt: false, pouch: false, harness: false, injector: false, decrypter: false, battery: false, hands: false },
    missionsWon: 0,
    bestScore: 0,
    trainingDone: false,
    trainingBest: 0,
    trainingOffered: false,
    sens: 1,
    sfx: 0.8,
    music: 0.5,
    quality: "high",
    kills: { drone: 0, sentinel: 0, ripper: 0, bulwark: 0, warlord: 0 },
    difficulty: "recruit",
    wins: { recruit: 0, veteran: 0, elite: 0 },
    colonyWins: { recruit: 0, veteran: 0, elite: 0 },
    colonyBest: 0,
    gadgetsOwned: [],
    gadgetSlots: { brutus: defaultGadgets("brutus"), hale: defaultGadgets("hale"), cloya: defaultGadgets("cloya"), dax: defaultGadgets("dax") },
    weaponLvl: { brutus: wl(), hale: wl(), cloya: wl(), dax: wl() },
    attachOwned: { brutus: [], hale: [], cloya: [], dax: [] },
    attachOff: { brutus: [], hale: [], cloya: [], dax: [] },
    log: ["SYSTEM STATUS: ONLINE", "SQUAD READY FOR DEPLOYMENT", "NEW SECTOR: ABANDONED FREIGHTER"],
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = { ...fresh(), ...JSON.parse(raw) } as SaveData;
    const f = fresh();
    for (const h of Object.keys(f.upgrades) as HeroId[]) d.upgrades[h] = { ...f.upgrades[h], ...(d.upgrades?.[h] ?? {}) };
    d.gear = { ...f.gear, ...d.gear };
    d.kills = { ...f.kills, ...(d.kills ?? {}) };
    // older saves: their wins were all at the standard level
    if (!raw.includes('"wins"')) f.wins.recruit = d.missionsWon;
    d.wins = { ...f.wins, ...(d.wins ?? {}) };
    d.colonyWins = { ...f.colonyWins, ...(d.colonyWins ?? {}) };
    d.gadgetsOwned = Array.isArray(d.gadgetsOwned) ? d.gadgetsOwned.filter((k) => k in GADGET_STORE) : [];
    for (const h of Object.keys(f.upgrades) as HeroId[]) {
      d.weaponLvl = d.weaponLvl ?? f.weaponLvl;
      d.weaponLvl[h] = { ...f.weaponLvl[h], ...(d.weaponLvl[h] ?? {}) };
      d.attachOwned = d.attachOwned ?? f.attachOwned;
      d.attachOwned[h] = Array.isArray(d.attachOwned[h]) ? d.attachOwned[h] : [];
      d.attachOff = d.attachOff ?? f.attachOff;
      d.attachOff[h] = Array.isArray(d.attachOff[h]) ? d.attachOff[h] : [];
      d.gadgetSlots = d.gadgetSlots ?? f.gadgetSlots;
      const gs = d.gadgetSlots[h];
      const ok = Array.isArray(gs) && gs.length === 2 && gs[0] !== gs[1] && gs.every((k) => k in GADGET_STORE && gadgetAvailable(d, h, k));
      if (!ok) d.gadgetSlots[h] = f.gadgetSlots[h];
    }
    if (!DIFFICULTIES.some((x) => x.key === d.difficulty)) d.difficulty = "recruit";
    return d;
  } catch {
    return fresh();
  }
}

export function writeSave(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable */
  }
}

export function pushLog(d: SaveData, line: string): void {
  d.log.unshift(line.toUpperCase());
  d.log = d.log.slice(0, 8);
}

/** Final numbers for a hero with upgrades, store purchases and gear applied. */
export function heroStats(save: SaveData, id: HeroId) {
  const h = HEROES.find((x) => x.id === id)!;
  const u = save.upgrades[id];
  const w = save.weaponLvl?.[id] ?? wl();
  const fitted = (save.attachOwned?.[id] ?? []).filter((a) => !(save.attachOff?.[id] ?? []).includes(a));
  const pm = gunMods(fitted, "primary");
  const sm = gunMods(fitted, "secondary");
  const gear = save.gear;
  const handling = gear.hands ? 0.75 : 1;
  const base = LOADOUTS[id];
  // sidearm and melee with their overhauls and attachments baked in
  const secondary: GunDef = {
    ...base.secondary,
    damage: base.secondary.damage * (1 + 0.15 * w.secondary) * sm.dmg,
    mag: Math.round(base.secondary.mag * (1 + 0.15 * w.secondary) * sm.mag),
    reserve: Math.round(base.secondary.reserve * (gear.harness ? 1.5 : 1)),
    noise: base.secondary.noise * sm.noise,
    recoil: base.secondary.recoil * sm.recoil,
    reload: base.secondary.reload * sm.reload * handling,
    zoom: base.secondary.zoom + sm.zoom * 0.5,
  };
  const melee: MeleeDef = { ...base.melee, damage: base.melee.damage * (1 + 0.15 * w.melee), time: base.melee.time * (1 - 0.08 * w.melee) };
  const slots = save.gadgetSlots?.[id] ?? defaultGadgets(id);
  const gadgets: [{ kind: GadgetKind; count: number }, { kind: GadgetKind; count: number }] = [
    { kind: slots[0], count: gadgetCount(id, slots[0]) },
    { kind: slots[1], count: gadgetCount(id, slots[1]) },
  ];
  return {
    def: h,
    hp: Math.round(h.hp * (1 + 0.15 * u.health)),
    damage: h.damage * (1 + 0.12 * u.damage) * (1 + 0.1 * w.primary) * pm.dmg,
    abilityDur: h.abilityDur * (1 + 0.2 * u.ability),
    abilityCd: h.abilityCd * (1 - 0.15 * u.ability),
    mag: Math.round(h.mag * (gear.mags ? 1.3 : 1) * pm.mag),
    reserve: Math.round(h.reserve * (gear.harness ? 1.5 : 1)),
    damageTaken: gear.plating ? 0.85 : 1,
    sprintNoise: gear.boots ? 0.35 : 1,
    /** secondary gun, melee weapon and gadgets */
    loadout: { secondary, melee, gadgets },
    /** main gun handling from attachments and overhauls */
    primaryMods: { ...pm, reload: pm.reload * (1 - 0.1 * w.primary) * handling },
    secondaryMods: sm,
    /** fitted attachment ids (the view model shows them) */
    fitted,
    /** weapon tuning applies to every weapon the hero carries */
    dmgScale: 1 + 0.12 * u.damage,
    magScale: save.gear.mags ? 1.3 : 1,
    /** extra gadgets from the Gadget Belt */
    gadgetBonus: save.gear.belt ? 1 : 0,
    hackMul: h.hackMul * (gear.decrypter ? 1.4 : 1),
    healMul: h.pickupMul * (gear.pouch ? 1.5 : 1),
    regenCap: gear.injector ? 0.7 : 0.4,
    regenRate: gear.injector ? 8 : 4,
    startArmour: gear.battery ? 25 : 0,
    handling,
  };
}
export type HeroStats = ReturnType<typeof heroStats>;
