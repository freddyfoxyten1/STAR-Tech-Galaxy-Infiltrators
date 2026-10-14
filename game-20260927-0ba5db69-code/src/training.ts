import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, Vector3 } from "three";
import { audio } from "./audio";
import type { Game, MissionResult } from "./game";
import type { Level, MapDef, Room } from "./level";
import * as P from "./models";
import { M, box, cyl, rbox } from "./models";
import { paintTraining, type Robot } from "./robots";
import { GADGETS } from "./equipment";
import { labelTex } from "./textures";

// ====================================================================== the map
// STAR-Tech Academy: a training deck aboard a station. 1 cell = 1 m, same 67 × 31 grid as the freighter.
const R = (id: string, name: string, x0: number, z0: number, x1: number, z1: number, floor: string, wall: string, light: number, lightI: number): Room => ({ id, name, x0, z0, x1, z1, floor, wall, light, lightI });

const ROOMS: Room[] = [
  R("t_locker", "Locker Room", 2, 2, 9, 10, "acadFloor", "acadWall", 0xdcecff, 18),
  R("t_move", "Movement Course", 11, 5, 34, 8, "grate", "acadWall", 0xe8f4ff, 22),
  R("t_duct", "Crawl Duct", 36, 6, 43, 7, "grate", "greyWall", 0xa0c0e0, 8),
  R("t_range", "Firing Range", 45, 2, 63, 12, "navy", "navyWall", 0x9fd0ff, 30),
  R("t_supply", "Supply Room", 45, 14, 63, 18, "white", "whiteWall", 0xe8f4ff, 20),
  R("t_dark", "Breaker Room", 52, 20, 63, 28, "engGrate", "engWall", 0, 0),
  R("t_hack", "Hacking Station", 45, 22, 50, 27, "navy", "navyWall", 0x60e0ff, 14),
  R("t_stealth", "Stealth Hall", 25, 20, 43, 28, "greenFloor", "greenWall", 0xb8ffc8, 12),
  R("t_ability", "Ability Room", 14, 20, 23, 28, "white", "acadWall", 0xffe6c0, 22),
  R("t_maze", "Map Maze", 2, 20, 12, 28, "podFloor", "podWall", 0xffc890, 16),
  R("t_arena", "Exam Arena", 2, 12, 30, 18, "diamond", "greyWall", 0xffb870, 30),
];

const DOORS = [
  { id: "t1", x: 10, z: 6, len: 2, alongX: false, locked: true },
  { id: "t2", x: 35, z: 6, len: 2, alongX: false, locked: true },
  { id: "t3", x: 44, z: 6, len: 2, alongX: false, locked: true },
  { id: "t4", x: 46, z: 13, len: 2, alongX: true, locked: true },
  { id: "t5", x: 57, z: 19, len: 2, alongX: true, locked: true },
  { id: "t6", x: 51, z: 24, len: 2, alongX: false, locked: true },
  { id: "t7", x: 44, z: 24, len: 2, alongX: false, locked: true },
  { id: "t8", x: 24, z: 24, len: 2, alongX: false },
  { id: "t9", x: 13, z: 24, len: 2, alongX: false, locked: true },
  { id: "t10", x: 6, z: 19, len: 2, alongX: true, locked: true },
];
const LOCKED_AT_START = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t9", "t10"];

const WINDOWS: [number, number][] = [];
for (let z = 4; z <= 8; z++) WINDOWS.push([1, z]);
for (let z = 13; z <= 17; z++) WINDOWS.push([1, z]);
for (let x = 48; x <= 62; x += 2) WINDOWS.push([x, 1]);

// key spots
const SPRINT_START = new Vector3(12.3, 0, 7);
const SPRINT_END = new Vector3(33.2, 0, 7);
const DUCT_X0 = 36.7;
const DUCT_X1 = 42.3;
const BREAKER = new Vector3(62.9, 0, 27.9);
const HACK_TERM = new Vector3(47.5, 0, 23.2);
const KEYCARD = new Vector3(2.9, 0, 21.0);
const EXTRACT = new Vector3(28.4, 0, 15.5);
const HALE_START = new Vector3(22.3, 0, 27.8);
const HALE_END = new Vector3(14.8, 0, 27.8);

/** A glowing instruction board on a wall. dir: which way the board faces. */
function sign(lv: Level, x: number, z: number, dir: "n" | "s" | "e" | "w", lines: string[], color = "#7fe8ff"): void {
  const longest = Math.max(...lines.map((l) => l.length));
  const px = Math.min(56, Math.floor(1150 / Math.max(10, longest)));
  const tex = labelTex(lines.join("|"), color, "#04141c", 768, 384, `bold ${px}px 'Share Tech Mono', Consolas, monospace`, lines);
  const g = new Group();
  const frame = rbox(2.7, 1.45, 0.06, M.darkMetal, 0, 0, -0.04, g, 0.02);
  void frame;
  const board = new Mesh(new PlaneGeometry(2.5, 1.25), new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 }));
  g.add(board);
  box(2.5, 0.03, 0.03, M.cyanGlow, 0, -0.66, 0, g);
  g.position.y = 2.2;
  const ry = dir === "s" ? 0 : dir === "n" ? Math.PI : dir === "e" ? Math.PI / 2 : -Math.PI / 2;
  lv.addProp(g, x, z, ry, undefined, true);
}

