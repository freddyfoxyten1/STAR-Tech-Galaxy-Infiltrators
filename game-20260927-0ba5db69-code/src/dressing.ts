import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Material,
} from "three";
import type { Level, Room } from "./level";
import { M, box, cyl, rbox } from "./models";
import { boothTex, bumpOf, cleanPanelTex, foamTex, glowSpriteTex, netTex, screenTex, wallStencilTex, wornMetalTex } from "./textures";

/**
 * Set dressing for the interiors: wall ribs, kick plates, trims, ceiling beams, pipes,
 * cable trays, door frames, stencils and room-specific clutter. Everything here is either
 * flush with the walls or up at the ceiling, so it never changes where anyone can walk.
 */

const H = 3.4;
const GW = 67;
const GH = 31;
const WALL = 0;
const FLOOR = 1;
const WINDOW = 3;

interface Face {
  fx: number;
  fz: number;
  /** direction into the room */
  nx: number;
  nz: number;
  /** centre of the face on the wall plane */
  cx: number;
  cz: number;
  alongX: boolean;
  u: number;
  win: boolean;
  room: Room | null;
}

function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const std = (tex: ReturnType<typeof wornMetalTex>, rough = 0.6, metal = 0.6, bump = 1.4, color = 0xffffff): MeshStandardMaterial => {
  const m = new MeshStandardMaterial({ map: tex, color, roughness: rough, metalness: metal });
  m.bumpMap = bumpOf(tex);
  m.bumpScale = bump;
  return m;
};

let worn: ReturnType<typeof makeWorn> | null = null;
function makeWorn() {
  return {
    kick: std(wornMetalTex("kick", "#33373c", { cols: 1, rows: 1, rust: 8, size: 256 }), 0.65, 0.6),
    rib: std(wornMetalTex("rib", "#3a3f45", { cols: 1, rows: 3, rust: 4, size: 256 }), 0.55, 0.75),
    hatch: std(wornMetalTex("hatch", "#50565c", { cols: 1, rows: 1, rust: 4, size: 256, stripe: "#b08a1c" }), 0.55, 0.6),
    yellow: std(wornMetalTex("craneY", "#a8821c", { cols: 1, rows: 1, rust: 6, size: 256, bolts: false }), 0.55, 0.5),
    paint: new MeshStandardMaterial({ color: 0xb8942a, roughness: 0.85, metalness: 0.1 }),
    net: new MeshStandardMaterial({ map: netTex(), alphaTest: 0.5, side: DoubleSide, roughness: 0.9, metalness: 0 }),
    recess: new MeshStandardMaterial({ color: 0x08090b, roughness: 0.9, metalness: 0.2 }),
  };
}

let clean: ReturnType<typeof makeClean> | null = null;
function makeClean() {
  const band = cleanPanelTex("band", "#7b8896", "#4b5663", 2, 1);
  return {
    band: std(band, 0.32, 0.45, 0.8),
    white: new MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.3, metalness: 0.25 }),
    trim: new MeshStandardMaterial({ color: 0x9aa6b2, roughness: 0.3, metalness: 0.6 }),
    glow: new MeshStandardMaterial({ color: 0xc8f4ff, emissive: 0x7fdcff, emissiveIntensity: 1.5, roughness: 0.4 }),
    glowWarm: new MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffc070, emissiveIntensity: 1.3, roughness: 0.4 }),
    dark: new MeshStandardMaterial({ color: 0x1b2129, roughness: 0.5, metalness: 0.5 }),
    foam: std(foamTex(), 0.95, 0, 3),
    ledA: new MeshStandardMaterial({ color: 0x3cff78, emissive: 0x2cff6a, emissiveIntensity: 2 }),
    ledB: new MeshStandardMaterial({ color: 0x55e6ff, emissive: 0x35d6ff, emissiveIntensity: 2 }),
    ledC: new MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a10, emissiveIntensity: 2 }),
  };
}

export class Dresser {
  private readonly faces: Face[] = [];
  private readonly faceMap = new Map<string, Face>();
  private readonly S = new Group();
  private readonly isClean: boolean;
  private readonly stencilled = new Set<Face>();

  constructor(private readonly lv: Level) {
    this.isClean = lv.def.id === "training";
  }

  build(): void {
    this.collect();
    if (this.isClean) {
      clean ??= makeClean();
      this.academyWalls();
      this.academyCeilings();
      this.doorFrames();
      this.academyRooms();
    } else if (this.lv.def.id === "colony") {
      // the Remote Colony: worn prefab walls, beams only under flat ceilings, damage and robot cabling
      worn ??= makeWorn();
      this.shipWalls();
      this.shipCeilings(this.lv.def.domes ?? []);
      this.doorFrames();
      this.alienGrowth([["c_fact", 9], ["c_ref", 5], ["c_commons", 3], ["c_tunnel", 2]], false);
      this.brokenPanels(["c_tunnel", "c_commons", "c_hab", "c_ref", "c_power"]);
    } else {
      worn ??= makeWorn();
      this.shipWalls();
      this.shipCeilings();
      this.shipPipes();
      this.doorFrames();
      this.shipRooms();
      this.shipStencils();
      this.alienGrowth();
      this.brokenPanels();
    }
    this.dust();
    this.lv.addProp(this.S, 0, 0);
  }

