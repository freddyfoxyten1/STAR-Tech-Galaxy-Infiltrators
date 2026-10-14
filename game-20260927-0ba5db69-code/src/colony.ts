/**
 * Mission 2: the Remote Colony ("Helios Colony"), a silent mining outpost under glass domes.
 * Everything map-specific lives here: rooms, doors, windows, furniture, the outdoor world,
 * and the mission's robots, pickups, hazards and radio lines. Game logic is in game.ts.
 */
import { CatmullRomCurve3, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { buildDropship } from "./dropship";
import { buildColonySurface } from "./exteriors";
import { WALL_H, type ColonyCore, type DoorDef, type Level, type MapDef, type Room } from "./level";
import * as P from "./models";
import { M, box, cyl, rbox, sphere, type RobotKind } from "./models";

const ROOMS: Room[] = [
  { id: "c_airlock", name: "Landing Pad Airlock", x0: 61, z0: 13, x1: 64, z1: 17, floor: "diamond", wall: "podWall", light: 0x90ff90, lightI: 7 },
  { id: "c_tunnel", name: "Landing Tunnel", x0: 53, z0: 14, x1: 59, z1: 16, floor: "grate", wall: "domeWall", light: 0xffc890, lightI: 12 },
  { id: "c_commons", name: "Colony Commons", x0: 39, z0: 8, x1: 51, z1: 22, floor: "colFloor", wall: "domeWall", light: 0xffd8a8, lightI: 30 },
  { id: "c_hab", name: "Habitat Dome", x0: 40, z0: 1, x1: 50, z1: 6, floor: "blueFloor", wall: "habWall", light: 0xc8d8ff, lightI: 16 },
  { id: "c_med", name: "Medical Bay", x0: 40, z0: 24, x1: 50, z1: 29, floor: "white", wall: "whiteWall", light: 0xe8f4ff, lightI: 20 },
  { id: "c_green", name: "Hydroponics Dome", x0: 26, z0: 8, x1: 37, z1: 22, floor: "greenFloor", wall: "greenWall", light: 0xd8ffa0, lightI: 26 },
  { id: "c_power", name: "Power Station", x0: 27, z0: 1, x1: 38, z1: 6, floor: "engGrate", wall: "engWall", light: 0xffa040, lightI: 20 },
  { id: "c_ref", name: "Ore Refinery", x0: 13, z0: 9, x1: 24, z1: 21, floor: "diamond", wall: "rustWall", light: 0xff9040, lightI: 24 },
  { id: "c_fact", name: "Robot Factory", x0: 1, z0: 5, x1: 11, z1: 25, floor: "mineFloor", wall: "mineWall", light: 0xff4028, lightI: 28 },
];

const DOORS: DoorDef[] = [
  { id: "c_pad", x: 60, z: 14, len: 3, alongX: false },
  { id: "c_tun", x: 52, z: 14, len: 3, alongX: false },
  { id: "c_green", x: 38, z: 14, len: 3, alongX: false },
  { id: "c_hab", x: 44, z: 7, len: 3, alongX: true },
  { id: "c_med", x: 44, z: 23, len: 3, alongX: true, locked: true },
  { id: "c_pow", x: 31, z: 7, len: 3, alongX: true },
  { id: "c_powhab", x: 39, z: 3, len: 2, alongX: false },
  { id: "c_mine", x: 25, z: 14, len: 3, alongX: false, locked: true },
  { id: "c_fact", x: 12, z: 14, len: 3, alongX: false },
];

const WINDOWS: [number, number][] = [];
for (let x = 54; x <= 58; x++) WINDOWS.push([x, 13], [x, 17]);
WINDOWS.push([65, 14], [65, 15], [65, 16]);
for (const z of [10, 11, 12, 18, 19, 20]) WINDOWS.push([52, z]);
for (let x = 28; x <= 35; x++) if (x !== 31 && x !== 32) WINDOWS.push([x, 23]);
for (const x of [41, 42, 45, 46, 49]) WINDOWS.push([x, 0]);
for (let x = 15; x <= 22; x++) if (x !== 18 && x !== 19) WINDOWS.push([x, 8], [x, 22]);
for (const x of [42, 43, 48, 49]) WINDOWS.push([x, 30]);
for (const x of [29, 30, 36, 37]) WINDOWS.push([x, 0]);

/** Rounded corners on the two big domes. */
function domeCorners(x0: number, z0: number, x1: number, z1: number): [number, number][] {
  return [
    [x0, z0], [x0 + 1, z0], [x0, z0 + 1],
    [x1, z0], [x1 - 1, z0], [x1, z0 + 1],
    [x0, z1], [x0 + 1, z1], [x0, z1 - 1],
    [x1, z1], [x1 - 1, z1], [x1, z1 - 1],
  ];
}

// ------------------------------------------------------------------ furniture
const leafM = new MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8, metalness: 0 });
const leafM2 = new MeshStandardMaterial({ color: 0x7aa844, roughness: 0.8, metalness: 0 });
const soilM = new MeshStandardMaterial({ color: 0x3a2618, roughness: 1, metalness: 0 });
const growM = new MeshBasicMaterial({ color: 0xff70d8 });
const oreM = new MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9, metalness: 0.2, emissive: 0x200800 });

