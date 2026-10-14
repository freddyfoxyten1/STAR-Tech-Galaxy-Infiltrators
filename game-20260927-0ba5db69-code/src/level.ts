import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  TorusGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import * as P from "./models";
import { M, box, cyl } from "./models";
import { bumpOf, cleanPanelTex, cloudTex, diamondPlateTex, grateTex, hologramTex, panelTex, planetTex, spaceTex, woodTex, wornMetalTex } from "./textures";
import { Dresser } from "./dressing";
import { buildDropship } from "./dropship";
import { compact } from "./models";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const WALL_H = 3.4;
export const GW = 67;
export const GH = 31;

const WALL = 0;
const FLOOR = 1;
const DOOR = 2;
const WINDOW = 3;

export interface Room {
  id: string;
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floor: string;
  wall: string;
  light: number;
  lightI: number;
}

export interface Door {
  id: string;
  cells: [number, number][];
  alongX: boolean; // door spans along X (wall line runs along X)
  locked: boolean;
  open: number;
  cx: number;
  cz: number;
  panels: Mesh[];
  lamp: MeshBasicMaterial;
  width: number;
}

export interface PropBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
  sight: boolean;
}

export interface RayHit {
  t: number;
  point: Vector3;
  normal: Vector3;
}

const ROOMS: Room[] = [
  { id: "bridge", name: "Bridge", x0: 1, z0: 9, x1: 9, z1: 21, floor: "navy", wall: "navyWall", light: 0x4aa8ff, lightI: 26 },
  { id: "life", name: "Life Support", x0: 11, z0: 8, x1: 19, z1: 12, floor: "white", wall: "whiteWall", light: 0xe8f4ff, lightI: 22 },
  { id: "fcorr", name: "Forward Corridor", x0: 11, z0: 14, x1: 19, z1: 16, floor: "grate", wall: "greyWall", light: 0x9fc6ff, lightI: 12 },
  { id: "armory", name: "Armory", x0: 11, z0: 18, x1: 19, z1: 22, floor: "redFloor", wall: "redWall", light: 0xff5a44, lightI: 20 },
  { id: "conf", name: "Conference Room", x0: 21, z0: 7, x1: 30, z1: 23, floor: "wood", wall: "brownWall", light: 0xffc890, lightI: 30 },
  { id: "bunk2", name: "Bunk Two", x0: 32, z0: 7, x1: 38, z1: 11, floor: "greenFloor", wall: "greenWall", light: 0xb8ffc8, lightI: 10 },
  { id: "bunk4", name: "Bunk Four", x0: 40, z0: 7, x1: 46, z1: 11, floor: "blueFloor", wall: "blueWall", light: 0xb8d0ff, lightI: 10 },
  { id: "lcorr", name: "Living Quarters Corridor", x0: 32, z0: 13, x1: 46, z1: 16, floor: "grate", wall: "greyWall", light: 0xa0b8d0, lightI: 14 },
  { id: "bunk1", name: "Bunk One", x0: 32, z0: 18, x1: 38, z1: 23, floor: "greenFloor", wall: "greenWall", light: 0xb8ffc8, lightI: 10 },
  { id: "bunk3", name: "Bunk Three", x0: 40, z0: 18, x1: 46, z1: 23, floor: "blueFloor", wall: "blueWall", light: 0xb8d0ff, lightI: 10 },
  { id: "cargo", name: "Cargo Hull", x0: 48, z0: 7, x1: 56, z1: 23, floor: "diamond", wall: "rustWall", light: 0xffb060, lightI: 30 },
  { id: "eng", name: "Engineering", x0: 58, z0: 9, x1: 64, z1: 21, floor: "engGrate", wall: "engWall", light: 0x60e0ff, lightI: 24 },
  { id: "fuel2", name: "Fuel Tank Two", x0: 42, z0: 1, x1: 52, z1: 4, floor: "podFloor", wall: "podWall", light: 0xff9a50, lightI: 14 },
  { id: "fuel1", name: "Fuel Tank One", x0: 42, z0: 26, x1: 52, z1: 29, floor: "podFloor", wall: "podWall", light: 0xff9a50, lightI: 14 },
  { id: "c2", name: "Fuel Access", x0: 49, z0: 5, x1: 50, z1: 5, floor: "podFloor", wall: "podWall", light: 0, lightI: 0 },
  { id: "c1", name: "Fuel Access", x0: 49, z0: 25, x1: 50, z1: 25, floor: "podFloor", wall: "podWall", light: 0, lightI: 0 },
  { id: "airlock", name: "Airlock", x0: 54, z0: 25, x1: 55, z1: 26, floor: "diamond", wall: "podWall", light: 0x90ff90, lightI: 5 },
];

export interface DoorDef {
  id: string;
  x: number;
  z: number;
  len: number;
  alongX: boolean;
  locked?: boolean;
}

const DOORS: DoorDef[] = [
  { id: "bridge", x: 10, z: 14, len: 3, alongX: false },
  { id: "life-bridge", x: 10, z: 10, len: 2, alongX: false },
  { id: "life-corr", x: 14, z: 13, len: 2, alongX: true },
  { id: "armory", x: 14, z: 17, len: 2, alongX: true, locked: true },
  { id: "life-conf", x: 20, z: 10, len: 2, alongX: false },
  { id: "corr-conf", x: 20, z: 14, len: 3, alongX: false },
  { id: "conf-lcorr", x: 31, z: 14, len: 2, alongX: false },
  { id: "conf-bunk2", x: 31, z: 9, len: 2, alongX: false },
  { id: "conf-bunk1", x: 31, z: 20, len: 2, alongX: false },
  { id: "bunk2", x: 35, z: 12, len: 2, alongX: true },
  { id: "bunk4", x: 43, z: 12, len: 2, alongX: true },
  { id: "bunk1", x: 35, z: 17, len: 2, alongX: true },
  { id: "bunk3", x: 43, z: 17, len: 2, alongX: true },
  { id: "blast", x: 47, z: 14, len: 2, alongX: false, locked: true },
  { id: "eng", x: 57, z: 14, len: 3, alongX: false },
  { id: "fuel2", x: 49, z: 6, len: 2, alongX: true },
  { id: "fuel1", x: 49, z: 24, len: 2, alongX: true },
  { id: "airlock", x: 54, z: 24, len: 2, alongX: true },
];

const WINDOWS: [number, number][] = [];
for (let z = 11; z <= 19; z++) WINDOWS.push([0, z]);
WINDOWS.push([54, 27], [55, 27]);
for (const x of [23, 24, 27, 28]) WINDOWS.push([x, 6], [x, 24]);
// (the Cargo Hull's north wall backs onto solid structure, so it has no windows)

/** Everything that makes one map: rooms, doors, windows, furniture. */
export interface MapDef {
  id: string;
  rooms: Room[];
  doors: DoorDef[];
  windows: [number, number][];
  /** extra cells forced back to solid wall (rounded corners etc.) */
  solid?: [number, number][];
  /** sky-light strength (lower = moodier rooms) */
  hemi?: number;
  /** furniture builder; the freighter uses its own */
  props?: (lv: Level) => void;
  /** park the dropship outside the airlock */
  dock?: boolean;
  /** haze: [colour, density] */
  fog?: [number, number];
  /** rooms whose lights stutter */
  flicker?: string[];
  /** rooms with a glass dome instead of a flat ceiling */
  domes?: string[];
  /** cap the whole building with an outside roof (maps whose domes let you see over the walls) */
  roof?: boolean;
  /** replaces the default space sky (landscape, sky dome, parked dropship...) */
  sky?: (lv: Level) => void;
}

