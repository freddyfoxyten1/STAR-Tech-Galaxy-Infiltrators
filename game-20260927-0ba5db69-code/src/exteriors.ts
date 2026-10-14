import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Texture,
} from "three";
import { M, box, compact, cyl, rbox, sphere } from "./models";
import { bumpOf, cloudTex, containerTex, labelTex, planetTex, windowGridTex, wornMetalTex } from "./textures";

/** A big exterior model plus its per-frame animation (blinking lights, turning rings, traffic). */
export interface Exterior {
  root: Group;
  update: (t: number) => void;
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

const stdM = (tex: Texture, rough: number, metal: number, bump = 1.6, color = 0xffffff, rep = 1): MeshStandardMaterial => {
  const m = new MeshStandardMaterial({ map: tex, color, roughness: rough, metalness: metal });
  m.bumpMap = bumpOf(tex);
  m.bumpScale = bump;
  if (rep !== 1) {
    tex.repeat.set(rep, rep);
    m.bumpMap.repeat.set(rep, rep);
  }
  return m;
};

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

/** A flat lit plane (windows, signs) facing +z unless rotated. */
function panel(tex: Texture, w: number, h: number, parent: Object3D, x: number, y: number, z: number, ry = 0): Mesh {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

/** A shaded world with clouds and a thin atmosphere glow. */
export function buildPlanet(radius: number, sunDir: Vector3): { root: Group; clouds: Mesh } {
  const root = new Group();
  const geo = new SphereGeometry(radius, 96, 48);
  const nor = geo.getAttribute("normal");
  const cols: number[] = [];
  const v = new Vector3();
  const sun = sunDir.clone().normalize();
  for (let i = 0; i < nor.count; i++) {
    v.fromBufferAttribute(nor, i);
    const l = Math.max(0.05, Math.min(1, v.dot(sun) * 1.25 + 0.2));
    cols.push(l, l, l * 1.05);
  }
  geo.setAttribute("color", new Float32BufferAttribute(cols, 3));
  root.add(new Mesh(geo, new MeshBasicMaterial({ map: planetTex(), vertexColors: true, fog: false })));
  const clouds = new Mesh(geo, new MeshBasicMaterial({ map: cloudTex(), vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  clouds.scale.setScalar(1.01);
  root.add(clouds);
  const halo = new Mesh(new SphereGeometry(radius * 1.045, 64, 32), new MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.25, side: BackSide, blending: AdditiveBlending, depthWrite: false, fog: false }));
  root.add(halo);
  return { root, clouds };
}

// ================================================================ the freighter
/**
 * A long-haul cargo freighter: bridge tower at the bow, a spine stacked with shipping
 * containers, the crew/cargo module (the mission's interior) with the airlock the dropship
 * docks against, radiators, and a four-bell engine block.
 */
export function buildFreighterShip(): Exterior {
  const g = new Group();
  const rnd = rng(4242);
  const hull = stdM(wornMetalTex("fx_hull", "#7d848b", { cols: 4, rows: 3, rust: 8 }), 0.55, 0.7, 2);
  const hullD = stdM(wornMetalTex("fx_hullD", "#474d54", { cols: 3, rows: 3, rust: 10 }), 0.6, 0.7, 2);
  const radMat = stdM(wornMetalTex("fx_rad", "#3a3d40", { cols: 1, rows: 8, rust: 2, bolts: false }), 0.5, 0.6, 1.5);
  radMat.emissive.setHex(0x2a0c02);
  const blinkR = new MeshBasicMaterial({ color: 0xff3020 });
  const blinkG = new MeshBasicMaterial({ color: 0x30ff60 });
  const strobe = new MeshBasicMaterial({ color: 0xffffff });
  const amber = new MeshBasicMaterial({ color: 0xffb040 });
  // --- spine truss
  for (const [y, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(35, 0.3, 0.3, M.darkMetal, -1.5, y, z, g);
  for (let x = -18; x <= 16; x += 2) {
    for (const [w, h, d, y, z] of [[0.2, 2.3, 0.2, 0, -1], [0.2, 2.3, 0.2, 0, 1], [0.2, 0.2, 2.3, -1, 0], [0.2, 0.2, 2.3, 1, 0]]) box(w, h, d, M.darkMetal, x, y, z, g);
    const d1 = box(0.12, 2.9, 0.12, M.steel, x + 1, 0, 1, g);
    d1.rotation.z = 0.78;
    const d2 = box(0.12, 2.9, 0.12, M.steel, x + 1, 0, -1, g);
    d2.rotation.z = -0.78;
  }
  // --- containers, three high and three wide around the spine
  const kinds = [
    containerTex("tsn", "#8a2f24", "TESANA LINES"),
    containerTex("stc", "#2d5a86", "STAR-TECH"),
    containerTex("orn", "#b98619", "ORION FREIGHT"),
    containerTex("ksl", "#3d6739", "KESSEL AGRI"),
    containerTex("gry", "#666b71", "HAZ-CARGO"),
    containerTex("wht", "#a9adb0", "COLONY SUPPLY"),
  ].map((t) => stdM(t, 0.6, 0.45, 1.2));
  const bays = [-14.5, -8.3, -2.1, 4.1, 10.3];
  for (const bx of bays)
    for (const y of [-2.7, 0, 2.7])
      for (const z of [-2.7, 0, 2.7]) {
        if (y === 0 && z === 0) continue;
        if (rnd() < 0.12) continue;
        const m = kinds[Math.floor(rnd() * kinds.length)];
        const c = box(6, 2.55, 2.5, m, bx + (rnd() - 0.5) * 0.15, y, z, g);
        c.rotation.x = rnd() < 0.5 ? 0 : Math.PI;
      }
  for (let i = 0; i <= bays.length; i++) {
    const x = bays[0] - 3.1 + i * 6.2;
    for (const s of [-1, 1]) {
      box(0.5, 8.9, 0.45, hullD, x, 0, s * 4.2, g);
      box(0.5, 0.45, 8.9, hullD, x, s * 4.2, 0, g);
    }
    for (const s of [-1, 1]) sphere(0.14, amber, x, 4.5, s * 4.3, g, 6);
  }
  // --- bow: command block, nose and bridge tower
  rbox(9, 6.4, 8.6, hull, -22.4, 0, 0, g, 0.8);
  const nose = new Mesh(new SphereGeometry(4.3, 28, 18), hull);
  nose.scale.set(1.5, 0.74, 1);
  nose.position.set(-26.6, -0.3, 0);
  g.add(nose);
  rbox(1.2, 0.8, 6.4, M.darkMetal, -30.6, -0.4, 0, g, 0.3);
  rbox(5.4, 4.2, 6.2, hull, -20.6, 5.2, 0, g, 0.5);
  rbox(4.2, 1.6, 4.6, hullD, -20.2, 8, 0, g, 0.4);
  const bw = windowGridTex("fx_bridge", 14, 2, "#bfe8ff", 0.85);
  panel(bw, 6, 1.1, g, -23.33, 6.1, 0, -Math.PI / 2);
  for (const s of [-1, 1]) panel(windowGridTex("fx_twr" + s, 12, 2, "#ffe6b0", 0.6), 4.6, 1.0, g, -20.6, 5.6, s * 3.12, s > 0 ? 0 : Math.PI);
  for (const s of [-1, 1]) panel(windowGridTex("fx_deck" + s, 24, 1, "#bfe8ff", 0.7), 8, 0.5, g, -22.4, 1.2, s * 4.32, s > 0 ? 0 : Math.PI);
  // antennas and dish
  cyl(0.12, 0.16, 4.5, M.darkMetal, -21, 11, 1.2, g, 6);
  cyl(0.08, 0.1, 3, M.darkMetal, -19.5, 10.3, -1.5, g, 6);
  sphere(0.22, strobe, -21, 13.3, 1.2, g, 8);
  const dish = new Mesh(new SphereGeometry(1.5, 20, 8, 0, Math.PI * 2, 0, 1.0), M.steel);
  dish.material = M.steel;
  dish.position.set(-18.4, 9.6, -1.4);
  dish.rotation.set(-0.7, 0, 0.5);
  g.add(dish);
  cyl(0.1, 0.14, 1.4, M.darkMetal, -18.4, 9, -1.4, g, 6);
  // --- side tanks
  for (const s of [-1, 1]) {
    const tank = new Mesh(new CapsuleGeometry(1.5, 9, 6, 18), hull);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(1, -1.2, s * 5.9);
    g.add(tank);
    for (const x of [-3, 1, 5]) {
      const band = new Mesh(new TorusGeometry(1.53, 0.1, 6, 20), M.hazard);
      band.rotation.y = Math.PI / 2;
      band.position.set(x, -1.2, s * 5.9);
      g.add(band);
      box(0.3, 0.3, 1.4, M.darkMetal, x, -1.2, s * 4.9, g);
    }
  }
  // --- crew / cargo module: the interior of the mission
  rbox(10, 7.6, 8.6, hull, 20, 0, 0, g, 0.6);
  for (const y of [-2.4, 2.4]) box(10.1, 0.12, 8.7, hullD, 20, y, 0, g);
  for (const x of [16.5, 23.5]) box(0.14, 7.7, 8.7, hullD, x, 0, 0, g);
  panel(windowGridTex("fx_mod", 20, 1, "#ffe0b0", 0.55), 8.6, 0.45, g, 20, 2.0, 4.31);
  panel(windowGridTex("fx_modB", 20, 1, "#bfe8ff", 0.5), 8.6, 0.45, g, 20, 2.0, -4.31, Math.PI);
  // airlock collar where the dropship docks
  const collar = cyl(1.15, 1.25, 2.1, M.darkMetal, 18, 0.3, 5.35, g, 18);
  collar.rotation.x = Math.PI / 2;
  const lip = cyl(1.32, 1.32, 0.14, M.hazard, 18, 0.3, 6.35, g, 18);
  lip.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) sphere(0.16, blinkG, 18 + s * 1.5, 1.6, 5.2, g, 8);
  box(2.8, 0.2, 0.3, M.darkMetal, 18, 1.55, 4.9, g);
  // scorch marks on the module
  const scorch = canvasTex(256, 256, (c) => {
    const grd = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    grd.addColorStop(0, "rgba(10,8,6,0.85)");
    grd.addColorStop(0.5, "rgba(20,14,10,0.5)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = grd;
    c.fillRect(0, 0, 256, 256);
  });
  const scMat = new MeshBasicMaterial({ map: scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [x, y, w] of [[22.5, -1.4, 3], [16.8, 2.8, 2], [24, 1.6, 1.6]]) {
    const s = new Mesh(new PlaneGeometry(w, w * 0.7), scMat);
    s.position.set(x, y, 4.32);
    g.add(s);
  }
  // radiators above and below
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const r = box(2.1, 5.2, 0.1, radMat, 17.6 + i * 2.4, s * 6.8, 0, g);
      void r;
      box(2.2, 0.12, 0.2, M.darkMetal, 17.6 + i * 2.4, s * 9.4, 0, g);
    }
    cyl(0.18, 0.18, 1.2, M.darkMetal, 20, s * 4.4, 0, g, 8);
    box(7.6, 0.2, 0.3, M.darkMetal, 20, s * 4.25, 0, g);
  }
  // --- engine block and thrusters
  rbox(6.2, 8.4, 8.8, hullD, 28.1, 0, 0, g, 0.7);
  for (let i = 0; i < 5; i++) box(0.1, 8.5, 8.9, M.darkMetal, 25.6 + i * 1.2, 0, 0, g);
  const glows: Mesh[] = [];
  const plume = new MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false });
  for (const y of [-2.2, 2.2])
    for (const z of [-2.2, 2.2]) {
      const bell = new Mesh(new CylinderGeometry(1.05, 1.75, 2.4, 22, 1, true), M.darkMetal);
      bell.material = M.darkMetal.clone();
      (bell.material as MeshStandardMaterial).side = DoubleSide;
      bell.rotation.z = -Math.PI / 2;
      bell.position.set(32.3, y, z);
      g.add(bell);
      const core = cyl(1.3, 1.3, 0.1, new MeshBasicMaterial({ color: 0xbfeaff }), 32.0, y, z, g, 20);
      core.rotation.z = Math.PI / 2;
      const p = new Mesh(new SphereGeometry(1.0, 14, 10), plume);
      p.scale.set(2.4, 1, 1);
      p.position.set(33.9, y, z);
      g.add(p);
      glows.push(p);
    }
  // --- running lights
  for (const x of [-25, -8, 8, 25]) {
    sphere(0.22, blinkR, x, 0, -4.55, g, 8);
    sphere(0.22, blinkG, x, 0, 4.55, g, 8);
  }
  for (const [x, y, z] of [[-31.3, -0.4, 0], [31.2, 4.4, 0], [20, 9.6, 0], [20, -9.6, 0]]) sphere(0.25, strobe, x, y, z, g, 8);
  // --- robot cabling creeping over the module
  for (let i = 0; i < 9; i++) {
    const x0 = 14 + rnd() * 12;
    const pts = [new Vector3(x0, -3.8, 4.35), new Vector3(x0 + (rnd() - 0.5) * 3, -1 + rnd(), 4.4), new Vector3(x0 + (rnd() - 0.5) * 4, 2.5, 4.38), new Vector3(x0 + (rnd() - 0.5) * 3, 3.85, 2 - rnd() * 3)];
    g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.12 + rnd() * 0.08, 6, false), M.alienCable));
  }
  compact(g, new Set<Object3D>(glows));
  return {
    root: g,
    update: (t) => {
      const on = t % 1.6 < 0.1 || (t % 1.6 > 0.25 && t % 1.6 < 0.33);
      strobe.color.setScalar(on ? 1 : 0.08);
      const slow = Math.sin(t * 2.4) > 0 ? 1 : 0.25;
      blinkR.color.setRGB(slow, 0.18 * slow, 0.12 * slow);
      blinkG.color.setRGB(0.18 * slow, slow, 0.36 * slow);
      plume.opacity = 0.13 + Math.random() * 0.06;
      for (const p of glows) p.scale.set(1.8 + Math.random() * 0.5, 1, 1);
    },
  };
}

