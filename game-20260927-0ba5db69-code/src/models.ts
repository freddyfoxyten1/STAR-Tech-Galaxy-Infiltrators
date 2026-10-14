import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Texture,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  armourTex,
  barrelTex,
  bumpOf,
  crateFaceTex,
  emblemTex,
  fabricTex,
  gaugeTex,
  hazardTex,
  hullTex,
  keyboardTex,
  labelTex,
  lockerTex,
  panelTex,
  screenTex,
  woodTex,
  wornMetalTex,
} from "./textures";

// ================================================================ materials
function pbr(map: Texture | null, o: { color?: number; rough?: number; metal?: number; bump?: number; emissive?: number; ei?: number; side?: typeof DoubleSide } = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color: o.color ?? 0xffffff,
    roughness: o.rough ?? 0.6,
    metalness: o.metal ?? 0.3,
    map: map ?? undefined,
  });
  if (map && o.bump !== 0) {
    m.bumpMap = bumpOf(map);
    m.bumpScale = o.bump ?? 1.2;
  }
  if (o.emissive !== undefined) {
    m.emissive.setHex(o.emissive);
    m.emissiveIntensity = o.ei ?? 1;
  }
  if (o.side) m.side = o.side;
  return m;
}

const glow = (c: number, e: number, i = 2.2): MeshStandardMaterial => new MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: i, roughness: 0.4 });

export const M = {
  // robots
  gunmetal: pbr(wornMetalTex("robotA", "#80868d", { cols: 2, rows: 2, rust: 5 }), { color: 0xc4c9ce, metal: 0.8, rough: 0.42, bump: 1.6 }),
  darkMetal: pbr(wornMetalTex("robotD", "#3d4147", { cols: 2, rows: 3, rust: 3 }), { color: 0xb0b4b8, metal: 0.8, rough: 0.5, bump: 1.4 }),
  paleMetal: pbr(wornMetalTex("robotP", "#aeb3b8", { cols: 1, rows: 2, rust: 3 }), { color: 0xd8dce0, metal: 0.65, rough: 0.4, bump: 1.4 }),
  chrome: new MeshStandardMaterial({ color: 0xd6dade, metalness: 1, roughness: 0.18 }),
  blade: new MeshStandardMaterial({ color: 0xdfe3e7, metalness: 1, roughness: 0.12 }),
  vent: pbr(panelTex("vent", "#1c1e21", "#050505", 1, 6), { color: 0xffffff, metal: 0.6, rough: 0.6, bump: 2 }),
  // heroes
  armor: pbr(armourTex("heroA", "#1d231f"), { color: 0xffffff, metal: 0.55, rough: 0.32, bump: 0.8 }),
  armorLight: pbr(armourTex("heroB", "#2c352f"), { color: 0xffffff, metal: 0.5, rough: 0.38, bump: 0.8 }),
  suit: pbr(fabricTex("suit", "#15191a"), { color: 0xffffff, metal: 0.05, rough: 0.9, bump: 1 }),
  pouch: pbr(fabricTex("pouch", "#3a4130"), { color: 0xffffff, metal: 0.05, rough: 0.85, bump: 1.4 }),
  rubber: new MeshStandardMaterial({ color: 0x131416, roughness: 0.85, metalness: 0.1 }),
  visor: new MeshStandardMaterial({ color: 0xe0a820, metalness: 1, roughness: 0.1, emissive: 0x6a4400, emissiveIntensity: 0.5 }),
  // glows
  greenGlow: glow(0x3cff7a, 0x2cff6a),
  cyanGlow: glow(0x55e6ff, 0x35d6ff),
  redGlow: glow(0xff3a2a, 0xff2010, 2.5),
  orangeGlow: glow(0xffa040, 0xff7a10),
  // weapons
  gunBlack: pbr(wornMetalTex("gunB", "#1f2124", { cols: 1, rows: 1, bolts: false, size: 256 }), { color: 0xffffff, metal: 0.65, rough: 0.42, bump: 0.6 }),
  gunGrey: pbr(wornMetalTex("gunG", "#4d5156", { cols: 1, rows: 1, bolts: false, size: 256 }), { color: 0xffffff, metal: 0.75, rough: 0.38, bump: 0.6 }),
  polymer: new MeshStandardMaterial({ color: 0x2a2e2a, roughness: 0.7, metalness: 0.1 }),
  // vehicles / props
  olive: pbr(hullTex("ste"), { color: 0xffffff, metal: 0.45, rough: 0.55, bump: 1.5 }),
  oliveDark: pbr(wornMetalTex("oliveD", "#3f4434", { cols: 2, rows: 2 }), { color: 0xffffff, metal: 0.5, rough: 0.55, bump: 1.4 }),
  glass: new MeshStandardMaterial({ color: 0x0e2430, metalness: 1, roughness: 0.04, emissive: 0x06202c, emissiveIntensity: 0.6 }),
  crateGreen: pbr(crateFaceTex("green", "#56613f", "STAR-TECH", "SUPPLY · 40KG"), { color: 0xffffff, metal: 0.25, rough: 0.7, bump: 1.6 }),
  crateTan: pbr(crateFaceTex("tan", "#8d7a52", "AMMO", "CAL. 7.2 PULSE"), { color: 0xffffff, metal: 0.2, rough: 0.72, bump: 1.6 }),
  crateGrey: pbr(crateFaceTex("grey", "#5a6068", "PARTS", "FRAGILE · HANDLE"), { color: 0xffffff, metal: 0.45, rough: 0.6, bump: 1.6 }),
  barrelRed: pbr(barrelTex("red", "#7b2a20"), { color: 0xffffff, metal: 0.5, rough: 0.5, bump: 1.4 }),
  barrelYel: pbr(barrelTex("yel", "#b08a1c"), { color: 0xffffff, metal: 0.5, rough: 0.5, bump: 1.4 }),
  wood: pbr(woodTex(), { color: 0xffffff, metal: 0.05, rough: 0.35, bump: 0.8 }),
  fabricGreen: pbr(fabricTex("green", "#3f5a3a"), { color: 0xffffff, metal: 0, rough: 0.95, bump: 1.2 }),
  fabricBlue: pbr(fabricTex("blue", "#34466a"), { color: 0xffffff, metal: 0, rough: 0.95, bump: 1.2 }),
  fabricGrey: pbr(fabricTex("grey", "#8a8f90"), { color: 0xffffff, metal: 0, rough: 0.95, bump: 1.2 }),
  leather: pbr(fabricTex("leather", "#22262e"), { color: 0xffffff, metal: 0.1, rough: 0.55, bump: 0.8 }),
  white: pbr(wornMetalTex("white", "#d6dadd", { cols: 1, rows: 2 }), { color: 0xffffff, metal: 0.25, rough: 0.45, bump: 1 }),
  hazard: pbr(hazardTex(), { color: 0xffffff, metal: 0.3, rough: 0.6, bump: 0.6 }),
  pipe: pbr(wornMetalTex("pipe", "#6f5a45", { cols: 1, rows: 1, rust: 8, bolts: false, size: 256 }), { color: 0xffffff, metal: 0.7, rough: 0.5, bump: 0.8 }),
  steel: pbr(wornMetalTex("steel", "#7c8187", { cols: 2, rows: 2, rust: 2 }), { color: 0xffffff, metal: 0.75, rough: 0.4, bump: 1.2 }),
  cable: new MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.7, metalness: 0.2 }),
  alienCable: new MeshStandardMaterial({ color: 0x3a0c0c, emissive: 0x900000, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.3, side: DoubleSide }),
  gauge: new MeshStandardMaterial({ map: gaugeTex(), roughness: 0.3, metalness: 0.1 }),
  // legacy aliases
  gunmetalLegacy: new MeshStandardMaterial({ color: 0x6b7178 }),
  armorPlain: new MeshStandardMaterial({ color: 0x252b27 }),
};