  // ------------------------------------------------------------------ faces
  private collect(): void {
    const lv = this.lv;
    for (let z = 0; z < GH; z++)
      for (let x = 0; x < GW; x++) {
        if (lv.cell(x, z) !== FLOOR) continue;
        const room = lv.roomAt(x + 0.5, z + 0.5);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = lv.cell(x + dx, z + dz);
          if (c !== WALL && c !== WINDOW) continue;
          const alongX = dz !== 0;
          const cx = dx ? x + (dx > 0 ? 1 : 0) : x + 0.5;
          const cz = dz ? z + (dz > 0 ? 1 : 0) : z + 0.5;
          const f: Face = { fx: x, fz: z, nx: -dx, nz: -dz, cx, cz, alongX, u: alongX ? cx : cz, win: c === WINDOW, room };
          this.faces.push(f);
          this.faceMap.set(this.key(cx, cz, f.nx, f.nz), f);
        }
      }
  }

  private key(cx: number, cz: number, nx: number, nz: number): string {
    return `${cx},${cz},${nx},${nz}`;
  }

  private next(f: Face, step = 1): Face | undefined {
    return this.faceMap.get(this.key(f.alongX ? f.cx + step : f.cx, f.alongX ? f.cz : f.cz + step, f.nx, f.nz));
  }

  /** A box lying against a face: len along the wall, d out from it, `off` gap from the wall. */
  private slab(f: Face, len: number, h: number, d: number, mat: Material, y: number, off = 0, du = 0, parent: Object3D = this.S): Mesh {
    const x = f.cx + f.nx * (off + d / 2) + (f.alongX ? du : 0);
    const z = f.cz + f.nz * (off + d / 2) + (f.alongX ? 0 : du);
    return f.alongX ? box(len, h, d, mat, x, y, z, parent) : box(d, h, len, mat, x, y, z, parent);
  }

  /** Flat decal plane on a wall face (facing into the room). */
  private decal(f: Face, mat: Material, w: number, h: number, y: number, du = 0, off = 0.012): Mesh {
    const m = new Mesh(new PlaneGeometry(w, h), mat);
    m.position.set(f.cx + f.nx * off + (f.alongX ? du : 0), y, f.cz + f.nz * off + (f.alongX ? 0 : du));
    m.rotation.y = Math.atan2(f.nx, f.nz);
    this.S.add(m);
    return m;
  }

  /** Corner position (along coordinate c) on the wall of face f. */
  private corner(f: Face, c: number, out: number): [number, number] {
    return [f.alongX ? c : f.cx + f.nx * out, f.alongX ? f.cz + f.nz * out : c];
  }

  private roomsNamed(ids: string[]): Room[] {
    return this.lv.rooms.filter((r) => ids.includes(r.id));
  }

  // ------------------------------------------------------------------ freighter walls
  private shipWalls(): void {
    const W = worn!;
    for (const f of this.faces) {
      const id = f.room?.id ?? "";
      this.slab(f, 1, 0.85, 0.035, W.kick, 0.425);
      this.slab(f, 1, 0.12, 0.07, M.darkMetal, 0.06);
      this.slab(f, 1, 0.05, 0.06, M.steel, 0.875);
      this.slab(f, 1, 0.18, 0.13, M.darkMetal, H - 0.09);
      if (f.win) continue;
      if (id === "bridge") this.slab(f, 1, 0.03, 0.02, M.cyanGlow, 1.25);
      if (id === "eng") this.slab(f, 1, 0.025, 0.05, M.orangeGlow, 0.02, 0.08);
      if (id === "armory") this.slab(f, 1, 0.03, 0.02, M.redGlow, 1.25);
      const r = hash(f.cx * 7 + f.nx * 3, f.cz * 13 + f.nz * 5);
      if (r < 0.12) {
        this.slab(f, 0.6, 0.3, 0.02, M.vent, 0.45, 0.035);
        this.slab(f, 0.66, 0.36, 0.012, M.darkMetal, 0.45, 0.033);
      } else if (r > 0.93) {
        this.slab(f, 0.62, 0.82, 0.018, W.hatch, 1.6, 0);
        this.slab(f, 0.2, 0.04, 0.04, M.steel, 1.28, 0.018);
      }
      // structural ribs every 2 m
      const c = f.u + 0.5;
      if (c % 2 === 0) {
        const nb = this.next(f);
        if (nb && !nb.win) {
          const [px, pz] = this.corner(f, c, 0.06);
          box(f.alongX ? 0.24 : 0.12, H, f.alongX ? 0.12 : 0.24, W.rib, px, H / 2, pz, this.S);
          const [qx, qz] = this.corner(f, c, 0.125);
          box(f.alongX ? 0.1 : 0.012, H - 0.9, f.alongX ? 0.012 : 0.1, M.steel, qx, H / 2 + 0.1, qz, this.S);
        }
      }
    }
    // inner corner posts
    for (const f of this.faces) {
      if (f.nx === 0) continue;
      for (const dz of [-1, 1]) {
        const o = this.faceMap.get(this.key(f.fx + 0.5, dz > 0 ? f.fz + 1 : f.fz, 0, -dz));
        if (!o || o.win || f.win) continue;
        const px = f.cx + f.nx * 0.12;
        const pz = (dz > 0 ? f.fz + 1 : f.fz) - dz * 0.12;
        box(0.24, H, 0.24, W.rib, px, H / 2, pz, this.S);
      }
    }
  }

  private panelsAlong(r: Room, longX: boolean): number[] {
    const out: number[] = [];
    if (!r.lightI) return out;
    const w = r.x1 - r.x0 + 1;
    const d = r.z1 - r.z0 + 1;
    if (longX) {
      const n = Math.max(1, Math.round((r.x1 - r.x0) / 4));
      for (let i = 0; i < n; i++) out.push(r.x0 + ((i + 0.5) / n) * w);
    } else {
      const n = Math.max(1, Math.round((r.z1 - r.z0) / 5));
      for (let i = 0; i < n; i++) out.push(r.z0 + ((i + 0.5) / n) * d);
    }
    return out;
  }

  /** Ceiling light panel centres for a room (same layout as the level's lights). */
  private panels(r: Room): [number, number][] {
    const out: [number, number][] = [];
    if (!r.lightI) return out;
    const nx = Math.max(1, Math.round((r.x1 - r.x0) / 4));
    const nz = Math.max(1, Math.round((r.z1 - r.z0) / 5));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) out.push([r.x0 + ((i + 0.5) / nx) * (r.x1 - r.x0 + 1), r.z0 + ((j + 0.5) / nz) * (r.z1 - r.z0 + 1)]);
    return out;
  }

  private shipCeilings(extraSkip: string[] = []): void {
    const skip = ["c1", "c2", "airlock", "c_airlock", ...extraSkip];
    for (const r of this.lv.rooms) {
      if (skip.includes(r.id)) continue;
      const w = r.x1 - r.x0 + 1;
      const d = r.z1 - r.z0 + 1;
      const longX = w >= d;
      const along = this.panelsAlong(r, longX);
      const a0 = longX ? r.x0 : r.z0;
      const a1 = longX ? r.x1 + 1 : r.z1 + 1;
      const span = longX ? d : w;
      const mid = longX ? (r.z0 + r.z1 + 1) / 2 : (r.x0 + r.x1 + 1) / 2;
      for (let c = a0 + 1; c < a1; c += 2) {
        if (along.some((p) => Math.abs(p - c) < 0.9)) continue;
        if (longX) {
          box(0.2, 0.26, span, M.darkMetal, c, H - 0.13, mid, this.S);
          box(0.34, 0.04, span, M.darkMetal, c, H - 0.27, mid, this.S);
        } else {
          box(span, 0.26, 0.2, M.darkMetal, mid, H - 0.13, c, this.S);
          box(span, 0.04, 0.34, M.darkMetal, mid, H - 0.27, c, this.S);
        }
      }
      // caged light fittings
      for (const [px, pz] of this.panels(r)) {
        for (const s of [-1, 1]) box(1.34, 0.02, 0.02, M.darkMetal, px, H - 0.14, pz + s * 0.21, this.S);
        for (const ox of [-0.62, 0, 0.62]) {
          box(0.02, 0.02, 0.44, M.darkMetal, px + ox, H - 0.15, pz, this.S);
          for (const s of [-1, 1]) box(0.02, 0.12, 0.02, M.darkMetal, px + ox, H - 0.09, pz + s * 0.21, this.S);
        }
      }
    }
  }

  /** Which long wall of a room has the fewest openings (-1 = low side, 1 = high side). */
  private quietSide(r: Room, longX: boolean): number {
    const count = (s: number): number => {
      let n = 0;
      for (const f of this.faces) {
        if (f.room !== r || f.win) continue;
        if (longX && f.nz === -s) n++;
        if (!longX && f.nx === -s) n++;
      }
      return n;
    };
    return count(1) > count(-1) ? 1 : -1;
  }

  private pipeAlong(longX: boolean, a0: number, a1: number, wall: number, n: number, y: number, off: number, r: number, mat: Material, flanges = true): void {
    for (let a = a0; a < a1 - 0.01; a += 2) {
      const len = Math.min(2, a1 - a);
      const p = cyl(r, r, len, mat, longX ? a + len / 2 : wall + n * off, y, longX ? wall + n * off : a + len / 2, this.S, 10);
      if (longX) p.rotation.z = Math.PI / 2;
      else p.rotation.x = Math.PI / 2;
      if (flanges && a > a0) {
        const fl = cyl(r + 0.03, r + 0.03, 0.07, M.darkMetal, longX ? a : wall + n * off, y, longX ? wall + n * off : a, this.S, 10);
        if (longX) fl.rotation.z = Math.PI / 2;
        else fl.rotation.x = Math.PI / 2;
      }
    }
  }

  private shipPipes(): void {
    const rooms = this.roomsNamed(["armory", "conf", "bunk1", "bunk2", "bunk3", "bunk4", "cargo", "eng", "fuel1", "fuel2", "bridge"]);
    for (const r of rooms) {
      const w = r.x1 - r.x0 + 1;
      const d = r.z1 - r.z0 + 1;
      const longX = w >= d;
      const side = r.id === "bridge" ? 1 : this.quietSide(r, longX);
      const a0 = longX ? r.x0 : r.z0;
      const a1 = longX ? r.x1 + 1 : r.z1 + 1;
      const wall = longX ? (side < 0 ? r.z0 : r.z1 + 1) : side < 0 ? r.x0 : r.x1 + 1;
      const n = -side;
      const small = r.id.startsWith("bunk") || r.id === "bridge";
      this.pipeAlong(longX, a0, a1, wall, n, 3.1, 0.15, small ? 0.05 : 0.075, M.pipe);
      if (!small) this.pipeAlong(longX, a0, a1, wall, n, 3.26, 0.34, 0.058, M.pipe);
      this.pipeAlong(longX, a0, a1, wall, n, 3.22, 0.12, 0.025, M.cable, false);
      for (let a = a0 + 1; a < a1; a += 2) {
        const off = small ? 0.12 : 0.22;
        const dep = small ? 0.24 : 0.46;
        if (longX) box(0.05, 0.38, dep, M.darkMetal, a, 3.16, wall + n * off, this.S);
        else box(dep, 0.38, 0.05, M.darkMetal, wall + n * off, 3.16, a, this.S);
      }
      // cable tray down the middle of bigger rooms
      if (["conf", "armory", "fuel1", "fuel2"].includes(r.id)) {
        const trayAt = (longX ? (side < 0 ? r.z1 + 1 : r.z0) : side < 0 ? r.x1 + 1 : r.x0) + side * 1.1;
        for (let a = a0 + 0.2; a < a1 - 0.2; a += 2) {
          const len = Math.min(2, a1 - 0.2 - a) - 0.02;
          const c = a + len / 2;
          const [x, z] = longX ? [c, trayAt] : [trayAt, c];
          const [sx, sz] = longX ? [len, 0.45] : [0.45, len];
          box(sx, 0.03, sz, M.steel, x, H - 0.48, z, this.S);
          for (const s of [-1, 1]) {
            if (longX) box(len, 0.1, 0.02, M.steel, x, H - 0.43, z + s * 0.22, this.S);
            else box(0.02, 0.1, len, M.steel, x + s * 0.22, H - 0.43, z, this.S);
          }
          for (const k of [-0.1, 0, 0.1]) {
            const cb = cyl(0.028, 0.028, len, M.cable, longX ? x : x + k, H - 0.44, longX ? z + k : z, this.S, 6);
            if (longX) cb.rotation.z = Math.PI / 2;
            else cb.rotation.x = Math.PI / 2;
          }
          for (const s of [-1, 1]) cyl(0.012, 0.012, 0.45, M.darkMetal, longX ? a + 0.1 : x + s * 0.22, H - 0.23, longX ? z + s * 0.22 : a + 0.1, this.S, 4);
        }
      }
    }
  }

  // ------------------------------------------------------------------ doors (both styles)
  private doorFrames(): void {
    const lv = this.lv;
    for (const d of lv.doors) {
      const xs = d.cells.map((c) => c[0]);
      const zs = d.cells.map((c) => c[1]);
      const lo = d.alongX ? Math.min(...xs) : Math.min(...zs);
      const hi = (d.alongX ? Math.max(...xs) : Math.max(...zs)) + 1;
      const row = d.alongX ? zs[0] : xs[0];
      const len = hi - lo;
      const mid = (lo + hi) / 2;
      for (const s of [-1, 1]) {
        const plane = s < 0 ? row : row + 1;
        const cx = d.alongX ? d.cells[0][0] : row + s;
        const cz = d.alongX ? row + s : d.cells[0][1];
        if (lv.cell(cx, cz) !== FLOOR) continue;
        const at = (a: number, out: number): [number, number] => (d.alongX ? [a, plane + s * out] : [plane + s * out, a]);
        const B = (w: number, h: number, dep: number, mat: Material, a: number, y: number, out: number): void => {
          const [x, z] = at(a, out);
          if (d.alongX) box(w, h, dep, mat, x, y, z, this.S);
          else box(dep, h, w, mat, x, y, z, this.S);
        };
        const jamb = this.isClean ? clean!.white : M.hazard;
        for (const e of [lo - 0.1, hi + 0.1]) B(0.2, H - 0.45, 0.1, jamb, e, (H - 0.45) / 2, 0.05);
        B(len + 0.4, 0.45, 0.06, this.isClean ? clean!.white : M.darkMetal, mid, H - 0.225, 0.03);
        if (this.isClean) {
          B(len * 0.9, 0.03, 0.02, clean!.glow, mid, H - 0.47, 0.06);
          for (const e of [lo - 0.01, hi + 0.01]) B(0.03, H - 0.6, 0.03, clean!.glow, e, (H - 0.45) / 2, 0.1);
          B(len, 0.008, 0.06, clean!.glow, mid, 0.004, 0.45);
        } else {
          B(len + 0.4, 0.08, 0.07, M.hazard, mid, H - 0.49, 0.035);
          B(len, 0.012, 0.3, M.hazard, mid, 0.006, 0.4);
        }
      }
    }
  }

  // ------------------------------------------------------------------ freighter rooms
  private shipRooms(): void {
    const W = worn!;
    const lv = this.lv;
    // --- Bridge: heavy panoramic window frame, overhead screens
    box(0.34, 0.07, 9.2, M.darkMetal, 1.16, 0.935, 15.5, this.S);
    box(0.36, 0.3, 9.2, M.darkMetal, 1.17, 2.74, 15.5, this.S);
    box(0.04, 0.03, 9.0, M.cyanGlow, 1.33, 0.95, 15.5, this.S);
    for (const z of [11, 14, 17, 20]) box(0.3, 1.9, 0.14, M.darkMetal, 1.14, 1.75, z, this.S);
    let si = 0;
    for (const z of [12.4, 18.6]) {
      const scr = new MeshBasicMaterial({ map: screenTex("bov" + si++, "#6fe8ff") });
      rbox(0.1, 0.66, 1.26, M.darkMetal, 3.35, 2.72, z, this.S, 0.02);
      const p = new Mesh(new PlaneGeometry(1.14, 0.56), scr);
      p.position.set(3.41, 2.72, z);
      p.rotation.y = Math.PI / 2;
      this.S.add(p);
      for (const s of [-1, 1]) cyl(0.015, 0.015, 0.36, M.darkMetal, 3.35, 3.22, z + s * 0.45, this.S, 5);
    }
    // --- Cargo Hull: crane rails, gantry, hook, netting, tie-down rings, floor paint
    for (const x of [49.3, 55.7]) {
      for (let z = 7; z < 24; z += 2) box(0.22, 0.3, Math.min(2, 24 - z) - 0.01, W.yellow, x, H - 0.2, z + Math.min(2, 24 - z) / 2, this.S);
      box(0.5, 0.3, 0.8, W.yellow, x, H - 0.48, 15.5, this.S);
    }
    box(6.9, 0.34, 0.36, W.yellow, 52.5, H - 0.56, 15.5, this.S);
    box(6.9, 0.04, 0.5, M.darkMetal, 52.5, H - 0.75, 15.5, this.S);
    const hook = new Group();
    hook.position.set(52.5, H - 0.8, 15.5);
    box(0.7, 0.3, 0.6, M.darkMetal, 0, 0.05, 0, hook);
    cyl(0.018, 0.018, 0.9, M.cable, -0.08, -0.5, 0, hook, 5);
    cyl(0.018, 0.018, 0.9, M.cable, 0.08, -0.5, 0, hook, 5);
    const block = new Group();
    block.position.y = -1.0;
    hook.add(block);
    rbox(0.32, 0.26, 0.2, W.yellow, 0, 0, 0, block, 0.04);
    const h = new Mesh(new TorusGeometry(0.11, 0.03, 6, 14, Math.PI * 1.5), M.steel);
    h.position.y = -0.25;
    h.rotation.z = Math.PI * 0.75;
    block.add(h);
    lv.addProp(hook, 52.5, 15.5, 0, undefined, true);
    lv.animated.push({ update: (t) => ((hook.rotation.x = Math.sin(t * 0.7) * 0.025), (block.rotation.z = Math.sin(t * 0.9 + 1) * 0.08)) });
    // cargo netting over sacks on the north wall
    for (const [x, w, hh] of [[52.1, 0.9, 0.7], [53.2, 1.0, 0.95], [54.1, 0.7, 0.55]]) rbox(w, hh, 0.32, M.fabricGrey, x, hh / 2, 7.2, this.S, 0.08);
    const net = new Mesh(new PlaneGeometry(3, 1.4), W.net);
    net.position.set(53.1, 0.72, 7.4);
    this.S.add(net);
    for (const x of [51.6, 54.6]) box(0.06, 1.5, 0.03, M.fabricGreen, x, 0.75, 7.38, this.S);
    box(3.1, 0.05, 0.05, M.darkMetal, 53.1, 1.45, 7.36, this.S);
    for (const x of [49.5, 51.5, 53.5, 55.5])
      for (const z of [9.5, 13.5, 17.5, 21.5]) {
        box(0.24, 0.01, 0.24, M.darkMetal, x, 0.005, z, this.S);
        const ring = new Mesh(new TorusGeometry(0.07, 0.014, 5, 12), M.steel);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, 0.02, z);
        this.S.add(ring);
      }
    for (const x of [48.45, 56.55]) box(0.09, 0.006, 16.6, W.paint, x, 0.004, 15.5, this.S);
    for (const z of [7.45, 23.55]) box(8.1, 0.006, 0.09, W.paint, 52.5, 0.004, z, this.S);
    // --- Engineering: coolant pipes from the reactor, wall fans, steam
    const tube = (pts: [number, number, number][], r: number, mat: Material = M.pipe): void => {
      const curve = new CatmullRomCurve3(pts.map(([x, y, z]) => new Vector3(x, y, z)));
      this.S.add(new Mesh(new TubeGeometry(curve, 32, r, 8, false), mat));
    };
    tube([[62, 3.05, 14.4], [62.3, 3.24, 12.8], [63.8, 3.22, 11.3], [64.72, 2.9, 11.0], [64.78, 1.6, 11.0], [64.78, 0.1, 11.0]], 0.14);
    tube([[62, 3.05, 16.6], [62.3, 3.24, 18.2], [63.8, 3.22, 19.7], [64.72, 2.9, 20.0], [64.78, 1.6, 20.0], [64.78, 0.1, 20.0]], 0.14);
    tube([[61.2, 3.1, 15.5], [60.2, 3.28, 15.3], [59, 3.3, 14.2], [58.4, 3.28, 12.6], [58.2, 3.3, 11]], 0.1);
    for (const z of [11.0, 20.0]) {
      for (const y of [0.35, 1.6, 2.6]) {
        const b = cyl(0.17, 0.17, 0.06, M.darkMetal, 64.78, y, z, this.S, 10);
        void b;
      }
      box(0.3, 0.14, 0.3, M.darkMetal, 64.8, 0.07, z, this.S);
      lv.steamSpots.push({ p: new Vector3(64.55, 0.35, z + 0.35), n: new Vector3(-1, 0.4, 0.2) });
    }
    for (const [x, z, n] of [[60.3, 9, 1], [62.1, 9, 1], [60.3, 22, -1], [62.1, 22, -1]] as const) this.fan(x, 2.35, z, 0, n);
    // --- Bunks: privacy curtains drawn back to the head of each bed
    for (const [x, z, blue] of [[33, 8.1, false], [37.5, 8.5, false], [41, 8.5, true], [45.5, 8.5, true], [33, 22.9, false], [37.5, 21.8, false], [41, 21.8, true], [45.5, 21.8, true]] as const) {
      const room = lv.roomAt(x, z)!;
      const side = Math.sign((room.x0 + room.x1 + 1) / 2 - x) || 1;
      const head = z < 15 ? -1 : 1;
      const cx = x + side * 0.54;
      box(0.03, 0.03, 2.0, M.steel, cx, 1.98, z, this.S);
      for (let i = 0; i < 4; i++) {
        const fold = box(0.05, 1.6, 0.2, blue ? M.fabricBlue : M.fabricGreen, cx + (i % 2 ? 0.03 : -0.02), 1.17, z + head * (0.95 - i * 0.17), this.S);
        fold.rotation.y = (i % 2 ? 1 : -1) * 0.35;
      }
    }
  }

  /** A spinning extractor fan set into a wall (normal along z). */
  private fan(x: number, y: number, z: number, nx: number, nz: number): void {
    const g = new Group();
    rbox(0.95, 0.95, 0.14, M.darkMetal, 0, 0, 0.07, g, 0.04);
    const disc = cyl(0.4, 0.4, 0.02, worn!.recess, 0, 0, 0.145, g, 18);
    disc.rotation.x = Math.PI / 2;
    const rotor = new Group();
    rotor.position.z = 0.17;
    g.add(rotor);
    for (let i = 0; i < 5; i++) {
      const b = box(0.36, 0.1, 0.015, M.steel, 0, 0, 0, undefined);
      const arm = new Group();
      b.position.x = 0.2;
      b.rotation.x = 0.4;
      arm.add(b);
      arm.rotation.z = (i / 5) * Math.PI * 2;
      rotor.add(arm);
    }
    cyl(0.07, 0.07, 0.06, M.darkMetal, 0, 0, 0.18, g, 10).rotation.x = Math.PI / 2;
    for (let i = -2; i <= 2; i++) box(0.84, 0.018, 0.02, M.darkMetal, 0, i * 0.17, 0.22, g);
    g.rotation.y = Math.atan2(nx, nz);
    g.position.y = y;
    this.lv.addProp(g, x, z, Math.atan2(nx, nz), undefined, true);
    const sp = 5 + hash(x * 10, z * 10) * 3;
    this.lv.animated.push({ update: (t) => (rotor.rotation.z = t * sp) });
  }

  private shipStencils(): void {
    const put = (roomId: string, text: string, want: [number, number], nx: number, nz: number, arrowTo?: [number, number], y = 2.3): void => {
      let best: Face | null = null;
      let bd = Infinity;
      for (const f of this.faces) {
        if (f.room?.id !== roomId || f.nx !== nx || f.nz !== nz || f.win) continue;
        const c = f.u + 0.5;
        if (c % 2 === 0) continue; // centred between ribs
        const nb = this.next(f);
        if (!nb || nb.win) continue;
        const [px, pz] = this.corner(f, c, 0);
        const dd = Math.hypot(px - want[0], pz - want[1]);
        if (dd < bd) {
          bd = dd;
          best = f;
        }
      }
      if (!best) return;
      this.stencilled.add(best);
      const nb2 = this.next(best);
      if (nb2) this.stencilled.add(nb2);
      let arrow = 0;
      if (arrowTo) {
        const [px, pz] = this.corner(best, best.u + 0.5, 0);
        const rx = best.nz;
        const rz = -best.nx;
        arrow = (arrowTo[0] - px) * rx + (arrowTo[1] - pz) * rz > 0 ? 1 : -1;
      }
      const mat = new MeshStandardMaterial({ map: wallStencilTex(text, arrow), transparent: true, depthWrite: false, roughness: 0.8, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
      this.decal(best, mat, 1.7, 0.32, y, 0.5, 0.015);
    };
    const R = (id: string): Room => this.lv.rooms.find((r) => r.id === id)!;
    const mid = (id: string): [number, number] => {
      const r = R(id);
      return [(r.x0 + r.x1 + 1) / 2, (r.z0 + r.z1 + 1) / 2];
    };
    const names: [string, string][] = [
      ["bridge", "BRIDGE"], ["life", "LIFE SUPPORT"], ["armory", "ARMORY"], ["conf", "BRIEFING"], ["bunk1", "BUNK 1"], ["bunk2", "BUNK 2"],
      ["bunk3", "BUNK 3"], ["bunk4", "BUNK 4"], ["cargo", "CARGO HULL"], ["eng", "ENGINEERING"], ["fuel1", "FUEL TANK 1"], ["fuel2", "FUEL TANK 2"],
    ];
    for (const [id, text] of names) {
      const r = R(id);
      const longX = r.x1 - r.x0 >= r.z1 - r.z0;
      const side = this.quietSide(r, longX);
      // the long wall opposite the pipes
      const nx = longX ? 0 : side;
      const nz = longX ? side : 0;
      put(id, text, mid(id), nx, nz);
    }
    put("fcorr", "BRIDGE", [12, 17], 0, -1, mid("bridge"), 1.9);
    put("fcorr", "ENGINEERING", [18, 14], 0, 1, mid("eng"), 1.9);
    put("lcorr", "CARGO HULL", [41, 13], 0, 1, mid("cargo"), 1.9);
    put("lcorr", "BRIEFING", [39, 17], 0, -1, mid("conf"), 1.9);
    put("conf", "QUARTERS", [30, 11], -1, 0, mid("lcorr"), 1.9);
    put("cargo", "ENGINEERING", [57, 18], -1, 0, mid("eng"), 1.9);
  }

  /** Red robot cabling crawling over walls and ceilings in the rooms they've taken over. */
  private alienGrowth(rooms: [string, number][] = [["eng", 7], ["cargo", 5], ["lcorr", 4], ["bridge", 4], ["conf", 2]], relayNest = true): void {
    const rnd = rng(97);
    for (const [id, n] of rooms) {
      const fs = this.faces.filter((f) => f.room?.id === id && !f.win);
      for (let i = 0; i < n && fs.length; i++) {
        const f = fs[Math.floor(rnd() * fs.length)];
        const t = f.alongX ? [1, 0] : [0, 1];
        const w = (): number => (rnd() - 0.5) * 0.5;
        const b = (k: number, out: number, y: number): Vector3 => new Vector3(f.cx + t[0] * k + f.nx * out, y, f.cz + t[1] * k + f.nz * out);
        const reach = 1.4 + rnd() * 2.2;
        // under a glass dome there is no ceiling to crawl across: run along the top of the wall instead
        const domed = (this.lv.def.domes ?? []).includes(id);
        const pts = domed
          ? [b(w(), 0.07, 0.02), b(w(), 0.1, 1.1), b(w(), 0.12, 2.3), b(w(), 0.12, H - 0.35), b(w() + reach * 0.5, 0.12, H - 0.3 - rnd() * 0.2), b(w() + reach, 0.1, H - 0.45)]
          : [b(w(), 0.07, 0.02), b(w(), 0.1, 1.1), b(w(), 0.14, 2.3), b(w(), 0.2, H - 0.1), b(w() * 2, reach * 0.5, H - 0.3 - rnd() * 0.4), b(w() * 3, reach, H - 0.05)];
        this.S.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.03 + rnd() * 0.03, 5, false), M.alienCable));
      }
    }
    // a nest of cables feeding the control relay
    if (!relayNest) return;
    const rp = this.lv.relayPos;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pts = [
        new Vector3(rp.x + 0.1, 1.2, rp.z + Math.sin(a) * 0.2),
        new Vector3(rp.x - 0.2 + Math.cos(a) * 0.3, 2.2, rp.z + Math.sin(a) * 0.6),
        new Vector3(rp.x - 0.6 + Math.cos(a) * 0.8, 3.1, rp.z + Math.sin(a) * 1.6),
        new Vector3(rp.x - 1.2 + Math.cos(a) * 1.4, H - 0.04, rp.z + Math.sin(a) * 2.8),
      ];
      this.S.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 20, 0.04, 5, false), M.alienCable));
    }
  }

  /** Wall panels torn open by the robots, crackling with sparks. */
  private brokenPanels(want: string[] = ["lcorr", "cargo", "fcorr", "conf", "bunk3", "life"]): void {
    const W = worn!;
    for (const id of want) {
      const fs = this.faces.filter((f) => f.room?.id === id && !f.win && (f.u + 0.5) % 2 !== 0 && this.next(f) && !this.stencilled.has(f) && !this.stencilled.has(this.next(f)!));
      if (!fs.length) continue;
      const f = fs[Math.floor(hash(id.length * 31, id.charCodeAt(0) * 7) * fs.length)];
      const du = 0.5;
      this.slab(f, 0.72, 0.84, 0.01, W.recess, 1.95, 0.004, du);
      const hinge = new Group();
      const [hx, hz] = this.corner(f, f.u + 0.5, 0.03);
      hinge.position.set(hx, 1.53, hz);
      hinge.rotation.y = Math.atan2(f.nx, f.nz);
      const p = box(0.7, 0.82, 0.025, W.kick, 0, 0.41, 0, hinge);
      void p;
      hinge.rotateX(0.55);
      this.S.add(hinge);
      for (const [k, m] of [[-0.15, M.orangeGlow], [0.12, M.redGlow]] as const) {
        const [x, z] = this.corner(f, f.u + 0.5 + k, 0.05);
        const c = cyl(0.012, 0.012, 0.6, m, x, 1.95, z, this.S, 4);
        c.rotation.z = (k > 0 ? 1 : -1) * 0.5 * (f.alongX ? 1 : 0);
        c.rotation.x = (k > 0 ? 1 : -1) * 0.5 * (f.alongX ? 0 : 1);
      }
      const [sx, sz] = this.corner(f, f.u + 0.5, 0.12);
      this.lv.sparkSpots.push({ p: new Vector3(sx, 2.15, sz), n: new Vector3(f.nx, -0.3, f.nz) });
    }
  }

  // ------------------------------------------------------------------ academy
  private academyWalls(): void {
    const C = clean!;
    for (const f of this.faces) {
      const id = f.room?.id ?? "";
      const dark = id === "t_dark";
      const white = dark ? C.dark : C.white;
      this.slab(f, 1, 0.85, 0.03, dark ? C.dark : C.band, 0.425);
      this.slab(f, 1, 0.04, 0.035, dark ? C.dark : C.trim, 0.87);
      this.slab(f, 1, 0.03, 0.035, dark ? M.redGlow : C.glow, 0.03, 0.005);
      this.slab(f, 1, 0.14, 0.16, white, H - 0.07);
      if (!dark) this.slab(f, 1, 0.02, 0.12, id === "t_ability" || id === "t_maze" || id === "t_arena" ? C.glowWarm : C.glow, H - 0.15, 0.02);
      if (f.win) continue;
      if (!dark) this.slab(f, 1, 0.022, 0.018, C.glow, 1.14, 0);
      const c = f.u + 0.5;
      if (c % 2 === 0) {
        const nb = this.next(f);
        if (nb && !nb.win) {
          const [px, pz] = this.corner(f, c, 0.0175);
          box(f.alongX ? 0.34 : 0.035, H - 0.14, f.alongX ? 0.035 : 0.34, white, px, (H - 0.14) / 2, pz, this.S);
        }
      }
      if (hash(f.cx * 5 + f.nx, f.cz * 11 + f.nz) < 0.1) this.slab(f, 0.5, 0.22, 0.01, M.vent, 0.4, 0.03);
    }
  }

  private academyCeilings(): void {
    const C = clean!;
    for (const r of this.lv.rooms) {
      if (r.id === "t_duct") continue;
      const w = r.x1 - r.x0 + 1;
      const d = r.z1 - r.z0 + 1;
      const xc = (r.x0 + r.x1 + 1) / 2;
      const zc = (r.z0 + r.z1 + 1) / 2;
      if (r.id === "t_dark") {
        // the blacked-out breaker room keeps a dark ceiling so the flashlight lesson stays dark
        box(w, 0.01, d, C.dark, xc, H - 0.006, zc, this.S);
        for (let x = r.x0 + 2; x < r.x1 + 1; x += 2) box(0.12, 0.2, d, C.dark, x, H - 0.1, zc, this.S);
        continue;
      }
      for (let x = r.x0 + 2; x < r.x1 + 1; x += 2) box(0.07, 0.05, d, C.white, x, H - 0.025, zc, this.S);
      for (let z = r.z0 + 2; z < r.z1 + 1; z += 2) box(w, 0.05, 0.07, C.white, xc, H - 0.025, z, this.S);
      const pan = this.panels(r);
      for (let x = r.x0 + 1; x < r.x1; x += 4)
        for (let z = r.z0 + 1; z < r.z1; z += 4) {
          if (pan.some(([px, pz]) => Math.abs(px - (x + 1)) < 1.2 && Math.abs(pz - (z + 1)) < 0.8)) continue;
          box(0.8, 0.02, 0.8, M.vent, x + 1, H - 0.012, z + 1, this.S);
          box(0.9, 0.03, 0.9, C.trim, x + 1, H - 0.006, z + 1, this.S);
        }
      // recessed light troughs in the wide rooms
      if (Math.min(w, d) >= 5 && r.light) {
        const longX = w >= d;
        for (const s of [-1, 1]) {
          const off = (Math.min(w, d) / 4) * s;
          if (longX) {
            box(w - 1.2, 0.012, 0.16, C.glow, xc, H - 0.008, zc + off, this.S);
            box(w - 1.1, 0.03, 0.24, C.trim, xc, H - 0.004, zc + off, this.S);
          } else {
            box(0.16, 0.012, d - 1.2, C.glow, xc + off, H - 0.008, zc, this.S);
            box(0.24, 0.03, d - 1.1, C.trim, xc + off, H - 0.004, zc, this.S);
          }
        }
      }
    }
  }

  private academyRooms(): void {
    const C = clean!;
    const lv = this.lv;
    // --- Locker Room: name plates, kit bags, floor crest
    const names = ["RECRUIT 01", "BRUTUS", "HALE", "CLOYA", "DAX", "RECRUIT 06", "INSTRUCTOR", "SPARE"];
    const [cv, g] = this.canvas(1024, 64);
    names.forEach((n, i) => {
      const x = i * 128;
      g.fillStyle = "#d9e2ea";
      g.fillRect(x + 12, 10, 104, 44);
      g.fillStyle = "#1f3346";
      g.font = "bold 20px Consolas, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(n, x + 64, 33, 96);
    });
    const plates = new Mesh(new PlaneGeometry(0.66 * 8, 0.33), new MeshBasicMaterial({ map: this.tex(cv), transparent: true, alphaTest: 0.1 }));
    plates.position.set(2.6 + 3.5 * 0.66, 1.78, 10.44);
    plates.rotation.y = Math.PI;
    this.S.add(plates);
    for (const [x, z, r, m] of [[4.3, 4.9, 0.4, M.fabricGreen], [7.1, 3.6, -0.2, M.fabricBlue], [3.2, 9.4, 1.2, M.fabricGrey]] as const) {
      const bag = new Group();
      rbox(0.7, 0.3, 0.34, m, 0, 0.15, 0, bag, 0.13);
      box(0.4, 0.04, 0.05, M.leather, 0, 0.31, 0, bag);
      bag.rotation.y = r;
      bag.position.set(x, 0, z);
      this.S.add(bag);
    }
    const [cc, cg] = this.canvas(1024, 256);
    cg.strokeStyle = "rgba(90,200,255,0.55)";
    cg.lineWidth = 6;
    cg.strokeRect(10, 10, 1004, 236);
    cg.fillStyle = "rgba(90,200,255,0.6)";
    cg.font = "bold 120px Impact, 'Arial Black', sans-serif";
    cg.textAlign = "center";
    cg.textBaseline = "middle";
    cg.fillText("STAR-TECH ACADEMY", 512, 132);
    const crest = new Mesh(new PlaneGeometry(4.4, 1.1), new MeshStandardMaterial({ map: this.tex(cc), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }));
    crest.rotation.x = -Math.PI / 2;
    crest.position.set(5.9, 0.006, 7.2);
    this.S.add(crest);
    // --- Movement course: lane lines
    for (const z of [5.6, 8.4]) box(22.8, 0.006, 0.06, C.glow, 22.7, 0.005, z, this.S);
    // --- Firing Range: acoustic foam behind the targets, score boards
    for (let z = 2; z < 13; z += 1) box(0.08, 1.3, 0.98, C.foam, 63.96, 0.75, z + 0.5, this.S);
    for (const z of [3.8, 11.2]) {
      const [sc, sg] = this.canvas(512, 256);
      sg.fillStyle = "#031424";
      sg.fillRect(0, 0, 512, 256);
      sg.fillStyle = "#6fe8ff";
      sg.font = "bold 34px Consolas, monospace";
      sg.fillText(z < 7 ? "RANGE SCORES" : "TARGET STATUS", 24, 46);
      sg.font = "24px Consolas, monospace";
      const rows = z < 7 ? ["LANE 1  HALE    98%", "LANE 2  DAX     91%", "LANE 3  CLOYA   88%", "LANE 4  BRUTUS  79%"] : ["DRONES   ONLINE", "EYE CRIT  x2", "SAFETY   ON", "LIVE AMMO  NO"];
      rows.forEach((l, i) => sg.fillText(l, 24, 100 + i * 38));
      sg.strokeStyle = "#6fe8ff";
      sg.lineWidth = 4;
      sg.strokeRect(6, 6, 500, 244);
      rbox(0.08, 1.02, 1.84, C.dark, 63.94, 2.2, z, this.S, 0.02);
      const p = new Mesh(new PlaneGeometry(1.72, 0.9), new MeshBasicMaterial({ map: this.tex(sc) }));
      p.position.set(63.89, 2.2, z);
      p.rotation.y = -Math.PI / 2;
      this.S.add(p);
    }
    // --- Hacking Station: server racks with blinking lights
    const racks: [number, number, number][] = [[45.42, 26.45, Math.PI / 2], [45.42, 27.45, Math.PI / 2], [50.58, 26.45, -Math.PI / 2], [50.58, 27.45, -Math.PI / 2]];
    const leds = [C.ledA, C.ledB, C.ledC];
    racks.forEach(([x, z, r], i) => {
      const g2 = new Group();
      rbox(0.9, 2.2, 0.7, C.dark, 0, 1.1, 0, g2, 0.02);
      for (let k = 0; k < 9; k++) {
        box(0.8, 0.16, 0.02, M.vent, 0, 0.3 + k * 0.2, 0.355, g2);
        for (let j = 0; j < 3; j++) box(0.03, 0.03, 0.02, leds[(k + j + i) % 3], 0.28 + j * 0.05, 0.3 + k * 0.2, 0.37, g2);
      }
      lv.addProp(g2, x, z, r, { w: 0.9, d: 0.7, h: 2.2 });
    });
    lv.animated.push({
      update: (t) => {
        C.ledA.emissiveIntensity = Math.sin(t * 9) > 0 ? 2.4 : 0.3;
        C.ledB.emissiveIntensity = Math.sin(t * 5.3 + 1) > -0.3 ? 2 : 0.2;
        C.ledC.emissiveIntensity = Math.sin(t * 13.7 + 2) > 0.5 ? 2.4 : 0.2;
      },
    });
    // --- Exam Arena: observation booth with instructors watching
    rbox(6.4, 1.3, 0.2, C.white, 18, 2.65, 18.92, this.S, 0.05);
    const booth = new Mesh(new PlaneGeometry(6, 1.0), new MeshBasicMaterial({ map: boothTex() }));
    booth.position.set(18, 2.65, 18.8);
    booth.rotation.y = Math.PI;
    this.S.add(booth);
    const glass = new Mesh(new PlaneGeometry(6, 1.0), new MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 1, depthWrite: false }));
    glass.position.set(18, 2.65, 18.76);
    glass.rotation.y = Math.PI;
    this.S.add(glass);
    box(6.3, 0.06, 0.2, C.trim, 18, 2.12, 18.86, this.S);
    box(6.0, 0.02, 0.02, C.glow, 18, 2.1, 18.76, this.S);
    for (const x of [16, 20]) box(0.06, 1.0, 0.06, C.trim, x, 2.65, 18.77, this.S);
    // painted arena boundary
    for (const z of [12.5, 18.5]) box(27.4, 0.006, 0.08, M.hazard, 16.5, 0.005, z, this.S);
    for (const x of [2.5, 30.5]) box(0.08, 0.006, 6, M.hazard, x, 0.005, 15.5, this.S);
  }

  private canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return [c, c.getContext("2d")!];
  }

  private tex(c: HTMLCanvasElement): CanvasTexture {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  // ------------------------------------------------------------------ dust in the air
  private dust(): void {
    const rooms = this.lv.rooms.filter((r) => r.lightI > 0 || r.id === "t_dark");
    const area = rooms.reduce((a, r) => a + (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1), 0);
    const N = 1600;
    const rnd = rng(this.isClean ? 5 : 11);
    const base = new Float32Array(N * 3);
    const phase = new Float32Array(N);
    let k = 0;
    for (const r of rooms) {
      const n = Math.round((N * (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1)) / area);
      for (let i = 0; i < n && k < N; i++, k++) {
        base[k * 3] = r.x0 + rnd() * (r.x1 - r.x0 + 1);
        base[k * 3 + 1] = 0.2 + rnd() * (H - 0.4);
        base[k * 3 + 2] = r.z0 + rnd() * (r.z1 - r.z0 + 1);
        phase[k] = rnd() * 100;
      }
    }
    const pos = new Float32Array(k * 3);
    pos.set(base.subarray(0, k * 3));
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    const mat = new PointsMaterial({
      color: this.isClean ? 0xdff4ff : 0xffe2b0,
      size: this.isClean ? 0.022 : 0.03,
      map: glowSpriteTex(),
      transparent: true,
      opacity: this.isClean ? 0.3 : 0.5,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    this.lv.group.add(pts);
    const attr = geo.getAttribute("position") as Float32BufferAttribute;
    const arr = attr.array as Float32Array;
    this.lv.animated.push({
      update: (t) => {
        for (let i = 0; i < k; i++) {
          const ph = phase[i];
          arr[i * 3] = base[i * 3] + Math.sin(t * 0.13 + ph) * 0.35;
          arr[i * 3 + 1] = 0.2 + ((base[i * 3 + 1] - 0.2 + t * 0.04 + ph) % (H - 0.4));
          arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.11 + ph * 1.3) * 0.35;
        }
        attr.needsUpdate = true;
      },
    });
  }
}