// ================================================================ the Academy station
/**
 * STAR-Tech Academy in orbit: the main hull with its lit hangar (force field where the
 * dropship docks), a slowly turning habitat ring on spokes, solar arrays, docking arms with a
 * moored ship, shuttles coming and going, and the world turning below.
 */
export function buildAcademyStation(): Exterior {
  const g = new Group();
  const hullT = wornMetalTex("st_hull", "#a3aab2", { cols: 4, rows: 2, rust: 1 });
  const hull = stdM(hullT, 0.42, 0.6, 1.4);
  const hullW = new MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.35, metalness: 0.35 });
  const trim = stdM(wornMetalTex("st_trim", "#4a525b", { cols: 2, rows: 2, rust: 1 }), 0.45, 0.7, 1.2);
  const beacon = new MeshBasicMaterial({ color: 0xff3a2a });
  const strobe = new MeshBasicMaterial({ color: 0xffffff });
  // --- main hull
  rbox(52, 16, 8, hull, 0, 0, 0, g, 1.2);
  rbox(44, 3, 9, trim, 0, 9, 0, g, 0.6);
  rbox(44, 3, 9, trim, 0, -9, 0, g, 0.6);
  rbox(30, 2.5, 7, hullW, -6, 11.6, -0.5, g, 0.8);
  for (let i = 0; i < 9; i++) rbox(0.6, 15.2, 8.5, trim, -24 + i * 6, 0, 0, g, 0.2);
  for (const y of [-2.2, 2.2]) box(51, 0.18, 8.2, trim, 0, y, 0, g);
  for (const y of [-5.2, 5.2]) panel(windowGridTex("st_w" + y, 48, 2, "#cfeeff", 0.75), 40, 1.3, g, -4, y, 4.06);
  panel(windowGridTex("st_top", 30, 1, "#ffe6c0", 0.7), 26, 0.5, g, -6, 11.6, 3.02);
  // --- hangar bay (the dropship backs in through the force field)
  const bay = canvasTex(512, 320, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 320);
    grd.addColorStop(0, "#3a4a58");
    grd.addColorStop(1, "#12181e");
    c.fillStyle = grd;
    c.fillRect(0, 0, 512, 320);
    c.strokeStyle = "rgba(160,220,255,0.35)";
    c.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      c.beginPath();
      c.moveTo(256, 150);
      c.lineTo(i * 64, 320);
      c.stroke();
    }
    c.fillStyle = "#cfefff";
    for (let i = 0; i < 6; i++) c.fillRect(60 + i * 72, 22, 40, 8);
    c.fillStyle = "rgba(255,200,80,0.9)";
    for (let i = 0; i < 10; i++) c.fillRect(i * 52 + 8, 300, 26, 8);
    c.fillStyle = "#1a2530";
    c.fillRect(170, 150, 172, 70);
    c.fillStyle = "#6fe8ff";
    c.fillRect(180, 160, 150, 10);
  });
  rbox(9.2, 6.2, 0.9, trim, 18, -0.5, 4.1, g, 0.2);
  panel(bay, 7.6, 4.7, g, 18, -0.5, 4.56);
  const fieldMat = new MeshBasicMaterial({ color: 0x55d8ff, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false });
  const field = new Mesh(new PlaneGeometry(7.6, 4.7), fieldMat);
  field.position.set(18, -0.5, 4.62);
  g.add(field);
  for (const s of [-1, 1]) box(0.3, 5, 0.3, M.hazard, 18 + s * 3.95, -0.5, 4.65, g);
  box(8.2, 0.3, 0.3, M.hazard, 18, 2.0, 4.65, g);
  box(8.2, 0.3, 0.3, M.hazard, 18, -3.0, 4.65, g);
  // approach lights leading into the bay
  const chase: MeshBasicMaterial[] = [];
  for (let i = 0; i < 7; i++) {
    const m = new MeshBasicMaterial({ color: 0x40ff80 });
    chase.push(m);
    for (const s of [-1, 1]) sphere(0.18, m, 18 + s * 3.4, -3.3, 4.9 + i * 0.001, g, 8);
    box(0.15, 0.15, 0.6, trim, 18 - 3.4, -3.3, 5 + i * 1.3, g);
    box(0.15, 0.15, 0.6, trim, 18 + 3.4, -3.3, 5 + i * 1.3, g);
    for (const s of [-1, 1]) sphere(0.15, m, 18 + s * 3.4, -3.15, 5 + i * 1.3, g, 8);
  }
  // name board, lit
  const name = new Mesh(new PlaneGeometry(22, 3.2), new MeshBasicMaterial({ map: labelTex("STAR-TECH ACADEMY", "#e8f4ff", "#0b2334", 1024, 150, "bold 110px Impact, Arial Black, sans-serif") }));
  name.position.set(-8, 0, 4.1);
  g.add(name);
  rbox(22.8, 3.8, 0.3, trim, -8, 0, 3.98, g, 0.1);
  box(22, 0.1, 0.1, M.cyanGlow, -8, -1.75, 4.12, g);
  // --- connector to the habitat ring
  const conn = cyl(3, 3, 26, trim, 0, 0, -17, g, 20);
  conn.rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const b = cyl(3.3, 3.3, 0.6, hullW, 0, 0, -6 - i * 5, g, 20);
    b.rotation.x = Math.PI / 2;
  }
  // --- habitat ring, turning slowly
  const ring = new Group();
  ring.position.set(0, 0, -30);
  g.add(ring);
  const rim = new Mesh(new TorusGeometry(46, 3.4, 16, 128), hull);
  ring.add(rim);
  const rimW = new MeshBasicMaterial({ color: 0xcfeeff });
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    if (i % 9 === 4) continue;
    const w = box(2.6, 0.8, 0.3, rimW, Math.cos(a) * 46, Math.sin(a) * 46, 3.3, ring);
    w.rotation.z = a + Math.PI / 2;
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const band = new Mesh(new TorusGeometry(3.6, 0.35, 6, 16), trim);
    band.position.set(Math.cos(a) * 46, Math.sin(a) * 46, 0);
    band.rotation.set(0, Math.PI / 2, 0);
    band.rotateOnWorldAxis(new Vector3(0, 0, 1), a);
    ring.add(band);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = cyl(1.1, 1.1, 38, trim, Math.cos(a) * 25, Math.sin(a) * 25, 0, ring, 10);
    sp.rotation.z = a - Math.PI / 2;
  }
  const hubR = cyl(6.5, 6.5, 6, hullW, 0, 0, 0, ring, 28);
  hubR.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    sphere(0.5, beacon, Math.cos(a) * 49.6, Math.sin(a) * 49.6, 0, ring, 8);
  }
  // --- solar arrays
  const solar = canvasTex(256, 256, (c) => {
    c.fillStyle = "#0d2244";
    c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const grd = c.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
        grd.addColorStop(0, "#1c3e78");
        grd.addColorStop(1, "#0a1a38");
        c.fillStyle = grd;
        c.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
      }
    c.strokeStyle = "#8a96a8";
    c.lineWidth = 3;
    c.strokeRect(1, 1, 254, 254);
  });
  const solarMat = new MeshStandardMaterial({ map: solar, metalness: 0.7, roughness: 0.25, emissive: 0x040a18 });
  for (const s of [-1, 1]) {
    const mast = cyl(0.55, 0.55, 54, trim, s * 53, 0, -4, g, 8);
    mast.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const p = rbox(10, 0.14, 6.5, solarMat, s * (33 + i * 12), side * 3.8, -4, g, 0.05);
        p.rotation.x = 0.35 * side;
      }
      box(0.4, 8, 0.4, trim, s * (33 + i * 12), 0, -4, g);
    }
    sphere(0.4, strobe, s * 80, 0, -4, g, 8);
  }
  // --- docking arms with a moored cargo ship
  for (const x of [-16, -4]) {
    rbox(1.6, 1.6, 12, trim, x, 12.5, 7, g, 0.3);
    rbox(2.6, 2.6, 1.4, hullW, x, 12.5, 13, g, 0.3);
  }
  const moored = new Group();
  moored.position.set(-10, 16.4, 13);
  rbox(18, 3.6, 4, hull, 0, 0, 0, moored, 0.6);
  for (let i = 0; i < 4; i++) box(3.4, 2.4, 3.2, i % 2 ? M.crateTan : M.crateGreen, -6 + i * 3.8, 2.8, 0, moored);
  rbox(3, 2.6, 3.6, hullW, 10, 0.5, 0, moored, 0.5);
  panel(windowGridTex("st_moored", 8, 1, "#bfe8ff", 0.9), 2.6, 0.5, moored, 10, 1.1, 1.82);
  g.add(moored);
  // mast and beacons
  cyl(0.4, 0.4, 16, trim, 6, 20, 0, g, 8);
  sphere(0.45, beacon, 6, 28.2, 0, g, 8);
  for (const [x, y] of [[-26, 8], [26, 8], [-26, -8], [26, -8]]) sphere(0.35, strobe, x, y, 4.2, g, 8);
  // --- shuttles going about their business
  const shuttles: { o: Group; r: number; h: number; sp: number; ph: number; cz: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new Group();
    rbox(3.2, 1.1, 1.5, hullW, 0, 0, 0, s, 0.4);
    rbox(1.2, 0.6, 1.2, M.glass, 1.4, 0.35, 0, s, 0.25);
    for (const z of [-0.55, 0.55]) {
      const e = cyl(0.3, 0.35, 0.8, trim, -1.8, 0, z, s, 10);
      e.rotation.z = Math.PI / 2;
      const f = cyl(0.26, 0.26, 0.05, new MeshBasicMaterial({ color: 0x9fe8ff }), -2.22, 0, z, s, 10);
      f.rotation.z = Math.PI / 2;
    }
    sphere(0.12, beacon, 0, 0.6, 0, s, 6);
    g.add(s);
    shuttles.push({ o: s, r: 60 + i * 22, h: 6 + i * 5, sp: 0.05 + i * 0.02, ph: i * 2.1, cz: -10 - i * 12 });
  }
  // --- the world below
  const planet = buildPlanet(400, new Vector3(-0.5, 0.7, 0.6));
  planet.root.position.set(0, -520, -200);
  g.add(planet.root);
  compact(g, new Set<Object3D>([field, name, ring, moored, planet.root, ...shuttles.map((s) => s.o)]));
  const tmp = new Vector3();
  return {
    root: g,
    update: (t) => {
      ring.rotation.z = t * 0.05;
      planet.clouds.rotation.y = t * 0.003;
      fieldMat.opacity = 0.3 + Math.sin(t * 5) * 0.06 + Math.random() * 0.04;
      const on = t % 1.4 < 0.1;
      strobe.color.setScalar(on ? 1 : 0.1);
      beacon.color.setRGB(Math.sin(t * 3) > 0 ? 1 : 0.2, 0.15, 0.1);
      chase.forEach((m, i) => m.color.setHex(Math.floor(t * 8 - i) % 7 === 0 ? 0xc0ffd0 : 0x1a5a2a));
      for (const s of shuttles) {
        const a = t * s.sp + s.ph;
        s.o.position.set(Math.cos(a) * s.r, s.h + Math.sin(a * 2) * 3, s.cz + Math.sin(a) * s.r * 0.5);
        tmp.set(Math.cos(a + 0.05) * s.r, s.h + Math.sin((a + 0.05) * 2) * 3, s.cz + Math.sin(a + 0.05) * s.r * 0.5);
        s.o.lookAt(tmp);
        s.o.rotateY(-Math.PI / 2);
      }
    },
  };
}