function table(lv: Level, x: number, z: number): void {
  const g = new Group();
  rbox(1.6, 0.07, 1.0, M.white, 0, 0.76, 0, g, 0.02);
  cyl(0.06, 0.1, 0.74, M.steel, 0, 0.37, 0, g, 8);
  for (const [sx, sz] of [[-0.95, 0], [0.95, 0], [0, -0.7], [0, 0.7]]) {
    cyl(0.2, 0.2, 0.05, M.fabricGrey, sx, 0.46, sz, g, 10);
    cyl(0.03, 0.03, 0.44, M.steel, sx, 0.22, sz, g, 5);
  }
  lv.addProp(g, x, z, 0, { w: 1.7, d: 1.1, h: 0.8, sight: false });
}

function crates(lv: Level, x: number, z: number, stack: number, tan = false): void {
  for (let i = 0; i < stack; i++) {
    const c = P.crate(1.2, 1.2, 1.2, tan, (Math.floor(x * 7 + z * 3 + i) % 5) === 0 ? 2 : 0);
    c.position.y = 0.6 + i * 1.2;
    c.rotation.y = i * 0.2 + x;
    const g = new Group();
    g.add(c);
    lv.addProp(g, x, z, 0, i === 0 ? { w: 1.25, d: 1.25, h: stack * 1.2 } : undefined);
  }
}

function planter(lv: Level, x: number, z: number, len: number): void {
  const g = new Group();
  rbox(len, 0.5, 1.0, M.crateGrey, 0, 0.25, 0, g, 0.04);
  box(len - 0.12, 0.06, 0.86, soilM, 0, 0.5, 0, g);
  for (let i = 0; i < Math.round(len * 2.2); i++) {
    const px = -len / 2 + 0.3 + i * 0.45;
    const big = i % 3 === 0;
    const s = sphere(big ? 0.26 : 0.18, i % 2 ? leafM : leafM2, px, 0.72, (i % 2 ? 0.2 : -0.2), g, 8);
    s.scale.y = big ? 1.4 : 1.1;
  }
  // grow light hanging above the bed
  box(len - 0.4, 0.06, 0.16, growM, 0, 2.4, 0, g);
  box(len - 0.3, 0.05, 0.26, M.darkMetal, 0, 2.46, 0, g);
  for (const s of [-1, 1]) cyl(0.012, 0.012, WALL_H - 2.46, M.steel, s * (len / 2 - 0.3), (WALL_H + 2.46) / 2, 0, g, 4);
  lv.addProp(g, x, z, 0, { w: len, d: 1.0, h: 0.6, sight: false });
}

