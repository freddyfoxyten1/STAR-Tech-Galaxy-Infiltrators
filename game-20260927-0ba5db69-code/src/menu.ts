import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LineBasicMaterial,
  LineSegments,
  RepeatWrapping,
  BackSide,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  RingGeometry,
  TorusGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Material,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  PointLight,
  Raycaster,
  Vector2,
  Scene,
  SphereGeometry,
  SpotLight,
  Vector3,
  FogExp2,
} from "three";
import { audio } from "./audio";
import { buildAcademyStation, buildCarrier, buildColonySurface, buildFreighterShip, colonySkyTex, type Exterior } from "./exteriors";
import { ARMORY_BONUS, DIFFICULTIES, GEAR, HEROES, gadgetAvailable, gadgetCount, MISSION_BONUS, RESCUE_BONUS, ROBOT_POINTS, UPGRADE_COSTS, UPGRADES, difficultyDef, heroStats, scaledPoints, writeSave, type Difficulty, type GearKey, type SaveData } from "./data";
import type { MissionId, MissionResult } from "./game";
import { M, ammoCase, barrel, box, buildHero, buildRobot, compact, consoleDesk, crate, cyl, fuelTank, locker, pipeRun, rbox, weaponRack, type HeroId, type RobotKind, type RobotRig } from "./models";
import { DS, buildDropship, type Dropship } from "./dropship";
import { GADGETS, GADGET_ORDER, GADGET_STORE, LOADOUTS, type GadgetKind } from "./equipment";
import { ATTACHMENTS, WEAPON_UPGRADES, WEAPON_UPGRADE_COSTS, type WeaponSlotKey } from "./store";
import { MISSIONS, ROBOT_INTEL, ScreenPainter, missionStatus, paintBriefing, paintIntel, paintMissionList, robotBars, robotNumbers } from "./intel";
import { bumpOf, diamondPlateTex, emblemDataUrl, jungleTex, labelTex, spaceTex, wornMetalTex } from "./textures";

const UPV = new Vector3(0, 1, 0);
/** Thin rod between two points (hanging cables). */
function span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, mat: Material, parent: Object3D): void {
  const a = new Vector3(x0, y0, z0);
  const b = new Vector3(x1, y1, z1);
  const m = new Mesh(new CylinderGeometry(r, r, a.distanceTo(b), 6), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(UPV, b.sub(a).normalize()));
  parent.add(m);
}