// ================================================================ the STAR-Tech carrier (home base)
/**
 * The STC Vanguard: the carrier the squad's dropship launches from (the menu's Hangar Bay 2).
 * Long axis along x, the lit hangar mouth on the -z face. `hangar` is the mouth centre (local).
 */
export function buildCarrier(): Exterior & { hangar: Vector3 } {
  const g = new Group();
  const hull = stdM(wornMetalTex("cv_hull", "#6e767e", { cols: 6, rows: 3, rust: 1 }), 0.48, 0.55, 1.4);
  const dark = stdM(wornMetalTex("cv_dark", "#394046", { cols: 3, rows: 2, rust: 1 }), 0.55, 0.6, 1.2);
  const beacon = new MeshBasicMaterial({ color: 0xff3a2a });
  const strobe = new MeshBasicMaterial({ color: 0xffffff });
  // --- hull: main block, upper deck, keel, armour ribs
  rbox(150, 18, 34, hull, 0, 0, 0, g, 2);
  rbox(122, 8, 28, dark, -6, 12.5, 2, g, 1.5);
  rbox(112, 6, 26, dark, 0, -11.5, 0, g, 1.5);
  for (let i = 0; i < 12; i++) rbox(1.2, 19, 35, dark, -66 + i * 12, 0, 0, g, 0.3);
  for (const y of [-4.5, 4.5]) box(149, 0.4, 34.6, dark, 0, y, 0, g);
  // bow: a four-sided wedge pointing -x
  const bow = cyl(1, 19, 44, hull, -96, -0.5, 0, g, 4);
  bow.rotation.set(Math.PI / 4, 0, Math.PI / 2);
  bow.scale.set(0.62, 1, 1.25);
  // bridge tower
  rbox(12, 14, 16, hull, 34, 23, 4, g, 1.2);
  rbox(16, 3, 20, dark, 34, 31, 4, g, 0.8);
  panel(windowGridTex("cv_br", 14, 1, "#ffe6c0", 0.8), 10.5, 1.4, g, 34, 26, -4.06, Math.PI);
  for (const x of [28, 40]) cyl(0.25, 0.25, 12, dark, x, 38, 4, g, 6);
  // engine block with four glowing nozzles (+x)
  rbox(24, 26, 38, dark, 84, 0, 0, g, 2);
  const glowMat = new MeshBasicMaterial({ color: 0x55e6ff, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false });
  for (const [y, z] of [[-6, -9], [-6, 9], [7, -9], [7, 9]]) {
    cyl(5, 6, 7, dark, 99, y, z, g, 20).rotation.z = Math.PI / 2;
    cyl(4.4, 4.4, 0.4, M.cyanGlow, 102.7, y, z, g, 20).rotation.z = Math.PI / 2;
    const plume = new Mesh(new CylinderGeometry(4.2, 1.2, 22, 18, 1, true), glowMat);
    plume.rotation.z = -Math.PI / 2;
    plume.position.set(114, y, z);
    g.add(plume);
  }
  // lit window rows along the -z face
  for (const y of [2, 7]) panel(windowGridTex("cv_w" + y, 70, 2, "#cfeeff", 0.7), 104, 1.6, g, 8, y, -17.06, Math.PI);
  // --- Hangar Bay 2 mouth: bright interior, force field, hazard frame, approach lights
  const hangar = new Vector3(-24, -2, -17.2);
  const bay = canvasTex(512, 300, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 300);
    grd.addColorStop(0, "#4e5f6c");
    grd.addColorStop(1, "#1a2229");
    c.fillStyle = grd;
    c.fillRect(0, 0, 512, 300);
    c.strokeStyle = "rgba(200,230,255,0.35)";
    c.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      c.beginPath();
      c.moveTo(256, 130);
      c.lineTo(i * 64, 300);
      c.stroke();
    }
    c.fillStyle = "#f2fbff";
    for (let i = 0; i < 7; i++) c.fillRect(40 + i * 66, 18, 44, 9);
    c.fillStyle = "rgba(255,200,80,0.95)";
    for (let i = 0; i < 10; i++) c.fillRect(i * 52 + 8, 282, 26, 8);
    // parked dropships and crates deep in the bay
    c.fillStyle = "#56603f";
    c.fillRect(70, 170, 110, 44);
    c.fillRect(330, 176, 100, 40);
    c.fillStyle = "#2a3238";
    c.fillRect(210, 186, 90, 30);
    c.fillStyle = "#6fe8ff";
    c.fillRect(214, 190, 82, 5);
    c.fillStyle = "#ffffff";
    c.font = "bold 40px Impact, Arial Black, sans-serif";
    c.textAlign = "center";
    c.fillText("BAY 2", 256, 110);
  });
  rbox(20, 12, 1.4, dark, hangar.x, hangar.y, -17.4, g, 0.3);
  panel(bay, 17, 9.4, g, hangar.x, hangar.y, -18.15, Math.PI);
  const fieldMat = new MeshBasicMaterial({ color: 0x55d8ff, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const field = new Mesh(new PlaneGeometry(17, 9.4), fieldMat);
  field.position.set(hangar.x, hangar.y, -18.3);
  g.add(field);
  for (const s of [-1, 1]) box(0.5, 10.4, 0.5, M.hazard, hangar.x + s * 8.8, hangar.y, -18.3, g);
  for (const s of [-1, 1]) box(18, 0.5, 0.5, M.hazard, hangar.x, hangar.y + s * 5, -18.3, g);
  const chase: MeshBasicMaterial[] = [];
  for (let i = 0; i < 8; i++) {
    const m = new MeshBasicMaterial({ color: 0x1a5a2a });
    chase.push(m);
    for (const s of [-1, 1]) sphere(0.35, m, hangar.x + s * 10.5, hangar.y - 5.6, -18 - i * 0.01, g, 6).position.x += s * i * 1.6;
  }
  // hull markings
  const name = new Mesh(new PlaneGeometry(34, 6), new MeshBasicMaterial({ map: labelTex("STC VANGUARD", "#e8eef2", "#5b636a", 512, 96, "bold 64px Impact, Arial Black, sans-serif") }));
  name.position.set(18, -3.5, -17.08);
  name.rotation.y = Math.PI;
  g.add(name);
  const emb = new Mesh(new PlaneGeometry(8, 4), new MeshBasicMaterial({ map: labelTex("S-T-E", "#1c2126", "#d8a020", 256, 128) }));
  emb.position.set(-52, 2, -17.08);
  emb.rotation.y = Math.PI;
  g.add(emb);
  // beacons and strobes
  for (const [x, y, z] of [[-110, 0, 0], [-60, 16.6, -14], [34, 32.6, -6], [96, 13, -19], [96, -13, -19], [-60, -14.5, -13]]) sphere(0.7, beacon, x, y, z, g, 8);
  for (const [x, y, z] of [[-74, 8, -17.4], [60, 8, -17.4], [34, 39, 4]]) sphere(0.5, strobe, x, y, z, g, 8);
  compact(g, new Set<Object3D>([field, name, emb]));
  return {
    root: g,
    hangar,
    update: (t) => {
      fieldMat.opacity = 0.26 + Math.sin(t * 5) * 0.05 + Math.random() * 0.03;
      glowMat.opacity = 0.42 + Math.random() * 0.12;
      strobe.color.setScalar(t % 1.2 < 0.08 ? 1 : 0.1);
      beacon.color.setRGB(Math.sin(t * 3) > 0 ? 1 : 0.2, 0.15, 0.1);
      chase.forEach((m, i) => m.color.setHex(Math.floor(t * 10 + i) % 8 === 0 ? 0xc0ffd0 : 0x1a5a2a));
    },
  };
}

// ================================================================ the Remote Colony's world
/** Sky dome for the colony planet: violet zenith, dusty orange horizon. */
export function colonySkyTex(): CanvasTexture {
  return canvasTex(64, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#1c1426");
    g.addColorStop(0.3, "#4a2a3a");
    g.addColorStop(0.46, "#b0603a");
    g.addColorStop(0.5, "#e7a060");
    g.addColorStop(0.56, "#8a5236");
    g.addColorStop(1, "#3a2418");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 512);
  });
}