function pad(lv: Level, p: Vector3, color: number, r = 0.85): void {
  const g = new Group();
  const ring = new Mesh(new RingGeometry(r * 0.72, r, 32), new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const disc = new Mesh(new RingGeometry(0.01, r * 0.7, 32), new MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.025;
  g.add(disc);
  lv.addProp(g, p.x, p.z, 0, undefined, true);
}

function partition(lv: Level, x: number, z: number, w: number, d: number, h = 2.5): void {
  const g = new Group();
  rbox(w, h, d, M.steel, 0, h / 2, 0, g, 0.03);
  rbox(w + 0.04, 0.12, d + 0.04, M.hazard, 0, h - 0.06, 0, g, 0.02);
  rbox(w + 0.04, 0.1, d + 0.04, M.darkMetal, 0, 0.05, 0, g, 0.02);
  lv.addProp(g, x, z, 0, { w, d, h });
}

function crateStack(lv: Level, x: number, z: number, n: number, tan = false, variant = 0, rot = 0): void {
  const g = new Group();
  for (let i = 0; i < n; i++) {
    const c = P.crate(1.1, 1.1, 1.1, tan, variant);
    c.position.y = 0.55 + i * 1.1;
    c.rotation.y = (i % 2) * 0.12;
    g.add(c);
  }
  lv.addProp(g, x, z, rot, { w: 1.1, d: 1.1, h: n * 1.1 });
}

function buildTrainingProps(lv: Level): void {
  // ---- Locker Room ----
  for (let i = 0; i < 8; i++) lv.addProp(P.locker(), 2.6 + i * 0.66, 10.7, Math.PI, { w: 0.6, d: 0.5, h: 2.0 });
  const bench = new Group();
  rbox(2.6, 0.08, 0.45, M.wood, 0, 0.45, 0, bench, 0.02);
  for (const x of [-1.1, 1.1]) rbox(0.08, 0.45, 0.4, M.steel, x, 0.22, 0, bench, 0.02);
  lv.addProp(bench, 5.6, 4.2, 0, { w: 2.6, d: 0.45, h: 0.5, sight: false });
  lv.addProp(P.weaponRack(), 9.8, 3.6, -Math.PI / 2, { w: 1.6, d: 0.35, h: 1.9 });
  sign(lv, 6.2, 2.05, "s", ["WELCOME, RECRUIT", "MOUSE · LOOK", "W A S D · MOVE"]);
  // ---- Movement Course ----
  pad(lv, SPRINT_START, 0x40a8ff, 0.9);
  pad(lv, SPRINT_END, 0x40ff80, 1.0);
  for (let x = 15; x <= 31; x += 4) {
    box(0.6, 0.02, 3.6, M.hazard, x, 0.012, 7, lv.group);
  }
  sign(lv, 13.5, 5.05, "s", ["SPRINT COURSE", "HOLD SHIFT · SPRINT", "BLUE PAD → GREEN PAD"]);
  sign(lv, 31.5, 5.05, "s", ["CROUCH AHEAD", "CTRL / C · CROUCH"], "#ffd070");
  // ---- Crawl Duct: low ducting overhead ----
  const duct = new Group();
  const len = DUCT_X1 - DUCT_X0;
  rbox(len, 1.95, 2.0, M.steel, 0, 2.42, 0, duct, 0.05);
  rbox(len + 0.1, 0.12, 2.04, M.hazard, 0, 1.44, 0, duct, 0.02);
  for (let i = 0; i <= Math.floor(len / 1.2); i++) rbox(0.12, 2.0, 2.06, M.darkMetal, -len / 2 + i * 1.2, 2.42, 0, duct, 0.02);
  lv.addProp(duct, (DUCT_X0 + DUCT_X1) / 2, 7, 0, undefined);
  // ---- Firing Range ----
  const counter = new Group();
  rbox(0.6, 1.0, 10.8, M.darkMetal, 0, 0.5, 0, counter, 0.04);
  rbox(0.7, 0.06, 10.9, M.steel, 0, 1.03, 0, counter, 0.02);
  for (let i = 0; i < 5; i++) box(0.02, 0.5, 0.05, M.cyanGlow, -0.31, 0.6, -4 + i * 2, counter);
  lv.addProp(counter, 49.2, 7.5, 0, { w: 0.6, d: 10.8, h: 1.05, sight: false });
  for (const z of [4.2, 6.4, 8.6, 10.8]) {
    const div = new Group();
    rbox(6, 0.05, 0.08, M.hazard, 0, 0.03, 0, div, 0.01);
    lv.addProp(div, 53, z, 0);
  }
  for (const x of [56, 59.5])
    for (const z of [3.1, 5.3, 7.5, 9.7, 11.9]) {
      const plinth = new Group();
      cyl(0.6, 0.7, 0.12, M.darkMetal, 0, 0.06, 0, plinth, 18);
      cyl(0.62, 0.62, 0.02, M.cyanGlow, 0, 0.125, 0, plinth, 18);
      lv.addProp(plinth, x, z, 0);
    }
  lv.addProp(P.ammoCase(), 47, 2.6, 0.3);
  lv.addProp(P.consoleDesk("#6fe8ff", "range", 1.3), 46.2, 11.8, Math.PI, { w: 1.3, d: 0.8, h: 1.0, sight: false });
  sign(lv, 45.05, 4.2, "e", ["FIRING RANGE", "L-CLICK · FIRE", "R-CLICK · AIM  R · RELOAD"]);
  sign(lv, 63.95, 7.5, "w", ["HIT THE GLOWING EYE", "= CRITICAL HIT ×2"], "#ffd070");
  // ---- Supply Room ----
  for (const x of [49, 53, 60]) {
    const shelf = new Group();
    for (const y of [0.1, 0.9, 1.7]) rbox(2.2, 0.06, 0.6, M.steel, 0, y, 0, shelf, 0.02);
    for (const sx of [-1.05, 1.05]) rbox(0.06, 2.2, 0.6, M.darkMetal, sx, 1.1, 0, shelf, 0.02);
    const m = P.medkit();
    m.position.set(-0.5, 0.93, 0);
    shelf.add(m);
    const a = P.ammoCase();
    a.position.set(0.5, 1.73, 0);
    shelf.add(a);
    lv.addProp(shelf, x, 14.45, 0, { w: 2.2, d: 0.6, h: 2.2 });
  }
  crateStack(lv, 62.9, 17.9, 2, true);
  crateStack(lv, 45.7, 17.9, 1, false, 2);
  sign(lv, 52, 18.95, "n", ["WALK OVER ITEMS", "TO PICK THEM UP", "F · FLASHLIGHT"]);
  sign(lv, 63.95, 16.2, "w", ["ARMOURY", "1 2 3 / WHEEL · WEAPONS", "V · MELEE  G · T · GADGETS"], "#ffd070");
  // a weapons locker by the entrance: sidearms, blades and grenades on show
  const rack = P.weaponRack();
  lv.addProp(rack, 45.4, 16.2, Math.PI / 2, { w: 1.6, d: 0.35, h: 1.9 });
  // ---- Breaker Room (dark) ----
  for (const [x, z, n] of [[54, 22.5, 2], [58, 25, 1], [55.5, 27.4, 2], [61, 21.5, 1], [60.5, 25.6, 2]] as [number, number, number][]) crateStack(lv, x, z, n, n === 1, n === 2 ? 2 : 0);
  for (const [x, z] of [[52.6, 27.9], [62.4, 23.6], [56.2, 21.3]]) lv.addProp(P.barrel(true), x, z, 0, { w: 0.65, d: 0.65, h: 0.9 });
  const breaker = new Group();
  rbox(0.3, 1.2, 0.9, M.gunmetal, 0, 1.4, 0, breaker, 0.03);
  rbox(0.05, 0.9, 0.7, M.hazard, -0.16, 1.4, 0, breaker, 0.01);
  box(0.06, 0.12, 0.3, M.redGlow, -0.2, 1.75, 0, breaker);
  cyl(0.02, 0.02, 1.2, M.cable, 0, 2.6, 0, breaker, 6);
  lv.addProp(breaker, 63.8, 27.9, 0, { w: 0.35, d: 0.9, h: 2.0 });
  // ---- Hacking Station ----
  lv.addProp(P.consoleDesk("#3cff78", "hackterm", 1.4), HACK_TERM.x, 22.45, 0, { w: 1.4, d: 0.8, h: 1.0, sight: false });
  lv.addProp(P.locker(), 50.5, 22.4, -Math.PI / 2, { w: 0.6, d: 0.5, h: 2.0 });
  sign(lv, 47.5, 27.95, "n", ["HACKING", "HOLD E AT A TERMINAL", "WATCH THE PROGRESS BAR"]);
  // ---- Stealth Hall: two walls of crate cover with gaps ----
  for (let x = 27; x <= 41.5; x += 1.15) {
    const gapN = Math.abs(x - 30.5) < 0.6 || Math.abs(x - 36.25) < 0.6;
    const gapS = Math.abs(x - 33.4) < 0.6 || Math.abs(x - 39.2) < 0.6;
    if (!gapN) crateStack(lv, x, 22.3, 2, (Math.round(x * 3) % 2) === 0, (Math.round(x) % 3) === 0 ? 2 : 0);
    if (!gapS) crateStack(lv, x, 26.9, 2, (Math.round(x * 5) % 2) === 0, (Math.round(x) % 4) === 0 ? 2 : 0);
  }
  sign(lv, 43.95, 21.5, "w", ["STEALTH HALL", "CTRL · CROUCH TO HIDE", "STAY OUT OF THE RED CONE"], "#9fffb0");
  // ---- Ability Room ----
  for (const x of [15.2, 18.6, 22]) partition(lv, x, 22.1, 1.7, 0.3, 2.4);
  pad(lv, HALE_START, 0x40a8ff, 0.8);
  pad(lv, HALE_END, 0x40ff80, 0.8);
  sign(lv, 18.6, 28.95, "n", ["SPECIAL ABILITY", "Q · USE YOUR ABILITY", "EVERY HERO IS DIFFERENT"], "#ffd070");
  // ---- Map Maze ----
  partition(lv, 10.5, 23.25, 0.3, 6.5);
  partition(lv, 7.5, 25.75, 0.3, 6.5);
  partition(lv, 4.5, 23.0, 0.3, 6.0);
  sign(lv, 12.95, 21.2, "w", ["TACTICAL MAP", "TAB · OPEN / CLOSE", "FIND THE KEYCARD"]);
  // ---- Exam Arena: cover and the extraction pad ----
  for (const [x, z, n, tan] of [[9, 14, 1, false], [12, 17, 2, true], [16, 13.5, 1, false], [19, 16.5, 1, true], [22.5, 13.2, 2, false], [25, 17.2, 1, false]] as [number, number, number, boolean][]) crateStack(lv, x, z, n, tan, n === 2 ? 2 : 0);
  for (const [x, z] of [[14.2, 17.8], [21, 12.6]]) lv.addProp(P.barrel(), x, z, 0, { w: 0.65, d: 0.65, h: 0.9 });
  pad(lv, EXTRACT, 0x40ff80, 1.3);
  const hz = new Group();
  for (const [w, d, x, z] of [[3.2, 0.2, 0, -1.6], [3.2, 0.2, 0, 1.6], [0.2, 3.2, -1.6, 0], [0.2, 3.2, 1.6, 0]]) box(w, 0.02, d, M.hazard, x, 0.015, z, hz);
  lv.addProp(hz, EXTRACT.x, EXTRACT.z, 0);
  sign(lv, 8, 12.05, "s", ["FINAL EXAM", "DESTROY 3 TRAINING BOTS", "THEN EXTRACT"], "#ffb070");
}

export const TRAINING_MAP: MapDef = { id: "training", rooms: ROOMS, doors: DOORS, windows: WINDOWS, hemi: 0.55, props: buildTrainingProps, fog: [0x8ea4b8, 0.006] };

/** One-line "how it works" for each gadget, used by the Armoury lesson. */
const GADGET_TIP: Record<import("./equipment").GadgetKind, string> = {
  frag: "it bounces, then explodes.",
  emp: "it shuts robots down for 6 seconds.",
  decoy: "it beeps and robots go to check it out, even mid-fight.",
  mine: "it arms after a second and blows up the first robot that comes close.",
  stim: "it heals you over a few seconds, even mid-fight.",
  smoke: "robots can't see into or through the cloud.",
  shock: "it zaps and stuns every robot that comes close.",
  turret: "it shoots the nearest robot for 20 seconds.",
};

// ====================================================================== the lessons
type Step = "look" | "sprint" | "crawl" | "hip" | "ads" | "crit" | "reload" | "supply" | "swap" | "melee" | "gadget" | "gadget2" | "light" | "hack" | "stealth" | "ability" | "map" | "key" | "exam" | "extract" | "done";
const ORDER: Step[] = ["look", "sprint", "crawl", "hip", "ads", "crit", "reload", "supply", "swap", "melee", "gadget", "gadget2", "light", "hack", "stealth", "ability", "map", "key", "exam", "extract"];

/** Lesson groups shown on the objectives panel. */
const LESSONS: { name: string; steps: Step[] }[] = [
  { name: "Look & move", steps: ["look"] },
  { name: "Sprint course", steps: ["sprint"] },
  { name: "Crawl duct", steps: ["crawl"] },
  { name: "Firing range", steps: ["hip", "ads", "crit", "reload"] },
  { name: "Supply run", steps: ["supply"] },
  { name: "Armoury: weapons & gadgets", steps: ["swap", "melee", "gadget", "gadget2"] },
  { name: "Dark room", steps: ["light"] },
  { name: "Hacking", steps: ["hack"] },
  { name: "Stealth hall", steps: ["stealth"] },
  { name: "Special ability", steps: ["ability"] },
  { name: "Tactical map", steps: ["map", "key"] },
  { name: "Final exam", steps: ["exam", "extract"] },
];

const CHECKPOINT: Record<Step, [number, number, number]> = {
  look: [4, 6.5, -Math.PI / 2],
  sprint: [12.3, 7, -Math.PI / 2],
  crawl: [34, 7, -Math.PI / 2],
  hip: [47, 7, -Math.PI / 2],
  ads: [47, 7, -Math.PI / 2],
  crit: [47, 7, -Math.PI / 2],
  reload: [47, 7, -Math.PI / 2],
  supply: [47, 15.5, -Math.PI / 2],
  swap: [47.5, 16, -Math.PI / 2],
  melee: [47.5, 16, -Math.PI / 2],
  gadget: [47.5, 16, -Math.PI / 2],
  gadget2: [47.5, 16, -Math.PI / 2],
  light: [57.5, 17.5, Math.PI],
  hack: [50, 25, Math.PI / 2],
  stealth: [47.8, 25.6, Math.PI / 2],
  ability: [23.2, 24.9, Math.PI / 2],
  map: [12.3, 24.9, Math.PI / 2],
  key: [12.3, 24.9, Math.PI / 2],
  exam: [5, 15, -Math.PI / 2],
  extract: [5, 15, -Math.PI / 2],
  done: [5, 15, -Math.PI / 2],
};

const TARGET_YAW = -Math.PI / 2; // practice targets face the shooting booth (−X)

export class TrainingCourse {
  step: Step = "look";
  private count = 0;
  private need = 0;
  private targets: Robot[] = [];
  private patrol: Robot | null = null;
  private exam: Robot[] = [];
  private supply: { taken: boolean }[] = [];
  private keycard: Group | null = null;
  private startYaw = 0;
  private startPos = new Vector3();
  private runT = -1;
  private armed = false;
  private abilityUsed = false;
  private usesAtStart = 0;
  private breakerOn = false;
  private t = 0;
  /** the Armoury lessons: gadget uses when the lesson began, and the target that walks onto your mine */
  private gadgetStart = 0;
  private walker: Robot | null = null;

  constructor(private readonly g: Game) {}

  // ------------------------------------------------------------------ lifecycle
  start(): void {
    const g = this.g;
    for (const d of g.level.doors) g.level.setDoorLocked(d.id, LOCKED_AT_START.includes(d.id));
    const [x, z, yaw] = CHECKPOINT.look;
    g.player.spawn(x, z, yaw);
    this.startYaw = yaw;
    this.startPos.set(x, 0, z);
    g.stage = 0;
    this.step = "look";
    g.hud.setScore(0);
    setTimeout(() => this.say("start", `Welcome to the <b>STAR-Tech Academy</b>, ${g.player.stats.def.name}. Let's get you mission-ready. <b>Look around with the mouse</b> and <b>walk with W A S D</b>.`), 500);
  }

  dispose(): void {
    this.keycard?.removeFromParent();
    this.keycard = null;
  }

  private say(key: string, text: string): void {
    this.g.radio("tr_" + key, text);
  }

  private get p() {
    return this.g.player;
  }

  private next(): void {
    const i = ORDER.indexOf(this.step);
    this.step = ORDER[i + 1] ?? "done";
    this.count = 0;
    this.need = 0;
    this.runT = -1;
    this.armed = false;
    audio.upgrade();
    const done = LESSONS.filter((l) => l.steps.every((s) => ORDER.indexOf(s) < ORDER.indexOf(this.step))).length;
    this.g.hud.setScore(done);
    this.enter(this.step);
    this.g.hud.setObjectives(this.objectives());
  }

  private unlock(id: string): void {
    this.g.level.setDoorLocked(id, false);
  }

  /** Set up a step as it begins. */
  private enter(s: Step): void {
    const g = this.g;
    const p = this.p;
    switch (s) {
      case "sprint":
        this.unlock("t1");
        this.say("sprint", "Good. Through the door is the <b>Movement Course</b>. Stand on the <b style='color:#40a8ff'>blue pad</b>, then <b>hold SHIFT to sprint</b> to the <b style='color:#40ff80'>green pad</b> before the clock runs out.");
        break;
      case "crawl":
        this.unlock("t2");
        this.say("crawl", "Nice speed! Next, the <b>Crawl Duct</b>. Hold <b>CTRL</b> (or <b>C</b>) to crouch and squeeze underneath. Crouching also keeps you quiet.");
        break;
      case "hip":
        this.unlock("t3");
        this.need = 5;
        this.spawnTargets([[59.5, 3.1], [56, 5.3], [59.5, 7.5], [56, 9.7], [59.5, 11.9]]);
        this.say("hip", "Welcome to the <b>Firing Range</b>. Stay behind the counter and <b>destroy 5 targets</b> with <b>LEFT-CLICK</b>.");
        break;
      case "ads":
        this.need = 5;
        this.spawnTargets([[56, 3.1], [59.5, 5.3], [56, 7.5], [59.5, 9.7], [56, 11.9]]);
        this.say("ads", "Now hold <b>RIGHT-CLICK to aim down your sights</b>. Your shots get far more accurate. Destroy 5 more <b>while aiming</b>.");
        break;
      case "crit":
        this.need = 1;
        this.spawnTargets([[61.8, 7.5]]);
        this.say("crit", "Every robot has a glowing <b>chest eye</b>. Hitting it is a <b style='color:#ffd070'>critical hit</b> for double damage. Finish this target with a shot to the eye.");
        break;
      case "reload":
        p.selectSlot(0, true);
        if (p.mag >= p.stats.mag) p.mag = Math.ceil(p.stats.mag / 2);
        this.say("reload", "Keep an eye on your ammo counter, bottom right. Press <b>R</b> to <b>reload</b> now.");
        break;
      case "supply": {
        this.unlock("t4");
        p.hp = Math.round(p.maxHp * 0.55);
        p.reserve = Math.floor(p.stats.reserve * 0.35);
        const made = g.spawnPickups([["health", 51, 16.4], ["ammo", 57.5, 16.4]]);
        this.supply = made;
        this.say("supply", "We've knocked your suit down to half health for this one. Head into the <b>Supply Room</b> and walk over the <b style='color:#40ff80'>medkit</b> and the <b style='color:#40d8ff'>ammo case</b>.");
        break;
      }
      case "swap": {
        this.need = 2;
        this.spawnTargets([[62.3, 15.2], [61.4, 17.0]]);
        const sec = p.stats.loadout.secondary;
        this.say("swap", `Every hero carries a full kit now. Press <b>2</b> for your sidearm, the <b>${sec.name}</b>, and destroy the <b>2 targets</b> at the end of this room. <b>1 2 3</b> or the <b>mouse wheel</b> switch weapons.`);
        break;
      }
      case "melee": {
        this.need = 1;
        this.spawnTargets([[55.2, 16.3]]);
        const m = p.stats.loadout.melee;
        this.say("melee", `Now your <b>${m.name}</b>. Walk right up to the target and press <b>V</b> to swing (or press <b>3</b> and click). Hit a robot that hasn't noticed you for a <b style='color:#ffd070'>silent takedown</b>.`);
        break;
      }
      case "gadget": {
        this.need = 3;
        p.gadgets[0] = Math.max(p.gadgets[0], p.gadgetMax(0));
        this.gadgetStart = p.gadgetUses[0];
        this.spawnTargets([[60.4, 15.4], [60.4, 17.2], [61.6, 16.3]]);
        const k = p.gadgetKind(0);
        this.say("gadget", `You carry two <b>gadgets</b>. Press <b>G</b> to use your <b>${GADGETS[k].name}</b> on that group: ${GADGET_TIP[k]} Then destroy all three targets.`);
        break;
      }
      case "gadget2": {
        this.need = 1;
        p.gadgets[1] = Math.max(p.gadgets[1], p.gadgetMax(1));
        this.gadgetStart = p.gadgetUses[1];
        const k = p.gadgetKind(1);
        if (k === "stim") {
          p.hp = Math.round(p.maxHp * 0.5);
          this.say("gadget2", "We've dented your suit again. Press <b>T</b> to inject a <b>Medi-Stim</b>: it heals you over a few seconds, even mid-fight.");
        } else if (k === "mine") this.say("gadget2", "Press <b>T</b> to drop a <b>Proximity Mine</b> on the floor. Once it arms, a target drone will fly over it. Let the mine do the work!");
        else this.say("gadget2", `Press <b>T</b> to use your <b>${GADGETS[k].name}</b>: ${GADGET_TIP[k]}`);
        break;
      }
      case "light":
        this.walker = null;
        this.unlock("t5");
        this.say("light", "The <b>Breaker Room</b> has lost power. Press <b>F</b> for your <b>flashlight</b>, find the <b>breaker box</b> in the far corner and hold <b>E</b> to reset it. Careful: robots spot you more easily with your light on.");
        break;
      case "hack":
        this.unlock("t6");
        this.say("hack", "Power's back! In the <b>Hacking Station</b>, stand at the terminal and <b>hold E</b> until the bar fills. Let go and it slowly drains.");
        break;
      case "stealth": {
        this.unlock("t7");
        this.spawnPatrol();
        this.say("stealth", "The <b>Stealth Hall</b> has a patrol bot. Its eye turns <b style='color:#ffc020'>yellow</b> when it's suspicious and <b style='color:#ff2010'>bright red</b> when it spots you. Keep out of its red cone, crouch behind the crates and reach the far door. If it spots you, you'll be sent back here.");
        break;
      }
      case "ability":
        this.patrol?.remove();
        this.g.robots = this.g.robots.filter((r) => r !== this.patrol);
        this.patrol = null;
        this.abilityUsed = false;
        this.usesAtStart = p.abilityUses;
        this.setupAbility();
        break;
      case "map":
        this.unlock("t9");
        this.say("map", "Every hero has a <b>Tactical Map</b>. Press <b>TAB</b> to open it.");
        break;
      case "key":
        this.placeKeycard();
        this.say("key", "The map shows the whole deck: rooms, doors, pickups and your objective marker. A <b>keycard</b> is hidden in the <b>Map Maze</b>. Use the map and your radar to find it. Press TAB again to close the map.");
        break;
      case "exam":
        this.unlock("t10");
        this.say("exam", "Keycard accepted. Time for your <b>Final Exam</b>. Three training bots are waiting in the arena. They fight back, but their shots are set to training strength. Destroy them all!");
        break;
      case "extract":
        this.say("extract", "Outstanding! All targets down. Walk onto the <b style='color:#40ff80'>extraction pad</b> to finish your training.");
        break;
      case "done":
        g.stage = 5;
        g.finishMission();
        break;
      default:
        break;
    }
  }

  private spawnTargets(list: [number, number][]): void {
    for (const [x, z] of list) {
      const r = this.g.addRobot("drone", x, z, [], TARGET_YAW, true);
      r.role = "target";
      paintTraining(r.rig);
      this.targets.push(r);
      this.g.fx.puff(new Vector3(x, 0.6, z), 0x80d8ff, 14, new Vector3(0, 1.2, 0), 1.2, 0.6, 0.3, 0.9, true);
      this.g.fx.sparks(new Vector3(x, 1, z), new Vector3(0, 1, 0), 0x9fe8ff, 8, 3);
    }
  }

  private spawnPatrol(): void {
    const r = this.g.addRobot("drone", 40.5, 24.5, [[40.5, 24.5], [27.5, 24.5]], -Math.PI / 2);
    r.role = "stealth";
    paintTraining(r.rig);
    this.patrol = r;
  }

  private resetPatrol(): void {
    const r = this.patrol;
    if (!r) return;
    r.state = "patrol";
    r.suspicion = 0;
    r.alertT = 0;
    r.seenT = 0;
    r.path = [];
    r.wp = 0;
    r.waitT = 1.5;
    r.pos.set(40.5, 0, 24.5);
    r.yaw = -Math.PI / 2;
  }

  private setupAbility(): void {
    const id = this.p.stats.def.id;
    if (id === "brutus") {
      this.need = 1;
      this.spawnTargets([[18.5, 24.5]]);
      this.say("ab_b", "Brutus, your ability is <b>SHIELD UP</b>. Press <b>Q</b> near the target to raise your riot shield and bash it, then finish it off. The shield also blocks shots from the front.");
    } else if (id === "cloya") {
      this.need = 3;
      this.spawnTargets([[15.2, 21], [18.6, 21], [22, 21]]);
      this.say("ab_c", "Cloya, your ability is <b>SCAN</b>. Three targets are hidden behind the screens. Press <b>Q</b> to see robots through walls, then hunt them down.");
    } else if (id === "dax") {
      this.need = 3;
      this.spawnTargets([[17.4, 23.9], [17.4, 25.3], [18.6, 24.6]]);
      this.say("ab_d", "Dax, your ability is the <b>PULSE GRENADE</b>. Press <b>Q</b> to throw it into that group. It stuns and damages everything nearby. Then finish them off.");
    } else {
      this.need = 1;
      this.say("ab_h", "Hale, your ability is <b>OVERDRIVE</b>: faster running and firing. Stand on the <b style='color:#40a8ff'>blue pad</b>, press <b>Q</b>, then dash to the <b style='color:#40ff80'>green pad</b> while Overdrive is still active.");
    }
  }

  private updateGadget(): void {
    const p = this.p;
    const g = this.g;
    const alive = this.targets.filter((r) => r.alive).length;
    // the Academy hands out spares if you run dry mid-lesson
    if (alive > 0 && p.gadgets[0] <= 0 && p.gadgetUses[0] <= this.gadgetStart) p.gadgets[0] = 1;
    if (alive === 0 && this.count >= this.need) {
      if (p.gadgetUses[0] > this.gadgetStart) this.next();
      else if (!g.said.has("tr_gad_q")) {
        g.said.add("tr_gad_q");
        this.need += 1;
        this.spawnTargets([[61, 16.3]]);
        p.gadgets[0] = Math.max(1, p.gadgets[0]);
        g.hud.hint("Good shooting, but try your gadget! Press <b>G</b>", 4);
      } else if (p.gadgetUses[0] > this.gadgetStart) this.next();
    }
  }

  private updateGadget2(dt: number): void {
    const p = this.p;
    const g = this.g;
    const used = p.gadgetUses[1] > this.gadgetStart;
    if (p.gadgetKind(1) !== "mine") {
      if (!used) {
        if (p.gadgets[1] <= 0) p.gadgets[1] = 1;
        return;
      }
      if (this.runT < 0) this.runT = 0;
      this.runT += dt;
      if (this.runT > (p.gadgetKind(1) === "stim" ? 2 : 3)) this.next();
      return;
    }
    // mine: once one is armed on the floor, a target drone drifts over it
    const mine = p.devices.find((d) => d.kind === "mine" && d.landed && d.armT <= 0);
    if (!mine && !this.walker && p.gadgets[1] <= 0 && !p.devices.some((d) => d.kind === "mine")) p.gadgets[1] = 1;
    if (mine && !this.walker) {
      const from: [number, number] = mine.pos.x < 57 ? [62.2, 16.3] : [50, 16.3];
      this.spawnTargets([from]);
      this.walker = this.targets[this.targets.length - 1];
      g.hud.hint("Mine armed! Here comes a target...", 2.5);
    }
    const w = this.walker;
    if (w && w.alive) {
      const goal = mine ? mine.pos : null;
      if (goal) {
        const dx = goal.x - w.pos.x;
        const dz = goal.z - w.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const step = Math.min(d, dt * 1.6);
          w.pos.x += (dx / d) * step;
          w.pos.z += (dz / d) * step;
          w.yaw = Math.atan2(dx, dz);
        }
      } else if (!p.devices.some((d) => d.kind === "mine")) {
        // the mine went off without it: send it away and try again
        w.remove();
        this.g.robots = this.g.robots.filter((r) => r !== w);
        this.targets = this.targets.filter((r) => r !== w);
        this.walker = null;
      }
    }
    if (this.count >= this.need) {
      if (this.runT < 0) this.runT = 0;
      this.runT += dt;
      if (this.runT > 0.9) this.next();
    }
  }

  private placeKeycard(): void {
    const g = new Group();
    rbox(0.32, 0.02, 0.2, M.white, 0, 0, 0, g, 0.01);
    box(0.3, 0.025, 0.05, M.cyanGlow, 0, 0.002, -0.05, g);
    box(0.06, 0.026, 0.06, M.orangeGlow, 0.1, 0.003, 0.04, g);
    const halo = new Mesh(new RingGeometry(0.3, 0.45, 24), new MeshBasicMaterial({ color: 0x40d8ff, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.8;
    g.add(halo);
    g.position.set(KEYCARD.x, 0.9, KEYCARD.z);
    this.g.scene.add(g);
    this.keycard = g;
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number): void {
    const g = this.g;
    const p = this.p;
    this.t += dt;
    // the crawl duct: you must be crouched to get in, and stay low inside
    if (p.pos.z > 5.5 && p.pos.z < 8.5) {
      const x = p.pos.x;
      if (x > DUCT_X0 && x < DUCT_X1) p.crouch = Math.max(p.crouch, 0.95);
      else if (p.crouch < 0.6 && x > DUCT_X0 - 0.5 && x <= DUCT_X0) {
        p.pos.x = DUCT_X0 - 0.5;
        g.hud.hint("Too low to walk through: hold <b>CTRL</b> to crouch", 2);
      } else if (p.crouch < 0.6 && x >= DUCT_X1 && x < DUCT_X1 + 0.5) {
        p.pos.x = DUCT_X1 + 0.5;
        g.hud.hint("Too low to walk through: hold <b>CTRL</b> to crouch", 2);
      }
    }
    if (this.keycard) {
      this.keycard.rotation.y += dt * 2;
      this.keycard.position.y = 0.9 + Math.sin(this.t * 3) * 0.08;
    }
    switch (this.step) {
      case "look": {
        if (p.pos.distanceTo(this.startPos) > 2.5 && Math.abs(p.yaw - this.startYaw) > 0.8) this.next();
        break;
      }
      case "sprint":
        this.updateSprint(dt);
        break;
      case "crawl":
        if (p.pos.x > DUCT_X1 + 0.3 && p.pos.z > 5 && p.pos.z < 9) this.next();
        break;
      case "reload":
        if (p.reloadT > 0) this.next();
        break;
      case "supply":
        if (this.supply.length && this.supply.every((k) => k.taken)) this.next();
        break;
      case "gadget":
        this.updateGadget();
        break;
      case "gadget2":
        this.updateGadget2(dt);
        break;
      case "light":
        if (!this.breakerOn && !p.flashlight && g.level.roomAt(p.pos.x, p.pos.z)?.id === "t_dark" && !g.said.has("tr_dark")) {
          g.said.add("tr_dark");
          g.hud.hint("It's dark in here! Press <b>F</b> for your flashlight", 4);
        }
        break;
      case "stealth":
        if (p.pos.x < 24.2 && p.pos.z > 19 && p.pos.z < 29) this.next();
        break;
      case "ability":
        this.updateAbility(dt);
        break;
      case "map":
        if (g.hud.tactical) this.next();
        break;
      case "key":
        if (this.keycard && Math.hypot(p.pos.x - KEYCARD.x, p.pos.z - KEYCARD.z) < 1.0) {
          this.keycard.removeFromParent();
          this.keycard = null;
          audio.pickup("ammo");
          g.fx.burst(KEYCARD.clone().setY(0.9), 0x40d8ff, 30, 2.5, 0.5, 0.2);
          g.hud.hint("KEYCARD COLLECTED", 2);
          this.next();
        }
        break;
      case "exam":
        if (this.exam.length && this.exam.every((r) => !r.alive)) this.next();
        break;
      case "extract":
        if (Math.hypot(p.pos.x - EXTRACT.x, p.pos.z - EXTRACT.z) < 1.3) this.next();
        break;
      default:
        break;
    }
  }

  private updateSprint(dt: number): void {
    const p = this.p;
    const g = this.g;
    const onStart = Math.hypot(p.pos.x - SPRINT_START.x, p.pos.z - SPRINT_START.z) < 0.95;
    const limit = SPRINT_END.x - SPRINT_START.x;
    const allowed = limit / (p.stats.def.speed * 1.22) + 0.35;
    if (onStart) {
      this.armed = true;
      this.runT = -1;
      g.hud.prompt("Ready! Hold <b>SHIFT</b> and run for the green pad", 0);
      return;
    }
    if (this.armed && this.runT < 0) this.runT = 0;
    if (this.runT >= 0) {
      this.runT += dt;
      const left = Math.max(0, allowed - this.runT);
      g.hud.prompt(`SPRINT! <b>${left.toFixed(1)}s</b>`, left / allowed);
      if (Math.hypot(p.pos.x - SPRINT_END.x, p.pos.z - SPRINT_END.z) < 1.1) {
        g.hud.prompt(null, 0);
        g.hud.hint(`Made it in ${this.runT.toFixed(2)}s!`, 2.5);
        this.next();
        return;
      }
      if (this.runT > allowed) {
        this.runT = -1;
        this.armed = false;
        g.hud.prompt(null, 0);
        audio.denied();
        g.hud.hint("Too slow! Go back to the <b style='color:#40a8ff'>blue pad</b> and hold <b>SHIFT</b> while you run", 4);
      }
    }
  }

  private updateAbility(dt: number): void {
    const p = this.p;
    const g = this.g;
    if (p.abilityUses > this.usesAtStart) this.abilityUsed = true;
    if (p.stats.def.id === "hale") {
      const onStart = Math.hypot(p.pos.x - HALE_START.x, p.pos.z - HALE_START.z) < 0.85;
      if (onStart) {
        this.armed = true;
        this.runT = -1;
        return;
      }
      if (this.armed && this.runT < 0) {
        if (!p.overdrive) {
          this.armed = false;
          g.hud.hint("Press <b>Q</b> for Overdrive <i>before</i> leaving the blue pad", 3);
          return;
        }
        this.runT = 0;
      }
      if (this.runT >= 0) {
        this.runT += dt;
        if (Math.hypot(p.pos.x - HALE_END.x, p.pos.z - HALE_END.z) < 0.9) {
          if (p.overdrive) this.next();
          else {
            this.runT = -1;
            this.armed = false;
            g.hud.hint("Overdrive ran out! Wait for it to recharge and try again", 3);
          }
        } else if (this.runT > 4 || !p.overdrive) {
          this.runT = -1;
          this.armed = false;
          if (!p.overdrive) g.hud.hint("Overdrive ran out! Wait for it to recharge and try again", 3);
        }
      }
      return;
    }
    const alive = this.targets.filter((r) => r.alive).length;
    if (alive === 0 && this.count >= this.need) {
      if (this.abilityUsed) this.next();
      else if (!g.said.has("tr_ab_q")) {
        g.said.add("tr_ab_q");
        this.need += 1;
        this.spawnTargets([[18.6, 24.6]]);
        g.hud.hint("Nice shooting, but use your ability! Press <b>Q</b>", 4);
      }
    }
  }

  // ------------------------------------------------------------------ events from the game
  onRoom(id: string): void {
    if (id === "t_arena" && (this.step === "exam" || this.step === "key") && !this.exam.length) {
      const list: [Parameters<Game["addRobot"]>[0], number, number][] = [["drone", 20, 14.8], ["sentinel", 25.5, 16.2], ["ripper", 27.2, 13.4]];
      for (const [k, x, z] of list) {
        const r = this.g.addRobot(k, x, z, [], -Math.PI / 2, true);
        r.role = "live";
        paintTraining(r.rig);
        this.exam.push(r);
      }
    }
  }

  onKilled(r: Robot): void {
    const g = this.g;
    const p = this.p;
    g.kills[r.kind]++;
    if (r.role !== "target") return;
    this.targets = this.targets.filter((t) => t !== r);
    const pos = r.pos.clone();
    const respawn = (msg: string): void => {
      g.hud.hint(msg, 3);
      audio.denied();
      setTimeout(() => {
        if (g.course === this) this.spawnTargets([[pos.x, pos.z]]);
      }, 700);
    };
    if (this.step === "ads" && p.ads < 0.5) return respawn("That one didn't count: hold <b>RIGHT-CLICK</b> to aim first!");
    if (this.step === "crit" && !g.lastHitCrit) return respawn("Aim for the glowing <b>chest eye</b>!");
    if (this.step === "swap" && (p.slot !== 1 || p.lastAttack !== "gun")) return respawn(`That one didn't count: press <b>2</b> for your <b>${p.stats.loadout.secondary.name}</b> first!`);
    if (this.step === "melee" && p.lastAttack !== "melee") return respawn("Get up close and press <b>V</b> to hit it with your melee weapon!");
    if (this.step === "gadget2") {
      if (r === this.walker && p.lastAttack === "gadget") {
        this.count++;
        g.hud.floatText(pos.clone().setY(2), "MINE KILL!", 1.2);
        g.hud.setObjectives(this.objectives());
      } else {
        this.walker = null;
        respawn("Let the <b>mine</b> get it! Don't shoot the target.");
        setTimeout(() => {
          if (g.course === this && this.step === "gadget2") this.walker = this.targets[this.targets.length - 1] ?? null;
        }, 800);
      }
      return;
    }
    if (this.step === "hip" || this.step === "ads" || this.step === "crit" || this.step === "ability" || this.step === "swap" || this.step === "melee" || this.step === "gadget") {
      this.count++;
      g.hud.floatText(pos.clone().setY(2), `${Math.min(this.count, this.need)}/${this.need}`, 1);
      g.hud.setObjectives(this.objectives());
      if (this.step !== "ability" && this.step !== "gadget" && this.count >= this.need) setTimeout(() => this.next(), 500);
    }
  }

  onSpotted(r: Robot): void {
    const g = this.g;
    if (r.role === "stealth" && this.step === "stealth") {
      g.spottedCount++;
      audio.denied();
      g.hud.spotted();
      g.hud.hint("<b style='color:#ff4030'>SPOTTED!</b> Back to the start of the Stealth Hall. Crouch and time your moves.", 4);
      const [x, z, yaw] = CHECKPOINT.stealth;
      this.p.pos.set(x, 0, z);
      this.p.yaw = yaw;
      this.resetPatrol();
      return;
    }
    if (r.role === "live") g.spottedCount++;
  }

  onPlayerDown(): void {
    const p = this.p;
    const [x, z, yaw] = CHECKPOINT[this.step];
    p.dead = false;
    p.hp = p.maxHp;
    p.pos.set(x, 0, z);
    p.yaw = yaw;
    p.pitch = 0;
    audio.denied();
    this.g.hud.hint("Training suit reset: back to the start of this room with full health.", 4);
  }

  interaction(): { id: string; pos: Vector3; time: number; label: string } | null {
    const p = this.p;
    const near = (v: Vector3, r: number): boolean => Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < r;
    if (this.step === "light" && !this.breakerOn && near(BREAKER, 2.0)) return { id: "breaker", pos: BREAKER, time: 1.6, label: "reset the breaker" };
    if (this.step === "hack" && near(HACK_TERM, 1.9)) return { id: "hackterm", pos: HACK_TERM, time: 2.6, label: "hack the door" };
    return null;
  }

  onHack(id: string): void {
    const g = this.g;
    if (id === "breaker") {
      this.breakerOn = true;
      g.level.addRoomLight("t_dark", 0xffd8a0, 24);
      g.fx.sparks(BREAKER.clone().setY(1.5), new Vector3(-1, 0.5, 0), 0xffe080, 20, 4);
      this.next();
    } else if (id === "hackterm") {
      this.next();
    }
  }

  // ------------------------------------------------------------------ HUD
  objectives(): { text: string; done: boolean; optional?: boolean; active?: boolean }[] {
    const cur = ORDER.indexOf(this.step);
    const idx = LESSONS.findIndex((l) => l.steps.some((s) => ORDER.indexOf(s) >= cur));
    const out: { text: string; done: boolean; optional?: boolean; active?: boolean }[] = [];
    const doneCount = idx < 0 ? LESSONS.length : idx;
    if (doneCount > 0) out.push({ text: `${doneCount} of ${LESSONS.length} lessons complete`, done: true });
    if (idx >= 0) {
      out.push({ text: `${LESSONS[idx].name}: ${this.detail()}`, done: false, active: true });
      for (const l of LESSONS.slice(idx + 1, idx + 3)) out.push({ text: l.name, done: false });
    }
    return out;
  }

  private detail(): string {
    const n = `${Math.min(this.count, this.need)}/${this.need}`;
    switch (this.step) {
      case "look":
        return "look around and walk";
      case "sprint":
        return "sprint from the blue pad to the green pad";
      case "crawl":
        return "crouch through the duct";
      case "hip":
        return `destroy targets (${n})`;
      case "ads":
        return `destroy targets while aiming (${n})`;
      case "crit":
        return "hit the glowing chest eye";
      case "reload":
        return "press R to reload";
      case "supply":
        return "pick up the medkit and ammo";
      case "swap":
        return `press 2, destroy targets with your sidearm (${n})`;
      case "melee":
        return "press V, melee the target";
      case "gadget":
        return `press G, throw your ${GADGETS[this.p.gadgetKind(0)].name} (${n})`;
      case "gadget2": {
        const k = this.p.gadgetKind(1);
        return k === "mine" ? "press T, drop a mine and let it work" : `press T, use your ${GADGETS[k].name}`;
      }
      case "light":
        return "use your flashlight, reset the breaker";
      case "hack":
        return "hold E at the terminal";
      case "stealth":
        return "reach the far door unseen";
      case "ability":
        return this.p.stats.def.id === "hale" ? "Overdrive dash, pad to pad" : `use Q, destroy targets (${n})`;
      case "map":
        return "press TAB";
      case "key":
        return "find the keycard";
      case "exam":
        return `destroy the training bots (${this.exam.filter((r) => !r.alive).length}/3)`;
      case "extract":
        return "walk onto the extraction pad";
      default:
        return "complete";
    }
  }

  target(): Vector3 | null {
    const p = this.p;
    const nearestAlive = (list: Robot[]): Vector3 | null => {
      let best: Robot | null = null;
      for (const r of list) if (r.alive && (!best || r.pos.distanceTo(p.pos) < best.pos.distanceTo(p.pos))) best = r;
      return best ? best.pos : null;
    };
    switch (this.step) {
      case "look":
        return new Vector3(10.5, 0, 7);
      case "sprint":
        return this.armed || this.runT >= 0 ? SPRINT_END : SPRINT_START;
      case "crawl":
        return new Vector3(44.5, 0, 7);
      case "hip":
      case "ads":
      case "crit":
        return nearestAlive(this.targets);
      case "reload":
        return null;
      case "supply": {
        const left = this.g.pickups.filter((k) => !k.taken && this.supply.includes(k));
        return left.length ? left[0].pos : null;
      }
      case "swap":
      case "melee":
      case "gadget":
        return nearestAlive(this.targets);
      case "gadget2":
        return this.walker && this.walker.alive ? this.walker.pos : null;
      case "light":
        return BREAKER;
      case "hack":
        return HACK_TERM;
      case "stealth":
        return new Vector3(24.5, 0, 25);
      case "ability":
        if (p.stats.def.id === "hale") return this.armed || this.runT >= 0 ? HALE_END : HALE_START;
        return nearestAlive(this.targets) ?? new Vector3(13.5, 0, 25);
      case "map":
        return null;
      case "key":
        return KEYCARD;
      case "exam":
        return nearestAlive(this.exam) ?? new Vector3(16, 0, 15);
      case "extract":
        return EXTRACT;
      default:
        return null;
    }
  }

  result(won: boolean): MissionResult {
    const g = this.g;
    const acc = g.shots > 0 ? g.hits / g.shots : 0;
    const grade = won && acc >= 0.6 && g.spottedCount <= 1 && g.time < 620 ? "ELITE" : won && acc >= 0.35 && g.spottedCount <= 3 ? "SPECIALIST" : "RECRUIT";
    return {
      mission: "training",
      won,
      grade,
      accuracy: acc,
      kills: { ...g.kills },
      combatPoints: 0,
      armory: false,
      bonus: 0,
      total: 0,
      time: g.time,
      spotted: g.spottedCount,
      secured: LESSONS.map((l) => ({ name: l.name, done: l.steps.every((s) => ORDER.indexOf(s) < ORDER.indexOf(this.step)) || this.step === "done" })),
    };
  }
}