function medBed(lv: Level, x: number, z: number): void {
  const g = new Group();
  rbox(0.9, 0.45, 2.0, M.steel, 0, 0.4, 0, g, 0.04);
  rbox(0.84, 0.12, 1.9, M.white, 0, 0.68, 0, g, 0.05);
  rbox(0.6, 0.1, 0.35, M.white, 0, 0.78, -0.72, g, 0.04);
  cyl(0.02, 0.02, 1.7, M.steel, 0.55, 0.85, -0.9, g, 5);
  rbox(0.3, 0.25, 0.08, M.gunBlack, 0.55, 1.7, -0.9, g, 0.02);
  box(0.22, 0.12, 0.01, M.greenGlow, 0.55, 1.72, -0.855, g);
  lv.addProp(g, x, z, 0, { w: 0.95, d: 2.05, h: 0.8, sight: false });
}

function cryoPod(lv: Level, x: number, z: number, glass: MeshStandardMaterial): void {
  const g = new Group();
  cyl(0.5, 0.55, 0.25, M.darkMetal, 0, 0.12, 0, g, 16);
  cyl(0.5, 0.5, 0.25, M.darkMetal, 0, 2.15, 0, g, 16);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    cyl(0.04, 0.04, 1.9, M.steel, Math.cos(a) * 0.46, 1.15, Math.sin(a) * 0.46, g, 5);
  }
  // a sleeping colonist inside
  const body = new Mesh(new SphereGeometry(0.2, 10, 8), M.fabricBlue);
  body.scale.set(1, 3, 0.8);
  body.position.y = 1.05;
  g.add(body);
  sphere(0.13, M.leather, 0, 1.78, 0, g, 10);
  const pod = new Mesh(new SphereGeometry(0.46, 18, 12), glass);
  pod.scale.set(1, 2.1, 1);
  pod.position.y = 1.15;
  g.add(pod);
  lv.addProp(g, x, z, 0, { w: 1.0, d: 1.0, h: 2.3 }, true);
}

function core(lv: Level, x: number, z: number): ColonyCore {
  const g = new Group();
  cyl(0.85, 1.0, 0.5, M.darkMetal, 0, 0.25, 0, g, 16);
  cyl(0.32, 0.4, 3.0, M.gunmetal, 0, 1.5, 0, g, 10);
  for (const y of [0.6, 2.85]) cyl(0.7, 0.7, 0.14, M.darkMetal, 0, y, 0, g, 16);
  const glow = new MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2.6, roughness: 0.3 });
  sphere(0.5, glow, 0, 1.7, 0, g, 18);
  const spin: Group[] = [];
  for (const [r, tilt] of [[0.78, 0.4], [0.9, -0.7]] as const) {
    const s = new Group();
    s.position.y = 1.7;
    s.rotation.x = tilt;
    s.add(new Mesh(new TorusGeometry(r, 0.05, 8, 28), M.chrome));
    g.add(s);
    spin.push(s);
  }
  // alien cabling feeding the core from the ceiling
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const pts = [new Vector3(Math.cos(a) * 0.3, 2.9, Math.sin(a) * 0.3), new Vector3(Math.cos(a) * 0.9, 3.2, Math.sin(a) * 0.9), new Vector3(Math.cos(a) * 1.6, WALL_H - 0.02, Math.sin(a) * 1.6)];
    g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 10, 0.05, 5, false), M.alienCable));
  }
  lv.addProp(g, x, z, 0, { w: 1.7, d: 1.7, h: 3.2 }, true);
  return { pos: new Vector3(x, 1.7, z), hp: 1, max: 1, glow, spin, root: g };
}

