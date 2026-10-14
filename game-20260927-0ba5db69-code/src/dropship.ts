import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
  type Texture,
} from "three";
import { M, box, compact, cyl, rbox, sphere } from "./models";
import { bumpOf, diamondPlateTex, labelTex, screenTex, wornMetalTex } from "./textures";

/**
 * The S-T-E dropship "DS-07": a heavy troop lander with a real troop cabin inside.
 * Local frame: nose toward +z, ground at y = 0, width along x.
 *   rear door / ramp hinge  z = -5.0      bay floor y = 0.95
 *   bay (seats, rails)      z -5.0 … 2.3  bay ceiling y ≈ 3.1
 *   bulkhead with 3 screens z = 2.3 (facing the bay)
 *   cockpit under canopy    z 2.3 … 5.8
 */
export interface Dropship {
  root: Group;
  /** the three bulkhead screens, left → right (their materials can take any texture) */
  screens: Mesh[];
  /** rear ramp pivot (rotation.x: π/2 closed, 0 level, negative = lowered) */
  ramp: Group;
  /** points (ship-local) at the back of each engine, for exhaust glows */
  exhausts: Vector3[];
  update: (t: number) => void;
}

export const DS = {
  rearZ: -5.0,
  floorY: 0.95,
  ceilY: 3.1,
  bulkZ: 2.3,
  /** camera spot inside the bay, looking at the screens */
  cabinCam: new Vector3(0, 2.02, 0.42),
  cabinLook: new Vector3(0, 2.12, 2.3),
  /** waypoints a camera follows to get in through the rear door */
  doorOut: new Vector3(0, 1.95, -9.2),
  doorIn: new Vector3(0, 2.0, -4.4),
};

const UP = new Vector3(0, 1, 0);