// ================================================================ geometry helpers
const geoCache = new Map<string, BufferGeometry>();
function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function box(w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0, parent?: Object3D): Mesh {
  const m = new Mesh(cached(`b${r3(w)},${r3(h)},${r3(d)}`, () => new BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}
/** Rounded (bevelled) box: the single biggest help for a realistic, machined look. */
export function rbox(w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0, parent?: Object3D, r?: number): Mesh {
  const rad = Math.min(r ?? Math.min(w, h, d) * 0.18, Math.min(w, h, d) * 0.49);
  const m = new Mesh(cached(`rb${r3(w)},${r3(h)},${r3(d)},${r3(rad)}`, () => new RoundedBoxGeometry(w, h, d, 2, rad)), mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}
export function cyl(rt: number, rb: number, h: number, mat: Material, x = 0, y = 0, z = 0, parent?: Object3D, seg = 16): Mesh {
  const m = new Mesh(cached(`c${r3(rt)},${r3(rb)},${r3(h)},${seg}`, () => new CylinderGeometry(rt, rb, h, seg)), mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}
export function sphere(r: number, mat: Material, x = 0, y = 0, z = 0, parent?: Object3D, seg = 16): Mesh {
  const m = new Mesh(cached(`s${r3(r)},${seg}`, () => new SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.75)))), mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}
function capsule(r: number, len: number, mat: Material, parent?: Object3D): Mesh {
  const m = new Mesh(cached(`cap${r3(r)},${r3(len)}`, () => new CapsuleGeometry(r, len, 4, 12)), mat);
  parent?.add(m);
  return m;
}
function torus(r: number, t: number, mat: Material, parent?: Object3D, arc = Math.PI * 2): Mesh {
  const m = new Mesh(cached(`t${r3(r)},${r3(t)},${r3(arc)}`, () => new TorusGeometry(r, t, 8, 24, arc)), mat);
  parent?.add(m);
  return m;
}
function lathe(key: string, pts: [number, number][], mat: Material, parent?: Object3D, seg = 24): Mesh {
  const m = new Mesh(cached(`l${key}`, () => new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg)), mat);
  parent?.add(m);
  return m;
}
function pivot(parent: Object3D, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
const UP = new Vector3(0, 1, 0);
/** Cylinder spanning two points (struts, pistons, limbs). */
function span(a: Vector3, b: Vector3, r: number, mat: Material, parent: Object3D, seg = 10, rb = r): Mesh {
  const len = a.distanceTo(b);
  const m = new Mesh(cached(`sp${r3(r)},${r3(rb)},${r3(len)},${seg}`, () => new CylinderGeometry(r, rb, len, seg)), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  parent.add(m);
  return m;
}
/** Capsule limb between two points. */
function limbSeg(a: Vector3, b: Vector3, r: number, mat: Material, parent: Object3D): Mesh {
  const len = Math.max(0.001, a.distanceTo(b) - r * 2 + r * 0.6);
  const m = capsule(r, len, mat, parent);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  return m;
}
function piston(parent: Object3D, a: Vector3, b: Vector3, r: number): void {
  const mid = a.clone().lerp(b, 0.55);
  span(a, mid, r * 1.5, M.darkMetal, parent, 10);
  span(mid, b, r * 0.8, M.chrome, parent, 8);
}
function cable(parent: Object3D, pts: [number, number, number][], r = 0.022, mat: Material = M.cable): void {
  const curve = new CatmullRomCurve3(pts.map(([x, y, z]) => new Vector3(x, y, z)));
  parent.add(new Mesh(new TubeGeometry(curve, 14, r, 5, false), mat));
}
function decal(tex: Texture, w: number, h: number, parent: Object3D, x: number, y: number, z: number, ry = 0, emissive = 0): Mesh {
  const mat = new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, metalness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  if (emissive) {
    mat.emissive.setHex(emissive);
    mat.emissiveMap = tex;
    mat.emissiveIntensity = 0.9;
  }
  const m = new Mesh(cached(`pl${r3(w)},${r3(h)}`, () => new PlaneGeometry(w, h)), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

/**
 * Merge static meshes that share a material inside each group into one mesh.
 * Groups (animated pivots) are kept; `keep` meshes stay separate. Huge draw-call saver.
 */
export function compact(root: Object3D, keep: Set<Object3D> = new Set()): void {
  const visit = (node: Object3D): void => {
    const groups = new Map<Material, Mesh[]>();
    for (const ch of [...node.children]) {
      const m = ch as Mesh;
      if (m.isMesh && ch.children.length === 0 && !keep.has(ch) && !Array.isArray(m.material) && !(m.material as Material).transparent) {
        let list = groups.get(m.material as Material);
        if (!list) groups.set(m.material as Material, (list = []));
        list.push(m);
      } else visit(ch);
    }
    for (const [mat, list] of groups) {
      if (list.length < 2) continue;
      const geos: BufferGeometry[] = [];
      for (const m of list) {
        m.updateMatrix();
        const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        const g = new BufferGeometry();
        g.setAttribute("position", src.getAttribute("position"));
        g.setAttribute("normal", src.getAttribute("normal") ?? src.getAttribute("position"));
        const uv = src.getAttribute("uv");
        g.setAttribute("uv", uv ?? new Float32BufferAttribute(new Float32Array(src.getAttribute("position").count * 2), 2));
        g.applyMatrix4(m.matrix);
        geos.push(g);
      }
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      for (const m of list) node.remove(m);
      node.add(new Mesh(merged, mat));
    }
  };
  visit(root);
}

// ================================================================ robots
export type RobotKind = "drone" | "sentinel" | "ripper" | "bulwark" | "warlord";

export interface RobotRig {
  root: Group;
  body: Group;
  hipL: Group;
  hipR: Group;
  kneeL?: Group;
  kneeR?: Group;
  reverseKnee?: boolean;
  armL: Group;
  armR: Group;
  aim: number;
  eyeMat: MeshStandardMaterial;
  eye: Mesh;
  muzzles: Object3D[];
  spinners: Object3D[];
  height: number;
  eyeHeight: number;
  radius: number;
  scrapMats: Material[];
}

function newEye(parent: Object3D, r: number, x: number, y: number, z: number): [Mesh, MeshStandardMaterial] {
  const mat = new MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2010, emissiveIntensity: 2.5 });
  const socket = cyl(r * 1.6, r * 1.9, r * 0.9, M.darkMetal, x, y, z - r * 0.35, parent, 16);
  socket.rotation.x = Math.PI / 2;
  const ring = torus(r * 1.35, r * 0.18, M.chrome, parent);
  ring.position.set(x, y, z + r * 0.05);
  // armoured brow over the eye
  rbox(r * 4, r * 0.7, r * 1.6, M.gunmetal, x, y + r * 1.7, z - r * 0.2, parent);
  const eye = sphere(r, mat, x, y, z, parent, 16);
  eye.scale.z = 0.6;
  return [eye, mat];
}

function antennaCluster(parent: Object3D, x: number, y: number, z: number, n: number, h: number, lean = -0.18): void {
  for (let i = 0; i < n; i++) {
    const hh = h * (0.6 + (i % 3) * 0.25);
    const ox = x + (i - (n - 1) / 2) * 0.04;
    const a = new Vector3(ox, y, z + (i % 2) * 0.03);
    const b = new Vector3(ox + (i - (n - 1) / 2) * 0.03, y + hh, z + lean * hh);
    span(a, b, 0.009, M.darkMetal, parent, 5, 0.014);
    cyl(0.018, 0.018, 0.035, M.darkMetal, ox, y + 0.02, a.z, parent, 6);
    if (i % 2 === 0) sphere(0.016, M.redGlow, b.x, b.y, b.z, parent, 6);
  }
}

interface LegOut {
  hip: Group;
  knee: Group;
}

/** Armoured mech leg. Normal knees bend backward; reverse (digitigrade) legs bend forward. */
function mechLeg(body: Group, side: number, spread: number, thigh: number, shin: number, t: number, reverse: boolean): LegOut {
  const footH = t * 0.45;
  const hipY = thigh + shin + footH;
  const hip = pivot(body, side * spread, hipY, 0);
  // hip actuator
  const axle = cyl(t * 0.55, t * 0.55, t * 1.2, M.darkMetal, 0, 0, 0, hip, 14);
  axle.rotation.z = Math.PI / 2;
  cyl(t * 0.3, t * 0.3, t * 1.35, M.chrome, 0, 0, 0, hip, 10).rotation.z = Math.PI / 2;
  let knee: Group;
  if (!reverse) {
    rbox(t, thigh, t * 1.15, M.darkMetal, 0, -thigh / 2, 0, hip);
    const plate = rbox(t * 1.25, thigh * 0.85, t * 0.35, M.gunmetal, side * t * 0.05, -thigh * 0.48, t * 0.62, hip);
    plate.rotation.x = -0.08;
    rbox(t * 0.35, thigh * 0.7, t * 1.0, M.gunmetal, side * t * 0.62, -thigh * 0.5, 0, hip);
    piston(hip, new Vector3(0, -t * 0.4, -t * 0.62), new Vector3(0, -thigh + t * 0.2, -t * 0.62), t * 0.14);
    knee = pivot(hip, 0, -thigh, 0);
    const kj = cyl(t * 0.5, t * 0.5, t * 1.1, M.darkMetal, 0, 0, 0, knee, 14);
    kj.rotation.z = Math.PI / 2;
    rbox(t * 1.05, t * 0.8, t * 0.5, M.gunmetal, 0, t * 0.05, t * 0.55, knee);
    rbox(t * 0.85, shin, t * 0.95, M.darkMetal, 0, -shin / 2, -t * 0.05, knee);
    const guard = rbox(t * 1.2, shin * 0.8, t * 0.4, M.gunmetal, 0, -shin * 0.45, t * 0.52, knee);
    guard.rotation.x = 0.06;
    piston(knee, new Vector3(0, -t * 0.3, -t * 0.55), new Vector3(0, -shin + t * 0.3, -t * 0.55), t * 0.12);
    cable(knee, [[side * t * 0.45, 0, -t * 0.3], [side * t * 0.55, -shin * 0.4, -t * 0.4], [side * t * 0.4, -shin * 0.9, -t * 0.2]], t * 0.07);
    const ankle = pivot(knee, 0, -shin, 0);
    sphere(t * 0.42, M.darkMetal, 0, 0, 0, ankle, 12);
    rbox(t * 1.4, footH, t * 2.4, M.gunmetal, 0, -footH / 2, t * 0.35, ankle);
    rbox(t * 1.5, footH * 0.5, t * 0.8, M.darkMetal, 0, -footH * 0.75, t * 1.45, ankle);
    rbox(t * 1.2, footH * 0.6, t * 0.6, M.darkMetal, 0, -footH * 0.7, -t * 0.7, ankle);
  } else {
    const th = rbox(t, thigh, t * 1.2, M.darkMetal, 0, -thigh / 2, t * 0.45, hip);
    th.rotation.x = 0.55;
    const tp = rbox(t * 1.3, thigh * 0.8, t * 0.35, M.gunmetal, 0, -thigh * 0.45, t * 0.95, hip);
    tp.rotation.x = 0.55;
    knee = pivot(hip, 0, -thigh * 0.86, thigh * 0.5);
    const kj = cyl(t * 0.55, t * 0.55, t * 1.2, M.darkMetal, 0, 0, 0, knee, 14);
    kj.rotation.z = Math.PI / 2;
    rbox(t * 1.1, t * 0.9, t * 0.6, M.gunmetal, 0, 0.02, t * 0.5, knee);
    const sh = rbox(t * 0.9, shin * 1.08, t * 1.0, M.darkMetal, 0, -shin * 0.45, -shin * 0.27, knee);
    sh.rotation.x = -0.55;
    piston(knee, new Vector3(0, -t * 0.2, t * 0.35), new Vector3(0, -shin * 0.85, -shin * 0.35), t * 0.14);
    const ankle = pivot(knee, 0, -shin * 0.92, -shin * 0.5);
    sphere(t * 0.45, M.darkMetal, 0, 0, 0, ankle, 12);
    rbox(t * 1.7, footH, t * 2.6, M.gunmetal, 0, -footH * 0.4, t * 0.5, ankle);
    for (const s of [-1, 0, 1]) rbox(t * 0.45, footH * 0.6, t * 0.9, M.darkMetal, s * t * 0.55, -footH * 0.6, t * 1.9, ankle);
    rbox(t * 0.6, footH * 0.6, t * 0.9, M.darkMetal, 0, -footH * 0.6, -t * 0.9, ankle);
  }
  return { hip, knee };
}

/** Hunched mech torso with ribbed faceplate head, number plate, chest eye, vents and antennas. */
function mechTorso(body: Group, w: number, h: number, d: number, y: number, num: string): [Mesh, MeshStandardMaterial] {
  // pelvis + waist
  rbox(w * 0.62, h * 0.3, d * 0.7, M.darkMetal, 0, y - h * 0.68, 0, body);
  cyl(w * 0.2, w * 0.24, h * 0.3, M.chrome, 0, y - h * 0.45, 0, body, 14);
  for (let i = 0; i < 3; i++) rbox(w * (0.5 - i * 0.04), h * 0.09, d * 0.62, M.darkMetal, 0, y - h * 0.52 + i * h * 0.1, d * 0.03, body);
  const upper = pivot(body, 0, y, 0);
  upper.rotation.x = 0.1; // hunched forward
  // main chest block
  rbox(w, h, d, M.gunmetal, 0, 0, 0, upper, Math.min(w, h, d) * 0.12);
  // V chest plates
  for (const s of [-1, 1]) {
    const p = rbox(w * 0.54, h * 0.82, d * 0.16, M.gunmetal, s * w * 0.24, -h * 0.02, d * 0.52, upper);
    p.rotation.y = -s * 0.28;
    rbox(w * 0.1, h * 0.5, d * 0.1, M.darkMetal, s * w * 0.44, -h * 0.05, d * 0.46, upper);
  }
  // unit plate (e.g. "V1.5"): a wide stamped plate so the version number fits
  const plateMat = new MeshStandardMaterial({ map: labelTex(num, "#1c1f22", "#a2a8ae", 256, 152, `bold ${plateFont(num)}px Impact, Arial Black, sans-serif`), metalness: 0.55, roughness: 0.45 });
  plateMat.bumpMap = bumpOf(plateMat.map!);
  plateMat.bumpScale = 2;
  const plate = new Mesh(cached(`plt${r3(w)}`, () => new PlaneGeometry(w * 0.44, w * 0.26)), plateMat);
  plate.position.set(0, -h * 0.12, d * 0.62);
  upper.add(plate);
  rbox(w * 0.48, w * 0.3, d * 0.06, M.darkMetal, 0, -h * 0.12, d * 0.58, upper);
  // shoulder yoke
  rbox(w * 1.12, h * 0.16, d * 0.9, M.darkMetal, 0, h * 0.48, -d * 0.05, upper);
  // head / sensor block with ribbed faceplate
  const head = pivot(upper, 0, h * 0.62, d * 0.22);
  rbox(w * 0.42, h * 0.42, d * 0.62, M.gunmetal, 0, 0, 0, head);
  for (let i = 0; i < 5; i++) rbox(w * 0.36, h * 0.035, d * 0.08, M.darkMetal, 0, h * 0.14 - i * h * 0.065, d * 0.32, head);
  box(w * 0.3, h * 0.03, 0.01, M.redGlow, 0, h * 0.2, d * 0.35, head);
  rbox(w * 0.46, h * 0.08, d * 0.66, M.darkMetal, 0, h * 0.22, 0, head);
  for (const s of [-1, 1]) rbox(w * 0.08, h * 0.3, d * 0.5, M.darkMetal, s * w * 0.24, 0, -d * 0.02, head);
  // back pack: vents + exhausts
  rbox(w * 0.7, h * 0.7, d * 0.4, M.darkMetal, 0, h * 0.05, -d * 0.62, upper);
  for (const s of [-1, 1]) {
    const ex = cyl(w * 0.07, w * 0.09, h * 0.45, M.darkMetal, s * w * 0.18, h * 0.35, -d * 0.82, upper, 12);
    ex.rotation.x = -0.25;
    cyl(w * 0.05, w * 0.05, 0.02, M.vent, s * w * 0.18, h * 0.58, -d * 0.88, upper, 12);
  }
  rbox(w * 0.5, h * 0.3, 0.03, M.vent, 0, -h * 0.1, -d * 0.83, upper);
  // antenna clusters
  antennaCluster(upper, -w * 0.32, h * 0.56, -d * 0.35, 4, h * 0.9);
  antennaCluster(upper, w * 0.32, h * 0.56, -d * 0.35, 4, h * 0.9);
  antennaCluster(head, 0, h * 0.26, -d * 0.1, 3, h * 0.6);
  // cables from back to shoulders
  for (const s of [-1, 1]) cable(upper, [[s * w * 0.3, h * 0.2, -d * 0.7], [s * w * 0.55, h * 0.45, -d * 0.55], [s * w * 0.6, h * 0.3, -d * 0.1]], w * 0.03);
  // the eye sits below the number plate on the chest
  return newEye(upper, w * 0.075, 0, -h * 0.42, d * 0.55);
}

function shoulder(arm: Group, side: number, s: number): void {
  const j = sphere(0.2 * s, M.darkMetal, 0, 0, 0, arm, 14);
  void j;
  const paul = rbox(0.42 * s, 0.34 * s, 0.5 * s, M.gunmetal, side * 0.1 * s, 0.12 * s, 0, arm);
  paul.rotation.z = -side * 0.25;
  rbox(0.44 * s, 0.06 * s, 0.52 * s, M.darkMetal, side * 0.1 * s, 0.3 * s, 0, arm).rotation.z = -side * 0.25;
  rbox(0.08 * s, 0.2 * s, 0.3 * s, M.redGlow, side * 0.3 * s, 0.1 * s, 0.1 * s, arm).scale.set(0.2, 0.2, 1);
}

/** Font size (px, on a 256-wide plate texture) that fits a unit number like "V1.5" or "V1.20". */
function plateFont(txt: string): number {
  return txt.length >= 5 ? 88 : 104;
}

/** Unit plate (e.g. "V1.1") in the same stamped style as the Ripper and Bulwark; `size` is its height. */
function botPlate(parent: Object3D, txt: string, size: number, x: number, y: number, z: number): void {
  const mat = new MeshStandardMaterial({ map: labelTex(txt, "#1c1f22", "#a2a8ae", 256, 152, `bold ${plateFont(txt)}px Impact, Arial Black, sans-serif`), metalness: 0.55, roughness: 0.45 });
  mat.bumpMap = bumpOf(mat.map!);
  mat.bumpScale = 2;
  const w = size * 1.69;
  const p = new Mesh(cached(`bplt${r3(size)}`, () => new PlaneGeometry(w, size)), mat);
  p.position.set(x, y, z);
  parent.add(p);
  rbox(w + size * 0.14, size * 1.14, 0.03, M.darkMetal, x, y, z - 0.018, parent);
}

/**
 * Scout Drone: a lean recon walker from the same armoured mech family as the Ripper.
 * Bird-like reverse-jointed legs, pale armour over a dark frame, a camera-pod sensor head
 * carrying the eye, twin wrist blasters, and a comms mast + radar dish for raising the alarm.
 */
function drone(): RobotRig {
  const root = new Group();
  const body = pivot(root, 0, 0, 0);
  const legs = [mechLeg(body, -1, 0.19, 0.42, 0.46, 0.145, true), mechLeg(body, 1, 0.19, 0.42, 0.46, 0.145, true)];
  // the angled legs reach less far than their length, so drop the hips onto the feet
  for (const l of legs) l.hip.position.y -= 0.1;
  // pelvis, waist and hip armour
  rbox(0.46, 0.17, 0.32, M.darkMetal, 0, 0.82, 0, body, 0.03);
  for (const s of [-1, 1]) {
    const hp = rbox(0.12, 0.24, 0.3, M.paleMetal, s * 0.29, 0.8, 0.02, body, 0.03);
    hp.rotation.z = s * 0.15;
  }
  cyl(0.09, 0.1, 0.2, M.chrome, 0, 0.97, 0, body, 12);
  for (let i = 0; i < 2; i++) rbox(0.36 - i * 0.04, 0.06, 0.26, M.darkMetal, 0, 0.94 + i * 0.07, 0.01, body, 0.015);
  // forward-leaning chest: pale armour plates over a dark frame
  const chest = rbox(0.6, 0.44, 0.42, M.gunmetal, 0, 1.22, 0.02, body, 0.06);
  chest.rotation.x = 0.12;
  for (const s of [-1, 1]) {
    const p = rbox(0.3, 0.38, 0.07, M.paleMetal, s * 0.15, 1.23, 0.23, body, 0.03);
    p.rotation.y = -s * 0.3;
    p.rotation.x = 0.12;
    rbox(0.06, 0.32, 0.06, M.darkMetal, s * 0.29, 1.2, 0.19, body, 0.01);
    box(0.012, 0.2, 0.012, M.redGlow, s * 0.255, 1.2, 0.23, body);
  }
  botPlate(body, "V1.1", 0.13, 0, 1.13, 0.27);
  rbox(0.7, 0.09, 0.4, M.darkMetal, 0, 1.46, -0.02, body, 0.03);
  // back: comms pack, radar dish, tall antenna mast
  rbox(0.4, 0.36, 0.2, M.darkMetal, 0, 1.24, -0.29, body, 0.04);
  rbox(0.28, 0.2, 0.02, M.vent, 0, 1.24, -0.395, body);
  for (const s of [-1, 1]) cyl(0.035, 0.045, 0.2, M.darkMetal, s * 0.12, 1.43, -0.3, body, 10);
  cyl(0.012, 0.018, 0.62, M.darkMetal, 0.1, 1.72, -0.3, body, 6);
  sphere(0.025, M.redGlow, 0.1, 2.04, -0.3, body, 8);
  for (let i = 0; i < 3; i++) box(0.12 - i * 0.03, 0.012, 0.012, M.darkMetal, 0.1, 1.82 + i * 0.07, -0.3, body);
  const dish = new Mesh(cached("scoutDish", () => new SphereGeometry(0.11, 14, 6, 0, Math.PI * 2, 0, 1.1)), M.paleMetal);
  dish.position.set(-0.13, 1.56, -0.34);
  dish.rotation.set(-0.9, 0, 0.3);
  body.add(dish);
  cyl(0.012, 0.012, 0.1, M.darkMetal, -0.13, 1.5, -0.33, body, 6);
  antennaCluster(body, -0.02, 1.5, -0.24, 3, 0.2, -0.3);
  // neck and camera-pod sensor head
  cyl(0.05, 0.06, 0.12, M.chrome, 0, 1.54, 0.02, body, 8);
  rbox(0.36, 0.24, 0.38, M.gunmetal, 0, 1.66, 0.04, body, 0.08);
  for (const s of [-1, 1]) {
    const fin = rbox(0.045, 0.2, 0.34, M.paleMetal, s * 0.2, 1.67, 0.02, body, 0.015);
    fin.rotation.z = -s * 0.12;
    sphere(0.02, M.redGlow, s * 0.12, 1.73, 0.235, body, 6);
  }
  rbox(0.32, 0.05, 0.34, M.darkMetal, 0, 1.79, 0.03, body, 0.015);
  for (let i = 0; i < 3; i++) rbox(0.24, 0.014, 0.03, M.darkMetal, 0, 1.6 - i * 0.035, 0.23, body);
  const [eye, eyeMat] = newEye(body, 0.058, 0, 1.68, 0.245);
  // light arms with twin wrist blasters (forearms angle down at rest and come level in combat)
  const armL = pivot(body, -0.4, 1.38, 0);
  const armR = pivot(body, 0.4, 1.38, 0);
  const muzzles: Object3D[] = [];
  for (const [arm, s] of [[armL, -1], [armR, 1]] as const) {
    shoulder(arm, s, 0.64);
    rbox(0.12, 0.3, 0.13, M.darkMetal, s * 0.02, -0.17, 0, arm, 0.02);
    rbox(0.07, 0.2, 0.14, M.paleMetal, s * 0.08, -0.17, 0, arm, 0.015);
    const elbow = pivot(arm, s * 0.02, -0.32, 0);
    elbow.rotation.x = 0.6;
    sphere(0.07, M.gunmetal, 0, 0, 0, elbow, 10);
    rbox(0.16, 0.15, 0.38, M.gunmetal, 0, 0, 0.16, elbow, 0.03);
    rbox(0.17, 0.05, 0.28, M.paleMetal, 0, 0.09, 0.15, elbow, 0.012);
    rbox(0.1, 0.06, 0.12, M.vent, 0, -0.08, 0.12, elbow, 0.01);
    for (const bx of [-0.03, 0.03]) {
      const b = cyl(0.026, 0.03, 0.22, M.darkMetal, bx, -0.01, 0.43, elbow, 8);
      b.rotation.x = Math.PI / 2;
      const tip = cyl(0.018, 0.018, 0.01, M.redGlow, bx, -0.01, 0.545, elbow, 8);
      tip.rotation.x = Math.PI / 2;
    }
    const muzzle = new Object3D();
    muzzle.position.set(0, -0.01, 0.56);
    elbow.add(muzzle);
    muzzles.push(muzzle);
    cable(body, [[s * 0.14, 1.3, -0.36], [s * 0.44, 1.2, -0.14], [s * 0.42, 1.02, 0.06]], 0.014);
  }
  return {
    root, body, hipL: legs[0].hip, hipR: legs[1].hip, kneeL: legs[0].knee, kneeR: legs[1].knee, reverseKnee: true, armL, armR, aim: -0.6, eye, eyeMat, muzzles,
    spinners: [], height: 1.95, eyeHeight: 1.25, radius: 0.37, scrapMats: [M.paleMetal, M.darkMetal, M.gunmetal],
  };
}

/**
 * Blade Sentinel: an armoured guardian that hovers on a whirling ring of scythe blades.
 * Heavy chest with glowing ribs, a crested knight's helm, big shoulder guards and two long
 * sword-blades held forward that sweep sideways when it slashes.
 */
function sentinel(): RobotRig {
  const root = new Group();
  const body = pivot(root, 0, 0.12, 0);
  // hover core: squat armoured dome with a glowing underside
  lathe("sentCore", [[0, 0.26], [0.3, 0.28], [0.4, 0.42], [0.38, 0.6], [0.24, 0.72], [0, 0.74]], M.darkMetal, body, 24);
  const underGlow = torus(0.26, 0.035, M.redGlow, body);
  underGlow.rotation.x = Math.PI / 2;
  underGlow.position.y = 0.27;
  cyl(0.16, 0.2, 0.06, M.redGlow, 0, 0.25, 0, body, 16);
  // outer ring: scythe blades (spins one way)
  const hipL = pivot(body, 0, 0.5, 0);
  const rim = torus(0.6, 0.035, M.gunmetal, hipL);
  rim.rotation.x = Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const g = new Group();
    g.rotation.y = a;
    hipL.add(g);
    rbox(0.32, 0.05, 0.06, M.darkMetal, 0.45, 0, 0, g, 0.01);
    const bl = rbox(0.04, 0.09, 0.46, M.blade, 0.62, -0.08, 0.1, g, 0.01);
    bl.rotation.set(0.35, 0.5, 0);
    const spike = new Mesh(cached("spike", () => new ConeGeometry(0.05, 0.36, 4)), M.blade);
    spike.position.set(0.7, -0.12, 0.3);
    spike.rotation.set(Math.PI / 2, 0, 0);
    g.add(spike);
  }
  // inner ring: turbine vanes with glowing slits (spins the other way)
  const hipR = pivot(body, 0, 0.4, 0);
  for (let i = 0; i < 6; i++) {
    const g = new Group();
    g.rotation.y = (i / 6) * Math.PI * 2;
    hipR.add(g);
    const v = rbox(0.06, 0.2, 0.2, M.gunmetal, 0.4, 0, 0, g, 0.02);
    v.rotation.x = 0.5;
    box(0.065, 0.12, 0.02, M.redGlow, 0.4, 0, 0.08, g).rotation.x = 0.5;
  }
  // fixed shroud over the rings
  lathe("sentShroud", [[0.2, 0.76], [0.5, 0.66], [0.56, 0.7], [0.36, 0.86], [0.14, 0.9]], M.gunmetal, body, 24);
  // gyro column and segmented abdomen
  cyl(0.16, 0.2, 0.3, M.chrome, 0, 0.98, 0, body, 14);
  for (let i = 0; i < 3; i++) rbox(0.56 - i * 0.05, 0.08, 0.4, M.darkMetal, 0, 0.9 + i * 0.1, 0.02, body, 0.025);
  for (const s of [-1, 1]) piston(body, new Vector3(s * 0.3, 0.78, 0.1), new Vector3(s * 0.28, 1.14, 0.08), 0.025);
  // armoured skirt plates hanging from the shroud
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const sk = rbox(0.24, 0.16, 0.05, M.gunmetal, Math.sin(a) * 0.5, 0.66, Math.cos(a) * 0.5, body, 0.015);
    sk.rotation.set(-0.45, a, 0, "YXZ");
  }
  // armoured chest with glowing ribs
  rbox(0.84, 0.58, 0.52, M.gunmetal, 0, 1.37, 0, body, 0.07);
  for (const s of [-1, 1]) {
    const p = rbox(0.38, 0.5, 0.08, M.gunmetal, s * 0.19, 1.36, 0.27, body, 0.03);
    p.rotation.y = -s * 0.25;
    rbox(0.1, 0.46, 0.08, M.darkMetal, s * 0.38, 1.34, 0.21, body, 0.02);
  }
  for (const x of [-0.12, 0, 0.12]) rbox(0.06, 0.34, 0.05, M.darkMetal, x, 1.44, 0.32, body, 0.015);
  for (const x of [-0.06, 0.06]) box(0.015, 0.28, 0.015, M.redGlow, x, 1.44, 0.34, body);
  // mounted over the chest ribs (lower down, the eye's armoured brow would hide it)
  botPlate(body, "V1.5", 0.14, 0, 1.47, 0.372);
  rbox(0.9, 0.12, 0.54, M.darkMetal, 0, 1.66, -0.02, body, 0.04);
  const [eye, eyeMat] = newEye(body, 0.07, 0, 1.13, 0.3);
  // back: power core with glowing vents and exhaust stacks
  rbox(0.5, 0.46, 0.22, M.darkMetal, 0, 1.36, -0.33, body, 0.04);
  for (let i = 0; i < 3; i++) box(0.34, 0.03, 0.02, M.redGlow, 0, 1.24 + i * 0.1, -0.445, body);
  for (const s of [-1, 1]) {
    const ex = cyl(0.05, 0.065, 0.36, M.darkMetal, s * 0.16, 1.7, -0.36, body, 10);
    ex.rotation.x = -0.2;
  }
  antennaCluster(body, 0.28, 1.72, -0.3, 3, 0.3, -0.25);
  // crested knight's helm with a T-visor
  cyl(0.06, 0.07, 0.1, M.chrome, 0, 1.76, 0.02, body, 10);
  rbox(0.3, 0.3, 0.32, M.gunmetal, 0, 1.92, 0.03, body, 0.07);
  for (const s of [-1, 1]) {
    const ch = rbox(0.06, 0.22, 0.24, M.darkMetal, s * 0.16, 1.88, 0.05, body, 0.02);
    ch.rotation.y = s * 0.2;
  }
  box(0.2, 0.03, 0.02, M.redGlow, 0, 1.95, 0.195, body);
  box(0.03, 0.12, 0.02, M.redGlow, 0, 1.88, 0.195, body);
  const crest = rbox(0.03, 0.2, 0.42, M.blade, 0, 2.1, -0.02, body, 0.01);
  crest.rotation.x = -0.15;
  // heavy arms ending in long sword-blades held forward
  const armL = pivot(body, -0.5, 1.52, 0);
  const armR = pivot(body, 0.5, 1.52, 0);
  for (const [arm, s] of [[armL, -1], [armR, 1]] as const) {
    shoulder(arm, s, 0.9);
    rbox(0.16, 0.34, 0.16, M.darkMetal, s * 0.04, -0.22, 0, arm, 0.03);
    piston(arm, new Vector3(s * 0.08, -0.05, -0.08), new Vector3(s * 0.08, -0.36, -0.06), 0.02);
    const fore = pivot(arm, s * 0.04, -0.4, 0);
    fore.rotation.y = s * -0.18;
    sphere(0.09, M.darkMetal, 0, 0, 0, fore, 12);
    rbox(0.18, 0.18, 0.42, M.gunmetal, 0, -0.02, 0.18, fore, 0.04);
    rbox(0.2, 0.06, 0.34, M.darkMetal, 0, 0.1, 0.18, fore, 0.02);
    box(0.012, 0.012, 0.3, M.redGlow, s * 0.095, 0, 0.18, fore);
    rbox(0.1, 0.22, 0.12, M.darkMetal, 0, -0.02, 0.42, fore, 0.02);
    // the sword: broad blade, a glowing edge, serrations and a tapered point
    const sword = new Group();
    sword.position.set(0, -0.02, 0.46);
    sword.rotation.x = 0.12;
    fore.add(sword);
    rbox(0.035, 0.15, 0.9, M.blade, 0, 0, 0.45, sword, 0.01);
    box(0.04, 0.02, 0.86, M.redGlow, 0, -0.078, 0.45, sword);
    for (let i = 0; i < 6; i++) {
      const t = rbox(0.03, 0.05, 0.05, M.blade, 0, 0.09, 0.12 + i * 0.13, sword, 0.005);
      t.rotation.x = 0.7;
    }
    const tip = new Mesh(cached("swordTip", () => new ConeGeometry(0.085, 0.3, 4)), M.blade);
    tip.scale.set(0.3, 1, 1);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0, 1.04);
    sword.add(tip);
  }
  return { root, body, hipL, hipR, armL, armR, aim: 0, eye, eyeMat, muzzles: [eye], spinners: [hipL, hipR], height: 2.3, eyeHeight: 1.3, radius: 0.55, scrapMats: [M.gunmetal, M.darkMetal, M.blade] };
}