/** A half-built robot on an assembly frame (inert). */
function assembly(lv: Level, x: number, z: number, kind: RobotKind, rot: number): void {
  const g = new Group();
  for (const s of [-1, 1]) box(0.14, 3.2, 0.14, M.darkMetal, s * 1.1, 1.6, 0, g);
  box(2.4, 0.2, 0.3, M.darkMetal, 0, 3.2, 0, g);
  box(2.4, 0.08, 1.8, M.hazard, 0, 0.04, 0, g);
  const bot = P.buildRobot(kind);
  bot.eyeMat.emissiveIntensity = 0.1;
  bot.root.scale.setScalar(Math.min(1, 2.6 / bot.height));
  g.add(bot.root);
  lv.addProp(g, x, z, rot, { w: 2.4, d: 1.8, h: 3.2 });
}

function buildColonyProps(lv: Level): void {
  const podGlass = new MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x2a8cc0, emissiveIntensity: 0.9, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2, depthWrite: false });
  // ---- airlock
  const strip = new Group();
  box(0.4, 0.05, 3, M.hazard, 0, 0.03, 0, strip);
  lv.addProp(strip, 61.3, 15.5);
  for (const x of [62.2, 63.1]) lv.addProp(P.locker(), x, 13.35, 0, { w: 0.6, d: 0.5, h: 2.0 });
  const bench = new Group();
  rbox(2.0, 0.1, 0.5, M.steel, 0, 0.45, 0, bench, 0.02);
  for (const s of [-1, 1]) box(0.08, 0.45, 0.4, M.darkMetal, s * 0.9, 0.22, 0, bench);
  lv.addProp(bench, 63, 17.65, 0, { w: 2.0, d: 0.5, h: 0.5, sight: false });
  // ---- landing tunnel
  const tp = new Group();
  for (let i = 0; i < 3; i++) {
    const p = P.pipeRun(7);
    p.position.set(3.5, WALL_H - 0.25, -1 + i * 1);
    tp.add(p);
  }
  lv.addProp(tp, 53, 15.5);
  lv.addProp(P.barrel(true), 58.6, 16.5, 0, { w: 0.65, d: 0.65, h: 0.9 });
  // ---- commons: the colony's heart (tables, canteen, a tree in the middle, the colonists' barricade)
  const tree = new Group();
  cyl(1.15, 1.2, 0.6, M.crateGrey, 0, 0.3, 0, tree, 20);
  cyl(1.05, 1.05, 0.05, soilM, 0, 0.6, 0, tree, 20);
  cyl(0.14, 0.22, 2.4, M.wood, 0, 1.8, 0, tree, 8);
  for (const [px, py, pz, r] of [[0, 3.1, 0, 0.9], [0.6, 2.7, 0.2, 0.6], [-0.5, 2.8, -0.3, 0.65], [0.1, 2.6, 0.6, 0.55]]) sphere(r, leafM, px, py, pz, tree, 12);
  lv.addProp(tree, 45.5, 15.5, 0, { w: 2.4, d: 2.4, h: 0.7, sight: false });
  for (const [x, z] of [[42, 11], [49, 11], [42, 20], [49, 20]]) table(lv, x, z);
  for (const x of [41.8, 48.9]) {
    const c = new Group();
    rbox(2.1, 1.0, 0.8, M.white, 0, 0.5, 0, c, 0.03);
    box(2.1, 0.05, 0.85, M.steel, 0, 1.02, 0, c);
    box(1.8, 0.4, 0.05, M.orangeGlow, 0, 1.6, -0.2, c);
    lv.addProp(c, x, 8.75, 0, { w: 2.1, d: 0.8, h: 1.05, sight: false });
  }
  crates(lv, 50.3, 12.4, 2);
  crates(lv, 50.3, 18.6, 1, true);
  lv.addProp(P.barrel(), 49.9, 17.5, 0, { w: 0.65, d: 0.65, h: 0.9 });
  lv.addProp(P.consoleDesk("#ffb040", "colc1", 1.2), 39.8, 11.5, Math.PI / 2, { w: 1.2, d: 0.8, h: 1.0, sight: false });
  // the med bay door terminal
  lv.addProp(P.consoleDesk("#5ae0ff", "colmed", 0.9), 42.6, 22.4, Math.PI, { w: 0.9, d: 0.7, h: 1.0, sight: false });
  // ---- habitat: bunks, lockers, a table
  for (const x of [42.2, 44.2, 48.8, 50.4]) lv.addProp(P.bunkBed(x > 46), x, 2.1, 0, { w: 1.0, d: 2.05, h: 1.9 });
  for (const x of [41, 41.7, 49.1, 49.8]) lv.addProp(P.locker(), x, 6.6, Math.PI, { w: 0.6, d: 0.5, h: 2.0 });
  table(lv, 46.6, 4.4);
  for (const [x, z] of [[43.2, 4.6], [49.6, 4.3]]) {
    const b = new Group();
    box(0.5, 0.25, 0.35, M.crateTan, 0, 0.13, 0, b).rotation.y = x;
    box(0.2, 0.3, 0.2, M.fabricBlue, 0.35, 0.15, 0.1, b);
    lv.addProp(b, x, z);
  }
  // ---- medical bay: beds, cryo pods with sleeping survivors
  for (const [x, z] of [[41.2, 26.2], [49.8, 26.2]]) medBed(lv, x, z);
  for (const x of [43.4, 44.8, 46.2, 47.6]) cryoPod(lv, x, 29.35, podGlass);
  lv.addProp(P.consoleDesk("#5ae0ff", "colmed2", 1.2), 45.5, 26.2, 0, { w: 1.2, d: 0.8, h: 1.0, sight: false });
  for (const x of [41, 50]) lv.addProp(P.locker(), x, 29.4, 0, { w: 0.6, d: 0.5, h: 2.0 });
  // ---- hydroponics: planter beds under pink grow lights
  for (const [x, z] of [[28.8, 10.2], [35.2, 10.2], [28.8, 12.2], [35.2, 12.2], [28.8, 18.8], [35.2, 18.8], [28.8, 20.8], [35.2, 20.8]]) planter(lv, x, z, 3.2);
  const irr = new Group();
  for (let i = 0; i < 2; i++) {
    const p = P.pipeRun(11);
    p.position.set(5.5, 0.35 + i * 0.2, 0);
    irr.add(p);
  }
  lv.addProp(irr, 26.5, 22.75);
  // ---- power station: the generator, its console, pipes and barrels
  const rc = P.reactorCore();
  const genGlow = new MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 1.6, roughness: 0.3 });
  rc.core.material = genGlow;
  const gen = new Vector3(33.5, 0, 3.4);
  lv.reactorPos.copy(gen);
  lv.addProp(rc.root, gen.x, gen.z, 0, { w: 3.0, d: 3.0, h: 3.4 }, true);
  lv.animated.push({
    update: (t) => {
      const k = lv.colony && lv.colony.genGlow.color.getHex() !== 0xff3020 ? 1 : 0.15;
      rc.rings.forEach((r, i) => {
        r.rotation.x = t * (0.8 + i * 0.4) * k;
        r.rotation.y = t * (0.5 + i * 0.3) * k;
      });
      rc.core.scale.setScalar(1 + Math.sin(t * 5) * 0.05 * k);
    },
  });
  lv.addProp(P.consoleDesk("#ffb040", "colpow", 1.4), 28.2, 3.5, Math.PI / 2, { w: 1.4, d: 0.8, h: 1.0, sight: false });
  for (const [x, z] of [[27.6, 5.9], [38.3, 1.6]]) lv.addProp(P.barrel(x > 30), x, z, 0, { w: 0.65, d: 0.65, h: 0.9 });
  const pp = new Group();
  for (let i = 0; i < 4; i++) {
    const p = P.pipeRun(WALL_H, true);
    p.position.set(0, WALL_H / 2, i * 0.3);
    pp.add(p);
  }
  lv.addProp(pp, 38.6, 5.2);
  // ---- ore refinery: conveyor, crusher, silos, cover
  const conv = new Group();
  rbox(9.6, 0.9, 1.3, M.darkMetal, 0, 0.45, 0, conv, 0.04);
  box(9.6, 0.05, 1.0, M.gunBlack, 0, 0.92, 0, conv);
  for (let i = 0; i < 16; i++) {
    const s = sphere(0.18 + (i % 3) * 0.08, oreM, -4.4 + i * 0.58, 1.05, (i % 2 ? 0.2 : -0.15), conv, 7);
    s.scale.y = 0.7;
  }
  box(9.8, 0.1, 0.1, M.hazard, 0, 0.92, 0.66, conv);
  lv.addProp(conv, 18.6, 10.3, 0, { w: 9.6, d: 1.3, h: 1.1, sight: false });
  const crusher = new Group();
  rbox(3.0, 2.8, 2.4, M.oliveDark, 0, 1.4, 0, crusher, 0.08);
  box(3.05, 0.25, 2.45, M.hazard, 0, 2.2, 0, crusher);
  box(1.2, 0.6, 0.1, M.orangeGlow, 0, 1.2, 1.22, crusher);
  lv.addProp(crusher, 15.2, 19.8, 0, { w: 3.0, d: 2.4, h: 2.8 });
  for (const [x, z] of [[23.4, 20.2], [21.1, 20.4]]) {
    const s = new Group();
    cyl(0.95, 0.95, 3.1, M.crateGrey, 0, 1.55, 0, s, 18);
    cyl(1.0, 1.0, 0.15, M.darkMetal, 0, 0.8, 0, s, 18);
    cyl(1.0, 1.0, 0.15, M.darkMetal, 0, 2.4, 0, s, 18);
    lv.addProp(s, x, z, 0, { w: 1.9, d: 1.9, h: 3.1 });
  }
  crates(lv, 19.8, 12.6, 1);
  crates(lv, 17.2, 18.2, 1, true);
  for (let i = 0; i < 7; i++) {
    const s = sphere(0.3 + (i % 3) * 0.2, oreM, 13.9 + (i % 3) * 0.5, 0.2, 12.6 + Math.floor(i / 3) * 0.55);
    s.scale.y = 0.6;
    lv.addProp(s, s.position.x, s.position.z);
  }
  // ---- robot factory: three power cores, assembly frames with half-built robots, cover
  const cores = [core(lv, 3.2, 9.5), core(lv, 2.4, 15.5), core(lv, 3.2, 21.5)];
  assembly(lv, 6.8, 11.6, "ripper", Math.PI / 2);
  assembly(lv, 6.8, 19.4, "bulwark", Math.PI / 2);
  crates(lv, 9.2, 9.8, 1);
  crates(lv, 9.2, 21.2, 2, true);
  for (const [x, z] of [[1.8, 6.2], [1.8, 24.6], [10.6, 24.8]]) lv.addProp(P.barrel(true), x, z, 0, { w: 0.65, d: 0.65, h: 0.9 });
  lv.airlockPos.set(63, 0, 15.5);
  lv.colony = {
    generatorPos: gen,
    powerConsolePos: new Vector3(29.1, 0, 3.5),
    medTerminalPos: new Vector3(43.2, 0, 22.0),
    factoryPos: new Vector3(10.5, 0, 15.5),
    genGlow,
    cores,
    bays: [new Vector3(9.8, 0, 6.4), new Vector3(9.8, 0, 24.6)],
    podGlass,
  };
}