/** Remote Colony objective pieces (set by the colony's prop builder). */
export interface ColonyCore {
  pos: Vector3;
  hp: number;
  max: number;
  glow: MeshStandardMaterial;
  spin: Object3D[];
  root: Object3D;
}
export interface ColonyBits {
  generatorPos: Vector3;
  powerConsolePos: Vector3;
  medTerminalPos: Vector3;
  factoryPos: Vector3;
  genGlow: MeshStandardMaterial;
  cores: ColonyCore[];
  bays: Vector3[];
  /** survivors' cryo pod glass (turns green when rescued) */
  podGlass: MeshStandardMaterial;
}

export const FREIGHTER: MapDef = {
  id: "freighter",
  rooms: ROOMS,
  doors: DOORS,
  windows: WINDOWS,
  solid: [[1, 9], [1, 10], [2, 9], [1, 20], [1, 21], [2, 21], [64, 9], [64, 10], [63, 9], [64, 21], [64, 20], [63, 21]],
  dock: true,
  fog: [0x07090d, 0.03],
  flicker: ["lcorr", "cargo", "bunk3", "fuel1"],
};

/** Worn, riveted ship plating for the freighter's walls. */
const WORN_WALLS: Record<string, [string, number]> = {
  navyWall: ["#26354f", 2],
  domeWall: ["#8a7862", 7],
  habWall: ["#5e6c78", 5],
  mineWall: ["#4b3b2e", 16],
  whiteWall: ["#aeb4b9", 4],
  greyWall: ["#5a6168", 6],
  redWall: ["#582628", 4],
  brownWall: ["#5b4838", 3],
  greenWall: ["#3d5543", 5],
  blueWall: ["#374766", 4],
  rustWall: ["#665644", 14],
  engWall: ["#33373c", 7],
  podWall: ["#565c63", 9],
};
/** Clean pale station panels for the Academy. */
const CLEAN_WALLS: Record<string, [string, string, string?]> = {
  acadWall: ["#d4dce4", "#8c98a4", "#39c6ff"],
  greyWall: ["#b4bdc6", "#76818c", "#ffb040"],
  navyWall: ["#3b5070", "#1c2a3e", "#39c6ff"],
  whiteWall: ["#e0e5e9", "#98a2ab", "#39c6ff"],
  engWall: ["#2c3137", "#15181c"],
  greenWall: ["#6b8676", "#3a4d41", "#7dffa0"],
  podWall: ["#a39886", "#6a604f", "#ffb040"],
};

function mat(key: string, style: "worn" | "clean" = "worn"): MeshStandardMaterial {
  const std = (map: ReturnType<typeof panelTex>, color = 0xffffff, rough = 0.7, metal = 0.35, bump = 1.6): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ map, color, roughness: rough, metalness: metal });
    m.bumpMap = bumpOf(map);
    m.bumpScale = bump;
    return m;
  };
  if (style === "clean") {
    const c = CLEAN_WALLS[key];
    if (c) return std(cleanPanelTex(key, c[0], c[1], 1, 2, c[2]), 0xffffff, 0.32, 0.25, 0.7);
    if (key === "ceiling") return std(cleanPanelTex("ceilC", "#c3ccd4", "#8c96a0", 2, 2), 0xffffff, 0.4, 0.2, 0.6);
    const m = mat(key, "worn");
    // polished floors (the breaker room's grating stays dull and dark)
    if (key !== "engGrate") m.roughness = Math.min(m.roughness, 0.3);
    m.bumpScale *= 0.6;
    return m;
  }
  const w = WORN_WALLS[key];
  if (w) return std(wornMetalTex("fw_" + key, w[0], { cols: 2, rows: 2, rust: w[1] }), 0xffffff, 0.62, 0.45, 2);
  switch (key) {
    case "navy":
      return std(panelTex("navy", "#1d2a44", "#0b1222", 2, 2));
    case "navyWall":
      return std(panelTex("navyW", "#223556", "#0c1528", 1, 2, "#39c6ff"));
    case "white":
      return std(panelTex("white", "#c9ced2", "#8a9096", 2, 2), 0xffffff, 0.5, 0.2);
    case "whiteWall":
      return std(panelTex("whiteW", "#d8dde0", "#8f959b", 1, 2, "#58c8ff"), 0xffffff, 0.5, 0.2);
    case "grate":
      return std(grateTex("g", "#4d545b"), 0xffffff, 0.6, 0.6);
    case "greyWall":
      return std(panelTex("greyW", "#5c636a", "#2a2e33", 1, 2, "#e0a800"));
    case "redFloor":
      return std(panelTex("redF", "#3a1a1a", "#1a0a0a", 2, 2));
    case "redWall":
      return std(panelTex("redW", "#5a2222", "#260d0d", 1, 2, "#ff4a30"));
    case "wood":
      return std(woodTex(), 0xffffff, 0.55, 0.05);
    case "brownWall":
      return std(panelTex("brownW", "#5b4636", "#2c2018", 1, 2, "#e6b070"), 0xffffff, 0.6, 0.15);
    case "greenFloor":
      return std(panelTex("greenF", "#34463a", "#1a241d", 2, 2));
    case "greenWall":
      return std(panelTex("greenW", "#3f5a45", "#1c2a20", 1, 2));
    case "blueFloor":
      return std(panelTex("blueF", "#2f3b52", "#161d2a", 2, 2));
    case "blueWall":
      return std(panelTex("blueW", "#3a4a6a", "#1a2233", 1, 2));
    case "diamond":
      return std(diamondPlateTex("cargo", "#5d5a52"), 0xffffff, 0.55, 0.6);
    case "rustWall":
      return std(panelTex("rustW", "#6b5a48", "#2e241a", 2, 2, "#e0a800"));
    case "engGrate":
      return std(grateTex("eng", "#3c3a38", "#3a1a05"), 0xffffff, 0.6, 0.6);
    case "engWall":
      return std(panelTex("engW", "#35393e", "#15171a", 1, 2, "#ff8a30"));
    case "colFloor":
      return std(diamondPlateTex("colf", "#6e604e"), 0xffffff, 0.6, 0.5);
    case "mineFloor":
      return std(grateTex("mine", "#4a3a2c", "#4a1005"), 0xffffff, 0.65, 0.55);
    case "podFloor":
      return std(diamondPlateTex("pod", "#4f5359"), 0xffffff, 0.55, 0.6);
    case "podWall":
      return std(panelTex("podW", "#5a6068", "#23272c", 2, 2, "#e0a800"));
    case "frame":
      return new MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.7 });
    case "acadWall":
      return std(panelTex("acadW", "#c4ced8", "#66727e", 1, 2, "#39c6ff"), 0xffffff, 0.5, 0.25);
    case "acadFloor":
      return std(panelTex("acadF", "#39434e", "#1b2129", 2, 2, "#2aa8e0"), 0xffffff, 0.55, 0.45);
    case "hullOut":
      return std(wornMetalTex("hullOut", "#5f656c", { cols: 2, rows: 2, rust: 5 }), 0xffffff, 0.6, 0.55);
    case "ceiling":
      return std(panelTex("ceil", "#2a2e33", "#121417", 2, 2), 0xffffff, 0.8, 0.4);
    default:
      return new MeshStandardMaterial({ color: 0x888888 });
  }
}

const QUAD_CCW = [0, 1, 2, 0, 2, 3];
const QUAD_CW = [0, 2, 1, 0, 3, 2];

class GeoBatch {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, uvs: number[]): void {
    // make sure the visible (front) side faces along n, into the room
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
    const fx = c.x - a.x, fy = c.y - a.y, fz = c.z - a.z;
    const facing = (ey * fz - ez * fy) * n.x + (ez * fx - ex * fz) * n.y + (ex * fy - ey * fx) * n.z;
    const order = facing >= 0 ? QUAD_CCW : QUAD_CW;
    for (const [p, i] of order.map((k) => [[a, b, c, d][k], k] as const)) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
    }
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