function ripper(): RobotRig {
  const root = new Group();
  const body = pivot(root, 0, 0, 0);
  const L = mechLeg(body, -1, 0.26, 0.5, 0.46, 0.2, false);
  const R = mechLeg(body, 1, 0.26, 0.5, 0.46, 0.2, false);
  const [eye, eyeMat] = mechTorso(body, 0.9, 0.7, 0.58, 1.6, "V1.10");
  const spinners: Object3D[] = [];
  const armL = pivot(body, -0.58, 1.86, 0);
  const armR = pivot(body, 0.58, 1.86, 0);
  for (const [arm, s] of [[armL, -1], [armR, 1]] as const) {
    shoulder(arm, s, 1);
    rbox(0.2, 0.46, 0.22, M.darkMetal, s * 0.1, -0.32, 0, arm);
    rbox(0.24, 0.3, 0.12, M.gunmetal, s * 0.12, -0.3, 0.12, arm);
    piston(arm, new Vector3(s * 0.2, -0.05, -0.1), new Vector3(s * 0.18, -0.55, -0.08), 0.03);
    const elbow = pivot(arm, s * 0.1, -0.6, 0.02);
    cyl(0.1, 0.1, 0.24, M.darkMetal, 0, 0, 0, elbow, 12).rotation.z = Math.PI / 2;
    rbox(0.24, 0.32, 0.26, M.gunmetal, 0, -0.2, 0, elbow);
    cyl(0.15, 0.13, 0.18, M.darkMetal, 0, -0.42, 0, elbow, 16);
    const drill = pivot(elbow, 0, -0.5, 0);
    // threaded drill bit
    const pts: [number, number][] = [[0, -1.05]];
    for (let i = 0; i <= 14; i++) {
      const y = -1.0 + i * 0.07;
      const rr = 0.02 + (i / 14) * 0.12;
      pts.push([rr * (i % 2 ? 0.8 : 1.12), y]);
    }
    pts.push([0.13, 0], [0, 0]);
    lathe("drill", pts, M.blade, drill, 12);
    torus(0.14, 0.025, M.darkMetal, drill).rotation.x = Math.PI / 2;
    cable(elbow, [[s * 0.12, -0.05, -0.1], [s * 0.18, -0.25, -0.14], [s * 0.1, -0.42, -0.1]], 0.02);
    spinners.push(drill);
  }
  return { root, body, hipL: L.hip, hipR: R.hip, kneeL: L.knee, kneeR: R.knee, armL, armR, aim: -1.1, eye, eyeMat, muzzles: [eye], spinners, height: 2.5, eyeHeight: 1.35, radius: 0.55, scrapMats: [M.gunmetal, M.darkMetal, M.blade] };
}