// ------------------------------------------------------------------ outdoors: desert, domes, parked dropship
function buildColonySky(lv: Level): void {
  const world = buildColonySurface({
    centre: new Vector3(33, 0, 15),
    groundY: -0.04,
    radius: 300,
    skyR: 280,
    exclude: { minX: -4, maxX: 80, minZ: -4, maxZ: 35 },
    domes: [[-30, -22, 14], [105, 40, 18], [74, -38, 12], [20, 70, 16], [-42, 52, 10], [40, -60, 20]],
    derrick: [-26, 16],
    tower: [88, -8],
    solar: [[60, 40], [-20, -12]],
  });
  lv.group.add(world.root);
  lv.animated.push(world);
  // glass domes over the two big halls
  const glass = new MeshStandardMaterial({ color: 0xffe2c8, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.5, depthWrite: false, side: DoubleSide });
  for (const id of lv.def.domes ?? []) {
    const r = lv.rooms.find((x) => x.id === id)!;
    const cx = (r.x0 + r.x1 + 1) / 2;
    const cz = (r.z0 + r.z1 + 1) / 2;
    // footprint: a rounded square reaching the middle of the surrounding walls, so the glass
    // sits on the roof all the way round and covers the whole hall
    const a = (r.x1 - r.x0 + 1) / 2 + 0.5;
    const b = (r.z1 - r.z0 + 1) / 2 + 0.5;
    const h = 4.4;
    const y = WALL_H + 0.02;
    const sq = (ang: number): [number, number] => {
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const k = Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(sn), 4), -0.25);
      return [c * k, sn * k];
    };
    const geo = new SphereGeometry(1, 48, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const rho = Math.hypot(vx, vz);
      if (rho < 1e-6) continue;
      const [ux, uz] = sq(Math.atan2(vz, vx));
      pos.setX(i, ux * rho);
      pos.setZ(i, uz * rho);
    }
    geo.computeVertexNormals();
    const dome = new Mesh(geo, glass);
    dome.scale.set(a, h, b);
    dome.position.set(cx, y, cz);
    dome.renderOrder = 2;
    lv.group.add(dome);
    // frame: meridian ribs and rings following the same footprint
    const at = (ang: number, el: number): Vector3 => {
      const [ux, uz] = sq(ang);
      return new Vector3(cx + ux * Math.cos(el) * a, y + Math.sin(el) * h, cz + uz * Math.cos(el) * b);
    };
    const rib = (pts: Vector3[], rad: number, closed = false): void => {
      lv.group.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, closed), closed ? 96 : 24, rad, 5, closed), M.darkMetal));
    };
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + Math.PI / 12;
      const pts: Vector3[] = [];
      for (let i = 0; i <= 8; i++) pts.push(at(ang, (i / 8) * (Math.PI / 2)));
      rib(pts, 0.05);
    }
    for (const el of [0.0, 0.55, 1.05]) {
      const pts: Vector3[] = [];
      for (let i = 0; i < 48; i++) pts.push(at((i / 48) * Math.PI * 2, el));
      rib(pts, el < 0.1 ? 0.14 : 0.045, true);
    }
  }
  // our dropship, parked on the pad outside the airlock with its ramp down
  const ship = buildDropship().root;
  ship.position.set(71, 0, 15.5);
  ship.rotation.y = Math.PI / 2;
  lv.group.add(ship);
  box(14, 0.08, 10, M.darkMetal, 71, 0.0, 15.5, lv.group);
  for (const s of [-1, 1]) box(14, 0.09, 0.3, M.hazard, 71, 0.01, 15.5 + s * 4.8, lv.group);
}