/** The STAR-Tech training station seen in the arrival scene (its hangar sits where the freighter's airlock is). */
function fmtTime(t: number): string {
  if (!t) return "--:--";
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

/** Where the dropship is parked: nose toward the launch window, ramp open toward the Barracks (never touching the heroes). */
const SHIP_POS = new Vector3(1.5, 0, -7.5);
const SHIP_YAW = Math.PI - 0.45;
/** The robot scanning lab on the west side of the hangar. */
const LAB = new Vector3(-11.5, 0, 2.5);

type ScreenId = "title" | "main" | "missions" | "barracks" | "intel" | "options" | "credits" | "results" | "quit" | "bye" | "firsttime" | "none";

/** A camera placement for one menu screen. */
interface Shot {
  pos: Vector3;
  look: Vector3;
  /** inside the dropship: moves in or out go through the rear door */
  inside?: boolean;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Menu {
  readonly el: HTMLDivElement;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 400);
  private screen: ScreenId = "title";
  private t = 0;
  private readonly heroes = new Map<HeroId, Group>();
  private readonly pedestal: Mesh;
  private readonly camPos = new Vector3(9, 4.5, 11);
  private readonly camLook = new Vector3(0, 2, 0);
  private readonly emblem = emblemDataUrl(256);
  onDeploy: ((m: MissionId) => void) | null = null;
  onSettings: (() => void) | null = null;
  private lastResult: MissionResult | null = null;
  private ds!: Dropship;
  /** the camera's current flight between screens */
  private move: { curve: CatmullRomCurve3; t0: number; dur: number; look0: Vector3; door: boolean } | null = null;
  private shotScreen: ScreenId = "title";
  private misSel = 0;
  private botSel = 0;
  /** Armory Store tab in the barracks */
  private storeTab: "hero" | "weapons" | "attach" | "gadgets" | "gear" = "hero";
  private readonly painters = { list: new ScreenPainter(640, 492), brief: new ScreenPainter(1024, 664), intel: new ScreenPainter(640, 492) };
  /** Mission Select: which dropship screen is zoomed in (-1 = all three) */
  private focus = -1;
  private readonly ray = new Raycaster();
  /** a press on a dropship screen: drag scrolls it, a short tap zooms / selects */
  private press: { x: number; y: number; idx: number; lastV: number; moved: number } | null = null;
  private readonly turntable = new Group();
  private readonly bots = new Map<RobotKind, RobotRig>();
  private scanRing!: Mesh;
  private scanMat!: MeshBasicMaterial;

  constructor(root: HTMLElement, private readonly save: SaveData) {
    this.el = document.createElement("div");
    this.el.className = "menu";
    root.appendChild(this.el);
    this.buildHangar();
    this.pedestal = new Mesh(new CylinderGeometry(0.9, 1.0, 0.18, 32), new MeshStandardMaterial({ color: 0x1c2226, emissive: 0x0c3a1c, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.35 }));
    this.pedestal.position.set(0, 0.09, 6.2);
    this.scene.add(this.pedestal);
    this.misSel = save.trainingDone ? 1 : 0;
    this.paintScreens();
    window.addEventListener("keydown", (e) => this.onKey(e));
    this.bindScreenInput();
    this.render();
  }

  // ------------------------------------------------------------------ dropship screens: zoom + scroll
  private get screenPainters(): ScreenPainter[] {
    return [this.painters.list, this.painters.brief, this.painters.intel];
  }

  /** Which dropship screen is under the pointer, and where on it (canvas px, before scrolling). */
  private screenAt(cx: number, cy: number): { idx: number; px: number; py: number } | null {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    this.ray.setFromCamera(new Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects(this.ds.screens, false)[0];
    if (!hit || !hit.uv) return null;
    const idx = this.ds.screens.indexOf(hit.object as Mesh);
    const p = this.screenPainters[idx];
    return { idx, px: hit.uv.x * p.w, py: (1 - hit.uv.y) * p.h };
  }

  private scrollScreen(idx: number, dy: number): void {
    const p = this.screenPainters[idx];
    if (!p || p.maxScroll <= 0) return;
    const next = Math.max(0, Math.min(p.maxScroll, p.scroll + dy));
    if (next === p.scroll) return;
    p.scroll = next;
    this.paintScreens();
  }

  private setFocus(i: number, sound = true): void {
    if (i === this.focus) return;
    this.focus = i;
    if (sound) audio.click();
    this.render();
  }

  /** A tap on a dropship screen: zoom in on it; when already zoomed, pick a mission from the list or zoom back out. */
  private tapScreen(hit: { idx: number; px: number; py: number } | null): void {
    if (!hit) {
      if (this.focus >= 0) this.setFocus(-1);
      return;
    }
    if (this.focus !== hit.idx) {
      this.setFocus(hit.idx);
      return;
    }
    if (hit.idx === 0) {
      const y = hit.py + this.painters.list.scroll - 66;
      const row = Math.floor(y / 104);
      if (y >= 0 && y % 104 <= 92 && row < MISSIONS.length) {
        if (row !== this.misSel) this.pickMission(row);
        return;
      }
    }
    this.setFocus(-1);
  }

  private bindScreenInput(): void {
    const onUi = (t: EventTarget | null): boolean => !!(t as HTMLElement | null)?.closest?.("button, .card, input");
    this.el.addEventListener("pointerdown", (e) => {
      if (this.screen !== "missions" || this.move || onUi(e.target) || e.button > 0) return;
      const hit = this.screenAt(e.clientX, e.clientY);
      this.press = { x: e.clientX, y: e.clientY, idx: hit?.idx ?? -1, lastV: hit?.py ?? 0, moved: 0 };
    });
    this.el.addEventListener("pointermove", (e) => {
      if (this.screen !== "missions") return;
      const hit = this.screenAt(e.clientX, e.clientY);
      this.el.style.cursor = hit && !onUi(e.target) ? (this.press && this.press.moved > 6 ? "grabbing" : "pointer") : "";
      const pr = this.press;
      if (!pr) return;
      pr.moved = Math.max(pr.moved, Math.hypot(e.clientX - pr.x, e.clientY - pr.y));
      // drag to scroll (content follows the finger / mouse)
      if (pr.idx >= 0 && hit && hit.idx === pr.idx) {
        if (pr.moved > 6) this.scrollScreen(pr.idx, pr.lastV - hit.py);
        pr.lastV = hit.py;
      }
    });
    const release = (e: PointerEvent): void => {
      const pr = this.press;
      this.press = null;
      if (!pr || this.screen !== "missions") return;
      if (pr.moved <= 6) this.tapScreen(this.screenAt(e.clientX, e.clientY));
    };
    this.el.addEventListener("pointerup", release);
    this.el.addEventListener("pointercancel", () => (this.press = null));
    this.el.addEventListener(
      "wheel",
      (e) => {
        if (this.screen !== "missions") return;
        const hit = this.screenAt(e.clientX, e.clientY);
        const idx = hit ? hit.idx : this.focus;
        if (idx < 0) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
        this.scrollScreen(idx, e.deltaY * unit * 0.8);
      },
      { passive: false },
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (this.el.hidden) return;
    const prev = e.code === "ArrowLeft" || e.code === "ArrowUp";
    const next = e.code === "ArrowRight" || e.code === "ArrowDown";
    if (this.screen === "missions") {
      if (this.focus >= 0 && (e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "PageUp" || e.code === "PageDown")) {
        // zoomed in: up / down scroll the screen you are reading
        const big = e.code === "PageUp" || e.code === "PageDown";
        this.scrollScreen(this.focus, (e.code === "ArrowDown" || e.code === "PageDown" ? 1 : -1) * (big ? 300 : 60));
      } else if (this.focus >= 0 && e.code === "Escape") this.setFocus(-1);
      else if (e.code === "ArrowUp" || e.code === "ArrowDown") this.pickDifficulty(e.code === "ArrowDown" ? 1 : -1);
      else if (prev || next) this.pickMission(this.misSel + (next ? 1 : -1));
      else if (e.code === "Enter") this.action("misgo");
      else if (e.code === "Escape") this.action("main");
    } else if (this.screen === "intel") {
      if (prev || next) this.pickBot(this.botSel + (next ? 1 : -1));
      else if (e.code === "Escape") this.action("main");
    } else if (e.code === "Escape" && (this.screen === "barracks" || this.screen === "options" || this.screen === "credits")) this.action("main");
  }

  private pickMission(i: number): void {
    const n = MISSIONS.length;
    this.misSel = ((i % n) + n) % n;
    audio.hover();
    this.painters.brief.scroll = 0;
    this.painters.intel.scroll = 0;
    this.paintScreens();
    this.render();
  }

  /** Step the mission difficulty (Recruit / Veteran / Elite); it is saved and used by every real mission. */
  private pickDifficulty(step: number, key?: Difficulty): void {
    const n = DIFFICULTIES.length;
    const cur = DIFFICULTIES.findIndex((d) => d.key === this.save.difficulty);
    const next = key ?? DIFFICULTIES[(((cur + step) % n) + n) % n].key;
    if (next === this.save.difficulty) return;
    this.save.difficulty = next;
    writeSave(this.save);
    audio.hover();
    this.paintScreens();
    this.render();
  }

  private pickBot(i: number): void {
    const n = ROBOT_INTEL.length;
    this.botSel = ((i % n) + n) % n;
    audio.hover();
    this.showBot();
    this.render();
  }

  /** Draw the three dropship screens for the chosen mission. */
  private paintScreens(): void {
    const m = MISSIONS[this.misSel];
    paintMissionList(this.painters.list, this.misSel, this.save);
    paintBriefing(this.painters.brief, m, this.save);
    paintIntel(this.painters.intel, m, this.save);
  }

  /** Put the chosen robot on the lab's scanning turntable (each is built the first time it's shown). */
  private showBot(): void {
    const kind = ROBOT_INTEL[this.botSel].kind;
    for (const [k, r] of this.bots) r.root.visible = k === kind;
    if (!this.bots.has(kind)) {
      const r = buildRobot(kind);
      const sc = Math.min(1, 2.7 / r.height);
      r.root.scale.setScalar(sc);
      r.root.userData.bodyY = r.body.position.y;
      this.turntable.add(r.root);
      this.bots.set(kind, r);
    }
  }

  // ------------------------------------------------------------------ 3D hangar
  private buildHangar(): void {
    const s = this.scene;
    // bright, readable work lighting: sky fill + overhead key + two coloured accents
    s.add(new HemisphereLight(0xc4d6ea, 0x3a3026, 1.35));
    const sunDir = new DirectionalLight(0xfff2e0, 1.3);
    sunDir.position.set(6, 14, 8);
    s.add(sunDir);
    const props = new Group();
    s.add(props);
    // floor: worn diamond plate with a painted landing pad
    const floorTex = diamondPlateTex("hangar", "#464a4f");
    const floorMat = new MeshStandardMaterial({ map: floorTex, bumpMap: bumpOf(floorTex), bumpScale: 0.9, roughness: 0.62, metalness: 0.5 });
    floorMat.map!.repeat.set(10, 10);
    floorMat.bumpMap!.repeat.set(10, 10);
    const floor = new Mesh(new PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    // landing pad sits under the parked dropship, clear of the Barracks line-up
    const pad = new Group();
    pad.position.copy(SHIP_POS);
    pad.rotation.y = SHIP_YAW;
    props.add(pad);
    for (const [w, d, x, z] of [[10.6, 0.25, 0, -7.9], [10.6, 0.25, 0, 6.9], [0.25, 14.8, -5.3, -0.5], [0.25, 14.8, 5.3, -0.5]]) box(w, 0.02, d, M.hazard, x, 0.01, z, pad);
    for (let i = 0; i < 5; i++) box(0.5, 0.012, 1.6, M.white, 0, 0.012, -6 + i * 2.9, pad);
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) cyl(0.12, 0.12, 0.03, M.cyanGlow, s * 5.3, 0.02, -7 + i * 2.7, pad, 10);
    // walls: riveted plating with structural ribs, girders and pipe runs
    const wallTex = wornMetalTex("hangarWall", "#59606a", { cols: 3, rows: 2, rust: 4 });
    const wallMat = new MeshStandardMaterial({ map: wallTex, bumpMap: bumpOf(wallTex), bumpScale: 1.6, roughness: 0.6, metalness: 0.5, side: BackSide });
    wallMat.map!.repeat.set(8, 2);
    wallMat.bumpMap!.repeat.set(8, 2);
    const walls = new Mesh(new CylinderGeometry(20, 20, 12, 8, 1, true), wallMat);
    walls.position.y = 6;
    walls.rotation.y = Math.PI / 8;
    s.add(walls);
    const R = 18.3;
    for (let f = 0; f < 8; f++) {
      const ang = (f / 8) * Math.PI * 2 + Math.PI;
      const face = new Group();
      face.position.set(Math.sin(ang) * R, 0, Math.cos(ang) * R);
      face.rotation.y = ang + Math.PI;
      props.add(face);
      const isWin = f === 0;
      for (const x of isWin ? [-8.9, 8.9] : [-5, 0, 5]) {
        rbox(0.7, 12, 0.5, M.darkMetal, x, 6, 0.05, face, 0.06);
        rbox(0.3, 11.6, 0.2, M.steel, x, 6, 0.36, face, 0.04);
        for (let y = 1; y < 12; y += 2.2) cyl(0.07, 0.07, 0.08, M.steel, x, y, 0.5, face, 8).rotation.x = Math.PI / 2;
      }
      rbox(15.2, 0.6, 0.6, M.darkMetal, 0, 10.2, 0.1, face, 0.06);
      rbox(15.2, 0.12, 0.4, M.hazard, 0, 9.85, 0.25, face, 0.02);
      rbox(15.2, 0.5, 0.35, M.darkMetal, 0, 0.25, 0.05, face, 0.05);
      if (!isWin) {
        for (const y of [7.2, 7.6]) {
          const pr = pipeRun(14.6);
          pr.position.set(0, y, 0.55 + (y - 7.2) * 0.8);
          face.add(pr);
        }
        // wall lamp strip
        box(3, 0.12, 0.08, M.cyanGlow, f % 2 ? -2.5 : 2.5, 5.2, 0.3, face);
        // stencilled bay number
        const lbl = new Mesh(new PlaneGeometry(2.4, 1.2), new MeshStandardMaterial({ map: labelTex("BAY " + (f + 1), "#e8d9a0", "#3a3f45", 256, 128), roughness: 0.7, metalness: 0.3 }));
        lbl.position.set(f % 2 ? 2.5 : -2.5, 8.6, 0.32);
        face.add(lbl);
      }
    }
    // ceiling: plated deck with I-beam trusses and hanging work lamps
    const ceilTex = wornMetalTex("hangarCeil", "#3a3f46", { cols: 4, rows: 4, rust: 2 });
    const ceilMat = new MeshStandardMaterial({ map: ceilTex, roughness: 0.8, metalness: 0.4 });
    ceilMat.map!.repeat.set(4, 4);
    const ceil = new Mesh(new PlaneGeometry(40, 40), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 12;
    s.add(ceil);
    for (const z of [-12, -4, 4, 12]) {
      box(38, 0.7, 0.12, M.darkMetal, 0, 11.4, z, props);
      box(38, 0.08, 0.5, M.steel, 0, 11.05, z, props);
      box(38, 0.08, 0.5, M.steel, 0, 11.75, z, props);
    }
    for (const x of [-10, 0, 10]) box(0.4, 0.4, 36, M.darkMetal, x, 11.8, 0, props);
    const lampMat = new MeshBasicMaterial({ color: 0xfff1d0 });
    for (const [x, z] of [[-7, -4], [7, -4], [-7, 4], [7, 4], [0, -12], [0, 12], [-12, 0], [12, 0]]) {
      span(x, 11.05, z, x, 9.9, z, 0.025, M.cable, props);
      cyl(0.18, 0.95, 0.5, M.darkMetal, x, 9.6, z, props, 16);
      const disc = new Mesh(new CylinderGeometry(0.85, 0.85, 0.02, 16), lampMat);
      disc.position.set(x, 9.34, z);
      props.add(disc);
    }
    // hangar opening to space
    const spaceWin = new Mesh(new PlaneGeometry(16, 7), new MeshBasicMaterial({ map: spaceTex() }));
    spaceWin.position.set(0, 5, -18.3);
    s.add(spaceWin);
    rbox(17, 0.6, 0.6, M.darkMetal, 0, 8.7, -18.2, props, 0.08);
    rbox(17, 0.6, 0.6, M.darkMetal, 0, 1.3, -18.2, props, 0.08);
    rbox(16.4, 0.14, 0.3, M.hazard, 0, 1.65, -18.1, props, 0.03);
    for (let i = 1; i < 4; i++) box(0.18, 7, 0.2, M.darkMetal, -8 + i * 4, 5, -18.2, props);
    // the S-T-E dropship
    this.ds = buildDropship({ rampOpen: true, cabinLights: true });
    const ship = this.ds.root;
    ship.position.copy(SHIP_POS);
    ship.rotation.y = SHIP_YAW;
    s.add(ship);
    ship.updateMatrixWorld(true);
    this.ds.screens[0].material = new MeshBasicMaterial({ map: this.painters.list.tex });
    this.ds.screens[1].material = new MeshBasicMaterial({ map: this.painters.brief.tex });
    this.ds.screens[2].material = new MeshBasicMaterial({ map: this.painters.intel.tex });
    // mission consoles + big jungle-planet monitor on a stand
    for (let i = 0; i < 3; i++) {
      const c = consoleDesk(i === 1 ? "#6fe8ff" : "#3cff78", "hangar" + i, 1.4);
      c.position.set(-12 + i * 1.6, 0, -11);
      c.rotation.y = 0.6;
      props.add(c);
    }
    const stand = new Group();
    stand.position.set(-13.1, 0, -12.5);
    stand.rotation.y = 0.75;
    props.add(stand);
    rbox(6.9, 4.5, 0.25, M.darkMetal, 0, 5.2, -0.05, stand, 0.08);
    rbox(7.1, 0.12, 0.35, M.steel, 0, 2.9, 0, stand, 0.03);
    for (const x of [-2.6, 2.6]) {
      rbox(0.3, 3.2, 0.3, M.steel, x, 1.5, -0.2, stand, 0.05);
      rbox(0.9, 0.12, 1.2, M.darkMetal, x, 0.06, -0.2, stand, 0.04);
    }
    const mon = new Mesh(new PlaneGeometry(6.4, 4), new MeshBasicMaterial({ map: jungleTex() }));
    mon.position.set(0, 5.2, 0.09);
    stand.add(mon);
    // cargo: crate stacks in three finishes, ammo cases, barrels, fuel tank
    const stacks: [number, number, number, boolean, number][] = [
      [10, -6, 2, false, 0], [11.3, -6.2, 1, true, 0], [10.6, -4.6, 1, false, 2], [12, 3, 2, true, 0], [13.2, 3.4, 1, false, 2],
      [-12.6, 10.6, 1, false, 0], [-13.8, 10.9, 2, false, 2], [-13.1, 12.1, 1, true, 0], [8.5, -13.8, 1, false, 2], [9.7, -14.1, 2, true, 0],
    ];
    for (const [x, z, st, tan, v] of stacks) {
      for (let i = 0; i < st; i++) {
        const sz = i === 0 ? 1.2 : 1.0;
        const c = crate(sz, sz, sz, tan, v);
        c.position.set(x, sz / 2 + (i === 0 ? 0 : 1.2), z);
        c.rotation.y = x * 0.3 + i * 0.25;
        props.add(c);
      }
    }
    for (const [x, z, ry] of [[10, -6, 0.4], [-12.6, 10.6, 1.2], [12, 3, -0.3]]) {
      const top = stacks.find((q) => q[0] === x && q[1] === z) ?? stacks[0];
      const a = ammoCase();
      a.position.set(x, top[2] === 2 ? 2.2 : 1.2, z);
      a.rotation.y = ry;
      props.add(a);
    }
    for (const [x, z, y] of [[-8, -9, 0], [-7.3, -9.4, 1], [-7.7, -8.5, 0], [9, 6, 1], [9.6, 6.5, 1], [-6.5, 10, 0], [14.5, -2, 1], [14.1, -1.3, 0]]) {
      const b = barrel(!!y);
      b.position.set(x, 0, z);
      b.rotation.y = x * 1.7;
      props.add(b);
    }
    const tank = fuelTank(4);
    tank.position.set(12.4, 0, -10.8);
    tank.rotation.y = 0.85;
    tank.scale.setScalar(0.85);
    props.add(tank);
    // crew lockers and a weapon rack against the walls
    for (let i = 0; i < 5; i++) {
      const l = locker();
      l.position.set(17.7, 0, 3.2 + i * 0.64);
      l.rotation.y = -Math.PI / 2;
      props.add(l);
    }
    const rack = weaponRack();
    rack.position.set(-17.8, 0, -2);
    rack.rotation.y = Math.PI / 2;
    props.add(rack);
    // bake every static prop into one parent so identical materials merge into single draws
    props.updateMatrixWorld(true);
    const meshes: Object3D[] = [];
    props.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o);
    });
    for (const m of meshes) props.attach(m);
    for (const c of [...props.children]) if (!(c as Mesh).isMesh) props.remove(c);
    compact(props);
    // lights
    const key = new SpotLight(0xf2f6ff, 420, 44, 0.75, 0.55, 1.4);
    key.position.set(SHIP_POS.x + 4, 11, SHIP_POS.z + 6);
    key.target.position.set(SHIP_POS.x, 1, SHIP_POS.z);
    s.add(key, key.target);
    const cyan = new PointLight(0x45e0ff, 45, 22, 1.4);
    cyan.position.set(-11, 4, -9);
    s.add(cyan);
    const warm = new PointLight(0xffb070, 40, 24, 1.4);
    warm.position.set(11, 5, -4);
    s.add(warm);
    const heroLight = new SpotLight(0xf0fff4, 140, 14, 0.5, 0.6, 1.2);
    heroLight.position.set(0, 7, 9.5);
    heroLight.target.position.set(0, 1, 6.2);
    s.add(heroLight, heroLight.target);
    // heroes (Barracks)
    HEROES.forEach((h, i) => {
      const g = buildHero(h.id);
      g.position.set(-3 + i * 2, 0, 3.4);
      this.scene.add(g);
      this.heroes.set(h.id, g);
    });
    this.buildLab();
    // faint dust haze
    const dust = new Mesh(new SphereGeometry(18, 16, 8), new MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.06, side: BackSide, blending: AdditiveBlending, depthWrite: false }));
    dust.position.y = 5;
    s.add(dust);
  }

  /** Robot scanning lab: a turntable under a scanner gantry, holo cone, consoles and a data wall. */
  private buildLab(): void {
    const g = new Group();
    g.position.copy(LAB);
    this.scene.add(g);
    const toCam = new Vector3(6.1, 0, 5.0).normalize();
    g.rotation.y = Math.atan2(toCam.x, toCam.z);
    const glow = new MeshBasicMaterial({ color: 0x55e6ff });
    cyl(2.5, 2.6, 0.06, M.darkMetal, 0, 0.03, 0, g, 48);
    const hz = new Mesh(new RingGeometry(2.25, 2.45, 48), M.hazard);
    hz.rotation.x = -Math.PI / 2;
    hz.position.y = 0.065;
    g.add(hz);
    cyl(1.6, 1.7, 0.26, M.steel, 0, 0.13, 0, g, 48);
    const rim = new Mesh(new TorusGeometry(1.66, 0.035, 8, 64), glow);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.27;
    g.add(rim);
    this.turntable.position.y = 0.26;
    g.add(this.turntable);
    // scanner gantry
    for (const s of [-1, 1]) {
      rbox(0.4, 5.2, 0.5, M.darkMetal, s * 2.7, 2.6, -0.6, g, 0.06);
      rbox(0.2, 4.8, 0.08, M.hazard, s * 2.7, 2.6, -0.33, g, 0.02);
      box(0.06, 3.6, 0.06, M.cyanGlow, s * 2.48, 2.6, -0.6, g);
    }
    rbox(5.8, 0.45, 0.6, M.darkMetal, 0, 5.2, -0.6, g, 0.06);
    const head = new Mesh(new TorusGeometry(1.55, 0.12, 10, 48), M.darkMetal);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 4.6, 0);
    g.add(head);
    const headGlow = new Mesh(new TorusGeometry(1.45, 0.03, 6, 48), glow);
    headGlow.rotation.x = Math.PI / 2;
    headGlow.position.set(0, 4.52, 0);
    g.add(headGlow);
    rbox(0.3, 0.6, 0.3, M.darkMetal, 0, 4.9, -0.3, g, 0.05);
    // holo scan cone and a sweeping scan ring
    const coneMat = new MeshBasicMaterial({ color: 0x55d8ff, transparent: true, opacity: 0.06, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const cone = new Mesh(new CylinderGeometry(1.45, 1.6, 4.25, 40, 1, true), coneMat);
    cone.position.y = 2.4;
    g.add(cone);
    this.scanMat = new MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.scanRing = new Mesh(new RingGeometry(1.2, 1.62, 48), this.scanMat);
    this.scanRing.rotation.x = -Math.PI / 2;
    g.add(this.scanRing);
    // data wall behind and consoles either side
    const wall = new Group();
    wall.position.set(0, 0, -3.4);
    g.add(wall);
    rbox(6.6, 3.6, 0.3, M.darkMetal, 0, 2.6, 0, wall, 0.08);
    const dataTex = new ScreenPainter(1024, 512);
    dataTex.frame("STAR-TECH INTEL · ROBOT DATABASE");
    const dg = dataTex.g;
    dg.strokeStyle = "rgba(111,232,255,0.25)";
    for (let x = 20; x < 1004; x += 40) {
      dg.beginPath();
      dg.moveTo(x, 60);
      dg.lineTo(x, 500);
      dg.stroke();
    }
    for (let y = 60; y < 500; y += 40) {
      dg.beginPath();
      dg.moveTo(20, y);
      dg.lineTo(1004, y);
      dg.stroke();
    }
    ROBOT_INTEL.forEach((r, i) => {
      dataTex.text(`${r.unit.padEnd(13)} ${r.name}`, 40, 110 + i * 70, 30, r.colour);
      dg.fillStyle = r.colour;
      dg.fillRect(640, 88 + i * 70, 60 + r.threat * 60, 24);
    });
    dataTex.scanlines();
    const dw = new Mesh(new PlaneGeometry(6.2, 3.1), new MeshBasicMaterial({ map: dataTex.tex }));
    dw.position.set(0, 2.6, 0.16);
    wall.add(dw);
    for (const s of [-1, 1]) {
      const c = consoleDesk(s > 0 ? "#6fe8ff" : "#ffb040", "lab" + s, 1.3);
      c.position.set(s * 3.6, 0, 0.6);
      c.rotation.y = -s * 0.6;
      g.add(c);
    }
    // lighting on the specimen
    const spot = new SpotLight(0xcff4ff, 90, 12, 0.5, 0.5, 1.3);
    spot.position.set(LAB.x + 3, 7.5, LAB.z + 3);
    spot.target.position.set(LAB.x, 1.2, LAB.z);
    this.scene.add(spot, spot.target);
    const rimL = new PointLight(0x45e0ff, 18, 7, 1.6);
    rimL.position.set(LAB.x - 2, 3, LAB.z - 2);
    this.scene.add(rimL);
    this.showBot();
  }

  /** Where the camera sits for each screen (time-varying for the drifting shots). */
  private shotFor(id: ScreenId, t: number): Shot {
    const ship = this.ds.root;
    const W = (x: number, y: number, z: number): Vector3 => ship.localToWorld(new Vector3(x, y, z));
    switch (id) {
      case "main": {
        // from the open front of the hangar, looking across the dropship to the launch window
        const pos = W(-11.5 + Math.sin(t * 0.12) * 0.9, 4.3 + Math.sin(t * 0.1) * 0.3, -9.5);
        const c = W(0, 1.9, 0.4);
        const dir = c.clone().sub(pos).normalize();
        const right = new Vector3(-dir.z, 0, dir.x);
        return { pos, look: c.addScaledVector(right, -3.6) };
      }
      case "missions": {
        if (this.focus >= 0) {
          // zoomed in on one screen: fill most of the view with it, square on
          const scr = this.ds.screens[this.focus];
          const geo = (scr.geometry as PlaneGeometry).parameters;
          const sc = scr.getWorldScale(new Vector3());
          const c = scr.getWorldPosition(new Vector3());
          const n = new Vector3(0, 0, 1).transformDirection(scr.matrixWorld);
          const tan = Math.tan((25 * Math.PI) / 180);
          // leave room for the title at the top and the control bar at the bottom
          const d = Math.max((geo.height * sc.y * 0.5) / (tan * 0.72), (geo.width * sc.x * 0.5) / (tan * Math.max(0.5, this.camera.aspect) * 0.92));
          const pos = c.clone().addScaledVector(n, d);
          pos.y += Math.sin(t * 0.3) * 0.004;
          // aim a little below the middle so the screen sits just above the control bar
          return { pos, look: c.clone().add(new Vector3(0, -d * tan * 0.1, 0)), inside: true };
        }
        // back far enough that all three screens fit the view, whatever the window shape
        const need = 1.78 / (Math.tan((25 * Math.PI) / 180) * Math.max(0.6, this.camera.aspect));
        const z = DS.bulkZ - Math.max(2.1, Math.min(3.9, need));
        return { pos: W(Math.sin(t * 0.3) * 0.015, 2.02 + Math.sin(t * 0.23) * 0.01, z), look: W(0, 2.1, DS.bulkZ), inside: true };
      }
      case "barracks":
        return { pos: new Vector3(0, 1.7, 10.6), look: new Vector3(0, 1.15, 5.5) };
      case "intel":
        return { pos: new Vector3(LAB.x + 6.1 + Math.sin(t * 0.15) * 0.25, 1.95, LAB.z + 5.0), look: new Vector3(LAB.x, 1.45, LAB.z) };
      case "options":
        return { pos: new Vector3(-5.8 + Math.sin(t * 0.13) * 0.3, 2.6, -4.6), look: new Vector3(-10.6, 2.9, -12.6) };
      case "credits":
        return { pos: new Vector3(-3.6 + Math.sin(t * 0.1) * 0.4, 3.9, -10.2), look: new Vector3(-0.5, 5.4, -18.3) };
      case "quit":
        return { pos: new Vector3(10.2, 8.2, 10.2), look: new Vector3(0, 1.2, -4) };
      case "firsttime":
        return { pos: W(1.6, 2.2, -11.5), look: W(0, 2.0, -2) };
      case "results":
        return { pos: W(-4.6, 2.4, -10.6), look: W(0, 1.9, -4.5) };
      default: {
        // a slow sway along the open front of the hangar (a full orbit would pass behind the back wall)
        const a = 0.35 + Math.sin(t * 0.06) * 0.8;
        return { pos: new Vector3(Math.sin(a) * 15, 5 + Math.sin(t * 0.2) * 0.8, Math.cos(a) * 15 - 1), look: new Vector3(SHIP_POS.x * 0.4, 2.2, SHIP_POS.z * 0.4) };
      }
    }
  }

  /** Fly the camera to a new screen's shot (through the rear door if going in or out of the dropship). */
  private flyTo(id: ScreenId): void {
    if (id === "none" || id === this.shotScreen) return;
    const fromIn = !!this.shotFor(this.shotScreen, this.t).inside;
    const to = this.shotFor(id, this.t + 2);
    this.shotScreen = id;
    const W = (v: Vector3): Vector3 => this.ds.root.localToWorld(v.clone());
    const pts = [this.camPos.clone()];
    const door = fromIn !== !!to.inside;
    if (fromIn && !to.inside) pts.push(W(DS.doorIn), W(DS.doorOut));
    else if (!fromIn && to.inside) pts.push(W(DS.doorOut), W(DS.doorIn));
    else if (!fromIn) {
      // arc up and around the dropship rather than through it
      const mid = this.camPos.clone().lerp(to.pos, 0.5);
      const c = SHIP_POS.clone().setY(2);
      const away = mid.clone().sub(c).setY(0);
      const d = away.length();
      if (d < 8) mid.add(away.normalize().multiplyScalar(8 - d));
      mid.y = Math.max(mid.y, Math.min(7, 2 + this.camPos.distanceTo(to.pos) * 0.12));
      pts.push(mid);
    }
    pts.push(to.pos);
    const curve = new CatmullRomCurve3(pts, false, "centripetal");
    const len = curve.getLength();
    this.move = { curve, t0: this.t, dur: Math.min(3.2, Math.max(1.3, len / (door ? 5 : 8))), look0: this.camLook.clone(), door };
    audio.whoosh(this.move.dur);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Safety net: never let the camera drift through the hangar's eight walls or the roof. */
  private keepInHangar(p: Vector3): void {
    const lim = 18.48 - 1.6;
    for (let k = 0; k < 8; k++) {
      const nx = Math.sin((k * Math.PI) / 4);
      const nz = Math.cos((k * Math.PI) / 4);
      const over = p.x * nx + p.z * nz - lim;
      if (over > 0) {
        p.x -= nx * over;
        p.z -= nz * over;
      }
    }
    p.y = Math.min(10.5, Math.max(0.5, p.y));
  }

  update(dt: number): void {
    this.t += dt;
    const shot = this.shotFor(this.shotScreen, this.t);
    if (this.move) {
      const mv = this.move;
      const u0 = Math.min(1, (this.t - mv.t0) / mv.dur);
      const u = u0 * u0 * (3 - 2 * u0);
      this.camPos.copy(mv.curve.getPointAt(u));
      if (mv.door) {
        // look where we're going through the doorway, then settle on the new view
        const ahead = mv.curve.getPointAt(Math.min(1, u + 0.12));
        ahead.y = this.camPos.y;
        const l = mv.look0.clone().lerp(ahead, smooth(0, 0.3, u));
        this.camLook.copy(l.lerp(shot.look, smooth(0.62, 1, u)));
      } else this.camLook.copy(mv.look0).lerp(shot.look, u);
      if (u0 >= 1) this.move = null;
    } else {
      const k = Math.min(1, dt * 3);
      this.camPos.lerp(shot.pos, k);
      this.camLook.lerp(shot.look, k);
    }
    this.keepInHangar(this.camPos);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.ds.update(this.t);
    // robot lab: slow turntable, idle motion and a sweeping scan
    const bot = this.bots.get(ROBOT_INTEL[this.botSel].kind);
    if (bot && this.screen === "intel") {
      this.turntable.rotation.y = 0.2 + Math.sin(this.t * 0.35) * 1.3;
      bot.body.position.y = (bot.root.userData.bodyY as number) + Math.sin(this.t * 1.6) * 0.025;
      bot.armL.rotation.x = bot.aim * 0.4 + Math.sin(this.t * 0.9) * 0.06;
      bot.armR.rotation.x = bot.aim * 0.4 + Math.sin(this.t * 0.9 + 1) * 0.06;
      for (const sp of bot.spinners) if (ROBOT_INTEL[this.botSel].kind !== "sentinel") sp.rotation.z += dt * 6;
      bot.eyeMat.emissiveIntensity = 2 + Math.sin(this.t * 3) * 0.8;
    }
    const sy = (this.t * 0.6) % 1;
    this.scanRing.position.y = 0.3 + sy * 4.1;
    this.scanMat.opacity = 0.35 * Math.sin(sy * Math.PI);
    // hero line-up: the selected hero steps onto the pedestal and turns
    HEROES.forEach((h, i) => {
      const g = this.heroes.get(h.id)!;
      const sel = h.id === this.save.hero;
      const target = sel ? new Vector3(0, 0.18, 6.2) : new Vector3(-3.4 + i * 2.25, 0, 3.0);
      g.position.lerp(target, Math.min(1, dt * 5));
      if (sel) g.rotation.y = 0.35 + Math.sin(this.t * 0.5) * 0.5;
      else g.rotation.y += (0 - g.rotation.y) * Math.min(1, dt * 4);
      const chest = g.userData.chest as Object3D | undefined;
      if (chest) {
        const br = Math.sin(this.t * 1.7 + i * 1.3);
        chest.scale.set(1 + br * 0.012, 1 + br * 0.018, 1 + br * 0.025);
        chest.rotation.x = br * 0.015;
      }
    });
    this.pedestal.visible = this.screen === "barracks";
  }

  // ------------------------------------------------------------------ screens
  show(id: ScreenId): void {
    if (id !== this.screen) {
      this.focus = -1;
      this.press = null;
      this.el.style.cursor = "";
    }
    this.screen = id;
    if (id === "missions") this.paintScreens();
    if (id === "intel") this.showBot();
    this.flyTo(id === "bye" ? "title" : id);
    this.el.hidden = id === "none";
    this.render();
    audio.setMode(id === "none" || id === "bye" ? "off" : "menu");
  }

  /** True on the goodbye card: the hangar stops animating and stays silent. */
  get idle(): boolean {
    return this.screen === "bye";
  }

  get visible(): boolean {
    return this.screen !== "none";
  }

  showResults(r: MissionResult): void {
    this.lastResult = r;
    this.show("results");
  }

  private btn(label: string, action: string, cls = ""): string {
    return `<button class="mbtn ${cls}" data-a="${action}">${label}</button>`;
  }

  private render(): void {
    const s = this.save;
    const logo = `<div class="logo"><img src="${this.emblem}" alt=""/><h1>STAR-TECH:</h1><h2>GALAXY INFILTRATORS</h2><div class="slogan">COMMAND. INFILTRATE. NEUTRALIZE.</div></div>`;
    const points = `<div class="pointsbox"><div class="t">SQUAD POINTS</div><div class="v">${s.points}</div><div class="h">HERO: ${HEROES.find((h) => h.id === s.hero)!.name}</div><div class="h">DIFFICULTY: <b style="color:${difficultyDef(s.difficulty).colour}">${difficultyDef(s.difficulty).name}</b></div></div>`;
    let html = "";
    switch (this.screen) {
      case "title":
        html = `<div class="screen on">${logo}<div class="clicktostart" data-a="start" style="background:transparent"><div style="height:34vh"></div><div class="go">▶ CLICK TO START</div></div></div>`;
        break;
      case "main":
        html = `<div class="screen on mainmenu">${logo}
          <div class="btns">${this.btn("PLAY", "play", "primary")}${this.btn("MISSION SELECT", "missions")}${this.btn("ENFORCEMENT BARRACKS", "barracks")}${this.btn("ROBOT DATABASE", "intel")}${this.btn("OPTIONS", "options")}${this.btn("CREDITS", "credits")}${this.btn("QUIT GAME", "quit")}</div>
          ${points}
          <div class="infobox"><div class="t">INFORMATION UPDATES</div>${s.log.map((l) => `<div class="l">${l}</div>`).join("")}</div>
          <div class="loctag">HANGAR BAY 2 · DROPSHIP DS-07 READY</div></div>`;
        break;
      case "missions": {
        const m = MISSIONS[this.misSel];
        const tabs = MISSIONS.map((x, k) => `<button class="mtab ${k === this.misSel ? "sel" : ""} ${x.live ? "" : "locked"}" data-a="mis:${k}"><b>${x.num}</b>${x.name}<span>${x.live ? missionStatus(x, s) : "LOCKED"}</span></button>`).join("");
        const diffs = DIFFICULTIES.map((d) => `<button class="mdif ${d.key === s.difficulty ? "sel" : ""}" style="--c:${d.colour}" data-a="dif:${d.key}" title="${d.desc}"><b>${d.name}</b><span>${d.points === 1 ? "STANDARD PTS" : `×${d.points} POINTS`}</span></button>`).join("");
        const dd = difficultyDef(s.difficulty);
        const difNote = m.key === "training" ? "Training always runs at Recruit level" : m.live ? dd.desc : "";
        if (this.focus >= 0) {
          const names = ["MISSION LIST", "BRIEFING", "MISSION INTEL"];
          const tip = this.focus === 0 ? "CLICK A MISSION TO SELECT IT · SCROLL OR DRAG TO READ" : "SCROLL, DRAG OR ▲ ▼ TO READ · CLICK THE SCREEN TO ZOOM OUT";
          html = `<div class="screen on missel zoom"><div class="stitle sm">${names[this.focus]}</div>${this.btn("◀ ALL SCREENS", "zoomout", "small back")}
            <div class="zbar card">${[0, 1, 2].map((k) => `<button class="mtab ${k === this.focus ? "sel" : ""}" data-a="zoom:${k}">${names[k]}</button>`).join("")}
              <div class="mgo">${m.live ? this.btn(m.key === "training" ? "START TRAINING ▶" : "DEPLOY ▶", "misgo", "primary") : `<button class="mbtn" disabled>LOCKED</button>`}</div></div>
            <div class="loctag">${m.num} · ${m.name} · ${tip} · ESC TO ZOOM OUT</div></div>`;
          break;
        }
        html = `<div class="screen on missel"><div class="stitle sm">MISSION SELECT</div>${this.btn("◀ BACK", "main", "small back")}
          <div class="mdiff card ${m.key === "training" || !m.live ? "na" : ""}"><div class="mdt">DIFFICULTY</div><div class="mdb">${diffs}</div><div class="mdn">${difNote}</div></div>
          <div class="mbar card"><div class="mtabs">${tabs}</div>
            <div class="mgo">${m.live ? this.btn(m.key === "training" ? "START TRAINING ▶" : "DEPLOY ▶", "misgo", "primary") : `<button class="mbtn" disabled>LOCKED</button>`}</div></div>
          <div class="loctag">CLICK A SCREEN TO ZOOM IN · SCROLL TO READ · ◀ ▶ MISSION · ▲ ▼ DIFFICULTY</div></div>`;
        break;
      }
      case "intel":
        html = this.intelHtml();
        break;
      case "barracks":
        html = this.barracksHtml(points);
        break;
      case "options":
        html = `<div class="screen on"><div class="stitle">OPTIONS</div>${this.btn("◀ BACK", "main", "small back")}
          <div class="card opts">
            <div class="orow"><span>MOUSE SENSITIVITY</span><input type="range" min="0.3" max="2.5" step="0.05" value="${s.sens}" data-o="sens"></div>
            <div class="orow"><span>SOUND EFFECTS</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-o="sfx"></div>
            <div class="orow"><span>MUSIC</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-o="music"></div>
            <div class="orow"><span>GRAPHICS QUALITY</span><span>${this.btn(s.quality === "high" ? "HIGH" : "PERFORMANCE", "quality", "small")}</span></div>
            <div class="keys"><div><b>W A S D</b>Move</div><div><b>MOUSE</b>Look</div><div><b>L-CLICK</b>Shoot</div><div><b>R-CLICK</b>Aim</div><div><b>SHIFT</b>Sprint (noisy)</div><div><b>CTRL / C</b>Crouch (quiet)</div><div><b>Q</b>Special ability</div><div><b>E</b>Hold to hack / use</div><div><b>R</b>Reload</div><div><b>F</b>Flashlight</div><div><b>TAB</b>Tactical map</div><div><b>ESC</b>Pause</div></div>
          </div></div>`;
        break;
      case "credits":
        html = `<div class="screen on"><div class="stitle">CREDITS</div>${this.btn("◀ BACK", "main", "small back")}
          <div class="card credits"><img src="${this.emblem}" style="width:80px" alt=""/><h3>CREATED BY</h3><div class="cname">Oliver Hart</div><div class="ctag">freddyfoxyten</div><h3>GAME DESIGN &amp; STORY</h3>Original slideshow concept: characters, robots, freighter map, scoring and hangar art direction<h3>STARRING</h3>Brutus · Hale · Cloya · Dax<br/>and the V1 robots: Units V1.1, V1.5, V1.10, V1.15 and V1.20<h3>MADE ON</h3>Tesana</div></div>`;
        break;
      case "results":
        html = this.resultsHtml();
        break;
      case "quit":
        html = `<div class="screen on"><div class="pause"><div class="card box"><h2>QUIT GAME?</h2>
          <div style="font-size:14px;color:#c8d8de">Quit STAR-Tech: Galaxy Infiltrators? Your points, upgrades and gear are saved.</div>
          ${this.btn("QUIT", "bye", "primary")}${this.btn("CANCEL", "main")}</div></div></div>`;
        break;
      case "firsttime":
        html = `<div class="screen on"><div class="pause"><div class="card box"><h2>NEW RECRUIT?</h2>
          <div style="font-size:14px;color:#c8d8de">The <b>STAR-Tech Academy</b> teaches you everything you need for your first mission in about ten minutes.</div>
          ${this.btn("START TRAINING", "train", "primary")}${this.btn("SKIP TO MISSION 1", "skiptrain")}${this.btn("◀ BACK", "main", "small")}</div></div></div>`;
        break;
      case "bye":
        html = `<div class="screen on bye" data-a="title"><div class="byecard"><img src="${this.emblem}" alt=""/>
          <div class="bt">MISSION LOG SAVED</div><div class="bs">Thanks for playing, Infiltrator.</div>
          <div class="bc">Created by <b>Oliver Hart</b></div><div class="ctag">freddyfoxyten</div>
          <div class="bh">You can close this tab now · click anywhere to return</div></div></div>`;
        break;
      default:
        html = "";
    }
    this.el.innerHTML = html;
    this.el.querySelectorAll<HTMLElement>("[data-a]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.action(b.dataset.a!);
      });
      if (!b.classList.contains("bye")) b.addEventListener("mouseenter", () => audio.hover());
    });
    this.el.querySelectorAll<HTMLInputElement>("input[data-o]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const k = inp.dataset.o as "sens" | "sfx" | "music";
        s[k] = parseFloat(inp.value);
        writeSave(s);
        this.onSettings?.();
      });
    });
  }

  private barracksHtml(points: string): string {
    const s = this.save;
    const h = HEROES.find((x) => x.id === s.hero)!;
    const st = heroStats(s, h.id);
    const mk = (k: WeaponSlotKey): string => (s.weaponLvl[h.id][k] > 0 ? ` <em class="mk">MK ${["I", "II", "III", "IV"][s.weaponLvl[h.id][k]]}</em>` : "");
    const pips = (n: number): string => `<div class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>`;
    const u = s.upgrades[h.id];
    const upg = UPGRADES.map((x) => {
      const lvl = u[x.key];
      const cost = lvl < 3 ? UPGRADE_COSTS[lvl] : 0;
      const label = lvl >= 3 ? "MAX" : `${cost} PTS`;
      return `<div class="urow"><div class="ui"><div class="un">${x.name}</div><div class="ud">${x.desc}</div><div class="lv">${[0, 1, 2].map((i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("")}</div></div><button class="mbtn" data-a="up:${x.key}" ${lvl >= 3 || s.points < cost ? "disabled" : ""}>${label}</button></div>`;
    }).join("");
    const gear = GEAR.map((g) => {
      const own = s.gear[g.key];
      return `<div class="urow"><div class="ui"><div class="un">${g.name}</div><div class="ud">${g.desc}</div></div><button class="mbtn" data-a="gear:${g.key}" ${own || s.points < g.cost ? "disabled" : ""}>${own ? "OWNED" : `${g.cost} PTS`}</button></div>`;
    }).join("");
    return `<div class="screen on barracks"><div class="stitle">ENFORCEMENT BARRACKS</div>${this.btn("◀ BACK", "main", "small back")}
      <div class="card details"><div class="nm">${h.name}</div><div class="rl">${h.role.toUpperCase()} · ${h.roleTag} · AGE ${h.age}</div><div class="bl">${h.blurb}</div>
        <div class="stat"><span>HEALTH</span>${pips(h.stats.health)}</div><div class="stat"><span>POWER</span>${pips(h.stats.power)}</div><div class="stat"><span>SPEED</span>${pips(h.stats.speed)}</div><div class="stat"><span>STEALTH</span>${pips(h.stats.stealth)}</div>
        <div class="kv" style="margin-top:8px">ABILITY <b>[Q] ${h.ability}</b></div><div class="kv" style="color:#c8d8de">${h.abilityDesc}</div>
        <div class="loadout-card"><div class="lt">LOADOUT</div>
          <div class="li"><i>1</i><span>PRIMARY</span><b>${h.weaponName}${mk("primary")}</b></div>
          <div class="li"><i>2</i><span>SIDEARM</span><b>${st.loadout.secondary.name}${mk("secondary")}</b></div>
          <div class="li"><i>3</i><span>MELEE</span><b>${st.loadout.melee.name}${mk("melee")}</b></div>
          ${st.loadout.gadgets.map((gd, i) => `<div class="li gd" title="${GADGETS[gd.kind].desc}"><i>${i ? "T" : "G"}</i><span>GADGET</span><b>${GADGETS[gd.kind].name} ×${gd.count + st.gadgetBonus}</b></div>`).join("")}
          ${st.fitted.length ? `<div class="li at"><i>+</i><span>FITTED</span><b>${st.fitted.map((a) => ATTACHMENTS.find((x) => x.id === a)?.name ?? a).join(", ")}</b></div>` : ""}
          <div class="lh">${st.loadout.gadgets.map((gd) => `<b>${GADGETS[gd.kind].name}:</b> ${GADGETS[gd.kind].desc}`).join("<br/>")}</div></div>
        <div class="kv" style="margin-top:6px">MAX HEALTH <b>${st.hp}</b> · DAMAGE <b>${Math.round(st.damage)}</b> · MAG <b>${st.mag}</b></div></div>
      ${this.storeHtml(h.id, upg, gear)}
      <div class="deploy">${this.btn("DEPLOY ▶", "play", "primary")}</div>
      <div class="roster">${HEROES.map((x) => `<div class="card hcard ${x.id === s.hero ? "sel" : ""}" data-a="hero:${x.id}"><div class="n">${x.name}</div><div class="r">${x.role.toUpperCase()}</div></div>`).join("")}</div>
      ${points.replace('class="pointsbox"', 'class="pointsbox" style="bottom:auto;top:4%;left:auto;right:3%"')}</div>`;
  }

  /** The Armory Store: tabs for hero upgrades, weapon overhauls, attachments, gadgets and squad gear. */
  private storeHtml(id: HeroId, upg: string, gear: string): string {
    const s = this.save;
    const name = HEROES.find((x) => x.id === id)!.name;
    const tabs: [typeof this.storeTab, string][] = [["hero", "HERO"], ["weapons", "WEAPONS"], ["attach", "ATTACHMENTS"], ["gadgets", "GADGETS"], ["gear", "SQUAD GEAR"]];
    const lvBar = (lvl: number): string => `<div class="lv">${[0, 1, 2].map((i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("")}</div>`;
    const buy = (a: string, cost: number, done: boolean, doneLabel: string): string => `<button class="mbtn" data-a="${a}" ${done || s.points < cost ? "disabled" : ""}>${done ? doneLabel : `${cost} PTS`}</button>`;
    let body = "";
    if (this.storeTab === "hero") body = `<h4>${name} UPGRADES</h4>${upg}`;
    else if (this.storeTab === "weapons") {
      const lo = LOADOUT_NAMES(id);
      body = `<h4>${name} WEAPONS</h4>` + WEAPON_UPGRADES.map((w) => {
        const lvl = s.weaponLvl[id][w.key];
        const cost = lvl < 3 ? WEAPON_UPGRADE_COSTS[lvl] : 0;
        return `<div class="urow"><div class="ui"><div class="un">${w.name} <span class="wn">· ${lo[w.key]}</span></div><div class="ud">${w.desc}</div>${lvBar(lvl)}</div>${buy(`wup:${w.key}`, cost, lvl >= 3, "MAX")}</div>`;
      }).join("");
    } else if (this.storeTab === "attach") {
      const owned = s.attachOwned[id];
      const off = s.attachOff[id];
      const lo = LOADOUT_NAMES(id);
      const rows = (slot: "primary" | "secondary"): string =>
        ATTACHMENTS.filter((a) => a.slot === slot)
          .map((a) => {
            const has = owned.includes(a.id);
            const on = has && !off.includes(a.id);
            const btn = has ? `<button class="mbtn ${on ? "on" : ""}" data-a="att:${a.id}">${on ? "FITTED ✔" : "FIT"}</button>` : buy(`att:${a.id}`, a.cost, false, "");
            return `<div class="urow"><div class="ui"><div class="un">${a.name}</div><div class="ud">${a.desc}</div></div>${btn}</div>`;
          })
          .join("");
      body = `<h4>${lo.primary}</h4>${rows("primary")}<h4 style="margin-top:12px">${lo.secondary}</h4>${rows("secondary")}<div class="snote">Attachments are for ${name}. Bought ones can be fitted or taken off for free.</div>`;
    } else if (this.storeTab === "gadgets") {
      const slots = s.gadgetSlots[id];
      body =
        `<h4>${name} GADGETS</h4><div class="gslots"><div><i>G</i>${GADGETS[slots[0]].name}</div><div><i>T</i>${GADGETS[slots[1]].name}</div></div>` +
        GADGET_ORDER.map((k) => {
          const avail = gadgetAvailable(s, id, k);
          const inG = slots[0] === k;
          const inT = slots[1] === k;
          const btns = avail
            ? `<div class="gb"><button class="mbtn sm ${inG ? "on" : ""}" data-a="geq:0:${k}" ${inG ? "disabled" : ""}>${inG ? "IN G" : "USE G"}</button><button class="mbtn sm ${inT ? "on" : ""}" data-a="geq:1:${k}" ${inT ? "disabled" : ""}>${inT ? "IN T" : "USE T"}</button></div>`
            : buy(`gun:${k}`, GADGET_STORE[k].price, false, "");
          const isNew = k === "smoke" || k === "shock" || k === "turret";
          return `<div class="urow ${avail ? "" : "locked"}"><div class="ui"><div class="un">${GADGETS[k].name} <span class="wn">×${gadgetCount(id, k) + (s.gear.belt ? 1 : 0)}</span>${isNew ? ' <em class="new">NEW</em>' : ""}</div><div class="ud">${GADGETS[k].desc}</div></div>${btns}</div>`;
        }).join("") +
        `<div class="snote">Unlocking a gadget unlocks it for the whole squad. Each hero's own two are free.</div>`;
    } else body = `<h4>SQUAD GEAR</h4>${gear}<div class="snote">Squad gear helps every hero.</div>`;
    return `<div class="card upg store"><div class="stabs">${tabs.map(([k, l]) => `<button class="stab ${this.storeTab === k ? "on" : ""}" data-a="tab:${k}">${l}</button>`).join("")}</div><div class="sbody">${body}</div></div>`;
  }

  private threatBars(n: number): string {
    return `<span class="thr">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
  }

  private intelHtml(): string {
    const s = this.save;
    const r = ROBOT_INTEL[this.botSel];
    const b = robotBars(r.kind);
    const n = robotNumbers(r.kind, s.difficulty);
    const dnm = difficultyDef(s.difficulty);
    const pips = (v: number, col: string): string => `<div class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < v ? "on" : ""}" style="${i < v ? `background:${col};box-shadow:0 0 5px ${col}` : ""}"></i>`).join("")}</div>`;
    const list = ROBOT_INTEL.map(
      (x, i) => `<div class="irow ${i === this.botSel ? "sel" : ""}" data-a="bot:${i}" style="--c:${x.colour}"><div class="in">${x.name}</div><div class="iu">${x.unit} · ${x.cls}</div><div class="ith">THREAT ${this.threatBars(x.threat)}</div></div>`,
    ).join("");
    return `<div class="screen on intel"><div class="stitle">ROBOT DATABASE</div>${this.btn("◀ BACK", "main", "small back")}
      <div class="card ilist"><h4>KNOWN HOSTILES</h4>${list}
        <div class="inote">Robot eyes: <b style="color:#ff5a40">RED</b> patrolling · <b style="color:#ffc020">YELLOW</b> suspicious · <b style="color:#ff2010">BRIGHT RED</b> spotted you</div></div>
      <div class="card idetail" style="--c:${r.colour}">
        <div class="nm">${r.name}</div><div class="rl">${r.unit} · ${r.cls} · THREAT ${this.threatBars(r.threat)}</div>
        <div class="bl">${r.desc}</div>
        <div class="stat"><span>ARMOUR</span>${pips(b.armour, r.colour)}</div>
        <div class="stat"><span>DAMAGE</span>${pips(b.damage, r.colour)}</div>
        <div class="stat"><span>SPEED</span>${pips(b.speed, r.colour)}</div>
        <div class="stat"><span>SENSORS</span>${pips(b.senses, r.colour)}</div>
        <div class="igridt">MISSION STATS AT <b style="color:${dnm.colour}">${dnm.name}</b> DIFFICULTY</div>
        <div class="igrid">
          <div><em>HEALTH</em><b>${n.hp}</b></div><div><em>DAMAGE / HIT</em><b>${n.dmg}</b></div><div><em>ATTACKS / SEC</em><b>${n.rate}</b></div>
          <div><em>TOP SPEED</em><b>${n.run} m/s</b></div><div><em>SIGHT RANGE</em><b>${n.view} m</b></div><div><em>ATTACK RANGE</em><b>${n.range}</b></div>
        </div>
        <div class="kv"><span>WEAPONS</span>${r.attack}</div>
        <div class="kv"><span>WEAK POINT</span>${r.weak}</div>
        <div class="kv"><span>TACTICS</span>${r.tactics}</div>
        <div class="kv"><span>FOUND IN</span>${r.found}</div>
        <div class="ifoot"><div>REWARD <b>+${n.points} PTS</b></div><div>DESTROYED <b>×${s.kills[r.kind]}</b></div></div>
      </div>
      <div class="loctag">INTEL LAB · HOLOGRAPHIC SCAN · ◀ ▶ TO BROWSE</div></div>`;
  }

  private resultsHtml(): string {
    const r = this.lastResult;
    if (!r) return "";
    if (r.mission === "training") return this.trainingResultsHtml(r);
    const names: Record<string, string> = { drone: "Scout Drones (Unit V1.1)", sentinel: "Blade Sentinels (Unit V1.5)", ripper: "Rippers (Unit V1.10)", bulwark: "Bulwarks (Unit V1.15)", warlord: "Warlord (Unit V1.20)" };
    const dif = difficultyDef(r.difficulty);
    const pts = (k: string): number => scaledPoints(ROBOT_POINTS[k as RobotKind], r.difficulty);
    const rows = Object.entries(r.kills)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `<div class="rr"><span>${names[k]} ×${n}</span><b>+${n * pts(k)}</b></div>`)
      .join("");
    const mins = Math.floor(r.time / 60);
    const secs = String(Math.floor(r.time % 60)).padStart(2, "0");
    return `<div class="screen on"><div class="card results ${r.won ? "" : "fail"}">
      <img src="${this.emblem}" alt=""/>
      <div class="rt">${r.won ? "MISSION COMPLETE" : "MISSION FAILED"}</div>
      <div style="color:#9fb4bd;font-size:13px">${r.mission === "colony" ? "REMOTE COLONY" : "ABANDONED FREIGHTER"} · <b style="color:${dif.colour}">${dif.name}</b> · TIME ${mins}:${secs} · SPOTTED ${r.spotted}×</div>
      <div class="sec">${r.secured.map((x) => `<span class="${x.done ? "ok" : ""}">${x.done ? "✔" : "✖"} ${x.name}</span>`).join("")}</div>
      <div class="rows">${rows || `<div class="rr"><span>No robots destroyed</span><b>0</b></div>`}
        <div class="rr"><span>Combat points</span><b>${r.combatPoints}</b></div>
        ${r.armory ? `<div class="rr"><span>${r.extraLabel ?? "Armory secured"}</span><b>+${scaledPoints(r.mission === "colony" ? RESCUE_BONUS : ARMORY_BONUS, r.difficulty)}</b></div>` : ""}
        <div class="rr"><span>Mission bonus</span><b>${r.won ? `+${r.bonus}` : "—"}</b></div>
        ${dif.points !== 1 ? `<div class="rr"><span style="color:${dif.colour}">${dif.name} difficulty: every reward ×${dif.points}</span><b style="color:${dif.colour}">×${dif.points}</b></div>` : ""}
        <div class="rr tot"><span>POINTS EARNED</span><b>${r.total}</b></div>
        <div class="rr"><span>Squad points total</span><b>${this.save.points}</b></div></div>
      ${r.won ? "" : `<div style="font-size:13px;color:#c8d8de">Your points were kept. Spend them in the Barracks and try again!</div>`}
      <div class="rb">${this.btn(r.won ? "PLAY AGAIN" : "RETRY", "replay", "primary")}${this.btn("ENFORCEMENT BARRACKS", "barracks")}${this.btn("MAIN MENU", "main")}</div>
    </div></div>`;
  }

  private trainingResultsHtml(r: MissionResult): string {
    const acc = Math.round((r.accuracy ?? 0) * 100);
    const gradeCol = r.grade === "ELITE" ? "#ffd060" : r.grade === "SPECIALIST" ? "#7fe8ff" : "#c8d8de";
    return `<div class="screen on"><div class="card results">
      <img src="${this.emblem}" alt=""/>
      <div class="rt">${r.won ? "TRAINING COMPLETE" : "TRAINING ENDED"}</div>
      <div style="color:#9fb4bd;font-size:13px">STAR-TECH ACADEMY · TIME ${fmtTime(r.time)} · ACCURACY ${acc}% · SPOTTED ${r.spotted}×</div>
      ${r.won ? `<div style="font-family:var(--head);font-size:34px;letter-spacing:6px;margin:8px 0;color:${gradeCol};text-shadow:0 0 14px ${gradeCol}">GRADE: ${r.grade}</div>` : ""}
      <div class="sec">${r.secured.map((x) => `<span class="${x.done ? "ok" : ""}">${x.done ? "✔" : "✖"} ${x.name}</span>`).join("")}</div>
      <div class="rows">
        ${r.won ? `<div class="rr"><span>${r.firstClear ? "First completion reward" : r.total > 0 ? "New best time bonus" : "Replay (no reward)"}</span><b>+${r.total}</b></div>` : `<div class="rr"><span>Training left early</span><b>0</b></div>`}
        ${r.bestTime ? `<div class="rr"><span>Best time</span><b>${fmtTime(r.bestTime)}</b></div>` : ""}
        <div class="rr tot"><span>POINTS EARNED</span><b>${r.total}</b></div>
        <div class="rr"><span>Squad points total</span><b>${this.save.points}</b></div></div>
      ${r.won ? `<div style="font-size:13px;color:#c8d8de">You're ready. The Abandoned Freighter awaits!</div>` : ""}
      <div class="rb">${r.won ? this.btn("MISSION 1 ▶", "play1", "primary") : this.btn("RETRY TRAINING", "train", "primary")}${this.btn(r.won ? "TRAIN AGAIN" : "SKIP TO MISSION 1", r.won ? "train" : "skiptrain")}${this.btn("MAIN MENU", "main")}</div>
    </div></div>`;
  }

  private action(a: string): void {
    const s = this.save;
    if (a === "start") {
      audio.unlock();
      audio.confirm();
      this.show("main");
      return;
    }
    audio.click();
    if (a === "bye") {
      this.show("bye");
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      if (document.pointerLockElement) document.exitPointerLock();
      try {
        if (window.top === window.self) window.close(); // only works when the game was opened in its own window
      } catch {
        /* browsers block closing embedded pages */
      }
      return;
    }
    if (a === "play" && !s.trainingDone && !s.trainingOffered) {
      this.show("firsttime");
      return;
    }
    if (a === "play" || a === "play1" || a === "train" || a === "skiptrain" || a === "replay") {
      if (a === "skiptrain" || a === "train") {
        s.trainingOffered = true;
        writeSave(s);
      }
      audio.confirm();
      const m: MissionId = a === "train" ? "training" : a === "replay" ? (this.lastResult?.mission ?? "freighter") : "freighter";
      this.onDeploy?.(m);
      return;
    }
    if (a === "zoomout") {
      this.setFocus(-1, false);
      return;
    }
    if (a.startsWith("zoom:")) {
      this.setFocus(parseInt(a.slice(5), 10), false);
      return;
    }
    if (a.startsWith("dif:")) {
      this.pickDifficulty(0, a.slice(4) as Difficulty);
      return;
    }
    if (a.startsWith("mis:")) {
      this.pickMission(parseInt(a.slice(4), 10));
      return;
    }
    if (a === "misgo") {
      const m = MISSIONS[this.misSel];
      if (!m.live) {
        audio.denied();
        return;
      }
      if (m.key === "colony") {
        audio.confirm();
        this.onDeploy?.("colony");
        return;
      }
      this.action(m.key === "training" ? "train" : "play1");
      return;
    }
    if (a.startsWith("bot:")) {
      this.pickBot(parseInt(a.slice(4), 10));
      return;
    }
    if (a === "quality") {
      s.quality = s.quality === "high" ? "low" : "high";
      writeSave(s);
      this.onSettings?.();
      this.render();
      return;
    }
    if (a.startsWith("hero:")) {
      s.hero = a.slice(5) as HeroId;
      writeSave(s);
      this.render();
      return;
    }
    if (a.startsWith("up:")) {
      const key = a.slice(3) as "health" | "damage" | "ability";
      const lvl = s.upgrades[s.hero][key];
      const cost = UPGRADE_COSTS[lvl];
      if (lvl < 3 && s.points >= cost) {
        s.points -= cost;
        s.upgrades[s.hero][key]++;
        audio.upgrade();
        s.log.unshift(`${HEROES.find((h) => h.id === s.hero)!.name}: ${UPGRADES.find((u) => u.key === key)!.name.toUpperCase()} LV ${lvl + 1}`);
        s.log = s.log.slice(0, 8);
        writeSave(s);
      } else audio.denied();
      this.render();
      return;
    }
    if (a.startsWith("tab:")) {
      this.storeTab = a.slice(4) as typeof this.storeTab;
      this.render();
      return;
    }
    const heroName = HEROES.find((h) => h.id === s.hero)!.name;
    const logLine = (t: string): void => {
      s.log.unshift(t.toUpperCase());
      s.log = s.log.slice(0, 8);
    };
    if (a.startsWith("wup:")) {
      const key = a.slice(4) as WeaponSlotKey;
      const lvl = s.weaponLvl[s.hero][key];
      const cost = WEAPON_UPGRADE_COSTS[lvl];
      if (lvl < 3 && s.points >= cost) {
        s.points -= cost;
        s.weaponLvl[s.hero][key]++;
        audio.upgrade();
        logLine(`${heroName}: ${LOADOUT_NAMES(s.hero)[key]} MK ${["I", "II", "III", "IV"][lvl + 1]}`);
        writeSave(s);
      } else audio.denied();
      this.render();
      return;
    }
    if (a.startsWith("att:")) {
      const id = a.slice(4);
      const def = ATTACHMENTS.find((x) => x.id === id);
      const owned = s.attachOwned[s.hero];
      const off = s.attachOff[s.hero];
      if (def && owned.includes(id)) {
        // toggle fitted / taken off
        if (off.includes(id)) s.attachOff[s.hero] = off.filter((x) => x !== id);
        else off.push(id);
        audio.confirm();
        writeSave(s);
      } else if (def && s.points >= def.cost) {
        s.points -= def.cost;
        owned.push(id);
        audio.upgrade();
        logLine(`${heroName}: ${def.name} FITTED`);
        writeSave(s);
      } else audio.denied();
      this.render();
      return;
    }
    if (a.startsWith("gun:")) {
      const k = a.slice(4) as GadgetKind;
      const cost = GADGET_STORE[k]?.price ?? 0;
      if (cost && !s.gadgetsOwned.includes(k) && s.points >= cost) {
        s.points -= cost;
        s.gadgetsOwned.push(k);
        audio.upgrade();
        logLine(`GADGET UNLOCKED: ${GADGETS[k].name}`);
        writeSave(s);
      } else audio.denied();
      this.render();
      return;
    }
    if (a.startsWith("geq:")) {
      const [, si, k] = a.split(":") as [string, string, GadgetKind];
      const i = si === "1" ? 1 : 0;
      const slots = s.gadgetSlots[s.hero];
      if (gadgetAvailable(s, s.hero, k)) {
        // picking the gadget already in the other slot swaps the two
        if (slots[1 - i] === k) slots[1 - i] = slots[i];
        slots[i] = k;
        audio.confirm();
        writeSave(s);
      } else audio.denied();
      this.render();
      return;
    }
    if (a.startsWith("gear:")) {
      const key = a.slice(5) as GearKey;
      const g = GEAR.find((x) => x.key === key)!;
      if (!s.gear[key] && s.points >= g.cost) {
        s.points -= g.cost;
        s.gear[key] = true;
        audio.upgrade();
        s.log.unshift(`NEW GEAR: ${g.name.toUpperCase()}`);
        s.log = s.log.slice(0, 8);
        writeSave(s);
      } else audio.denied();
      this.render();
      return;
    }
    this.show(a as ScreenId);
  }
}

/** Names of a hero's three weapons, keyed by store slot. */
function LOADOUT_NAMES(id: HeroId): Record<WeaponSlotKey, string> {
  const h = HEROES.find((x) => x.id === id)!;
  const lo = LOADOUTS[id];
  return { primary: h.weaponName, secondary: lo.secondary.name, melee: lo.melee.name };
}

// ------------------------------------------------------------------ the ride in (cutscene)
const sstep = (a: number, b: number, x: number): number => smooth(a, b, x);

/** Radio chatter during the ride: [time, text]. `{dest}` and `{hero}` are filled in. */
const RIDE_LINES: [number, string][] = [
  [0.5, "PILOT: DS-07 lifting off the <b>Vanguard</b>. Sealing the ramp, hold on to something."],
  [3.6, "PILOT: Burning hard for {dest}. Squad, check your gear."],
  [9.3, "PILOT: Coming up on target. <b>Flipping for docking</b>!"],
  [12.2, "{approach}"],
  [15.0, "PILOT: Hard seal. Ramp's yours, {hero}. <b>Good hunting.</b>"],
];

/**
 * The ride in: you sit in the dropship's troop cabin looking aft through the ramp as the ship
 * leaves the STC Vanguard, burns across space, flips (seen from outside), then backs in to dock
 * at the mission (the freighter's airlock or the Academy's hangar).
 */
export class Intro {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(58, 1, 0.05, 1400);
  private readonly ship: Group;
  private readonly shipModel: Dropship;
  private t = 0;
  readonly duration = 16.4;
  private readonly freighter: Exterior;
  private station: Exterior | null = null;
  /** Mission 2: the colony's desert, landing pad and domes (built the first time it's needed) */
  private colony: { root: Group; world: Exterior; air: Mesh; airMat: MeshBasicMaterial; fog: FogExp2 } | null = null;
  private readonly carrier: ReturnType<typeof buildCarrier>;
  private readonly sky: Mesh;
  private readonly field: Mesh;
  private readonly fieldMat: MeshBasicMaterial;
  private readonly fieldBars: Mesh[] = [];
  private readonly thrustLight: PointLight;
  private readonly dust: LineSegments;
  private readonly dustPos: Float32Array;
  private readonly dustPts: Vector3[] = [];
  private readonly squad = new Map<HeroId, Group>();
  private readonly prevPos = new Vector3();
  private readonly localVel = new Vector3();
  private fired = new Set<string>();
  private mission: MissionId = "freighter";
  private hero: HeroId = "hale";
  /** docking point: the rear door meets the airlock collar / hangar field (ship scale 0.8) */
  private readonly D = new Vector3(18, -1.3, 10.5);
  /** where the flip happens and where the launch starts */
  private readonly F = new Vector3(18, -0.3, 72);
  private readonly S = new Vector3(18, 2, 330);

  constructor() {
    const s = this.scene;
    s.add(new HemisphereLight(0x8090c0, 0x101018, 0.9));
    const sun = new PointLight(0xfff0e0, 2600, 0, 1);
    sun.position.set(-80, 60, 80);
    s.add(sun);
    this.sky = new Mesh(new SphereGeometry(600, 40, 20), new MeshBasicMaterial({ map: spaceTex(), side: BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -1;
    s.add(this.sky);
    this.freighter = buildFreighterShip();
    s.add(this.freighter.root);
    this.carrier = buildCarrier();
    // the hangar mouth sits just behind the launch point
    this.carrier.root.position.copy(this.S).add(new Vector3(0, 0, 16)).sub(this.carrier.hangar);
    s.add(this.carrier.root);
    this.shipModel = buildDropship({ rampOpen: false, cabinLights: true, viewport: true });
    this.ship = this.shipModel.root;
    this.ship.scale.setScalar(0.8);
    s.add(this.ship);
    // a faint force field across the open ramp (keeps the air in)
    const ft = document.createElement("canvas");
    ft.width = 64;
    ft.height = 256;
    const fc = ft.getContext("2d")!;
    for (let y = 0; y < 256; y += 8) {
      fc.fillStyle = `rgba(120,230,255,${y % 32 === 0 ? 0.55 : 0.18})`;
      fc.fillRect(0, y, 64, 2);
    }
    const tex = new CanvasTexture(ft);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(1, 1.5);
    this.fieldMat = new MeshBasicMaterial({ map: tex, color: 0x66e0ff, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.field = new Mesh(new PlaneGeometry(2.72, 2.2), this.fieldMat);
    this.field.position.set(0, 2.0, DS.rearZ - 0.1);
    this.ship.add(this.field);
    for (const sx of [-1, 1]) this.fieldBars.push(box(0.04, 2.2, 0.04, M.cyanGlow, sx * 1.37, 2.0, DS.rearZ - 0.1, this.ship));
    // engine wash lighting the ramp platform
    this.thrustLight = new PointLight(0x7fe8ff, 0, 9, 1.6);
    this.thrustLight.position.set(0, 1.6, DS.rearZ - 3.2);
    this.ship.add(this.thrustLight);
    // space dust that streaks past (ship-local; never inside the hull)
    const N = 420;
    this.dustPos = new Float32Array(N * 6);
    const dg = new BufferGeometry();
    dg.setAttribute("position", new BufferAttribute(this.dustPos, 3));
    this.dust = new LineSegments(dg, new LineBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.ship.add(this.dust);
    for (let k = 0; k < N; k++) this.dustPts.push(this.spawnDust(new Vector3(), -8 - Math.random() * 140));
  }

  /** A dust mote somewhere around the ship at local z, outside the hull. */
  private spawnDust(v: Vector3, z: number): Vector3 {
    for (;;) {
      v.set((Math.random() - 0.5) * 44, (Math.random() - 0.5) * 26 + 2, z);
      if (Math.abs(v.x) > 5 || v.y > 6 || v.y < -2) return v;
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get time(): number {
    return this.t;
  }

  reset(mission: MissionId = "freighter", hero: HeroId = "hale"): void {
    this.t = 0;
    this.mission = mission;
    this.hero = hero;
    this.fired.clear();
    if (mission === "training" && !this.station) {
      this.station = buildAcademyStation();
      this.scene.add(this.station.root);
    }
    if (mission === "colony" && !this.colony) this.colony = this.buildColony();
    this.freighter.root.visible = mission === "freighter";
    if (this.station) this.station.root.visible = mission === "training";
    if (this.colony) {
      this.colony.root.visible = mission === "colony";
      this.colony.air.visible = mission === "colony";
    }
    this.scene.fog = mission === "colony" && this.colony ? this.colony.fog : null;
    // the other three heroes ride along: two braced against the wall, one at the ramp's edge
    const others = HEROES.map((h) => h.id).filter((id) => id !== hero);
    for (const [id, g] of this.squad) g.visible = others.includes(id);
    const spots: [number, number, number][] = [
      [-0.95, -2.95, Math.PI / 2 + 0.3],
      [-0.98, -4.25, Math.PI / 2 - 0.35],
      [0.98, -3.75, -Math.PI / 2 - 0.5],
    ];
    others.forEach((id, k) => {
      let g = this.squad.get(id);
      if (!g) {
        g = buildHero(id);
        this.ship.add(g);
        this.squad.set(id, g);
      }
      const [x, z, ry] = spots[k];
      g.position.set(x, DS.floorY + 0.02, z);
      g.rotation.set(0, ry, 0);
      g.userData.ry = ry;
      g.userData.ph = k * 1.7;
    });
    this.place(0);
    this.prevPos.copy(this.ship.position);
  }

  /** The colony landing site: a desert pad with the airlock and tunnel leading to the domes. */
  private buildColony(): { root: Group; world: Exterior; air: Mesh; airMat: MeshBasicMaterial; fog: FogExp2 } {
    const root = new Group();
    const g0 = this.D.y; // the pad's top: the landed ship's skids sit here
    const gy = g0 - 0.25;
    const world = buildColonySurface({
      centre: new Vector3(18, gy, -30),
      groundY: gy,
      radius: 320,
      exclude: { minX: 4, maxX: 32, minZ: -40, maxZ: 22 },
      domes: [[18, -26, 12], [2, -31, 8], [34, -30, 8], [18, -48, 9], [-14, -52, 14], [52, -58, 16], [22, -92, 20]],
      derrick: [-22, -12],
      tower: [50, -8],
      solar: [[36, 12], [-8, 12]],
    });
    root.add(world.root);
    // landing pad
    const padM = new MeshStandardMaterial({ map: diamondPlateTex("ipad", "#5e5448"), roughness: 0.7, metalness: 0.5 });
    box(15, 0.25, 15, padM, 18, gy + 0.125, 11, root);
    for (const sx of [-1, 1]) {
      box(0.35, 0.27, 15, M.hazard, 18 + sx * 7.3, gy + 0.13, 11, root);
      for (let k = 0; k < 5; k++) box(0.25, 0.12, 0.25, M.greenGlow, 18 + sx * 7.3, g0 + 0.07, 5 + k * 3, root);
    }
    box(8, 0.02, 0.3, M.hazard, 18, g0 + 0.01, 11, root);
    // the colony airlock the ramp mates with, and the tunnel back to the domes
    const hull = new MeshStandardMaterial({ color: 0x6e5e4c, roughness: 0.8, metalness: 0.3 });
    rbox(6, 4.4, 3, hull, 18, g0 + 2.2, 4, root, 0.2);
    box(2.6, 2.7, 0.08, M.darkMetal, 18, g0 + 1.35, 5.52, root);
    for (const sx of [-1, 1]) box(1.06, 2.4, 0.06, M.darkMetal, 18 + sx * 0.56, g0 + 1.25, 5.54, root);
    box(0.08, 2.4, 0.07, M.greenGlow, 18, g0 + 1.25, 5.55, root);
    box(1.6, 0.1, 0.07, M.greenGlow, 18, g0 + 2.55, 5.55, root);
    box(2.9, 0.18, 0.2, M.hazard, 18, g0 + 2.8, 5.55, root);
    for (const sx of [-1, 1]) box(0.18, 2.8, 0.2, M.hazard, 18 + sx * 1.4, g0 + 1.4, 5.55, root);
    box(3.2, 0.2, 1.0, M.darkMetal, 18, g0 + 0.1, 5.95, root);
    for (const sx of [-1, 1]) box(0.14, 3.0, 1.0, hull, 18 + sx * 1.55, g0 + 1.5, 5.95, root);
    box(3.2, 0.16, 1.0, hull, 18, g0 + 3.0, 5.95, root);
    const tun = new MeshStandardMaterial({ color: 0x7a6a56, roughness: 0.8, metalness: 0.3 });
    const tube = new Mesh(new CylinderGeometry(1.8, 1.8, 14, 16, 1, false, 0, Math.PI), tun);
    tube.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    tube.position.set(18, g0, -4.5);
    root.add(tube);
    for (let k = 0; k < 6; k++) {
      const ring = new Mesh(new TorusGeometry(1.85, 0.12, 6, 20, Math.PI), M.darkMetal);
      ring.position.set(18, g0, 2 - k * 2.6);
      root.add(ring);
      box(0.3, 0.2, 0.3, M.orangeGlow, 18 + (k % 2 ? 1.3 : -1.3), g0 + 1.35, 2 - k * 2.6, root);
    }
    const beacon = new PointLight(0xffc890, 1.2, 7, 2);
    beacon.position.set(18, g0 + 4.2, 3.5);
    root.add(beacon);
    this.scene.add(root);
    const airMat = new MeshBasicMaterial({ map: colonySkyTex(), side: BackSide, depthWrite: false, fog: false, transparent: true, opacity: 0 });
    const air = new Mesh(new SphereGeometry(590, 40, 20), airMat);
    air.renderOrder = -1;
    this.scene.add(air);
    return { root, world, air, airMat, fog: new FogExp2(0xb87048, 0) };
  }

  /** The radio line to show now ("" for none). */
  get caption(): string {
    let line = "";
    for (const [at, txt] of RIDE_LINES) if (this.t >= at && this.t < at + 3.1) line = txt;
    const dest = this.mission === "training" ? "the <b>Academy</b>" : this.mission === "colony" ? "<b>Helios Colony</b>" : "the <b>freighter</b>";
    const approach =
      this.mission === "training"
        ? "ACADEMY CONTROL: DS-07, you are cleared into the training hangar. Welcome back, recruits."
        : this.mission === "colony"
          ? "PILOT: Colony's dark. No beacon, no tower. Setting down on the <b>landing pad</b>, backing up to the airlock."
          : "PILOT: No lights, no hails. She's dead in the water. Mating with the <b>cargo airlock</b>.";
    const name = HEROES.find((h) => h.id === this.hero)?.name ?? "";
    return line.replace("{dest}", dest).replace("{approach}", approach).replace("{hero}", name);
  }

  /** 0 = clear, 1 = black (fade in at the start, out at the end). */
  get fade(): number {
    return Math.max(1 - this.t / 0.8, sstep(this.duration - 0.7, this.duration, this.t), this.cutFlash());
  }

  /** a quick dip to black around the cuts to and from the outside shot */
  private cutFlash(): number {
    const c = (at: number): number => Math.max(0, 1 - Math.abs(this.t - at) / 0.12) * 0.9;
    return Math.max(c(9.35), c(11.95));
  }

  /** Is the camera outside for the flip shot? */
  private get outside(): boolean {
    return this.t >= 9.35 && this.t < 11.95;
  }

  /** Ship pose along the route at time t. */
  private place(t: number): void {
    const { S, F, D } = this;
    const pos = new Vector3();
    let yaw = Math.PI;
    let roll = 0;
    let pitch = 0;
    if (t < 9.4) {
      // launch and burn: nose toward the target, ramp looking back at the carrier
      // ease out of the hangar slowly so the carrier looms, then burn
      const u = Math.pow(sstep(0, 9.4, t), 1.6);
      pos.copy(S).lerp(F, u);
      pos.x += Math.sin(u * Math.PI) * 16;
      pos.y += Math.sin(u * Math.PI) * 6;
      roll = Math.sin(u * Math.PI * 2) * 0.07;
      pitch = Math.sin(u * Math.PI) * 0.03;
    } else if (t < 11.9) {
      // the flip: swing the tail around toward the target while coasting
      const u = (t - 9.4) / 2.5;
      const e = u * u * (3 - 2 * u);
      pos.copy(F).add(new Vector3(0, 0, -6 * u));
      yaw = Math.PI * (1 - e);
      roll = Math.sin(e * Math.PI) * 0.32;
    } else {
      // back in, rear first, and settle onto the dock
      const u = sstep(11.9, 15.2, t);
      pos.copy(F).add(new Vector3(0, 0, -6)).lerp(D, u);
      yaw = 0;
      roll = Math.sin(t * 1.3) * 0.012 * (1 - u);
    }
    this.ship.position.copy(pos);
    this.ship.rotation.set(pitch, yaw, roll, "YXZ");
  }

  /** Returns true when finished. */
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const once = (key: string, at: number, fn: () => void): void => {
      if (t >= at && !this.fired.has(key)) {
        this.fired.add(key);
        fn();
      }
    };
    once("ramp", 0.8, () => audio.rampMotor());
    once("ramp2", 12.2, () => audio.rampMotor());
    once("burn", 3.3, () => audio.thrustBoom());
    once("flip", 9.4, () => audio.rcsPuffs());
    once("dock", 15.1, () => audio.dockClamp());
    if (this.freighter.root.visible) this.freighter.update(t);
    if (this.station?.root.visible) this.station.update(t);
    const col = this.mission === "colony" ? this.colony : null;
    if (col) {
      // descending through the atmosphere: the planet rises to meet the ship
      const k = 1 - sstep(4, 14.6, t);
      col.root.position.y = -260 * k * k;
      col.world.update(t);
      col.airMat.opacity = sstep(4.5, 9, t);
      col.fog.density = 0.0055 * sstep(4.5, 10, t);
    }
    this.carrier.update(t);
    this.shipModel.update(t);
    this.place(t);
    this.ship.updateMatrixWorld(true);
    // ramp: open at lift-off, seals during the launch, then drops clear for docking
    const r = this.shipModel.ramp;
    // (starts lowered as it was in the hangar, seals shut on take-off, opens again on docking)
    const OPEN = -0.35;
    if (t < 6) r.rotation.x = OPEN + (Math.PI / 2 - OPEN) * sstep(0.8, 2.65, t);
    else r.rotation.x = Math.PI / 2 + (-1.2 - Math.PI / 2) * sstep(12.2, 14.0, t);
    // the doorway force field only shows while the ramp is open
    const open = 1 - Math.min(1, Math.max(0, r.rotation.x / (Math.PI / 2 - 0.08)));
    this.field.visible = open > 0.02;
    for (const b of this.fieldBars) b.visible = this.field.visible;
    // thrust: how hard the engines are working (drives rumble, engine wash and camera shake)
    const burn = sstep(3.0, 4.2, t) * (1 - sstep(7.4, 9.2, t));
    const thrust = Math.max(0.15, burn, t > 9.4 && t < 11.9 ? 0.45 : 0, t > 11.9 && t < 15.1 ? 0.3 : 0);
    audio.rideLevel(thrust);
    this.thrustLight.intensity = thrust * 5 + Math.random() * thrust * 1.5;
    this.fieldMat.opacity = (0.1 + Math.sin(t * 7) * 0.02 + thrust * 0.05) * open;
    (this.fieldMat.map as CanvasTexture).offset.y = -t * 0.35;
    // dust streaks: moves opposite to the ship's own motion, stretched by speed
    const v = dt > 0 ? this.ship.position.clone().sub(this.prevPos).divideScalar(dt) : new Vector3();
    this.prevPos.copy(this.ship.position);
    const q = this.ship.quaternion.clone().invert();
    this.localVel.lerp(v.applyQuaternion(q).divideScalar(0.8), Math.min(1, dt * 6));
    const rel = this.localVel.clone().negate();
    const len = Math.min(14, 0.3 + rel.length() * 0.12);
    const dir = rel.lengthSq() > 1e-4 ? rel.clone().normalize() : new Vector3(0, 0, -1);
    this.dustPts.forEach((p, k) => {
      p.addScaledVector(rel, dt);
      if (p.z < -160 || p.z > 60 || Math.abs(p.x) > 30) this.spawnDust(p, rel.z < 0 ? 40 + Math.random() * 15 : -150 - Math.random() * 10);
      this.dustPos.set([p.x, p.y, p.z, p.x - dir.x * len, p.y - dir.y * len, p.z - dir.z * len], k * 6);
    });
    this.dust.geometry.getAttribute("position").needsUpdate = true;
    // squad sways with the ship
    for (const g of this.squad.values()) {
      if (!g.visible) continue;
      const ph = g.userData.ph as number;
      g.rotation.z = Math.sin(t * 1.4 + ph) * 0.02 + (this.ship.rotation.z ?? 0) * -0.3;
      g.rotation.y = (g.userData.ry as number) + Math.sin(t * 0.6 + ph) * 0.06;
    }
    // ---- camera
    this.sky.position.copy(this.camera.position);
    if (col) col.air.position.copy(this.camera.position);
    if (this.outside) {
      // outside: watch the dropship flip with the target looming behind it
      const u = (t - 9.35) / 2.6;
      const p = this.ship.position;
      this.camera.position.copy(p).add(new Vector3(15 - u * 4, 4.5 - u * 1.5, 13 + u * 2));
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(p.clone().lerp(this.D, 0.1));
      this.camera.fov = 50;
    } else {
      // inside: a front jump seat, looking aft down the cabin and out through the ramp
      const shake = 0.004 + thrust * 0.012 + (t > 15.1 && t < 15.6 ? 0.03 : 0) + (t > 2.62 && t < 2.95 ? 0.02 : 0) + (t > 14.0 && t < 14.3 ? 0.015 : 0);
      const n = (f: number, o: number): number => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.7 + o * 3) * 0.4;
      const eye = new Vector3(0.32 + n(1.3, 0) * 0.01, 2.08 + n(1.7, 2) * 0.008 + n(23, 1) * shake, -0.2);
      const look = new Vector3(-0.08 + n(0.7, 1) * 0.1, 1.86 + n(19, 4) * shake * 6, -8);
      this.camera.position.copy(this.ship.localToWorld(eye));
      this.camera.up.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
      this.camera.lookAt(this.ship.localToWorld(look));
      this.camera.fov = 56 + burn * 6;
    }
    this.camera.updateProjectionMatrix();
    return t >= this.duration;
  }
}