export class Level {
  readonly group = new Group();
  readonly grid = new Uint8Array(GW * GH);
  readonly roomIdx = new Int8Array(GW * GH).fill(-1);
  readonly pathBlock = new Uint8Array(GW * GH);
  readonly rooms: Room[];
  readonly doors: Door[] = [];
  readonly props: PropBox[] = [];
  readonly doorAt = new Map<number, Door>();
  readonly animated: { update: (t: number) => void }[] = [];
  reactorPos = new Vector3(62, 0, 15.5);
  relayPos = new Vector3(59.9, 0, 15.5);
  relayLight!: Mesh;
  bridgeConsolePos = new Vector3(2.6, 0, 15.5);
  airlockPos = new Vector3(55, 0, 25.9);
  armoryTerminalPos = new Vector3(15, 0, 17);
  roomLights: PointLight[] = [];
  /** Remote Colony objective pieces (null on other maps) */
  colony: ColonyBits | null = null;
  /** rooms whose lights currently stutter (the colony steadies them once power is back) */
  private flickerIds: string[] = [];
  /** torn wall panels that crackle with sparks, and vents that hiss steam */
  readonly sparkSpots: { p: Vector3; n: Vector3 }[] = [];
  readonly steamSpots: { p: Vector3; n: Vector3 }[] = [];
  /** which room each pooled light is serving right now */
  private readonly poolRoom: (Room | null)[] = [];
  private readonly panelMats = new Map<string, { m: MeshBasicMaterial; c: Color }>();
  /** Static furniture is collected here, then merged into a handful of meshes. */
  private readonly staticGroup = new Group();
  private readonly lightDefs: { x: number; z: number; room: Room; color: number; intensity: number; distance: number }[] = [];
  private lightT = 0;
  private propCells: number[][] = [];
  private propStamp: Uint32Array = new Uint32Array(0);
  private readonly tmpProps: PropBox[] = [];
  private stamp = 1;

  constructor(readonly def: MapDef = FREIGHTER) {
    this.rooms = def.rooms;
    this.flickerIds = [...(def.flicker ?? [])];
    this.carve();
    this.buildShell();
    this.buildDoors();
    if (def.props) def.props(this);
    else this.buildProps();
    new Dresser(this).build();
    this.buildLights();
    this.buildSky();
    this.mergeStatic();
    this.indexProps();
  }