export const COLONY_MAP: MapDef = {
  id: "colony",
  rooms: ROOMS,
  doors: DOORS,
  windows: WINDOWS,
  solid: [...domeCorners(39, 8, 51, 22), ...domeCorners(26, 8, 37, 22)],
  hemi: 0.75,
  fog: [0x5a3a26, 0.012],
  flicker: ["c_tunnel", "c_commons", "c_hab", "c_green", "c_ref", "c_med"],
  domes: ["c_commons", "c_green"],
  roof: true,
  props: buildColonyProps,
  sky: buildColonySky,
};

// ------------------------------------------------------------------ the mission's actors
const W = -Math.PI / 2;
const E = Math.PI / 2;
const N = Math.PI;
export const COLONY_ROBOTS: [RobotKind, number, number, [number, number][], number, boolean][] = [
  // landing tunnel
  ["drone", 57.5, 15.5, [[57.5, 15.5], [54, 15.5]], W, false],
  // commons
  ["drone", 41, 13.2, [[41, 13.2], [48.4, 13.2], [48.4, 17.8], [41, 17.8]], E, false],
  ["drone", 44, 9.8, [[44, 9.8], [47, 9.8], [47, 21.3], [44, 21.3]], 0, false],
  ["sentinel", 47.5, 12.5, [], 0, true],
  // habitat
  ["ripper", 46.5, 2.6, [], 0, true],
  ["drone", 41, 5.4, [[41, 5.4], [50, 5.4]], E, false],
  // hydroponics
  ["drone", 36, 15.5, [[36, 15.5], [27.5, 15.5]], W, false],
  ["drone", 32.2, 9.2, [[32.2, 9.2], [32.2, 21.5]], 0, false],
  ["sentinel", 29.5, 16.6, [], E, true],
  // power station
  ["sentinel", 30.5, 5.6, [], E, true],
  ["drone", 29, 1.7, [[29, 1.7], [37.6, 1.7]], E, false],
  // ore refinery
  ["bulwark", 22, 13, [[22, 13], [22, 17.6], [14.5, 17.6], [14.5, 13]], W, false],
  ["ripper", 16.2, 12.6, [], E, true],
  ["drone", 23.5, 17.4, [[23.5, 17.4], [14, 16.6]], W, false],
  // robot factory
  ["bulwark", 5.6, 12.4, [], E, true],
  ["bulwark", 5.6, 18.6, [], E, true],
  ["ripper", 9.2, 15.5, [], E, true],
];