function bulwark(): RobotRig {
  const root = new Group();
  const body = pivot(root, 0, 0, 0);
  const L = mechLeg(body, -1, 0.36, 0.46, 0.44, 0.26, false);
  const R = mechLeg(body, 1, 0.36, 0.46, 0.44, 0.26, false);
  const [eye, eyeMat] = mechTorso(body, 1.08, 0.8, 0.68, 1.62, "V1.15");
  const muzzles: Object3D[] = [];
  const armL = pivot(body, -0.72, 1.92, 0);
  const armR = pivot(body, 0.72, 1.92, 0);
  for (const [arm, s] of [[armL, -1], [armR, 1]] as const) {
    shoulder(arm, s, 1.2);
    rbox(0.32, 0.4, 0.34, M.darkMetal, s * 0.12, -0.3, 0, arm);
    // hanging block cannon (points down at rest, raised to aim)
    const can = pivot(arm, s * 0.14, -0.55, 0.02);
    rbox(0.46, 0.9, 0.46, M.gunmetal, 0, -0.4, 0, can);
    rbox(0.5, 0.12, 0.5, M.darkMetal, 0, -0.05, 0, can);
    for (let i = 0; i < 4; i++) rbox(0.48, 0.03, 0.48, M.darkMetal, 0, -0.25 - i * 0.14, 0, can);
    rbox(0.2, 0.6, 0.05, M.vent, s * 0.24, -0.45, 0, can).rotation.y = Math.PI / 2;
    for (const bx of [-0.1, 0.1]) {
      cyl(0.07, 0.07, 0.24, M.darkMetal, bx, -0.94, 0.02, can, 12);
      cyl(0.045, 0.045, 0.26, M.gunBlack, bx, -0.96, 0.02, can, 10);
    }
    box(0.3, 0.04, 0.01, M.redGlow, 0, -0.6, 0.235, can);
    piston(arm, new Vector3(s * 0.22, -0.05, -0.12), new Vector3(s * 0.2, -0.75, -0.16), 0.035);
    const muzzle = new Object3D();
    muzzle.position.set(0, -1.1, 0.02);
    can.add(muzzle);
    muzzles.push(muzzle);
  }
  return { root, body, hipL: L.hip, hipR: R.hip, kneeL: L.knee, kneeR: R.knee, armL, armR, aim: -1.45, eye, eyeMat, muzzles, spinners: [], height: 2.6, eyeHeight: 1.3, radius: 0.7, scrapMats: [M.gunmetal, M.darkMetal, M.vent] };
}

function warlord(): RobotRig {
  const root = new Group();
  const body = pivot(root, 0, 0, 0);
  const L = mechLeg(body, -1, 0.55, 0.62, 0.62, 0.34, true);
  const R = mechLeg(body, 1, 0.55, 0.62, 0.62, 0.34, true);
  const [eye, eyeMat] = mechTorso(body, 1.45, 1.0, 0.95, 2.05, "V1.20");
  const muzzles: Object3D[] = [];
  const spinners: Object3D[] = [];
  const armL = pivot(body, -1.0, 2.35, 0);
  const armR = pivot(body, 1.0, 2.35, 0);
  for (const [arm, s] of [[armL, -1], [armR, 1]] as const) {
    // huge shoulder box with a sensor screen face
    rbox(0.8, 0.66, 0.9, M.gunmetal, s * 0.3, 0.28, 0, arm);
    rbox(0.84, 0.1, 0.94, M.darkMetal, s * 0.3, 0.62, 0, arm);
    rbox(0.5, 0.36, 0.04, M.vent, s * 0.3, 0.3, 0.46, arm);
    box(0.44, 0.04, 0.01, M.redGlow, s * 0.3, 0.46, 0.48, arm);
    for (let i = 0; i < 3; i++) rbox(0.06, 0.5, 0.9, M.darkMetal, s * (0.62 + i * 0.001), 0.28, 0, arm).position.x = s * (0.05 + i * 0.25);
    antennaCluster(arm, s * 0.35, 0.66, -0.25, 3, 0.5);
    sphere(0.24, M.darkMetal, 0, 0, 0, arm, 14);
    rbox(0.42, 0.7, 0.45, M.darkMetal, s * 0.2, -0.45, 0, arm);
    piston(arm, new Vector3(s * 0.4, -0.1, -0.15), new Vector3(s * 0.38, -0.8, -0.18), 0.04);
    // gatling cannon
    const g = pivot(arm, s * 0.2, -0.95, 0.3);
    cyl(0.26, 0.26, 0.5, M.gunmetal, 0, 0, -0.1, g, 16).rotation.x = Math.PI / 2;
    rbox(0.4, 0.3, 0.4, M.darkMetal, 0, 0.18, -0.2, g);
    cable(g, [[0, 0.2, -0.35], [0, 0.45, -0.5], [0, 0.6, -0.3]], 0.04);
    const spin = pivot(g, 0, 0, 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(0.05, 0.05, 1.0, M.gunBlack, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.35, spin, 8).rotation.x = Math.PI / 2;
    }
    for (const z of [0.15, 0.55, 0.82]) torus(0.2, 0.035, M.gunmetal, spin).position.z = z;
    cyl(0.05, 0.05, 1.0, M.darkMetal, 0, 0, 0.35, spin, 8).rotation.x = Math.PI / 2;
    spinners.push(spin);
    const muzzle = new Object3D();
    muzzle.position.set(0, 0, 1.2);
    g.add(muzzle);
    muzzles.push(muzzle);
  }
  return { root, body, hipL: L.hip, hipR: R.hip, kneeL: L.knee, kneeR: R.knee, reverseKnee: true, armL, armR, aim: -0.25, eye, eyeMat, muzzles, spinners, height: 3.3, eyeHeight: 1.75, radius: 1.0, scrapMats: [M.gunmetal, M.darkMetal, M.gunBlack] };
}