  /** Merge every static prop mesh that shares a material into one mesh (thousands of draws → dozens). */
  private mergeStatic(): void {
    this.staticGroup.updateMatrixWorld(true);
    const byMat = new Map<Material, BufferGeometry[]>();
    const loose: Object3D[] = [];
    this.staticGroup.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as Material;
      if (Array.isArray(m.material) || mat.transparent) {
        loose.push(m);
        return;
      }
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const g = new BufferGeometry();
      g.setAttribute("position", src.getAttribute("position"));
      g.setAttribute("normal", src.getAttribute("normal") ?? src.getAttribute("position"));
      g.setAttribute("uv", src.getAttribute("uv") ?? new Float32BufferAttribute(new Float32Array(src.getAttribute("position").count * 2), 2));
      g.applyMatrix4(m.matrixWorld);
      let list = byMat.get(mat);
      if (!list) byMat.set(mat, (list = []));
      list.push(g);
    });
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos);
      if (merged) this.group.add(new Mesh(merged, mat));
    }
    for (const o of loose) this.group.attach(o);
    this.staticGroup.clear();
  }

  /** Bucket prop boxes by grid cell for fast collision / sight / ray queries. */
  private indexProps(): void {
    this.propCells = Array.from({ length: GW * GH }, () => []);
    this.propStamp = new Uint32Array(this.props.length);
    this.props.forEach((b, i) => {
      for (let cz = Math.floor(b.minZ); cz <= Math.floor(b.maxZ); cz++)
        for (let cx = Math.floor(b.minX); cx <= Math.floor(b.maxX); cx++) {
          if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) continue;
          this.propCells[this.idx(cx, cz)].push(i);
        }
    });
  }

  private propsNear(x0: number, z0: number, x1: number, z1: number, out: PropBox[]): PropBox[] {
    out.length = 0;
    this.stamp++;
    for (let cz = Math.max(0, Math.floor(z0)); cz <= Math.min(GH - 1, Math.floor(z1)); cz++)
      for (let cx = Math.max(0, Math.floor(x0)); cx <= Math.min(GW - 1, Math.floor(x1)); cx++)
        for (const i of this.propCells[this.idx(cx, cz)]) {
          if (this.propStamp[i] === this.stamp) continue;
          this.propStamp[i] = this.stamp;
          out.push(this.props[i]);
        }
    return out;
  }

  /** Keep only the room lights nearest the camera switched on (few lights = fast shading everywhere). */
  updateLights(dt: number, cam: Vector3): void {
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.15;
    const scored = this.lightDefs
      .map((l) => {
        const r = l.room;
        const dx = Math.max(r.x0 - cam.x, 0, cam.x - (r.x1 + 1));
        const dz = Math.max(r.z0 - cam.z, 0, cam.z - (r.z1 + 1));
        return { l, d: Math.hypot(dx, dz) };
      })
      .sort((a, b) => a.d - b.d);
    this.roomLights.forEach((pl, i) => {
      const e = scored[i];
      if (!e) {
        pl.intensity = 0;
        this.poolRoom[i] = null;
        return;
      }
      this.poolRoom[i] = e.l.room;
      pl.position.set(e.l.x, WALL_H - 0.4, e.l.z);
      pl.color.setHex(e.l.color);
      pl.intensity = e.l.intensity;
      pl.distance = e.l.distance;
    });
  }

  idx(x: number, z: number): number {
    return z * GW + x;
  }

  private carve(): void {
    this.rooms.forEach((r, ri) => {
      for (let z = r.z0; z <= r.z1; z++)
        for (let x = r.x0; x <= r.x1; x++) {
          this.grid[this.idx(x, z)] = FLOOR;
          this.roomIdx[this.idx(x, z)] = ri;
        }
    });
    // rounded corners etc.
    for (const [x, z] of this.def.solid ?? []) {
      this.grid[this.idx(x, z)] = WALL;
      this.roomIdx[this.idx(x, z)] = -1;
    }
    for (const d of this.def.doors) {
      const cells: [number, number][] = [];
      for (let i = 0; i < d.len; i++) {
        const x = d.alongX ? d.x + i : d.x;
        const z = d.alongX ? d.z : d.z + i;
        this.grid[this.idx(x, z)] = DOOR;
        cells.push([x, z]);
      }
      const cx = d.alongX ? d.x + d.len / 2 : d.x + 0.5;
      const cz = d.alongX ? d.z + 0.5 : d.z + d.len / 2;
      const lamp = new MeshBasicMaterial({ color: d.locked ? 0xff3020 : 0x30ff70 });
      const door: Door = { id: d.id, cells, alongX: d.alongX, locked: !!d.locked, open: 0, cx, cz, panels: [], lamp, width: d.len };
      this.doors.push(door);
      for (const [x, z] of cells) this.doorAt.set(this.idx(x, z), door);
    }
    for (const [x, z] of this.def.windows) if (this.grid[this.idx(x, z)] === WALL) this.grid[this.idx(x, z)] = WINDOW;
  }

  cell(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= GW || z >= GH) return WALL;
    return this.grid[this.idx(x, z)];
  }

  /** True when the cell blocks movement (walls, windows, closed doors). */
  solid(x: number, z: number): boolean {
    const c = this.cell(x, z);
    if (c === FLOOR) return false;
    if (c === DOOR) return this.doorAt.get(this.idx(x, z))!.open < 0.85;
    return true;
  }

  walkableForPath(x: number, z: number): boolean {
    const c = this.cell(x, z);
    if (c === FLOOR) return !this.pathBlock[this.idx(x, z)];
    if (c === DOOR) return !this.doorAt.get(this.idx(x, z))!.locked;
    return false;
  }

  roomAt(x: number, z: number): Room | null {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return null;
    const r = this.roomIdx[this.idx(cx, cz)];
    return r >= 0 ? this.rooms[r] : null;
  }

  private buildShell(): void {
    const floors = new Map<string, GeoBatch>();
    const walls = new Map<string, GeoBatch>();
    const ceil = new GeoBatch();
    const glass = new GeoBatch();
    const roof = new GeoBatch();
    const RY = WALL_H + 0.02;
    const roofQuad = (x: number, z: number): void => {
      roof.quad(new Vector3(x, RY, z), new Vector3(x, RY, z + 1), new Vector3(x + 1, RY, z + 1), new Vector3(x + 1, RY, z), up, [x / 3, z / 3, x / 3, (z + 1) / 3, (x + 1) / 3, (z + 1) / 3, (x + 1) / 3, z / 3]);
    };
    const get = (m: Map<string, GeoBatch>, k: string): GeoBatch => {
      let b = m.get(k);
      if (!b) m.set(k, (b = new GeoBatch()));
      return b;
    };
    const up = new Vector3(0, 1, 0);
    const down = new Vector3(0, -1, 0);
    const domes = new Set(this.def.domes ?? []);
    // open space around the ship: wall cells reachable from the map edge that touch no room
    const open = (x: number, z: number): boolean => {
      const c = this.cell(x, z);
      return c === FLOOR || c === DOOR;
    };
    const outside = new Uint8Array(GW * GH);
    const queue: number[] = [];
    const seed = (x: number, z: number): void => {
      const i = this.idx(x, z);
      if (outside[i] || this.grid[i] !== WALL) return;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, z + dz)) return;
      outside[i] = 1;
      queue.push(i);
    };
    for (let x = 0; x < GW; x++) {
      seed(x, 0);
      seed(x, GH - 1);
    }
    for (let z = 0; z < GH; z++) {
      seed(0, z);
      seed(GW - 1, z);
    }
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % GW;
      const z = (i - x) / GW;
      if (x > 0) seed(x - 1, z);
      if (x < GW - 1) seed(x + 1, z);
      if (z > 0) seed(x, z - 1);
      if (z < GH - 1) seed(x, z + 1);
    }
    const isOutside = (x: number, z: number): boolean => x < 0 || z < 0 || x >= GW || z >= GH || outside[this.idx(x, z)] === 1;
    for (let z = 0; z < GH; z++) {
      for (let x = 0; x < GW; x++) {
        const c = this.grid[this.idx(x, z)];
        if (c === FLOOR || c === DOOR) {
          const ri = this.roomIdx[this.idx(x, z)];
          const key = ri >= 0 ? this.rooms[ri].floor : "grate";
          const uv = [x / 2, z / 2, (x + 1) / 2, z / 2, (x + 1) / 2, (z + 1) / 2, x / 2, (z + 1) / 2];
          get(floors, key).quad(new Vector3(x, 0, z), new Vector3(x, 0, z + 1), new Vector3(x + 1, 0, z + 1), new Vector3(x + 1, 0, z), up, [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]]);
          // domed rooms are open to their glass dome (built by the map's sky)
          if (ri >= 0 && domes.has(this.rooms[ri].id)) continue;
          if (this.def.roof) roofQuad(x, z);
          ceil.quad(new Vector3(x, WALL_H, z), new Vector3(x + 1, WALL_H, z), new Vector3(x + 1, WALL_H, z + 1), new Vector3(x, WALL_H, z + 1), down, uv);
          continue;
        }
        // wall / window cell: emit faces toward walkable neighbours
        if (this.def.roof && !isOutside(x, z)) roofQuad(x, z);
        const nbrs: [number, number, Vector3][] = [
          [x - 1, z, new Vector3(-1, 0, 0)],
          [x + 1, z, new Vector3(1, 0, 0)],
          [x, z - 1, new Vector3(0, 0, -1)],
          [x, z + 1, new Vector3(0, 0, 1)],
        ];
        if (c === WINDOW) {
          // sill and head close the top and bottom of the window opening
          const lo = 0.9;
          const hi = 2.6;
          get(walls, "frame").quad(new Vector3(x, lo, z), new Vector3(x, lo, z + 1), new Vector3(x + 1, lo, z + 1), new Vector3(x + 1, lo, z), up, [0, 0, 0, 1, 1, 1, 1, 0]);
          get(walls, "frame").quad(new Vector3(x, hi, z), new Vector3(x + 1, hi, z), new Vector3(x + 1, hi, z + 1), new Vector3(x, hi, z + 1), down, [0, 0, 1, 0, 1, 1, 0, 1]);
        }
        for (const [nx, nz, n] of nbrs) {
          const nc = this.cell(nx, nz);
          const skin = c === WALL && isOutside(nx, nz) && !isOutside(x, z);
          const reveal = c === WALL && nc === WINDOW && !isOutside(x, z);
          if (nc !== FLOOR && nc !== DOOR && !skin && !reveal) continue;
          let key: string;
          if (skin) key = "hullOut";
          else if (reveal || nc === DOOR) key = "frame";
          else {
            const ri = this.roomIdx[this.idx(nx, nz)];
            key = ri >= 0 ? this.rooms[ri].wall : "greyWall";
          }
          // face lies on the shared edge
          let a: Vector3, b: Vector3;
          if (n.x !== 0) {
            const fx = n.x > 0 ? x + 1 : x;
            a = new Vector3(fx, 0, n.x > 0 ? z : z + 1);
            b = new Vector3(fx, 0, n.x > 0 ? z + 1 : z);
          } else {
            const fz = n.z > 0 ? z + 1 : z;
            a = new Vector3(n.z > 0 ? x + 1 : x, 0, fz);
            b = new Vector3(n.z > 0 ? x : x + 1, 0, fz);
          }
          const along0 = n.x !== 0 ? a.z : a.x;
          const along1 = n.x !== 0 ? b.z : b.x;
          if (c === WINDOW && nc !== DOOR) {
            // lower + upper wall strips, glass between
            const target = get(walls, key);
            const lo = 0.9;
            const hi = 2.6;
            target.quad(a.clone(), b.clone(), new Vector3(b.x, lo, b.z), new Vector3(a.x, lo, a.z), n, [along0 / 2, 0, along1 / 2, 0, along1 / 2, lo / 2, along0 / 2, lo / 2]);
            target.quad(new Vector3(a.x, hi, a.z), new Vector3(b.x, hi, b.z), new Vector3(b.x, WALL_H, b.z), new Vector3(a.x, WALL_H, a.z), n, [along0 / 2, hi / 2, along1 / 2, hi / 2, along1 / 2, WALL_H / 2, along0 / 2, WALL_H / 2]);
            glass.quad(new Vector3(a.x, lo, a.z), new Vector3(b.x, lo, b.z), new Vector3(b.x, hi, b.z), new Vector3(a.x, hi, a.z), n, [0, 0, 1, 0, 1, 1, 0, 1]);
            continue;
          }
          get(walls, key).quad(a, b, new Vector3(b.x, WALL_H, b.z), new Vector3(a.x, WALL_H, a.z), n, [along0 / 2, 0, along1 / 2, 0, along1 / 2, WALL_H / 2, along0 / 2, WALL_H / 2]);
        }
      }
    }
    const style = this.def.id === "training" ? "clean" : "worn";
    for (const [k, b] of floors) this.group.add(new Mesh(b.build(), mat(k, style)));
    for (const [k, b] of walls) {
      const m = mat(k, k === "hullOut" || k === "frame" ? "worn" : style);
      m.side = DoubleSide; // solid from either side, whichever way you look
      this.group.add(new Mesh(b.build(), m));
    }
    this.group.add(new Mesh(ceil.build(), mat("ceiling", style)));
    if (this.def.roof) this.group.add(new Mesh(roof.build(), mat("hullOut", "worn")));
    const gm = new MeshStandardMaterial({ color: 0x5fb0d0, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.9, depthWrite: false, side: DoubleSide });
    this.group.add(new Mesh(glass.build(), gm));
    // window frames: thin mullions
    for (const [x, z] of this.def.windows) {
      if (this.grid[this.idx(x, z)] !== WINDOW || x !== 0) continue;
      const alongX = this.cell(x, z - 1) === FLOOR || this.cell(x, z + 1) === FLOOR;
      const f = box(alongX ? 0.08 : 0.3, 1.7, alongX ? 0.3 : 0.08, M.darkMetal, x + (alongX ? 0 : 0.5), 1.75, z + (alongX ? 0.5 : 0));
      this.group.add(f);
    }
  }

  private buildDoors(): void {
    const panelMat = new MeshStandardMaterial({ color: 0x5a6068, metalness: 0.7, roughness: 0.4, map: panelTex("door", "#6a7078", "#2a2e33", 1, 3, "#e0a800") });
    const blastMat = new MeshStandardMaterial({ color: 0x7a6040, metalness: 0.7, roughness: 0.45, map: panelTex("blast", "#8a7a50", "#2a2418", 2, 3, "#e0a800") });
    const headerMat = new MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.7 });
    for (const d of this.doors) {
      const half = d.width / 2;
      for (const s of [-1, 1]) {
        const geo = new BoxGeometry(d.alongX ? half : 0.22, WALL_H - 0.3, d.alongX ? 0.22 : half);
        const m = new Mesh(geo, d.id === "blast" ? blastMat : panelMat);
        m.userData.side = s;
        m.userData.half = half;
        this.group.add(m);
        d.panels.push(m);
      }
      // solid header beam over the doorway: no gap between door and ceiling
      const hdr = new Mesh(new BoxGeometry(d.alongX ? d.width : 0.5, 0.45, d.alongX ? 0.5 : d.width), headerMat);
      hdr.position.set(d.cx, WALL_H - 0.225, d.cz);
      this.group.add(hdr);
      // lamp strip above door on both sides
      for (const s of [-1, 1]) {
        const lamp = new Mesh(new BoxGeometry(d.alongX ? d.width * 0.6 : 0.05, 0.08, d.alongX ? 0.05 : d.width * 0.6), d.lamp);
        lamp.position.set(d.cx + (d.alongX ? 0 : s * 0.28), WALL_H - 0.3, d.cz + (d.alongX ? s * 0.28 : 0));
        this.group.add(lamp);
      }
      this.placeDoorPanels(d);
    }
  }

  private placeDoorPanels(d: Door): void {
    for (const m of d.panels) {
      const s = m.userData.side as number;
      const half = m.userData.half as number;
      const off = s * (half / 2 + d.open * half * 0.95);
      m.position.set(d.cx + (d.alongX ? off : 0), (WALL_H - 0.3) / 2, d.cz + (d.alongX ? 0 : off));
    }
  }

  setDoorLocked(id: string, locked: boolean): void {
    const d = this.doors.find((x) => x.id === id);
    if (!d) return;
    d.locked = locked;
    d.lamp.color.setHex(locked ? 0xff3020 : 0x30ff70);
  }

  /** Doors slide open when anything stands near them (unless locked). */
  updateDoors(dt: number, actors: { x: number; z: number }[]): string[] {
    const opened: string[] = [];
    for (const d of this.doors) {
      let want = 0;
      if (!d.locked) for (const a of actors) if (Math.abs(a.x - d.cx) < 2.3 + (d.alongX ? d.width / 2 : 0) && Math.abs(a.z - d.cz) < 2.3 + (d.alongX ? 0 : d.width / 2)) want = 1;
      const prev = d.open;
      d.open += Math.sign(want - d.open) * Math.min(Math.abs(want - d.open), dt * 3.2);
      if (prev === 0 && d.open > 0) opened.push(d.id);
      if (d.open !== prev) this.placeDoorPanels(d);
    }
    return opened;
  }

  addProp(o: Object3D, x: number, z: number, rotY = 0, blk?: { w: number; d: number; h: number; sight?: boolean }, dynamic = false): Object3D {
    o.position.set(x, o.position.y, z);
    o.rotation.y = rotY;
    (dynamic ? this.group : this.staticGroup).add(o);
    if (blk) {
      const swap = Math.abs(Math.sin(rotY)) > 0.7;
      const w = swap ? blk.d : blk.w;
      const d = swap ? blk.w : blk.d;
      const p: PropBox = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: blk.h, sight: blk.sight ?? blk.h > 1.3 };
      this.props.push(p);
      for (let cz = Math.floor(p.minZ); cz <= Math.floor(p.maxZ); cz++)
        for (let cx = Math.floor(p.minX); cx <= Math.floor(p.maxX); cx++) {
          if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) continue;
          const ccx = cx + 0.5;
          const ccz = cz + 0.5;
          if (ccx > p.minX - 0.25 && ccx < p.maxX + 0.25 && ccz > p.minZ - 0.25 && ccz < p.maxZ + 0.25) this.pathBlock[this.idx(cx, cz)] = 1;
        }
    }
    return o;
  }

  private crates(x: number, z: number, stack: number, tan = false, rot = 0): void {
    for (let i = 0; i < stack; i++) {
      const c = P.crate(1.2, 1.2, 1.2, tan, (Math.floor(x * 7 + z * 3 + i) % 5) === 0 ? 2 : 0);
      c.position.y = 0.6 + i * 1.2;
      c.rotation.y = rot + i * 0.2;
      c.position.x = 0;
      const g = new Group();
      g.add(c);
      this.addProp(g, x, z, 0, i === 0 ? { w: 1.25, d: 1.25, h: stack * 1.2 } : undefined);
    }
  }

  private cables(x: number, z: number, rotY: number, count = 3): void {
    const g = new Group();
    for (let i = 0; i < count; i++) {
      const c = new Mesh(new PlaneGeometry(0.12, WALL_H), M.alienCable);
      c.position.set(i * 0.25 - count * 0.12, WALL_H / 2, 0);
      c.rotation.z = (i - 1) * 0.15;
      g.add(c);
    }
    this.addProp(g, x, z, rotY);
  }

  private buildProps(): void {
    // ---- Bridge ----
    const cBridge = [0x39c6ff];
    void cBridge;
    let bi = 0;
    for (const a of [0.95, 1.4]) {
      for (const s of [-1, 1]) {
        const con = P.consoleDesk("#39c6ff", "bridge" + bi++, 1.3);
        const x = 4.5 - Math.cos(a) * 3.3;
        const z = 15.5 + s * Math.sin(a) * 3.3;
        this.addProp(con, x, z, Math.atan2(4.5 - x, 15.5 - z), { w: 1.2, d: 1.0, h: 1.0, sight: false });
      }
    }
    this.addProp(P.captainChair(), 5.8, 15.5, -Math.PI / 2, { w: 0.9, d: 0.9, h: 1.3, sight: false });
    const main = P.consoleDesk("#6fe8ff", "bridgeMain", 1.6);
    this.addProp(main, 1.9, 15.5, Math.PI / 2, { w: 1.6, d: 0.8, h: 1.0, sight: false });
    this.cables(9.95, 12.5, -Math.PI / 2);
    this.cables(9.95, 18.5, -Math.PI / 2);
    for (const z of [10.6, 20.4]) this.addProp(P.locker(), 8.4, z, -Math.PI / 2, { w: 0.6, d: 0.5, h: 2.0 });
    // ---- Life Support ----
    for (let i = 0; i < 3; i++) {
      const tank = new Group();
      cyl(0.5, 0.5, 2.6, M.white, 0, 1.3, 0, tank, 16);
      cyl(0.52, 0.52, 0.2, M.cyanGlow, 0, 1.9, 0, tank, 16);
      cyl(0.52, 0.52, 0.2, M.darkMetal, 0, 0.1, 0, tank, 16);
      this.addProp(tank, 12.2 + i * 1.4, 8.7, 0, { w: 1.05, d: 1.05, h: 2.6 });
    }
    this.addProp(P.consoleDesk("#5ae0ff", "life", 1.4), 18.2, 8.6, Math.PI, { w: 1.4, d: 0.8, h: 1.0, sight: false });
    const pipes = new Group();
    for (let i = 0; i < 4; i++) {
      const p = P.pipeRun(9);
      p.position.set(4.5, 2.7 + i * 0.18, 0);
      pipes.add(p);
    }
    this.addProp(pipes, 11, 12.75);
    const hatch = new Group();
    box(1.6, 0.1, 1.6, M.hazard, 0, 0.05, 0, hatch);
    box(1.2, 0.12, 1.2, M.darkMetal, 0, 0.06, 0, hatch);
    this.addProp(hatch, 17.5, 11.3);
    // ---- Armory ----
    for (let i = 0; i < 3; i++) this.addProp(P.weaponRack(), 12.5 + i * 2.4, 22.6, Math.PI, { w: 1.6, d: 0.4, h: 1.9 });
    for (let i = 0; i < 3; i++) this.addProp(P.locker(), 19.6, 19 + i * 0.7, -Math.PI / 2, { w: 0.6, d: 0.5, h: 2.0 });
    this.crates(12, 18.8, 1, false);
    // ---- Forward corridor pipes ----
    const fp = new Group();
    for (let i = 0; i < 3; i++) {
      const p = P.pipeRun(9);
      p.position.set(4.5, WALL_H - 0.25, -1.2 + i * 1.2);
      fp.add(p);
    }
    this.addProp(fp, 11, 15.5);
    // ---- Conference Room ----
    this.addProp(P.conferenceTable(), 25.5, 15.5, 0, { w: 2.0, d: 5.8, h: 0.85, sight: false });
    const holo = new Group();
    const hm = new MeshBasicMaterial({ map: hologramTex(), color: 0x6fe8ff, transparent: true, opacity: 0.55, depthWrite: false });
    const cone = new Mesh(new SphereGeometry(0.55, 20, 14), hm);
    cone.position.y = 1.55;
    holo.add(cone);
    const ship = box(0.8, 0.14, 0.2, new MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.8 }), 0, 1.55, 0, holo);
    this.addProp(holo, 25.5, 15.5, 0, undefined, true);
    this.animated.push({ update: (t) => ((cone.rotation.y = t * 0.6), (ship.rotation.y = -t), (hm.opacity = 0.45 + Math.sin(t * 7) * 0.08)) });
    this.crates(22.3, 8.2, 1, true);
    this.crates(29.6, 22.2, 2, false);
    this.crates(22.2, 22.4, 1, false);
    this.addProp(P.barrel(), 29.5, 8, 0, { w: 0.65, d: 0.65, h: 0.9 });
    this.cables(21.05, 12, Math.PI / 2);
    this.cables(30.95, 18, -Math.PI / 2);
    for (const z of [7.08, 23.92]) {
      // sealed side airlocks (decorative)
      const al = new Group();
      box(1.9, 2.6, 0.12, M.hazard, 0, 1.3, 0, al);
      box(1.6, 2.3, 0.14, M.darkMetal, 0, 1.25, 0, al);
      box(0.6, 0.1, 0.16, M.redGlow, 0, 2.2, 0, al);
      this.addProp(al, 26, z);
    }
    // ---- Bunks ----
    const bunk = (x: number, z: number, blue: boolean, rot: number): void => {
      this.addProp(P.bunkBed(blue), x, z, rot, { w: 1.0, d: 2.05, h: 1.9 });
    };
    bunk(33, 8.1, false, 0);
    bunk(37.5, 8.5, false, 0);
    bunk(41, 8.5, true, 0);
    bunk(45.5, 8.5, true, 0);
    bunk(33, 22.9, false, 0); // pushed to the back wall so the door from the Briefing room is clear
    bunk(37.5, 21.8, false, 0);
    bunk(41, 21.8, true, 0);
    bunk(45.5, 21.8, true, 0);
    for (const [x, z] of [[35.3, 7.5], [43.3, 7.5], [35.3, 23.4], [43.3, 23.4]]) this.addProp(P.locker(), x, z, 0, { w: 0.6, d: 0.5, h: 2.0 });
    // belongings the old crew left behind
    for (const [x, z] of [[34.2, 10.4], [42.6, 10.6], [34.8, 19], [44, 19.3], [36.8, 20.4]]) {
      const b = new Group();
      box(0.5, 0.25, 0.35, M.crateTan, 0, 0.13, 0, b).rotation.y = x;
      box(0.2, 0.3, 0.2, M.fabricBlue, 0.35, 0.15, 0.1, b);
      this.addProp(b, x, z);
    }
    this.cables(38.95, 9.4, -Math.PI / 2, 2);
    this.cables(38.5, 13.05, 0, 2);
    const lp = new Group();
    for (let i = 0; i < 2; i++) {
      const p = P.pipeRun(15);
      p.position.set(7.5, WALL_H - 0.25, i * 3);
      lp.add(p);
    }
    this.addProp(lp, 32, 13.4);
    // ---- Cargo Hull ----
    // kept against the west wall, clear of the Fuel Tank Two doorway
    this.crates(48.7, 10.6, 2);
    this.crates(48.7, 11.9, 1, true);
    this.crates(55.6, 8.4, 2, true);
    this.crates(52, 11.5, 2);
    this.crates(53.3, 11.5, 1, true);
    this.crates(49.2, 18.5, 1, true);
    this.crates(49.2, 19.8, 2);
    this.crates(52.8, 19.5, 2, true);
    this.crates(55.5, 21.5, 1);
    this.crates(55.6, 12.8, 1, false);
    for (const [x, z] of [[54.2, 16.6], [54.9, 17.2], [50.5, 14.2]]) this.addProp(P.barrel(x > 54.5), x, z, 0, { w: 0.65, d: 0.65, h: 0.9 });
    this.cables(56.9, 10.5, -Math.PI / 2);
    this.cables(48.1, 21, Math.PI / 2);
    // ---- Engineering ----
    const rc = P.reactorCore();
    this.addProp(rc.root, this.reactorPos.x, this.reactorPos.z, 0, { w: 3.0, d: 3.0, h: 3.4 }, true);
    this.animated.push({
      update: (t) => {
        rc.rings.forEach((r, i) => {
          r.rotation.x = t * (0.8 + i * 0.4);
          r.rotation.y = t * (0.5 + i * 0.3);
        });
        const s = 1 + Math.sin(t * 5) * 0.05;
        rc.core.scale.setScalar(s);
      },
    });
    const relay = P.relayDevice();
    this.relayLight = relay.light;
    this.addProp(relay.root, this.relayPos.x, this.relayPos.z, -Math.PI / 2, { w: 0.9, d: 0.55, h: 1.5, sight: false }, true);
    for (const [x, z, r] of [[59, 10, 0], [63.5, 12, -Math.PI / 2], [63.5, 19, -Math.PI / 2], [59, 20.9, Math.PI]] as const)
      this.addProp(P.consoleDesk("#ff9a40", "eng" + x + z, 1.2), x, z, r, { w: 1.2, d: 0.8, h: 1.0, sight: false });
    const ep = new Group();
    for (let i = 0; i < 5; i++) {
      const p = P.pipeRun(WALL_H, true);
      p.position.set(0, WALL_H / 2, i * 0.3);
      ep.add(p);
    }
    this.addProp(ep, 64.6, 13.8);
    // ---- Fuel pods ----
    for (const z of [2.5, 27.5]) {
      this.addProp(P.fuelTank(5.5), 45.2, z, 0, { w: 7.8, d: 2.3, h: 2.5 });
    }
    for (const [x, z] of [[51.5, 1.6], [51.5, 28.4]]) this.addProp(P.barrel(), x, z, 0, { w: 0.65, d: 0.65, h: 0.9 });
    // ---- Airlock ----
    const al = new Group();
    box(2, 0.05, 0.4, M.hazard, 0, 0.03, 0, al);
    this.addProp(al, 55, 24.6);
  }

  private buildLights(): void {
    this.group.add(new HemisphereLight(0x8a9ab8, 0x241a14, this.def.hemi ?? 0.7));
    for (let i = 0; i < 5; i++) {
      const l = new PointLight(0xffffff, 0, 10, 1.6);
      this.group.add(l);
      this.roomLights.push(l);
    }
    for (const r of this.rooms) {
      if (!r.lightI) continue;
      const cx = (r.x0 + r.x1 + 1) / 2;
      const cz = (r.z0 + r.z1 + 1) / 2;
      const area = (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
      this.lightDefs.push({ x: cx, z: cz, room: r, color: r.light, intensity: r.lightI, distance: Math.sqrt(area) * 2.2 + 6 });
      // ceiling light panels
      const panel = new MeshBasicMaterial({ color: new Color(r.light).lerp(new Color(0xffffff), 0.5) });
      this.panelMats.set(r.id, { m: panel, c: panel.color.clone() });
      // domed rooms have no ceiling to hang panels from
      if (this.def.domes?.includes(r.id)) continue;
      const nx = Math.max(1, Math.round((r.x1 - r.x0) / 4));
      const nz = Math.max(1, Math.round((r.z1 - r.z0) / 5));
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const px = r.x0 + ((i + 0.5) / nx) * (r.x1 - r.x0 + 1);
          const pz = r.z0 + ((j + 0.5) / nz) * (r.z1 - r.z0 + 1);
          box(1.2, 0.05, 0.3, panel, px, WALL_H - 0.03, pz, this.staticGroup);
          box(1.3, 0.08, 0.4, M.darkMetal, px, WALL_H - 0.005, pz, this.staticGroup);
        }
    }
  }

  /** Stuttering lights in damaged rooms (runs every frame, after updateLights). */
  private flickerLights(t: number): void {
    const list = this.flickerIds;
    for (let k = 0; k < list.length; k++) {
      const id = list[k];
      const s = k * 17.3;
      const w = Math.sin(t * 1.7 + s) + Math.sin(t * 3.1 + s * 1.7) * 0.6;
      let f = 1;
      if (w > 1.25) f = Math.sin(t * 60 + s) > 0 ? 0.15 : 0.9;
      else if (w > 1.05) f = 0.55;
      const pm = this.panelMats.get(id);
      if (pm) pm.m.color.copy(pm.c).multiplyScalar(0.25 + f * 0.75);
      this.roomLights.forEach((pl, i) => {
        const r = this.poolRoom[i];
        if (r && r.id === id) {
          const def = this.lightDefs.find((l) => l.room === r);
          if (def) pl.intensity = def.intensity * f;
        }
      });
    }
  }

  /** Colony power: off = the flicker rooms stutter; on = every light steadies. */
  setPowered(on: boolean): void {
    this.flickerIds = on ? [] : [...(this.def.flicker ?? [])];
    if (on) for (const pm of this.panelMats.values()) pm.m.color.copy(pm.c);
    this.lightT = 0;
  }

  private buildSky(): void {
    if (this.def.flicker?.length) this.animated.push({ update: (t) => this.flickerLights(t) });
    if (this.def.sky) {
      this.def.sky(this);
      return;
    }
    const sky = new Mesh(new SphereGeometry(300, 40, 20), new MeshBasicMaterial({ map: spaceTex(), side: BackSide, depthWrite: false, fog: false }));
    sky.position.set(33, 0, 15);
    sky.renderOrder = -10;
    this.group.add(sky);
    if (this.def.id === "training") this.buildOrbitView();
    if (!this.def.dock) return;
    const dock = buildDropship().root;
    dock.position.set(55, -1.2, 33.3);
    dock.rotation.y = 0;
    this.group.add(dock);
  }

  /** The view from the Academy's windows: a blue-green world below and the station's docking ring turning. */
  private buildOrbitView(): void {
    const sun = new Vector3(0.4, 0.5, 0.75).normalize();
    const planetGeo = new SphereGeometry(140, 64, 32);
    const cols: number[] = [];
    const nor = planetGeo.getAttribute("normal");
    const v = new Vector3();
    for (let i = 0; i < nor.count; i++) {
      v.fromBufferAttribute(nor, i);
      const l = Math.max(0.06, Math.min(1, v.dot(sun) * 1.2 + 0.25));
      cols.push(l, l, l * 1.05);
    }
    planetGeo.setAttribute("color", new Float32BufferAttribute(cols, 3));
    const planet = new Mesh(planetGeo, new MeshBasicMaterial({ map: planetTex(), vertexColors: true, fog: false }));
    planet.position.set(-150, -140, 5);
    planet.rotation.z = 0.3;
    const clouds = new Mesh(planetGeo, new MeshBasicMaterial({ map: cloudTex(), vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    clouds.scale.setScalar(1.012);
    planet.add(clouds);
    const halo = new Mesh(new SphereGeometry(146, 48, 24), new MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.22, side: BackSide, blending: AdditiveBlending, depthWrite: false, fog: false }));
    planet.add(halo);
    this.group.add(planet);
    // the station's docking ring out beyond the range windows
    const ring = new Group();
    ring.position.set(55, 10, -120);
    const hull = new MeshStandardMaterial({ color: 0x8a939c, roughness: 0.5, metalness: 0.6, fog: false, emissive: 0x10161c });
    const lit = new MeshBasicMaterial({ color: 0xbfe8ff, fog: false });
    const rim = new Mesh(new TorusGeometry(60, 4, 12, 96), hull);
    ring.add(rim);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const w = new Mesh(new BoxGeometry(2.2, 0.8, 0.3), lit);
      w.position.set(Math.cos(a) * 60, Math.sin(a) * 60, 4.1);
      w.rotation.z = a + Math.PI / 2;
      ring.add(w);
    }
    for (let i = 0; i < 4; i++) {
      const sp = new Mesh(new BoxGeometry(120, 2, 2), hull);
      sp.rotation.z = (i / 4) * Math.PI;
      ring.add(sp);
    }
    ring.add(new Mesh(new SphereGeometry(8, 24, 16), hull));
    this.group.add(ring);
    this.animated.push({ update: (t) => ((ring.rotation.z = t * 0.03), (clouds.rotation.y = t * 0.004), (planet.rotation.y = t * 0.0015)) });
  }

  /** Switch on a room's lighting later (e.g. after resetting a breaker). */
  addRoomLight(roomId: string, color: number, intensity: number): void {
    const r = this.rooms.find((x) => x.id === roomId);
    if (!r || this.lightDefs.some((l) => l.room === r)) return;
    const area = (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
    this.lightDefs.push({ x: (r.x0 + r.x1 + 1) / 2, z: (r.z0 + r.z1 + 1) / 2, room: r, color, intensity, distance: Math.sqrt(area) * 2.2 + 6 });
    this.lightT = 0;
  }

  // ---------- queries ----------

  /** Push a circle (x,z,r) out of walls, closed doors and props. */
  collide(p: Vector3, r: number): void {
    for (let iter = 0; iter < 2; iter++) {
      const x0 = Math.floor(p.x - r);
      const x1 = Math.floor(p.x + r);
      const z0 = Math.floor(p.z - r);
      const z1 = Math.floor(p.z + r);
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) {
          if (!this.solid(cx, cz)) continue;
          this.pushOut(p, r, cx, cx + 1, cz, cz + 1);
        }
      for (const b of this.propsNear(p.x - r, p.z - r, p.x + r, p.z + r, this.tmpProps)) {
        if (p.x + r < b.minX || p.x - r > b.maxX || p.z + r < b.minZ || p.z - r > b.maxZ) continue;
        this.pushOut(p, r, b.minX, b.maxX, b.minZ, b.maxZ);
      }
    }
  }

  private pushOut(p: Vector3, r: number, minX: number, maxX: number, minZ: number, maxZ: number): void {
    const qx = Math.max(minX, Math.min(p.x, maxX));
    const qz = Math.max(minZ, Math.min(p.z, maxZ));
    let dx = p.x - qx;
    let dz = p.z - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 < 1e-8) {
      // centre inside the box: push along the shallowest axis
      const l = p.x - minX;
      const rr = maxX - p.x;
      const t = p.z - minZ;
      const b = maxZ - p.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) p.x = minX - r;
      else if (m === rr) p.x = maxX + r;
      else if (m === t) p.z = minZ - r;
      else p.z = maxZ + r;
      return;
    }
    const d = Math.sqrt(d2);
    dx /= d;
    dz /= d;
    p.x = qx + dx * r;
    p.z = qz + dz * r;
  }

  /** Line of sight in the XZ plane. Props block if taller than the target's height. */
  sight(ax: number, az: number, bx: number, bz: number, targetH = 1.6): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 0.2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      const c = this.cell(Math.floor(x), Math.floor(z));
      if (c === WALL || c === WINDOW) return false;
      if (c === DOOR && this.doorAt.get(this.idx(Math.floor(x), Math.floor(z)))!.open < 0.6) return false;
    }
    for (const b of this.propsNear(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this.tmpProps)) {
      if (b.h < targetH - 0.05) continue;
      if (segBox(ax, az, bx, bz, b.minX, b.maxX, b.minZ, b.maxZ)) return false;
    }
    return true;
  }

  /** 3D ray against walls, closed doors, floor, ceiling and props. */
  raycast(o: Vector3, d: Vector3, maxT: number): RayHit {
    let best = maxT;
    const n = new Vector3(0, 1, 0);
    // floor / ceiling
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t < best) ((best = t), n.set(0, 1, 0));
    } else if (d.y > 1e-6) {
      const t = (WALL_H - o.y) / d.y;
      if (t < best) ((best = t), n.set(0, -1, 0));
    }
    // grid DDA
    let cx = Math.floor(o.x);
    let cz = Math.floor(o.z);
    const stepX = d.x > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (d.x || 1e-9));
    const tdz = Math.abs(1 / (d.z || 1e-9));
    let tmx = (d.x > 0 ? cx + 1 - o.x : o.x - cx) * tdx;
    let tmz = (d.z > 0 ? cz + 1 - o.z : o.z - cz) * tdz;
    let t = 0;
    let lastAxis = -1;
    for (let i = 0; i < 200 && t < best; i++) {
      if (i > 0 && this.solid(cx, cz)) {
        if (t < best) {
          best = t;
          if (lastAxis === 0) n.set(-stepX, 0, 0);
          else n.set(0, 0, -stepZ);
        }
        break;
      }
      if (tmx < tmz) {
        t = tmx;
        tmx += tdx;
        cx += stepX;
        lastAxis = 0;
      } else {
        t = tmz;
        tmz += tdz;
        cz += stepZ;
        lastAxis = 1;
      }
    }
    // props (3D boxes from floor to h) — only those in the ray's bounding area
    const ex = o.x + d.x * best;
    const ez = o.z + d.z * best;
    for (const b of this.propsNear(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), this.tmpProps)) {
      const r = rayBox(o, d, b.minX, 0, b.minZ, b.maxX, b.h, b.maxZ);
      if (r && r.t < best && r.t > 0) {
        best = r.t;
        n.copy(r.n);
      }
    }
    return { t: best, point: o.clone().addScaledVector(d, best), normal: n };
  }

  /** A* over the cell grid. Returns world-space waypoints (cell centres), start excluded. */
  findPath(ax: number, az: number, bx: number, bz: number): Vector2[] {
    const sx = Math.floor(ax);
    const sz = Math.floor(az);
    let gx = Math.floor(bx);
    let gz = Math.floor(bz);
    if (!this.walkableForPath(gx, gz)) {
      // nearest walkable around goal
      let found = false;
      for (let r = 1; r < 3 && !found; r++)
        for (let dz = -r; dz <= r && !found; dz++)
          for (let dx = -r; dx <= r && !found; dx++)
            if (this.walkableForPath(gx + dx, gz + dz)) {
              gx += dx;
              gz += dz;
              found = true;
            }
      if (!found) return [];
    }
    const N = GW * GH;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const f = new Float32Array(N).fill(Infinity);
    const s = this.idx(sx, sz);
    const goal = this.idx(gx, gz);
    g[s] = 0;
    f[s] = Math.hypot(gx - sx, gz - sz);
    // binary min-heap on f (lazy deletion of stale entries)
    const push = (v: number): void => {
      open.push(v);
      let i = open.length - 1;
      while (i > 0) {
        const pi = (i - 1) >> 1;
        if (f[open[pi]] <= f[open[i]]) break;
        [open[pi], open[i]] = [open[i], open[pi]];
        i = pi;
      }
    };
    const pop = (): number => {
      const top = open[0];
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < open.length && f[open[l]] < f[open[m]]) m = l;
          if (r < open.length && f[open[r]] < f[open[m]]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    push(s);
    let iter = 0;
    while (open.length && iter++ < 4000) {
      const cur = pop();
      if (closed[cur]) continue;
      if (cur === goal) break;
      closed[cur] = 1;
      const cx = cur % GW;
      const cz = (cur / GW) | 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.walkableForPath(nx, nz)) continue;
          if (dx && dz && (!this.walkableForPath(cx + dx, cz) || !this.walkableForPath(cx, cz + dz))) continue;
          const ni = this.idx(nx, nz);
          if (closed[ni]) continue;
          const ng = g[cur] + (dx && dz ? 1.414 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = cur;
            f[ni] = ng + Math.hypot(gx - nx, gz - nz);
            push(ni);
          }
        }
    }
    if (came[goal] === -1 && goal !== s) return [];
    const out: Vector2[] = [];
    let c = goal;
    while (c !== s && c !== -1) {
      out.push(new Vector2((c % GW) + 0.5, ((c / GW) | 0) + 0.5));
      c = came[c];
    }
    out.reverse();
    return out;
  }
}