function sandTex(): CanvasTexture {
  const t = canvasTex(256, 256, (c) => {
    c.fillStyle = "#8a5a36";
    c.fillRect(0, 0, 256, 256);
    const r = rng(41);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      c.fillStyle = v < 0.5 ? `rgba(60,34,18,${0.05 + r() * 0.12})` : `rgba(230,170,110,${0.04 + r() * 0.1})`;
      c.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 2);
    }
    for (let i = 0; i < 18; i++) {
      c.strokeStyle = `rgba(70,40,20,${0.08 + r() * 0.1})`;
      c.lineWidth = 2;
      c.beginPath();
      const y = r() * 256;
      c.moveTo(0, y);
      c.bezierCurveTo(80, y + (r() - 0.5) * 40, 170, y + (r() - 0.5) * 40, 256, y);
      c.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function gasGiantTex(): CanvasTexture {
  return canvasTex(256, 128, (c) => {
    const bands = ["#d8b890", "#b8845a", "#e8d0a8", "#9a6444", "#d2a070", "#f0dcb8", "#a87050", "#c89868"];
    let y = 0;
    let i = 0;
    const r = rng(7);
    while (y < 128) {
      const h = 5 + r() * 14;
      c.fillStyle = bands[i++ % bands.length];
      c.fillRect(0, y, 256, h + 1);
      y += h;
    }
    c.fillStyle = "rgba(160,70,40,0.8)";
    c.beginPath();
    c.ellipse(170, 78, 18, 8, 0, 0, Math.PI * 2);
    c.fill();
  });
}

export interface ColonySurfaceOpts {
  centre: Vector3;
  groundY: number;
  radius: number;
  /** add a fixed sky dome of this radius (the ride uses its own fading one) */
  skyR?: number;
  /** keep rocks out of this box (the colony's own footprint) */
  exclude: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** outer colony domes: [x, z, radius] */
  domes: [number, number, number][];
  derrick: [number, number];
  tower: [number, number];
  solar: [number, number][];
}

/** Desert, rocks, mountains, outer domes, a mining derrick, a comms tower and a gas giant overhead. */
export function buildColonySurface(o: ColonySurfaceOpts): Exterior {
  const g = new Group();
  const y0 = o.groundY;
  const beacon = new MeshBasicMaterial({ color: 0xff3a2a, fog: false });
  if (o.skyR) {
    const sky = new Mesh(new SphereGeometry(o.skyR, 40, 20), new MeshBasicMaterial({ map: colonySkyTex(), side: BackSide, depthWrite: false, fog: false }));
    sky.position.set(o.centre.x, y0, o.centre.z);
    sky.renderOrder = -10;
    g.add(sky);
  }
  // gas giant with rings, and a small pale sun
  const giant = new Group();
  giant.position.set(o.centre.x - 150, y0 + 115, o.centre.z - 200);
  giant.add(new Mesh(new SphereGeometry(62, 48, 24), new MeshBasicMaterial({ map: gasGiantTex(), fog: false })));
  const ringMat = new MeshBasicMaterial({ color: 0xe8c8a0, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false, fog: false });
  const ring = new Mesh(new RingGeometry(80, 118, 96), ringMat);
  ring.rotation.set(1.2, 0.2, 0.3);
  giant.add(ring);
  giant.rotation.z = 0.35;
  g.add(giant);
  const sun = new Mesh(new SphereGeometry(9, 20, 12), new MeshBasicMaterial({ color: 0xfff0d0, fog: false }));
  sun.position.set(o.centre.x + 170, y0 + 60, o.centre.z - 180);
  g.add(sun);
  // ground and dunes
  const sand = sandTex();
  sand.repeat.set(o.radius / 8, o.radius / 8);
  const sandM = new MeshStandardMaterial({ map: sand, color: 0xd09a70, roughness: 1, metalness: 0 });
  const ground = new Mesh(new CircleGeometry(o.radius, 64), sandM);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(o.centre.x, y0, o.centre.z);
  g.add(ground);
  const rockM = stdM(wornMetalTex("col_rock", "#6a4430", { cols: 1, rows: 1, rust: 20, bolts: false }), 0.95, 0.05, 2.2);
  const r = rng(99);
  const inEx = (x: number, z: number, pad: number): boolean => x > o.exclude.minX - pad && x < o.exclude.maxX + pad && z > o.exclude.minZ - pad && z < o.exclude.maxZ + pad;
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = 40 + r() * o.radius * 0.6;
    const x = o.centre.x + Math.cos(a) * d;
    const z = o.centre.z + Math.sin(a) * d;
    const sx = 18 + r() * 30;
    const sy = 2 + r() * 4;
    const sz = 12 + r() * 20;
    const ry = r() * 3;
    // keep the whole dune (not just its middle) well clear of the colony, or it pokes up through the floors
    if (inEx(x, z, Math.max(sx, sz) + 8)) continue;
    const dune = new Mesh(new SphereGeometry(1, 16, 8), sandM);
    dune.scale.set(sx, sy, sz);
    dune.position.set(x, y0 - 0.5, z);
    dune.rotation.y = ry;
    g.add(dune);
  }
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const d = 12 + Math.pow(r(), 0.7) * o.radius * 0.7;
    const x = o.centre.x + Math.cos(a) * d;
    const z = o.centre.z + Math.sin(a) * d;
    const s = 0.3 + Math.pow(r(), 2) * 2.6;
    if (inEx(x, z, 3 + s)) continue;
    const m = new Mesh(new DodecahedronGeometry(s, 0), rockM);
    m.position.set(x, y0 + s * 0.35, z);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.scale.y = 0.6 + r() * 0.5;
    g.add(m);
  }
  // mountains on the horizon
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + r() * 0.2;
    const d = o.radius * (0.72 + r() * 0.2);
    const h = 25 + r() * 55;
    const m = new Mesh(new ConeGeometry(h * (0.9 + r() * 0.6), h, 6), rockM);
    m.position.set(o.centre.x + Math.cos(a) * d, y0 + h / 2 - 2, o.centre.z + Math.sin(a) * d);
    m.rotation.y = r() * 3;
    g.add(m);
  }
  // the colony's outer domes
  const domeM = stdM(wornMetalTex("col_dome", "#c9c2b6", { cols: 6, rows: 3, rust: 3 }), 0.5, 0.4, 1.2);
  const winM = new MeshBasicMaterial({ color: 0x3a2a20, fog: true });
  const litM = new MeshBasicMaterial({ color: 0xffc070 });
  for (const [x, z, rad] of o.domes) {
    const d = new Mesh(new SphereGeometry(rad, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
    d.position.set(x, y0, z);
    g.add(d);
    const base = new Mesh(new CylinderGeometry(rad + 0.6, rad + 0.9, 1.6, 28), rockM);
    base.position.set(x, y0 + 0.8, z);
    g.add(base);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const w = box(1.6, 0.8, 0.2, k % 3 === 0 ? litM : winM, x + Math.cos(a) * rad * 0.93, y0 + rad * 0.33, z + Math.sin(a) * rad * 0.93, g);
      w.rotation.y = -a + Math.PI / 2;
    }
    sphere(0.4, beacon, x, y0 + rad + 0.3, z, g, 8);
  }
  // mining derrick
  const [dx, dz] = o.derrick;
  const steel = new MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.7, metalness: 0.6 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = cyl(0.3, 0.45, 34, steel, dx + sx * 2.2, y0 + 17, dz + sz * 2.2, g, 6);
    leg.rotation.set(sz * 0.07, 0, -sx * 0.07);
  }
  for (let k = 0; k < 8; k++) box(5.6 - k * 0.45, 0.3, 5.6 - k * 0.45, steel, dx, y0 + 2 + k * 4, dz, g);
  box(3, 2, 3, M.hazard, dx, y0 + 35, dz, g);
  sphere(0.5, beacon, dx, y0 + 36.5, dz, g, 8);
  cyl(3.5, 4, 5, rockM, dx, y0 + 2.5, dz, g, 12);
  // comms tower with a dish
  const [tx, tz] = o.tower;
  cyl(0.5, 0.9, 26, steel, tx, y0 + 13, tz, g, 8);
  const dish = new Mesh(new SphereGeometry(4, 20, 8, 0, Math.PI * 2, 0, 1.1), new MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5, metalness: 0.4, side: DoubleSide }));
  dish.position.set(tx, y0 + 25, tz);
  dish.rotation.x = -0.9;
  g.add(dish);
  sphere(0.45, beacon, tx, y0 + 27.5, tz, g, 8);
  // solar farms
  const panelM = new MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.25, metalness: 0.8, emissive: 0x0a1426 });
  for (const [sx, sz] of o.solar) {
    for (let k = 0; k < 6; k++) {
      const p = box(4, 0.12, 2.2, panelM, sx + (k % 3) * 4.6, y0 + 1.4, sz + Math.floor(k / 3) * 3.2, g);
      p.rotation.x = -0.5;
      cyl(0.08, 0.08, 1.3, steel, sx + (k % 3) * 4.6, y0 + 0.65, sz + Math.floor(k / 3) * 3.2, g, 5);
    }
  }
  compact(g, new Set<Object3D>([giant, sun, ground]));
  return {
    root: g,
    update: (t) => {
      beacon.color.setRGB(Math.sin(t * 2.6) > 0.2 ? 1 : 0.2, 0.15, 0.1);
      giant.rotation.y = t * 0.004;
    },
  };
}