export function buildRobot(kind: RobotKind): RobotRig {
  const rig = kind === "drone" ? drone() : kind === "sentinel" ? sentinel() : kind === "ripper" ? ripper() : kind === "bulwark" ? bulwark() : warlord();
  compact(rig.root, new Set<Object3D>([rig.eye]));
  return rig;
}

// ================================================================ weapons
export type WeaponKind = "pistol" | "rifle" | "sniper" | "rotary";

/** The faint blue-green glass in the red-dot sight (see-through, both faces). */
const REFLEX_GLASS = new MeshBasicMaterial({ color: 0x7fe8d0, transparent: true, opacity: 0.12, side: DoubleSide, depthWrite: false });

export function buildWeapon(kind: WeaponKind): { root: Group; muzzle: Object3D; spinner?: Object3D } {
  const root = new Group();
  const muzzle = new Object3D();
  let spinner: Object3D | undefined;
  const B = M.gunBlack;
  const G = M.gunGrey;
  const rail = (len: number, z: number, y: number): void => {
    rbox(0.045, 0.02, len, G, 0, y, z, root, 0.004);
    for (let i = 0; i < Math.floor(len / 0.025); i++) box(0.05, 0.008, 0.01, G, 0, y + 0.012, z - len / 2 + i * 0.025 + 0.012, root);
  };
  if (kind === "rifle") {
    rbox(0.07, 0.11, 0.4, B, 0, 0, 0, root, 0.012);
    rbox(0.075, 0.05, 0.26, G, 0, 0.035, 0.02, root, 0.01);
    rail(0.36, 0.02, 0.07);
    rbox(0.068, 0.075, 0.28, B, 0, 0.01, 0.33, root, 0.012);
    for (let i = 0; i < 5; i++) box(0.072, 0.012, 0.035, M.polymer, 0, 0.02, 0.24 + i * 0.045, root);
    cyl(0.013, 0.013, 0.16, G, 0, 0.012, 0.52, root, 8).rotation.x = Math.PI / 2;
    cyl(0.022, 0.022, 0.06, B, 0, 0.012, 0.61, root, 8).rotation.x = Math.PI / 2;
    const mag = rbox(0.045, 0.2, 0.085, M.polymer, 0, -0.13, 0.07, root, 0.01);
    mag.rotation.x = 0.18;
    const grip = rbox(0.045, 0.15, 0.06, M.polymer, 0, -0.1, -0.1, root, 0.012);
    grip.rotation.x = 0.35;
    rbox(0.055, 0.09, 0.2, M.polymer, 0, -0.01, -0.3, root, 0.015);
    rbox(0.06, 0.13, 0.05, M.polymer, 0, -0.03, -0.42, root, 0.012);
    rbox(0.05, 0.03, 0.14, B, 0, 0.045, -0.3, root, 0.008);
    // red-dot optic: an open frame with a tinted glass pane, so you look straight through it when aiming
    rbox(0.07, 0.012, 0.075, B, 0, 0.092, 0.0, root, 0.004);
    for (const s of [-1, 1]) rbox(0.009, 0.08, 0.03, B, s * 0.04, 0.132, 0.012, root, 0.003);
    rbox(0.089, 0.01, 0.034, B, 0, 0.175, 0.012, root, 0.003);
    const glass = new Mesh(cached("reflexglass", () => new PlaneGeometry(0.072, 0.074)), REFLEX_GLASS);
    glass.position.set(0, 0.134, 0.012);
    root.add(glass);
    sphere(0.0034, M.redGlow, 0, 0.134, 0.0112, root, 8);
    box(0.012, 0.012, 0.02, G, 0.034, 0.1, -0.02, root); // brightness knob
    box(0.076, 0.012, 0.16, M.greenGlow, 0, 0.03, 0.08, root);
    muzzle.position.set(0, 0.012, 0.64);
  } else if (kind === "sniper") {
    rbox(0.06, 0.1, 0.5, B, 0, 0, 0, root, 0.012);
    cyl(0.018, 0.02, 0.5, G, 0, 0.015, 0.5, root, 10).rotation.x = Math.PI / 2;
    cyl(0.03, 0.03, 0.09, B, 0, 0.015, 0.78, root, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) box(0.062, 0.008, 0.012, G, 0, 0.015, 0.74 + i * 0.022, root);
    // scope
    cyl(0.03, 0.03, 0.26, B, 0, 0.1, 0.02, root, 14).rotation.x = Math.PI / 2;
    cyl(0.04, 0.03, 0.06, B, 0, 0.1, 0.17, root, 14).rotation.x = Math.PI / 2;
    cyl(0.036, 0.03, 0.05, B, 0, 0.1, -0.12, root, 14).rotation.x = Math.PI / 2;
    cyl(0.035, 0.035, 0.005, M.cyanGlow, 0, 0.1, 0.2, root, 14).rotation.x = Math.PI / 2;
    for (const z of [-0.04, 0.08]) rbox(0.03, 0.05, 0.025, G, 0, 0.06, z, root, 0.006);
    cyl(0.012, 0.012, 0.06, G, 0.04, 0.03, -0.06, root, 6).rotation.z = Math.PI / 2;
    sphere(0.016, G, 0.075, 0.03, -0.06, root, 8);
    const mag = rbox(0.045, 0.12, 0.08, M.polymer, 0, -0.1, 0.05, root, 0.01);
    mag.rotation.x = 0.1;
    const grip = rbox(0.045, 0.15, 0.06, M.polymer, 0, -0.1, -0.12, root, 0.012);
    grip.rotation.x = 0.35;
    rbox(0.055, 0.11, 0.3, M.polymer, 0, -0.02, -0.38, root, 0.02);
    rbox(0.05, 0.035, 0.16, B, 0, 0.055, -0.36, root, 0.01);
    // folded bipod
    for (const s of [-1, 1]) span(new Vector3(s * 0.015, -0.03, 0.34), new Vector3(s * 0.02, -0.04, 0.6), 0.007, G, root, 6);
    box(0.066, 0.012, 0.3, M.cyanGlow, 0, 0.04, 0.12, root);
    muzzle.position.set(0, 0.015, 0.84);
  } else if (kind === "pistol") {
    rbox(0.075, 0.07, 0.3, G, 0, 0.03, 0.02, root, 0.012);
    for (let i = 0; i < 6; i++) box(0.078, 0.04, 0.006, B, 0, 0.035, -0.1 + i * 0.012, root);
    rbox(0.07, 0.06, 0.26, B, 0, -0.03, 0.02, root, 0.01);
    const grip = rbox(0.06, 0.17, 0.085, M.polymer, 0, -0.12, -0.07, root, 0.015);
    grip.rotation.x = 0.22;
    rbox(0.08, 0.03, 0.14, M.orangeGlow, 0, 0.07, 0.03, root, 0.008);
    cyl(0.02, 0.02, 0.04, B, 0, 0.03, 0.18, root, 10).rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.03, 0.2);
  } else {
    cyl(0.09, 0.09, 0.3, G, 0, 0, -0.08, root, 16).rotation.x = Math.PI / 2;
    rbox(0.18, 0.16, 0.2, B, 0, 0, -0.26, root, 0.02);
    rbox(0.1, 0.16, 0.18, M.oliveDark, 0.12, -0.05, -0.14, root, 0.02); // ammo box
    rbox(0.05, 0.14, 0.07, M.polymer, 0, -0.14, -0.2, root, 0.012).rotation.x = 0.3;
    rbox(0.05, 0.12, 0.06, M.polymer, 0, -0.12, 0.08, root, 0.012);
    // carry handle
    span(new Vector3(0, 0.1, -0.2), new Vector3(0, 0.14, -0.1), 0.012, G, root, 6);
    span(new Vector3(0, 0.14, -0.1), new Vector3(0, 0.14, 0.05), 0.012, G, root, 6);
    span(new Vector3(0, 0.14, 0.05), new Vector3(0, 0.09, 0.08), 0.012, G, root, 6);
    const spin = new Group();
    spin.position.set(0, 0, 0.1);
    root.add(spin);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(0.017, 0.017, 0.52, B, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.28, spin, 8).rotation.x = Math.PI / 2;
    }
    for (const z of [0.1, 0.36, 0.5]) torus(0.066, 0.012, G, spin).position.z = z;
    for (const sx of [-1, 1]) box(0.01, 0.018, 0.14, M.greenGlow, sx * 0.092, 0.03, -0.26, root);
    spinner = spin;
    muzzle.position.set(0, 0, 0.66);
  }
  root.add(muzzle);
  return { root, muzzle, spinner };
}

export function buildShield(): Group {
  const g = new Group();
  const tex = labelTex("STAR-TECH ENFORCEMENT", "#c3c8cc", "#3a3f43", 256, 384, "bold 44px Impact, Arial Black, sans-serif", ["", "STAR-TECH", "ENFORCEMENT", ""]);
  const mat = pbr(tex, { color: 0xffffff, metal: 0.65, rough: 0.4, bump: 2 });
  // curved riot shield (slice of a cylinder)
  const face = new Mesh(cached("shieldface", () => new CylinderGeometry(1.1, 1.1, 0.92, 16, 1, true, -0.29, 0.58)), mat);
  face.position.z = -1.08;
  const back = new Mesh(cached("shieldface", () => new CylinderGeometry(1.1, 1.1, 0.92, 16, 1, true, -0.29, 0.58)), M.darkMetal);
  back.position.z = -1.1;
  const backMat = M.darkMetal.clone();
  backMat.side = DoubleSide;
  back.material = backMat;
  g.add(back, face);
  // rim
  for (const y of [-0.47, 0.47]) {
    const rim = new Mesh(cached("shieldrim", () => new TorusGeometry(1.1, 0.02, 6, 16, 0.58)), M.gunBlack);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = Math.PI / 2 - 0.29;
    rim.position.set(0, y, -1.08);
    g.add(rim);
  }
  // viewport + handle
  rbox(0.22, 0.07, 0.03, M.glass, 0, 0.3, 0.02, g, 0.01);
  rbox(0.26, 0.1, 0.02, M.gunBlack, 0, 0.3, 0.005, g, 0.01);
  span(new Vector3(-0.06, 0, -0.06), new Vector3(0.06, 0, -0.06), 0.015, M.gunBlack, g, 6);
  return g;
}

// ================================================================ heroes
export type HeroId = "brutus" | "hale" | "cloya" | "dax";

/** Solve a two-bone limb: elbow position for shoulder S reaching hand T. */
function elbowPos(S: Vector3, T: Vector3, a: number, b: number, pole: Vector3): Vector3 {
  const d = Math.min(a + b - 0.001, S.distanceTo(T));
  const dir = T.clone().sub(S).normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const bend = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return S.clone().addScaledVector(dir, x).addScaledVector(bend, h);
}

function glove(parent: Object3D, at: Vector3, dir: Vector3, s: number): void {
  const g = new Group();
  g.position.copy(at);
  g.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.clone().normalize()));
  rbox(0.085 * s, 0.1 * s, 0.1 * s, M.rubber, 0, 0, 0, g, 0.025);
  rbox(0.07 * s, 0.03 * s, 0.07 * s, M.armor, 0, 0.05 * s, 0, g, 0.012);
  for (let i = 0; i < 4; i++) rbox(0.022 * s, 0.022 * s, 0.07 * s, M.rubber, (-0.03 + i * 0.02) * s, -0.03 * s, 0.05 * s, g, 0.008);
  parent.add(g);
}