function segBox(ax: number, az: number, bx: number, bz: number, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, d, mn, mx] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < mn || p > mx) return false;
    } else {
      let ta = (mn - p) / d;
      let tb = (mx - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return t0 < 0.98 && t1 > 0.02;
}

function rayBox(o: Vector3, d: Vector3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { t: number; n: Vector3 } | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  const n = new Vector3();
  const axes: [number, number, number, number, number][] = [
    [o.x, d.x, x0, x1, 0],
    [o.y, d.y, y0, y1, 1],
    [o.z, d.z, z0, z1, 2],
  ];
  let hitAxis = 0;
  let hitSign = 1;
  for (const [p, dd, mn, mx, ax] of axes) {
    if (Math.abs(dd) < 1e-9) {
      if (p < mn || p > mx) return null;
      continue;
    }
    let ta = (mn - p) / dd;
    let tb = (mx - p) / dd;
    let sign = -1;
    if (ta > tb) {
      [ta, tb] = [tb, ta];
      sign = 1;
    }
    if (ta > tmin) {
      tmin = ta;
      hitAxis = ax;
      hitSign = sign;
    }
    tmax = Math.min(tmax, tb);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (hitAxis === 0) n.set(hitSign, 0, 0);
  else if (hitAxis === 1) n.set(0, hitSign, 0);
  else n.set(0, 0, hitSign);
  return { t: tmin, n };
}

export type { Material };