export const COLONY_PICKUPS: ["health" | "ammo", number, number][] = [
  ["ammo", 62, 16.9],
  ["health", 64.2, 13.6],
  ["ammo", 56, 14.4],
  ["health", 40.4, 20.4],
  ["ammo", 50.7, 10.2],
  ["health", 50.9, 20.2],
  ["ammo", 43.6, 13.4],
  ["health", 40.8, 3.6],
  ["ammo", 50.4, 6.2],
  ["health", 43, 25],
  ["health", 48, 25],
  ["ammo", 26.8, 13.2],
  ["health", 37.2, 19.6],
  ["ammo", 31.6, 22.3],
  ["health", 27.6, 1.6],
  ["ammo", 38.2, 6.4],
  ["ammo", 13.7, 16.2],
  ["health", 24.2, 11.6],
  ["ammo", 24.3, 17.6],
  ["health", 10.8, 6],
  ["ammo", 10.9, 23.2],
  ["ammo", 1.8, 12.4],
  ["health", 1.8, 18.6],
];

export const COLONY_HAZARDS: ["arc" | "flame" | "steam", number, number, number][] = [
  ["arc", 36.6, 2.1, 0],
  ["arc", 36.6, 5.5, 2.1],
  ["steam", 29.2, 1.7, 0.6],
  ["flame", 21.5, 13.6, 0],
  ["flame", 18.5, 17, 1.7],
  ["flame", 15.8, 13.6, 3.4],
];

/** Maintenance hatches reinforcements crawl out of. */
export const COLONY_VENTS: [number, number][] = [[57, 15.5], [45.5, 9.6], [45.5, 21.4], [32.2, 9], [32.2, 21.6], [19, 15.5], [45, 4]];

/** Everything left in the colony comes for you once the factory dies. */
export const COLONY_EXTRACT: [RobotKind, number, number][] = [
  ["ripper", 45.5, 12], ["drone", 56, 15.5], ["bulwark", 45.5, 19], ["ripper", 32.2, 15.5], ["drone", 19, 15.5], ["sentinel", 29, 12.6], ["drone", 41, 16],
];