function arm(parent: Object3D, S: Vector3, T: Vector3, s: number, pole: Vector3, emblem: MeshStandardMaterial, side: number): void {
  const a = 0.29 * s;
  const b = 0.27 * s;
  const E = elbowPos(S, T, a, b, pole);
  limbSeg(S, E, 0.058 * s, M.suit, parent);
  limbSeg(E, T, 0.052 * s, M.suit, parent);
  // bicep armour, elbow pad, forearm guard
  const up = rbox(0.12 * s, a * 0.62, 0.12 * s, M.armor, 0, 0, 0, parent, 0.03);
  up.position.copy(S.clone().lerp(E, 0.5));
  up.quaternion.copy(new Quaternion().setFromUnitVectors(UP, E.clone().sub(S).normalize()));
  const ep = sphere(0.06 * s, M.armorLight, E.x, E.y, E.z, parent, 12);
  ep.scale.set(1, 1, 1.1);
  const fa = rbox(0.11 * s, b * 0.66, 0.12 * s, M.armor, 0, 0, 0, parent, 0.03);
  fa.position.copy(E.clone().lerp(T, 0.52));
  fa.quaternion.copy(new Quaternion().setFromUnitVectors(UP, T.clone().sub(E).normalize()));
  const strip = box(0.02 * s, b * 0.3, 0.02 * s, M.greenGlow, 0, 0, 0, parent);
  strip.position.copy(E.clone().lerp(T, 0.5)).add(new Vector3(side * 0.05 * s, 0, 0.03 * s));
  strip.quaternion.copy(fa.quaternion);
  glove(parent, T, T.clone().sub(E), s);
  void emblem;
}

function helmet(parent: Object3D, y: number, s: number): void {
  const h = pivot(parent, 0, y, 0.01);
  const dome = sphere(0.158 * s, M.armor, 0, 0, 0, h, 24);
  dome.scale.set(1, 1.04, 1.12);
  // gold visor band wrapping the front
  const vis = new Mesh(cached("visor", () => new SphereGeometry(0.163, 24, 8, Math.PI / 2 - 1.05, 2.1, 1.35, 0.42)), M.visor);
  vis.scale.set(s, s * 1.04, s * 1.12);
  h.add(vis);
  // visor frame
  const brow = rbox(0.27 * s, 0.035 * s, 0.1 * s, M.armorLight, 0, 0.035 * s, 0.13 * s, h, 0.015);
  brow.rotation.x = -0.25;
  // jaw guard
  rbox(0.2 * s, 0.08 * s, 0.13 * s, M.armor, 0, -0.1 * s, 0.07 * s, h, 0.03);
  for (let i = 0; i < 3; i++) box(0.12 * s, 0.008 * s, 0.01 * s, M.gunBlack, 0, -0.09 * s - i * 0.015 * s, 0.137 * s, h);
  // ear pieces + side lamp + top rail
  for (const sd of [-1, 1]) {
    cyl(0.055 * s, 0.055 * s, 0.05 * s, M.armorLight, sd * 0.16 * s, -0.015 * s, 0, h, 14).rotation.z = Math.PI / 2;
    cyl(0.03 * s, 0.03 * s, 0.055 * s, M.gunBlack, sd * 0.165 * s, -0.015 * s, 0, h, 10).rotation.z = Math.PI / 2;
  }
  rbox(0.03 * s, 0.05 * s, 0.07 * s, M.gunBlack, 0.175 * s, 0.05 * s, 0.03 * s, h, 0.01);
  sphere(0.012 * s, M.greenGlow, 0.19 * s, 0.05 * s, 0.07 * s, h, 6);
  rbox(0.04 * s, 0.03 * s, 0.26 * s, M.armorLight, 0, 0.165 * s, -0.01 * s, h, 0.012);
  // neck seal
  cyl(0.07 * s, 0.085 * s, 0.08 * s, M.suit, 0, -0.16 * s, 0, h, 14);
}