function rod(a: Vector3, b: Vector3, r: number, mat: Material, parent: Object3D, seg = 8): Mesh {
  const m = new Mesh(new CylinderGeometry(r, r, a.distanceTo(b), seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  parent.add(m);
  return m;
}

function pivotAt(parent: Object3D, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Extrude a side profile ([z, y] points) across the ship's width. */
function sideExtrude(pts: [number, number][], width: number, mat: Material, bevel = 0.12): Mesh {
  const s = new Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  return new Mesh(geo, mat);
}

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const std = (tex: Texture, rough: number, metal: number, bump = 1.2, color = 0xffffff): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ map: tex, color, roughness: rough, metalness: metal });
    m.bumpMap = bumpOf(tex);
    m.bumpScale = bump;
    return m;
  };
  const wall = wornMetalTex("ds_wall", "#4d544c", { cols: 2, rows: 3, rust: 2 });
  const floor = diamondPlateTex("ds_floor", "#4a4e52");
  floor.repeat.set(2, 5);
  const ceil = wornMetalTex("ds_ceil", "#3a3f44", { cols: 3, rows: 3, rust: 1 });
  return {
    wall: std(wall, 0.6, 0.45, 1.4),
    floor: std(floor, 0.55, 0.6, 1.2),
    ceil: std(ceil, 0.7, 0.4, 1.0),
    frame: new MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.7 }),
    seat: new MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.8, metalness: 0.15 }),
    strap: new MeshStandardMaterial({ color: 0xd8741c, roughness: 0.85, metalness: 0 }),
    glass: new MeshStandardMaterial({ color: 0x7fc4de, transparent: true, opacity: 0.28, roughness: 0.04, metalness: 0.9, depthWrite: false, side: DoubleSide }),
    coolLight: new MeshStandardMaterial({ color: 0xdff4ff, emissive: 0xbfe8ff, emissiveIntensity: 1.6 }),
    redLight: new MeshStandardMaterial({ color: 0xff5040, emissive: 0xff2010, emissiveIntensity: 1.8 }),
    ext: new MeshStandardMaterial({ color: 0xd2342a, roughness: 0.4, metalness: 0.3 }),
    hull: (() => {
      const t = wornMetalTex("ds_hull", "#5b6644", { cols: 3, rows: 3, rust: 3 });
      t.repeat.set(0.3, 0.3);
      return std(t, 0.55, 0.45, 1.6);
    })(),
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildDropship(opts: { rampOpen?: boolean; cabinLights?: boolean; viewport?: boolean } = {}): Dropship {
  const rampOpen = opts.rampOpen ?? true;
  mats ??= makeMats();
  const X = mats;
  const g = new Group();
  const dynamic = new Set<Object3D>();

  // ================================================================ hull
  // fuselage: a hollow tube (cross-section with the cabin cut out) running from the rear door to the bulkhead
  const outer: [number, number][] = [[-1.3, 0.62], [1.3, 0.62], [1.78, 1.2], [1.86, 2.25], [1.5, 3.1], [0.85, 3.45], [-0.85, 3.45], [-1.5, 3.1], [-1.86, 2.25], [-1.78, 1.2]];
  const inner: [number, number][] = [[-1.36, 0.9], [1.36, 0.9], [1.52, 1.25], [1.52, 2.62], [1.08, 3.12], [-1.08, 3.12], [-1.52, 2.62], [-1.52, 1.25]];
  const sec = new Shape(outer.map(([x, y]) => new Vector2(x, y)));
  sec.holes.push(new Shape(inner.map(([x, y]) => new Vector2(x, y))));
  const tubeLen = DS.bulkZ - DS.rearZ;
  const tubeGeo = new ExtrudeGeometry(sec, { depth: tubeLen, bevelEnabled: false, steps: 1 });
  tubeGeo.translate(0, 0, DS.rearZ);
  g.add(new Mesh(tubeGeo, X.hull));
  // armour belt, plating seams and a lower chine rail
  for (const s of [-1, 1]) {
    rbox(0.14, 0.34, tubeLen - 0.4, M.oliveDark, s * 1.9, 1.75, (DS.rearZ + DS.bulkZ) / 2, g, 0.05);
    rbox(0.1, 0.12, tubeLen, M.oliveDark, s * 1.8, 1.18, (DS.rearZ + DS.bulkZ) / 2, g, 0.03);
    for (let i = 0; i < 6; i++) box(0.03, 1.8, 0.05, M.oliveDark, s * 1.86, 2.2, DS.rearZ + 0.6 + i * 1.2, g);
    for (let i = 0; i < 5; i++) box(0.04, 0.22, 0.4, M.vent, s * 1.9, 2.55, -3.6 + i * 0.5, g);
    const lbl = new MeshStandardMaterial({ map: labelTex("S-T-E", "#e2e6d4", "#4f573f", 256, 128), roughness: 0.6, metalness: 0.3 });
    const p = new Mesh(new PlaneGeometry(1.5, 0.72), lbl);
    p.position.set(s * 1.975, 2.28, -1.4);
    p.rotation.y = s * Math.PI / 2;
    g.add(p);
    const num = new MeshStandardMaterial({ map: labelTex("DS-07", "#e2e6d4", "#4f573f", 256, 96), roughness: 0.6, metalness: 0.3 });
    const q = new Mesh(new PlaneGeometry(0.9, 0.34), num);
    q.position.set(s * 1.93, 1.5, 1.2);
    q.rotation.y = s * Math.PI / 2;
    g.add(q);
    // hazard strip along the door edge
    rbox(0.06, 2.3, 0.16, M.hazard, s * 1.55, 2.0, DS.rearZ - 0.02, g, 0.02);
  }
  // rear door frame
  rbox(3.2, 0.18, 0.22, M.darkMetal, 0, 3.2, DS.rearZ - 0.05, g, 0.04);
  rbox(3.0, 0.12, 0.22, M.darkMetal, 0, 0.84, DS.rearZ - 0.05, g, 0.03);
  box(2.4, 0.05, 0.05, X.redLight, 0, 3.05, DS.rearZ + 0.08, g);
  // roof spine, sensor dome, tail fin, antennas
  rbox(1.3, 0.32, 5.8, M.oliveDark, 0, 3.55, -1.3, g, 0.1);
  for (let i = 0; i < 8; i++) box(1.0, 0.04, 0.14, M.vent, 0, 3.72, -3.8 + i * 0.6, g);
  sphere(0.32, M.darkMetal, 0, 3.72, 1.4, g, 16).scale.set(1, 0.55, 1);
  g.add(sideExtrude([[-5.0, 3.5], [-3.4, 3.5], [-4.3, 5.1], [-5.3, 5.1]], 0.18, X.hull, 0.05));
  sphere(0.08, M.redGlow, 0, 5.14, -5.0, g, 8);
  rod(new Vector3(0.45, 3.6, 0.6), new Vector3(0.5, 4.5, 0.3), 0.015, M.darkMetal, g, 5);
  rod(new Vector3(-0.4, 3.6, 0.2), new Vector3(-0.42, 4.2, 0.05), 0.015, M.darkMetal, g, 5);

  // nose: armoured cowling below the canopy
  const nose = sideExtrude([[2.25, 0.62], [3.9, 0.62], [5.5, 1.2], [5.85, 1.62], [5.3, 2.0], [4.3, 1.62], [2.25, 1.62]], 2.9, X.hull, 0.16);
  g.add(nose);
  rbox(3.3, 0.3, 0.3, M.oliveDark, 0, 3.2, 2.3, g, 0.1);
  rbox(3.72, 2.6, 0.2, M.oliveDark, 0, 1.95, 2.4, g, 0.08);
  // canopy glass and frame
  const canopy = sideExtrude([[2.3, 1.62], [4.3, 1.62], [5.3, 2.02], [4.0, 2.78], [2.9, 3.2], [2.3, 3.28]], 2.7, X.glass, 0);
  g.add(canopy);
  dynamic.add(canopy);
  for (const s of [-1, 1]) {
    rod(new Vector3(s * 1.36, 3.28, 2.3), new Vector3(s * 1.36, 3.2, 2.9), 0.05, M.oliveDark, g);
    rod(new Vector3(s * 1.36, 3.2, 2.9), new Vector3(s * 1.36, 2.78, 4.0), 0.05, M.oliveDark, g);
    rod(new Vector3(s * 1.36, 2.78, 4.0), new Vector3(s * 1.36, 2.02, 5.3), 0.05, M.oliveDark, g);
    rod(new Vector3(s * 1.36, 1.65, 3.2), new Vector3(s * 1.36, 3.2, 2.95), 0.035, M.oliveDark, g);
  }
  rod(new Vector3(-1.36, 2.78, 4.0), new Vector3(1.36, 2.78, 4.0), 0.045, M.oliveDark, g);
  rod(new Vector3(-1.36, 3.2, 2.9), new Vector3(1.36, 3.2, 2.9), 0.045, M.oliveDark, g);
  rod(new Vector3(0, 3.2, 2.9), new Vector3(0, 2.05, 5.25), 0.04, M.oliveDark, g);
  // chin turret + sensor
  sphere(0.26, M.darkMetal, 0, 0.62, 4.1, g, 14);
  for (const x of [-0.08, 0.08]) cyl(0.035, 0.035, 0.8, M.gunBlack, x, 0.55, 4.55, g, 8).rotation.x = Math.PI / 2;
  // landing lights
  for (const x of [-0.9, 0.9]) sphere(0.08, X.coolLight, x, 0.72, 3.9, g, 8);

  // ================================================================ wings, engines
  const exhausts: Vector3[] = [];
  for (const s of [-1, 1]) {
    const wing = rbox(1.9, 0.2, 2.4, X.hull, s * 2.75, 2.35, -1.3, g, 0.07);
    wing.rotation.z = -s * 0.07;
    rbox(1.7, 0.05, 0.3, M.hazard, s * 2.75, 2.47, -0.25, g, 0.01);
    rbox(0.5, 0.9, 1.6, M.oliveDark, s * 2.0, 2.0, -1.3, g, 0.1);
    // nacelle
    const pod = pivotAt(g, s * 3.85, 2.25, -1.4);
    const nac = new Mesh(new LatheGeometry([[0, -1.6], [0.72, -1.6], [0.9, -1.3], [0.95, -0.2], [0.92, 0.8], [0.8, 1.4], [0.68, 1.6], [0, 1.6]].map(([r, y]) => new Vector2(r, y)), 28), X.hull);
    nac.rotation.x = Math.PI / 2;
    pod.add(nac);
    for (const z of [-0.9, 0, 0.9]) {
      const band = new Mesh(new TorusGeometry(0.95, 0.03, 6, 28), M.oliveDark);
      band.position.z = z;
      pod.add(band);
    }
    const intake = new Mesh(new TorusGeometry(0.68, 0.07, 8, 28), M.darkMetal);
    intake.position.z = 1.6;
    pod.add(intake);
    cyl(0.66, 0.66, 0.05, M.darkMetal, 0, 0, 1.52, pod, 22).rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const bl = box(0.09, 0.6, 0.02, M.steel, Math.sin(a) * 0.32, Math.cos(a) * 0.32, 1.56, pod);
      bl.rotation.set(0.35, 0, -a);
    }
    cyl(0.16, 0.16, 0.14, M.darkMetal, 0, 0, 1.6, pod, 12).rotation.x = Math.PI / 2;
    const noz = cyl(0.6, 0.7, 0.3, M.darkMetal, 0, 0, -1.72, pod, 22);
    noz.rotation.x = Math.PI / 2;
    cyl(0.56, 0.56, 0.04, M.cyanGlow, 0, 0, -1.86, pod, 22).rotation.x = Math.PI / 2;
    exhausts.push(new Vector3(s * 3.85, 2.25, -3.2));
    sphere(0.1, s > 0 ? M.greenGlow : M.redGlow, s * 3.7, 2.45, -0.1, g, 8);
    sphere(0.07, X.coolLight, s * 3.85, 3.18, -1.4, g, 8);
  }

  // ================================================================ landing gear
  for (const [x, z] of [[-1.25, 3.2], [1.25, 3.2], [-1.45, -3.6], [1.45, -3.6]]) {
    rbox(0.4, 0.3, 0.6, M.oliveDark, x, 0.62, z, g, 0.05);
    rod(new Vector3(x, 0.58, z), new Vector3(x, 0.12, z + 0.05), 0.08, M.darkMetal, g, 10);
    rod(new Vector3(x, 0.55, z - 0.24), new Vector3(x, 0.18, z), 0.04, M.chrome, g, 8);
    cyl(0.26, 0.3, 0.09, M.gunBlack, x, 0.05, z + 0.05, g, 14);
  }

  // ================================================================ ramp
  const ramp = pivotAt(g, 0, DS.floorY - 0.04, DS.rearZ - 0.02);
  const RL = 2.4;
  // an armoured viewport window in the ramp (for the ride in: you can watch space with the ramp sealed)
  const win = opts.viewport ? { d0: 0.55, d1: 1.95, hw: 1.1 } : null;
  if (!win) rbox(2.92, 0.1, RL, M.oliveDark, 0, -0.05, -RL / 2, ramp, 0.03);
  else {
    const wl = win.d1 - win.d0;
    rbox(2.92, 0.1, win.d0, M.oliveDark, 0, -0.05, -win.d0 / 2, ramp, 0.03);
    rbox(2.92, 0.1, RL - win.d1, M.oliveDark, 0, -0.05, -(win.d1 + RL) / 2, ramp, 0.03);
    for (const s of [-1, 1]) rbox(1.46 - win.hw, 0.1, wl, M.oliveDark, s * (1.46 + win.hw) / 2, -0.05, -(win.d0 + win.d1) / 2, ramp, 0.03);
    // heavy frame, a centre mullion and the glass
    for (const d of [win.d0, win.d1]) box(win.hw * 2 + 0.1, 0.14, 0.07, M.darkMetal, 0, -0.03, -d, ramp);
    for (const s of [-1, 1]) box(0.07, 0.14, wl + 0.1, M.darkMetal, s * win.hw, -0.03, -(win.d0 + win.d1) / 2, ramp);
    box(0.05, 0.1, wl, M.darkMetal, 0, -0.04, -(win.d0 + win.d1) / 2, ramp);
    const glass = new Mesh(new PlaneGeometry(win.hw * 2, wl), new MeshStandardMaterial({ color: 0xa8dcff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.1, depthWrite: false, side: DoubleSide }));
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0, -0.05, -(win.d0 + win.d1) / 2);
    ramp.add(glass);
  }
  for (let i = 0; i < 9; i++) {
    const d = 0.2 + i * 0.25;
    if (win && d > win.d0 - 0.05 && d < win.d1 + 0.05) continue;
    box(2.6, 0.03, 0.07, M.steel, 0, 0.015, -d, ramp);
  }
  for (const s of [-1, 1]) rbox(0.1, 0.16, RL, M.hazard, s * 1.42, 0.02, -RL / 2, ramp, 0.02);
  box(2.6, 0.012, 0.05, X.redLight, 0, 0.02, -RL + 0.1, ramp);
  ramp.rotation.x = rampOpen ? -Math.asin((DS.floorY - 0.04) / RL) : Math.PI / 2;
  if (rampOpen) {
    for (const s of [-1, 1]) rod(new Vector3(s * 1.25, 1.55, DS.rearZ + 0.1), new Vector3(s * 1.25, 0.7, DS.rearZ - 0.9), 0.03, M.chrome, g, 6);
  }

  // ================================================================ troop cabin
  const cab = new Group();
  g.add(cab);
  const zMid = (DS.rearZ + DS.bulkZ) / 2;
  const L = tubeLen;
  const F = DS.floorY;
  // floor, walls, chamfers, ceiling (inside the tube so the hull's own inner faces never show)
  box(2.7, 0.04, L, X.floor, 0, F + 0.0, zMid, cab);
  for (const s of [-1, 1]) {
    box(0.03, 1.4, L, X.wall, s * 1.49, 1.94, zMid, cab);
    const lo = box(0.03, 0.4, L, X.wall, s * 1.43, 1.08, zMid, cab);
    lo.rotation.z = s * 0.42;
    const hi = box(0.03, 0.68, L, X.ceil, s * 1.28, 2.87, zMid, cab);
    hi.rotation.z = -s * 0.83;
  }
  box(2.2, 0.03, L, X.ceil, 0, 3.09, zMid, cab);
  // ribs every metre
  for (let z = DS.rearZ + 0.5; z < DS.bulkZ - 0.2; z += 1.0) {
    for (const s of [-1, 1]) {
      box(0.08, 1.42, 0.14, X.frame, s * 1.44, 1.94, z, cab);
      const d = box(0.08, 0.7, 0.14, X.frame, s * 1.24, 2.86, z, cab);
      d.rotation.z = -s * 0.83;
    }
    box(2.1, 0.08, 0.14, X.frame, 0, 3.04, z, cab);
  }
  // ceiling light strips and floor guide lights
  for (const s of [-1, 1]) box(0.08, 0.02, L - 0.6, X.coolLight, s * 0.5, 3.065, zMid, cab);
  for (let z = DS.rearZ + 0.4; z < DS.bulkZ - 0.2; z += 0.6) for (const s of [-1, 1]) box(0.05, 0.012, 0.12, M.cyanGlow, s * 0.45, F + 0.03, z, cab);
  for (const s of [-1, 1]) box(0.04, 0.008, L, M.hazard, s * 1.0, F + 0.025, zMid, cab);
  // red combat lights low on the walls
  for (const s of [-1, 1]) box(0.02, 0.04, L - 0.4, X.redLight, s * 1.46, 1.3, zMid, cab);
  // overhead grab rails with hangers
  for (const s of [-1, 1]) {
    rod(new Vector3(s * 0.8, 2.86, DS.rearZ + 0.3), new Vector3(s * 0.8, 2.86, DS.bulkZ - 0.5), 0.022, M.chrome, cab, 8);
    for (let z = DS.rearZ + 0.8; z < DS.bulkZ - 0.4; z += 1.5) rod(new Vector3(s * 0.8, 2.86, z), new Vector3(s * 0.8, 3.08, z), 0.012, X.frame, cab, 5);
  }
  // pipes and cable runs in the upper corners
  for (const s of [-1, 1]) {
    rod(new Vector3(s * 1.2, 2.95, DS.rearZ + 0.1), new Vector3(s * 1.2, 2.95, DS.bulkZ - 0.05), 0.035, M.pipe, cab, 8);
    rod(new Vector3(s * 1.1, 3.02, DS.rearZ + 0.1), new Vector3(s * 1.1, 3.02, DS.bulkZ - 0.05), 0.02, M.cable, cab, 6);
  }
  // jump seats with orange harnesses
  for (const s of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const z = -4.15 + i * 0.82;
      const seat = new Group();
      seat.position.set(s * 1.2, 0, z);
      seat.rotation.y = -s * Math.PI / 2;
      cab.add(seat);
      rbox(0.52, 0.08, 0.44, X.seat, 0, 1.46, 0.02, seat, 0.03);
      rbox(0.5, 0.78, 0.07, X.seat, 0, 1.92, -0.24, seat, 0.03);
      rbox(0.34, 0.2, 0.08, X.seat, 0, 2.43, -0.23, seat, 0.03);
      for (const x of [-0.13, 0.13]) {
        box(0.05, 0.72, 0.02, X.strap, x, 1.9, -0.2, seat);
        box(0.05, 0.02, 0.3, X.strap, x, 2.25, -0.07, seat);
      }
      box(0.1, 0.07, 0.03, M.chrome, 0, 1.72, -0.19, seat);
      rod(new Vector3(0, 1.42, 0.2), new Vector3(0, 0.98, -0.18), 0.02, X.frame, seat, 5);
    }
  // forward stowage: weapon racks, medical kit, extinguisher, ammo cases
  for (const s of [-1, 1]) {
    const z0 = 0.3;
    rbox(0.32, 1.5, 1.5, X.frame, s * 1.3, 1.85, z0 + 0.4, cab, 0.03);
    for (let i = 0; i < 4; i++) {
      const rz = z0 - 0.15 + i * 0.36;
      rbox(0.07, 0.9, 0.1, M.gunBlack, s * 1.12, 1.95, rz, cab, 0.02);
      rbox(0.05, 0.25, 0.06, M.gunGrey, s * 1.1, 1.5, rz + 0.05, cab, 0.01);
    }
    box(0.04, 0.05, 1.4, M.chrome, s * 1.12, 2.45, z0 + 0.4, cab);
    rbox(0.5, 0.35, 0.5, M.crateGreen, s * 1.08, F + 0.18, 1.75, cab, 0.03);
  }
  rbox(0.08, 0.34, 0.4, M.white, -1.44, 2.45, -0.3, cab, 0.03);
  box(0.02, 0.1, 0.24, X.redLight, -1.39, 2.45, -0.3, cab);
  cyl(0.07, 0.07, 0.42, X.ext, 1.4, 1.6, -0.35, cab, 10);

  // ================================================================ bulkhead with three mission screens
  const bz = DS.bulkZ - 0.02;
  box(2.95, 2.2, 0.05, X.wall, 0, 2.0, bz, cab);
  box(2.9, 0.1, 0.25, X.frame, 0, 1.4, bz - 0.12, cab);
  box(2.9, 0.04, 0.26, M.steel, 0, 1.46, bz - 0.13, cab);
  for (let i = 0; i < 14; i++) box(0.06, 0.02, 0.04, i % 3 === 0 ? M.redGlow : i % 3 === 1 ? M.greenGlow : M.cyanGlow, -1.2 + i * 0.18, 1.48, bz - 0.2, cab);
  const screens: Mesh[] = [];
  const defs: [number, number, number, number][] = [
    // x, width, height, yaw (side screens angle toward the middle)
    // (the bay looks toward +z, so +x is on the viewer's left)
    // (+yaw on the left screen turns its face toward the middle, outer edge forward)
    [0.97, 0.78, 0.6, 0.32],
    [0, 1.08, 0.7, 0],
    [-0.97, 0.78, 0.6, -0.32],
  ];
  defs.forEach(([x, w, h, yaw], i) => {
    const holder = new Group();
    // pull angled screens forward so their inner edge stays clear of the bulkhead
    holder.position.set(x, 2.14, bz - 0.06 - Math.abs(Math.sin(yaw)) * (w / 2 + 0.06));
    holder.rotation.y = Math.PI + yaw;
    cab.add(holder);
    rbox(w + 0.08, h + 0.08, 0.06, X.frame, 0, 0, 0.02, holder, 0.02);
    const scr = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: screenTex("dsb" + i, i === 1 ? "#6fe8ff" : "#3cff78") }));
    scr.position.z = 0.056;
    holder.add(scr);
    box(w * 0.6, 0.015, 0.02, M.cyanGlow, 0, -h / 2 - 0.03, 0.05, holder);
    screens.push(scr);
    dynamic.add(scr);
  });
  const plate = new Mesh(new PlaneGeometry(1.2, 0.16), new MeshBasicMaterial({ map: labelTex("DS-07 · TACTICAL", "#9fe8ff", "#0a1a22", 512, 64, "bold 34px Consolas, monospace") }));
  plate.position.set(0, 2.72, bz - 0.04);
  plate.rotation.y = Math.PI;
  cab.add(plate);
  dynamic.add(plate);
  for (const s of [-1, 1]) box(0.05, 1.1, 0.03, M.cyanGlow, s * 1.44, 2.1, bz - 0.05, cab);

  // ================================================================ cockpit (seen through the canopy)
  const ck = new Group();
  g.add(ck);
  box(2.5, 0.03, 2.0, X.floor, 0, 1.64, 3.3, ck);
  box(2.9, 1.6, 0.04, X.wall, 0, 2.45, DS.bulkZ + 0.03, ck);
  for (const s of [-1, 1]) {
    const seat = new Group();
    seat.position.set(s * 0.58, 1.65, 3.25);
    ck.add(seat);
    rbox(0.52, 0.12, 0.5, X.seat, 0, 0.42, 0, seat, 0.04);
    rbox(0.5, 0.85, 0.12, X.seat, 0, 0.9, -0.24, seat, 0.05).rotation.x = -0.12;
    rbox(0.3, 0.22, 0.1, X.seat, 0, 1.42, -0.3, seat, 0.04);
    cyl(0.07, 0.09, 0.36, X.frame, 0, 0.18, 0, seat, 8);
    for (const x of [-0.14, 0.14]) box(0.05, 0.7, 0.02, X.strap, x, 0.95, -0.17, seat);
    rod(new Vector3(s * 0.58, 1.65, 3.75), new Vector3(s * 0.58, 2.05, 3.85), 0.02, X.frame, ck, 6);
    rbox(0.26, 0.06, 0.1, M.gunBlack, s * 0.58, 2.07, 3.87, ck, 0.02);
  }
  // sloped dashboard with glowing displays
  const dash = new Group();
  dash.position.set(0, 2.0, 4.3);
  dash.rotation.x = -0.55;
  ck.add(dash);
  rbox(2.4, 0.08, 0.7, X.frame, 0, 0, 0, dash, 0.03);
  const dashTex = canvasTex(512, 128, (c) => {
    c.fillStyle = "#050c10";
    c.fillRect(0, 0, 512, 128);
    const cols = ["#6fe8ff", "#3cff78", "#ffb040", "#6fe8ff"];
    for (let i = 0; i < 4; i++) {
      c.fillStyle = cols[i];
      c.globalAlpha = 0.85;
      for (let y = 18; y < 110; y += 12) c.fillRect(20 + i * 125, y, 30 + ((i * 37 + y) % 70), 4);
      c.globalAlpha = 1;
      c.strokeStyle = cols[i];
      c.strokeRect(12 + i * 125, 10, 110, 108);
    }
  });
  const dm = new Mesh(new PlaneGeometry(2.2, 0.55), new MeshBasicMaterial({ map: dashTex }));
  dm.rotation.x = -Math.PI / 2;
  dm.position.y = 0.045;
  dash.add(dm);
  dynamic.add(dm);
  rbox(2.5, 0.35, 0.3, X.frame, 0, 1.8, 4.6, ck, 0.05);
  rbox(1.6, 0.06, 0.4, X.frame, 0, 3.12, 3.0, ck, 0.02);
  for (let i = 0; i < 10; i++) box(0.05, 0.02, 0.05, i % 2 ? M.redGlow : M.cyanGlow, -0.6 + i * 0.13, 3.08, 3.0, ck);

  // ================================================================ cabin light for close-ups
  if (opts.cabinLights) {
    const l1 = new PointLight(0xcfe8ff, 2.2, 6, 1.6);
    l1.position.set(0, 2.8, -0.4);
    g.add(l1);
    const l2 = new PointLight(0xff5040, 1.6, 4.5, 1.8);
    l2.position.set(0, 2.4, -3.8);
    g.add(l2);
    const l3 = new PointLight(0x7fdcff, 0.5, 3, 2);
    l3.position.set(0, 2.2, 1.4);
    g.add(l3);
  }

  compact(g, dynamic);
  // exhaust glow sprites (animated)
  const glowMat = new MeshBasicMaterial({ color: 0x55e6ff, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false });
  const glows: Mesh[] = [];
  for (const p of exhausts) {
    const m = new Mesh(new CylinderGeometry(0.5, 0.15, 1.4, 16, 1, true), glowMat);
    m.rotation.x = Math.PI / 2;
    m.position.copy(p);
    m.position.z -= 0.6;
    m.visible = !rampOpen;
    g.add(m);
    glows.push(m);
  }
  return {
    root: g,
    screens,
    ramp,
    exhausts,
    update: (t) => {
      glowMat.opacity = 0.25 + Math.random() * 0.15;
      X.redLight.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.6;
      for (const m of glows) m.scale.set(1, 1 + Math.random() * 0.25, 1);
    },
  };
}