/** A STAR-Tech Enforcement trooper in slide-7 armour, holding their weapon. */
export function buildHero(id: HeroId): Group {
  const g = new Group();
  const female = id === "cloya";
  const s = id === "brutus" ? 1.06 : female ? 0.95 : 1;
  const wf = female ? 0.88 : id === "brutus" ? 1.12 : id === "dax" ? 1.05 : 1;
  const emb = new MeshStandardMaterial({ map: emblemTex(), transparent: true, emissive: 0x2cff6a, emissiveMap: emblemTex(), emissiveIntensity: 0.9, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // ---- legs
  for (const sd of [-1, 1]) {
    const x = sd * 0.11 * wf;
    rbox(0.13, 0.12, 0.29, M.rubber, x, 0.06, 0.04, g, 0.03);
    rbox(0.14, 0.05, 0.3, M.gunBlack, x, 0.015, 0.04, g, 0.015);
    rbox(0.12, 0.08, 0.14, M.armorLight, x, 0.14, 0.0, g, 0.03);
    const shin = capsule(0.062, 0.32, M.suit, g);
    shin.position.set(x, 0.33, 0);
    rbox(0.13, 0.34, 0.08, M.armor, x, 0.33, 0.05, g, 0.03);
    const knee = sphere(0.072, M.armorLight, x, 0.52, 0.05, g, 14);
    knee.scale.set(1, 0.95, 0.85);
    const thigh = capsule(0.085 * wf, 0.3, M.suit, g);
    thigh.position.set(x, 0.72, 0);
    rbox(0.15 * wf, 0.24, 0.07, M.armor, x, 0.74, 0.07, g, 0.03);
    rbox(0.06, 0.22, 0.13, M.armorLight, x + sd * 0.085 * wf, 0.74, 0, g, 0.02);
  }
  // thigh holster + pouches
  rbox(0.06, 0.16, 0.1, M.pouch, 0.2 * wf, 0.8, 0.02, g, 0.02);
  // ---- pelvis + belt
  rbox(0.34 * wf, 0.16, 0.22, M.suit, 0, 0.93, 0, g, 0.05);
  rbox(0.36 * wf, 0.05, 0.25, M.gunBlack, 0, 1.0, 0, g, 0.015);
  for (const [x, z] of [[-0.14, 0.1], [0.14, 0.1], [-0.19, -0.02], [0.19, -0.02], [0, -0.12]]) rbox(0.07, 0.08, 0.05, M.pouch, x * wf, 0.97, z, g, 0.015);
  rbox(0.1, 0.12, 0.05, M.armor, 0, 0.9, 0.11, g, 0.02);
  // ---- torso
  const chest = pivot(g, 0, 1.22, 0);
  g.userData.chest = chest;
  const core = capsule(0.15, 0.24, M.suit, chest);
  core.scale.set(1.25 * wf, 1, 0.9);
  const cp = rbox(0.42 * wf, 0.3, 0.12, M.armor, 0, 0.11, 0.1, chest, 0.05);
  void cp;
  rbox(0.3 * wf, 0.12, 0.08, M.armorLight, 0, 0.22, 0.15, chest, 0.03);
  for (let i = 0; i < 3; i++) rbox((0.28 - i * 0.02) * wf, 0.055, 0.06, M.armor, 0, -0.05 - i * 0.065, 0.1, chest, 0.02);
  rbox(0.4 * wf, 0.42, 0.1, M.armor, 0, 0.06, -0.11, chest, 0.04);
  torus(0.1, 0.03, M.armorLight, chest).position.set(0, 0.3, 0);
  (chest.children[chest.children.length - 1] as Mesh).rotation.x = Math.PI / 2;
  decal(emblemTex(), 0.12, 0.12, chest, 0, 0.13, 0.163, 0, 0x2cff6a);
  box(0.12, 0.012, 0.01, M.greenGlow, 0, 0.03, 0.162, chest);
  // grenades on Hale's chest rig
  if (id === "hale") for (const x of [-0.13, 0.13]) cyl(0.028, 0.028, 0.07, M.oliveDark, x * wf, -0.02, 0.15, chest, 10);
  // ---- shoulders (pauldrons with glowing emblem)
  for (const sd of [-1, 1]) {
    const pa = new Mesh(cached("pauld", () => new SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M.armor);
    pa.scale.set(1.15 * s, 0.95, 1.25);
    pa.position.set(sd * 0.27 * wf, 1.43, 0);
    pa.rotation.z = -sd * 0.35;
    g.add(pa);
    const pa2 = new Mesh(cached("pauld2", () => new SphereGeometry(0.115, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.armorLight);
    pa2.scale.set(1.1 * s, 0.7, 1.15);
    pa2.position.set(sd * 0.3 * wf, 1.38, 0);
    pa2.rotation.z = -sd * 0.6;
    g.add(pa2);
    const e = new Mesh(cached("pl0.1,0.1", () => new PlaneGeometry(0.1, 0.1)), emb);
    e.position.set(sd * 0.395 * wf, 1.4, 0);
    e.rotation.set(0, sd * Math.PI / 2, sd * 0.3);
    g.add(e);
  }
  // ---- helmet
  helmet(g, 1.66, s);
  // ---- backpacks
  if (id === "dax") {
    rbox(0.44 * wf, 0.56, 0.28, M.pouch, 0, 1.25, -0.3, g, 0.06);
    rbox(0.36, 0.2, 0.26, M.oliveDark, 0, 1.6, -0.3, g, 0.04);
    for (const sd of [-1, 1]) rbox(0.1, 0.3, 0.12, M.pouch, sd * 0.27 * wf, 1.2, -0.3, g, 0.03);
    rbox(0.3, 0.06, 0.22, M.fabricGrey, 0, 1.56, -0.3, g, 0.02);
  } else if (id === "cloya") {
    rbox(0.32, 0.42, 0.18, M.oliveDark, 0, 1.28, -0.23, g, 0.04);
    rbox(0.26, 0.12, 0.05, M.vent, 0, 1.3, -0.33, g, 0.01);
    span(new Vector3(-0.12, 1.45, -0.28), new Vector3(-0.16, 2.35, -0.34), 0.006, M.gunBlack, g, 5, 0.012);
    sphere(0.018, M.greenGlow, -0.16, 2.35, -0.34, g, 6);
    const dish = new Mesh(cached("dish", () => new SphereGeometry(0.07, 12, 6, 0, Math.PI * 2, 0, 1.0)), M.steel);
    dish.position.set(0.1, 1.53, -0.25);
    dish.rotation.x = -0.9;
    g.add(dish);
  } else {
    rbox(0.34 * wf, 0.36, 0.14, M.oliveDark, 0, 1.3, -0.21, g, 0.04);
    rbox(0.1, 0.18, 0.1, M.pouch, 0.2 * wf, 1.2, -0.2, g, 0.03);
  }
  // ---- weapon + arms reaching for it
  const wk: WeaponKind = id === "brutus" ? "pistol" : id === "hale" ? "rifle" : id === "cloya" ? "sniper" : "rotary";
  const wpn = buildWeapon(wk).root;
  const shoulderL = new Vector3(-0.3 * wf, 1.4, 0.0);
  const shoulderR = new Vector3(0.3 * wf, 1.4, 0.0);
  if (id === "brutus") {
    wpn.position.set(0.27, 1.02, 0.28);
    wpn.rotation.set(0.15, 0.05, 0);
    g.add(wpn);
    const grip = new Vector3(0.27, 0.97, 0.24);
    arm(g, shoulderR, grip, s, new Vector3(0.6, -0.3, -1), emb, 1);
    const sh = buildShield();
    sh.scale.setScalar(1.12);
    sh.position.set(-0.24, 1.15, 0.42);
    sh.rotation.y = 0.3;
    g.add(sh);
    arm(g, shoulderL, new Vector3(-0.22, 1.12, 0.33), s, new Vector3(-1, -0.4, -0.3), emb, -1);
  } else {
    // weapon held across the body, muzzle low and to the left (as in the slide art)
    const base = id === "dax" ? new Vector3(0.12, 1.02, 0.26) : new Vector3(0.1, 1.16, 0.24);
    wpn.position.copy(base);
    wpn.rotation.set(id === "dax" ? 0.05 : 0.35, -0.55, 0);
    g.add(wpn);
    wpn.updateMatrix();
    const gripLocal = id === "dax" ? new Vector3(0, -0.12, -0.2) : new Vector3(0, -0.1, -0.1);
    const foreLocal = id === "dax" ? new Vector3(0, -0.1, 0.08) : id === "cloya" ? new Vector3(0, -0.04, 0.3) : new Vector3(0, -0.03, 0.3);
    const grip = gripLocal.applyMatrix4(wpn.matrix);
    const fore = foreLocal.applyMatrix4(wpn.matrix);
    arm(g, shoulderR, grip, s, new Vector3(1, -0.5, -0.6), emb, 1);
    arm(g, shoulderL, fore, s, new Vector3(-1, -0.8, 0), emb, -1);
    if (id === "dax") {
      // ammo feed from the backpack to the rotary gun
      const feed = new Vector3(0.14, -0.04, -0.12).applyMatrix4(wpn.matrix);
      cable(g, [[0.2, 1.1, -0.35], [0.34, 0.95, -0.1], [feed.x + 0.05, feed.y - 0.05, feed.z - 0.05], [feed.x, feed.y, feed.z]], 0.03, M.gunGrey);
    }
  }
  g.scale.setScalar(s);
  compact(g, new Set<Object3D>([chest]));
  compact(chest);
  return g;
}

/** First-person arm: armoured glove at the origin, forearm running back (+Z) toward the camera. */
export function buildFPArm(left: boolean): Group {
  const g = new Group();
  const sd = left ? -1 : 1;
  rbox(0.085, 0.1, 0.11, M.rubber, 0, 0, 0, g, 0.025);
  rbox(0.075, 0.03, 0.08, M.armor, 0, 0.05, 0, g, 0.012);
  for (let i = 0; i < 4; i++) rbox(0.02, 0.022, 0.06, M.rubber, -0.03 + i * 0.02, -0.035, -0.04, g, 0.008);
  rbox(0.022, 0.05, 0.03, M.rubber, sd * -0.045, 0.01, -0.03, g, 0.008);
  const fore = capsule(0.05, 0.36, M.suit, g);
  fore.rotation.x = Math.PI / 2 - 0.25;
  fore.position.set(0.0, -0.05, 0.24);
  const guard = rbox(0.1, 0.1, 0.3, M.armor, 0, -0.03, 0.2, g, 0.03);
  guard.rotation.x = -0.25;
  const strip = box(0.012, 0.012, 0.14, M.greenGlow, sd * 0.051, -0.02, 0.18, g);
  strip.rotation.x = -0.25;
  const badge = new Mesh(new PlaneGeometry(0.06, 0.06), new MeshStandardMaterial({ map: emblemTex(), transparent: true, emissive: 0x2cff6a, emissiveMap: emblemTex(), emissiveIntensity: 0.8 }));
  badge.position.set(sd * 0.052, -0.03, 0.26);
  badge.rotation.y = sd * Math.PI / 2;
  g.add(badge);
  rbox(0.11, 0.11, 0.06, M.armorLight, 0, -0.06, 0.38, g, 0.03).rotation.x = -0.25;
  compact(g, new Set<Object3D>([badge]));
  return g;
}

// ================================================================ vehicles
export function buildFreighterExterior(): Group {
  const g = new Group();
  const hullMat = pbr(wornMetalTex("fhull", "#7a8086", { cols: 4, rows: 2, rust: 6 }), { color: 0xa2a7ac, metal: 0.7, rough: 0.5, bump: 2 });
  hullMat.map!.repeat.set(5, 9);
  (hullMat.bumpMap as Texture).repeat.set(5, 9);
  const hull = new Mesh(new CapsuleGeometry(7, 40, 8, 28), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 1, 0.55);
  g.add(hull);
  // armour ribs + plating greebles
  for (let i = 0; i < 9; i++) {
    const rib = new Mesh(new TorusGeometry(7.05, 0.28, 8, 40), M.darkMetal);
    rib.rotation.y = Math.PI / 2;
    rib.scale.set(0.55, 1, 1);
    rib.position.x = -20 + i * 5;
    g.add(rib);
  }
  for (let i = 0; i < 40; i++) {
    const x = -22 + (i % 20) * 2.3;
    const top = i < 20;
    box(1.4 + (i % 3) * 0.6, 0.4, 1 + (i % 4) * 0.5, i % 5 ? M.steel : M.darkMetal, x, top ? 6.9 : -6.9, ((i * 7) % 5) - 2, g);
  }
  // window strips
  for (const s of [-1, 1]) for (let i = 0; i < 14; i++) box(0.9, 0.35, 0.05, M.cyanGlow, -18 + i * 2.6, 1.2, s * 3.88, g).material = new MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4fc8ff, emissiveIntensity: i % 3 ? 1.6 : 0.2 });
  for (const s of [-1, 1]) {
    const tank = new Mesh(new CapsuleGeometry(2.6, 14, 6, 20), hullMat);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(6, 0, s * 10.5);
    g.add(tank);
    for (const x of [0, 6, 12]) {
      const band = new Mesh(new TorusGeometry(2.65, 0.18, 6, 24), M.hazard);
      band.rotation.y = Math.PI / 2;
      band.position.set(x, 0, s * 10.5);
      g.add(band);
    }
    rbox(8, 2.4, 3, M.darkMetal, 6, 0, s * 7.5, g, 0.3);
    const nozzle = cyl(1.2, 1.6, 2, M.darkMetal, 15, 0, s * 10.5, g, 18);
    nozzle.rotation.z = Math.PI / 2;
  }
  const engine = lathe("fengine", [[3.2, -2.5], [3.8, -1.5], [4.4, 1.5], [4.6, 2.5], [4.2, 2.6]], M.darkMetal, g, 28);
  engine.rotation.z = -Math.PI / 2;
  engine.position.x = 28.5;
  const glowDisc = cyl(3.9, 3.9, 0.2, M.orangeGlow, 30.8, 0, 0, g, 28);
  glowDisc.rotation.z = Math.PI / 2;
  // bridge windows
  const win = rbox(1.4, 1.3, 6, M.cyanGlow, -26.6, 1.5, 0, g, 0.3);
  win.rotation.z = -0.35;
  // radar dish + antenna mast
  const dish = new Mesh(new SphereGeometry(1.6, 20, 8, 0, Math.PI * 2, 0, 1.0), M.steel);
  dish.position.set(-12, 8.5, 0);
  dish.rotation.x = -0.8;
  g.add(dish);
  cyl(0.15, 0.2, 2.2, M.darkMetal, -12, 7.3, 0, g, 8);
  cyl(0.06, 0.08, 6, M.darkMetal, 8, 9.5, 0, g, 6);
  // running lights
  for (let i = 0; i < 8; i++) sphere(0.25, i % 2 ? M.redGlow : M.greenGlow, -20 + i * 6, 3.6, 3.8, g, 8);
  // robot cables crawling over the hull
  for (let i = 0; i < 10; i++) {
    const c = new Mesh(new TorusGeometry(3 + (i % 3), 0.2, 6, 24, Math.PI), M.alienCable);
    c.position.set(-18 + i * 4, 2.5, 0);
    c.rotation.set(Math.PI / 2, 0, i * 0.7);
    g.add(c);
  }
  compact(g);
  return g;
}

// ================================================================ props
export function crate(w: number, h: number, d: number, tan = false, variant = 0): Group {
  const g = new Group();
  const mat = variant === 2 ? M.crateGrey : tan ? M.crateTan : M.crateGreen;
  rbox(w, h, d, mat, 0, 0, 0, g, Math.min(w, h, d) * 0.04);
  // steel corner caps + edge bands
  const c = Math.min(w, h, d) * 0.14;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) rbox(c, c, c, M.steel, (x * (w - c)) / 2 + x * 0.005, (y * (h - c)) / 2 + y * 0.005, (z * (d - c)) / 2 + z * 0.005, g, c * 0.2);
  for (const y of [-1, 1]) {
    rbox(w * 0.84, c * 0.35, 0.02, M.darkMetal, 0, (y * (h - c * 0.4)) / 2, d / 2 + 0.006, g, 0.005);
    rbox(w * 0.84, c * 0.35, 0.02, M.darkMetal, 0, (y * (h - c * 0.4)) / 2, -d / 2 - 0.006, g, 0.005);
  }
  // side handles + latch
  for (const s of [-1, 1]) {
    span(new Vector3(s * (w / 2 + 0.03), h * 0.2, -d * 0.2), new Vector3(s * (w / 2 + 0.03), h * 0.2, d * 0.2), 0.018, M.darkMetal, g, 6);
    box(0.03, 0.06, 0.03, M.darkMetal, s * (w / 2 + 0.015), h * 0.2, -d * 0.2, g);
    box(0.03, 0.06, 0.03, M.darkMetal, s * (w / 2 + 0.015), h * 0.2, d * 0.2, g);
  }
  box(0.08, 0.1, 0.03, M.steel, 0, h * 0.42, d / 2 + 0.012, g);
  return g;
}

export function barrel(yellow = false): Group {
  const g = new Group();
  const b = lathe("barrel", [[0, 0], [0.29, 0], [0.3, 0.03], [0.3, 0.26], [0.315, 0.28], [0.3, 0.3], [0.3, 0.6], [0.315, 0.62], [0.3, 0.64], [0.3, 0.87], [0.29, 0.9], [0, 0.9]], yellow ? M.barrelYel : M.barrelRed, g, 24);
  void b;
  torus(0.27, 0.018, M.darkMetal, g).rotation.x = Math.PI / 2;
  (g.children[g.children.length - 1] as Mesh).position.y = 0.9;
  cyl(0.05, 0.05, 0.03, M.darkMetal, 0.14, 0.905, 0.05, g, 8);
  cyl(0.03, 0.03, 0.03, M.darkMetal, -0.15, 0.905, -0.04, g, 8);
  return g;
}

export function consoleDesk(color: string, key: string, w = 1.2): Group {
  const g = new Group();
  rbox(w, 0.8, 0.62, M.darkMetal, 0, 0.4, 0, g, 0.04);
  rbox(w * 0.9, 0.05, 0.03, M.vent, 0, 0.15, 0.315, g, 0.01);
  rbox(w * 0.9, 0.3, 0.02, M.vent, 0, 0.45, 0.31, g, 0.01);
  // sloped keyboard deck
  const deck = pivot(g, 0, 0.86, 0.08);
  deck.rotation.x = -0.35;
  rbox(w, 0.07, 0.62, M.steel, 0, 0, 0, deck, 0.025);
  const keys = new Mesh(new PlaneGeometry(w * 0.85, 0.36), new MeshBasicMaterial({ map: keyboardTex(key, color) }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.037, 0.04);
  deck.add(keys);
  // monitor with bezel
  const mon = pivot(g, 0, 1.28, -0.16);
  mon.rotation.x = -0.18;
  rbox(w * 0.94, 0.6, 0.07, M.darkMetal, 0, 0, 0, mon, 0.025);
  const scr = new Mesh(new PlaneGeometry(w * 0.84, 0.5), new MeshBasicMaterial({ map: screenTex(key, color) }));
  scr.position.z = 0.037;
  mon.add(scr);
  cyl(0.03, 0.03, 0.2, M.darkMetal, 0, 1.0, -0.22, g, 8);
  cable(g, [[w * 0.35, 0.8, -0.3], [w * 0.4, 0.4, -0.35], [w * 0.38, 0.02, -0.25]], 0.018);
  return g;
}

export function bunkBed(blue: boolean): Group {
  const g = new Group();
  const fab = blue ? M.fabricBlue : M.fabricGreen;
  for (const y of [0.34, 1.46]) {
    rbox(0.96, 0.06, 2.02, M.darkMetal, 0, y, 0, g, 0.02);
    rbox(0.88, 0.14, 1.9, M.fabricGrey, 0, y + 0.1, 0, g, 0.05);
    const blanket = rbox(0.9, 0.05, 1.3, fab, 0, y + 0.19, 0.28, g, 0.02);
    blanket.rotation.z = 0.02;
    rbox(0.92, 0.07, 0.12, fab, 0, y + 0.18, -0.34, g, 0.03);
    rbox(0.6, 0.1, 0.32, M.fabricGrey, 0, y + 0.23, -0.74, g, 0.05);
  }
  for (const [x, z] of [[-0.46, -0.98], [0.46, -0.98], [-0.46, 0.98], [0.46, 0.98]]) cyl(0.03, 0.03, 1.9, M.steel, x, 0.95, z, g, 8);
  for (const z of [-0.98, 0.98]) span(new Vector3(-0.46, 1.75, z), new Vector3(0.46, 1.75, z), 0.02, M.steel, g, 6);
  // ladder
  for (let i = 0; i < 4; i++) span(new Vector3(0.46, 0.5 + i * 0.3, 0.6), new Vector3(0.46, 0.5 + i * 0.3, 0.95), 0.015, M.steel, g, 6);
  span(new Vector3(0.46, 0.35, 0.6), new Vector3(0.46, 1.6, 0.6), 0.02, M.steel, g, 6);
  return g;
}

let lockerN = 0;
export function locker(): Group {
  const g = new Group();
  const tex = lockerTex("l" + (lockerN % 4), "#5b6166", String(11 + (lockerN++ % 4)));
  const mat = pbr(tex, { color: 0xffffff, metal: 0.6, rough: 0.45, bump: 1.5 });
  rbox(0.6, 2.0, 0.5, M.steel, 0, 1.0, 0, g, 0.03);
  const door = new Mesh(new PlaneGeometry(0.54, 1.92), mat);
  door.position.set(0, 1.0, 0.252);
  g.add(door);
  rbox(0.62, 0.06, 0.52, M.darkMetal, 0, 2.0, 0, g, 0.02);
  rbox(0.62, 0.08, 0.52, M.darkMetal, 0, 0.04, 0, g, 0.02);
  return g;
}

export function weaponRack(): Group {
  const g = new Group();
  rbox(1.6, 1.8, 0.3, M.darkMetal, 0, 0.9, 0, g, 0.04);
  rbox(1.5, 1.6, 0.02, M.vent, 0, 0.95, 0.15, g, 0.01);
  box(1.6, 0.04, 0.35, M.redGlow, 0, 1.82, 0.05, g);
  for (const y of [0.35, 1.55]) rbox(1.5, 0.06, 0.18, M.steel, 0, y, 0.2, g, 0.02);
  for (let i = 0; i < 4; i++) {
    const w = buildWeapon(i % 2 ? "rifle" : "sniper").root;
    w.rotation.x = -Math.PI / 2;
    w.position.set(-0.55 + i * 0.37, 1.0, 0.24);
    w.scale.setScalar(0.95);
    g.add(w);
  }
  return g;
}

export function conferenceTable(): Group {
  const g = new Group();
  rbox(1.9, 0.08, 5.7, M.wood, 0, 0.8, 0, g, 0.035);
  rbox(1.95, 0.03, 5.75, M.darkMetal, 0, 0.75, 0, g, 0.01);
  for (const z of [-1.8, 0, 1.8]) {
    rbox(0.9, 0.7, 0.4, M.darkMetal, 0, 0.38, z, g, 0.05);
    rbox(1.2, 0.05, 0.6, M.steel, 0, 0.03, z, g, 0.02);
  }
  // hologram projector
  cyl(0.38, 0.42, 0.06, M.darkMetal, 0, 0.87, 0, g, 24);
  torus(0.34, 0.02, M.cyanGlow, g).rotation.x = Math.PI / 2;
  (g.children[g.children.length - 1] as Mesh).position.y = 0.905;
  cyl(0.2, 0.2, 0.01, M.cyanGlow, 0, 0.905, 0, g, 20);
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const ch = new Group();
      rbox(0.5, 0.1, 0.5, M.leather, 0, 0.5, 0, ch, 0.04);
      const back = rbox(0.48, 0.6, 0.09, M.leather, 0, 0.84, s * 0.24, ch, 0.04);
      back.rotation.x = -s * 0.1;
      cyl(0.035, 0.035, 0.36, M.chrome, 0, 0.27, 0, ch, 8);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        span(new Vector3(0, 0.08, 0), new Vector3(Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26), 0.018, M.darkMetal, ch, 6);
      }
      ch.position.set(s * 1.28, 0, -2.2 + i * 0.88);
      g.add(ch);
    }
  }
  compact(g);
  return g;
}

export function captainChair(): Group {
  const g = new Group();
  cyl(0.1, 0.28, 0.42, M.darkMetal, 0, 0.21, 0, g, 14);
  rbox(0.8, 0.16, 0.72, M.leather, 0, 0.5, 0, g, 0.06);
  rbox(0.78, 1.0, 0.16, M.leather, 0, 1.05, -0.3, g, 0.06);
  rbox(0.6, 0.22, 0.14, M.leather, 0, 1.62, -0.32, g, 0.06);
  for (const s of [-1, 1]) {
    rbox(0.12, 0.14, 0.66, M.steel, s * 0.44, 0.72, 0.02, g, 0.03);
    rbox(0.14, 0.03, 0.2, M.darkMetal, s * 0.44, 0.8, 0.22, g, 0.01);
    box(0.08, 0.005, 0.12, M.cyanGlow, s * 0.44, 0.817, 0.22, g);
  }
  return g;
}

export function fuelTank(len: number): Group {
  const g = new Group();
  const tMat = pbr(wornMetalTex("ftank", "#8d9298", { cols: 3, rows: 1, rust: 6 }), { color: 0xffffff, metal: 0.75, rough: 0.35, bump: 1.6 });
  const t = new Mesh(new CapsuleGeometry(1.1, len, 8, 24), tMat);
  t.rotation.z = Math.PI / 2;
  t.position.y = 1.35;
  g.add(t);
  for (let i = -1; i <= 1; i++) {
    const band = torus(1.12, 0.07, M.hazard, g);
    band.rotation.y = Math.PI / 2;
    band.position.set(i * len * 0.35, 1.35, 0);
    rbox(0.35, 0.34, 2.3, M.darkMetal, i * len * 0.35, 0.17, 0, g, 0.04);
  }
  // valve, gauge and pipework
  cyl(0.12, 0.12, 0.3, M.steel, len * 0.2, 2.5, 0, g, 12);
  torus(0.14, 0.02, M.redGlow, g).position.set(len * 0.2, 2.68, 0);
  (g.children[g.children.length - 1] as Mesh).rotation.x = Math.PI / 2;
  const gauge = cyl(0.12, 0.12, 0.04, M.gauge, -len * 0.2, 1.35, 1.12, g, 20);
  gauge.rotation.x = Math.PI / 2;
  torus(0.12, 0.015, M.chrome, g).position.set(-len * 0.2, 1.35, 1.14);
  const p = cyl(0.09, 0.09, len * 0.8, M.pipe, 0, 2.55, -0.5, g, 10);
  p.rotation.z = Math.PI / 2;
  return g;
}

export function reactorCore(): { root: Group; core: Mesh; rings: Mesh[] } {
  const root = new Group();
  lathe("rbase", [[0, 0], [1.55, 0], [1.55, 0.2], [1.35, 0.45], [0.9, 0.55], [0, 0.55]], M.darkMetal, root, 28);
  const top = lathe("rtop", [[0, 3.4], [1.55, 3.4], [1.55, 3.2], [1.35, 2.95], [0.9, 2.85], [0, 2.85]], M.darkMetal, root, 28);
  void top;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cyl(0.09, 0.09, 2.4, M.steel, Math.cos(a) * 1.2, 1.7, Math.sin(a) * 1.2, root, 8);
    if (i % 2 === 0) cable(root, [[Math.cos(a) * 1.3, 0.5, Math.sin(a) * 1.3], [Math.cos(a) * 1.45, 1.7, Math.sin(a) * 1.45], [Math.cos(a) * 1.3, 2.9, Math.sin(a) * 1.3]], 0.045, M.pipe);
  }
  // glass containment
  const glass = cyl(0.8, 0.8, 2.3, new MeshStandardMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.15, metalness: 1, roughness: 0.05, depthWrite: false }), 0, 1.7, 0, root, 24);
  void glass;
  const coreMat = new MeshStandardMaterial({ color: 0x2a8aa8, emissive: 0x3fc6ff, emissiveIntensity: 1.4 });
  const core = new Mesh(new CapsuleGeometry(0.34, 1.1, 6, 16), coreMat);
  core.position.y = 1.72;
  root.add(core);
  const rings: Mesh[] = [];
  const ringMat = new MeshStandardMaterial({ color: 0x2090b0, emissive: 0x30b0e0, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const r = new Mesh(new TorusGeometry(0.6 + i * 0.07, 0.025, 8, 36), ringMat);
    r.position.y = 1.2 + i * 0.5;
    root.add(r);
    rings.push(r);
  }
  // coil windings
  for (let i = 0; i < 6; i++) torus(0.83, 0.035, M.pipe, root).position.set(0, 0.8 + i * 0.36, 0);
  root.children.forEach((c) => {
    if ((c as Mesh).geometry?.type === "TorusGeometry" && (c as Mesh).material === M.pipe) c.rotation.x = Math.PI / 2;
  });
  return { root, core, rings };
}

/** The robot control relay clamped onto the reactor (Engineering objective). */
export function relayDevice(): { root: Group; light: Mesh } {
  const root = new Group();
  rbox(0.95, 1.45, 0.55, M.darkMetal, 0, 0.72, 0, root, 0.05);
  rbox(0.8, 0.32, 0.58, M.gunmetal, 0, 1.2, 0, root, 0.04);
  for (let i = 0; i < 4; i++) rbox(0.7, 0.04, 0.02, M.redGlow, 0, 0.4 + i * 0.14, 0.28, root, 0.01);
  const light = box(0.5, 0.18, 0.02, M.redGlow, 0, 1.2, 0.29, root);
  // clamp claws gripping the reactor
  for (const s of [-1, 1]) {
    const claw = rbox(0.14, 0.9, 0.5, M.gunmetal, s * 0.55, 0.9, -0.3, root, 0.03);
    claw.rotation.z = s * 0.15;
    piston(root, new Vector3(s * 0.4, 0.4, -0.1), new Vector3(s * 0.58, 1.3, -0.4), 0.03);
  }
  antennaCluster(root, 0, 1.45, 0, 3, 0.8);
  for (let i = 0; i < 4; i++) cable(root, [[-0.3 + i * 0.2, 0.2, -0.28], [-0.4 + i * 0.25, 0.1, -0.7], [-0.5 + i * 0.3, 1.0, -1.1], [-0.3 + i * 0.2, 1.8, -0.9]], 0.035, M.alienCable);
  compact(root, new Set<Object3D>([light]));
  return { root, light };
}

export function pipeRun(len: number, vertical = false): Group {
  const g = new Group();
  const p = cyl(0.09, 0.09, len, M.pipe, 0, 0, 0, g, 10);
  void p;
  for (let i = 0; i <= Math.floor(len / 1.5); i++) cyl(0.12, 0.12, 0.06, M.darkMetal, 0, -len / 2 + i * 1.5, 0, g, 10);
  if (!vertical) g.rotation.z = Math.PI / 2;
  return g;
}

/** Field medkit (health pickup) and ammo case. */
export function medkit(): Group {
  const g = new Group();
  rbox(0.48, 0.26, 0.32, M.white, 0, 0.13, 0, g, 0.04);
  rbox(0.5, 0.04, 0.34, M.darkMetal, 0, 0.14, 0, g, 0.01);
  box(0.2, 0.02, 0.07, M.greenGlow, 0, 0.27, 0, g);
  box(0.07, 0.02, 0.2, M.greenGlow, 0, 0.27, 0, g);
  box(0.16, 0.06, 0.02, M.greenGlow, 0, 0.15, 0.165, g);
  span(new Vector3(-0.08, 0.27, 0), new Vector3(0.08, 0.27, 0), 0.015, M.darkMetal, g, 6);
  return g;
}
export function ammoCase(): Group {
  const g = new Group();
  rbox(0.5, 0.24, 0.3, M.oliveDark, 0, 0.12, 0, g, 0.03);
  rbox(0.52, 0.04, 0.32, M.darkMetal, 0, 0.22, 0, g, 0.01);
  for (let i = 0; i < 4; i++) {
    cyl(0.022, 0.022, 0.14, M.orangeGlow, -0.15 + i * 0.1, 0.3, 0, g, 8);
    sphere(0.022, M.chrome, -0.15 + i * 0.1, 0.37, 0, g, 8);
  }
  box(0.3, 0.05, 0.01, M.cyanGlow, 0, 0.12, 0.152, g);
  return g;
}

export { MeshBasicMaterial };
