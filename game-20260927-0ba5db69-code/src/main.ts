import { ACESFilmicToneMapping, CanvasTexture, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { drawEmblem } from "./textures";
import { audio } from "./audio";
import { difficultyDef, heroStats, loadSave, writeSave } from "./data";
import type { MissionId, MissionResult } from "./game";

const root = document.getElementById("game")!;
const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
root.appendChild(renderer.domElement);

// A light-weight splash frame goes up first, so something shows while the hangar and freighter are built.
function splashTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 720);
  grd.addColorStop(0, "#0b1418");
  grd.addColorStop(1, "#020405");
  g.fillStyle = grd;
  g.fillRect(0, 0, 1280, 720);
  drawEmblem(g, 640, 260, 110);
  g.textAlign = "center";
  g.fillStyle = "#c8ced4";
  g.font = "bold 72px Impact, Arial Black, sans-serif";
  g.fillText("STAR-TECH:", 640, 470);
  g.font = "bold 44px Impact, Arial Black, sans-serif";
  g.fillText("GALAXY INFILTRATORS", 640, 525);
  g.fillStyle = "#3cff78";
  g.font = "20px Consolas, monospace";
  g.fillText("PREPARING HANGAR . . .", 640, 600);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const splash = new Scene();
splash.background = splashTexture();
const splashCam = new PerspectiveCamera();
renderer.setSize(Math.max(1, root.clientWidth), Math.max(1, root.clientHeight), false);
renderer.setAnimationLoop(() => renderer.render(splash, splashCam));
// let the splash reach the screen between each heavy build step
const breathe = (): Promise<void> =>
  new Promise<void>((r) => {
    let done = false;
    const go = (): void => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 120); // background tabs never fire animation frames
  });
await breathe();
const { Hud } = await import("./hud");
await breathe();
const { Game } = await import("./game");
const { Intro, Menu } = await import("./menu");
await breathe();

const save = loadSave();
const hud = new Hud(root);
await breathe();
const game = new Game(hud);
await breathe();
hud.camera = game.camera;
const menu = new Menu(root, save);
await breathe();
const intro = new Intro();

type Mode = "menu" | "intro" | "play" | "paused";
let mode: Mode = "menu";

// ---------------------------------------------------------------- pause overlay
const pauseEl = document.createElement("div");
pauseEl.className = "menu";
pauseEl.hidden = true;
pauseEl.innerHTML = `<div class="pause"><div class="card box"><h2>PAUSED</h2>
  <button class="mbtn primary" data-p="resume">RESUME</button>
  <button class="mbtn" data-p="restart">RESTART MISSION</button>
  <div class="orow" style="font-size:13px"><span>MOUSE SENSITIVITY</span><input type="range" min="0.3" max="2.5" step="0.05" data-p="sens"></div>
  <button class="mbtn" data-p="quit">QUIT TO MAIN MENU</button>
  <div class="controls-card"><b>CONTROLS</b>
    <span><i>WASD</i> move</span><span><i>SHIFT</i> sprint</span><span><i>CTRL / C</i> crouch</span><span><i>L-CLICK</i> fire</span>
    <span><i>R-CLICK</i> aim</span><span><i>R</i> reload</span><span><i>1 2 3 / WHEEL</i> switch weapon</span><span><i>V</i> melee</span>
    <span><i>G</i> gadget 1</span><span><i>T</i> gadget 2</span><span><i>Q</i> ability</span><span><i>E</i> use / hack</span>
    <span><i>F</i> flashlight</span><span><i>TAB</i> map</span></div>
  <div style="font-size:12px;color:#9fb4bd">Points you've earned are kept if you quit.</div></div></div>`;
root.appendChild(pauseEl);
const sensInput = pauseEl.querySelector<HTMLInputElement>("input")!;
sensInput.addEventListener("input", () => {
  save.sens = parseFloat(sensInput.value);
  game.player.sens = save.sens;
  writeSave(save);
});
pauseEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.click();
    const a = b.dataset.p;
    if (a !== "resume") audio.setPaused(false);
    if (a === "resume") resume();
    else if (a === "restart") {
      bank(game.result(false), false);
      pauseEl.hidden = true;
      deploy(false);
    } else if (a === "quit") {
      bank(game.result(false), false);
      game.stop();
      pauseEl.hidden = true;
      hud.show(false);
      mode = "menu";
      menu.show("main");
    }
  }),
);

const skipEl = document.createElement("div");
skipEl.className = "menu letterbox";
skipEl.style.pointerEvents = "none";
skipEl.hidden = true;
skipEl.innerHTML = `<div class="cine-fade"></div><div class="cine-radio"></div><div class="cine-title"><div class="a">MISSION 1</div><div class="b">ABANDONED FREIGHTER</div></div><div class="skip">CLICK TO SKIP ▶▶</div>`;
const cineFade = skipEl.querySelector<HTMLDivElement>(".cine-fade")!;
const cineRadio = skipEl.querySelector<HTMLDivElement>(".cine-radio")!;
let cineLine = "";
/** Subtitles, fades and the destination title for the ride in. */
function updateCine(): void {
  cineFade.style.opacity = String(intro.fade);
  const line = intro.caption;
  if (line !== cineLine) {
    cineLine = line;
    cineRadio.innerHTML = line;
    cineRadio.classList.toggle("on", !!line);
    if (line) audio.radio();
  }
  skipEl.classList.toggle("dest", intro.time > 12.0);
}
root.appendChild(skipEl);

// ---------------------------------------------------------------- settings / resize
let dynScale = 1;
function basePixelRatio(): number {
  return save.quality === "high" ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 1) * 0.8;
}
function applySettings(): void {
  renderer.setPixelRatio(basePixelRatio() * dynScale);
  audio.setVolumes(save.sfx, save.music);
  game.player.sens = save.sens;
  resize();
}
menu.onSettings = applySettings;

function resize(): void {
  const w = Math.max(1, root.clientWidth);
  const h = Math.max(1, root.clientHeight);
  renderer.setSize(w, h, false);
  game.camera.aspect = w / h;
  game.camera.updateProjectionMatrix();
  menu.resize(w, h);
  intro.resize(w, h);
  game.fx.setScale(h * renderer.getPixelRatio());
}
new ResizeObserver(resize).observe(root);
applySettings();

// ---------------------------------------------------------------- flow
let currentMission: MissionId = "freighter";
function deploy(withIntro = true, mission: MissionId = currentMission): void {
  currentMission = mission;
  audio.unlock();
  menu.show("none");
  if (withIntro) {
    mode = "intro";
    intro.reset(mission, save.hero);
    cineLine = "";
    updateCine();
    skipEl.querySelector(".a")!.textContent = mission === "training" ? "TRAINING" : mission === "colony" ? "MISSION 2" : "MISSION 1";
    skipEl.querySelector(".b")!.textContent = mission === "training" ? "STAR-TECH ACADEMY" : mission === "colony" ? "REMOTE COLONY" : "ABANDONED FREIGHTER";
    skipEl.hidden = false;
    audio.rideStart();
    audio.setMode("intro");
    return;
  }
  startMission();
}
menu.onDeploy = (m) => deploy(true, m);

function startMission(): void {
  skipEl.hidden = true;
  audio.rideStop();
  const st = heroStats(save, save.hero);
  hud.reset(st.def.name, st.def.weaponName.toUpperCase(), `${st.def.ability}`);
  if (currentMission === "training") hud.setMission("TRAINING · STAR-TECH ACADEMY", "LESSONS");
  else hud.setMission(`MISSION · ${currentMission === "colony" ? "REMOTE COLONY" : "ABANDONED FREIGHTER"} · ${difficultyDef(save.difficulty).name}`);
  game.start(st, currentMission, save.difficulty);
  game.player.sens = save.sens;
  hud.show(true);
  mode = "play";
  audio.setMode("game");
  lockPointer();
}

function bank(r: MissionResult, final: boolean): void {
  if (r.mission === "training") {
    if (!final || !r.won) return;
    const first = !save.trainingDone;
    const better = !first && (!save.trainingBest || r.time < save.trainingBest);
    r.total = first ? 30 : better ? 5 : 0;
    r.firstClear = first;
    save.trainingDone = true;
    save.trainingOffered = true;
    save.trainingBest = save.trainingBest ? Math.min(save.trainingBest, r.time) : r.time;
    r.bestTime = save.trainingBest;
    save.points += r.total;
    save.lifetime += r.total;
    save.log.unshift(first ? `TRAINING COMPLETE: +${r.total} PTS · GRADE ${r.grade}` : `TRAINING REPLAY · GRADE ${r.grade}`);
    save.log = save.log.slice(0, 8);
    writeSave(save);
    return;
  }
  for (const k of Object.keys(save.kills) as (keyof typeof save.kills)[]) save.kills[k] += r.kills[k] ?? 0;
  if (r.total <= 0 && !final) {
    writeSave(save);
    return;
  }
  save.points += r.total;
  save.lifetime += r.total;
  const num = r.mission === "colony" ? 2 : 1;
  if (r.won) {
    const dk = r.difficulty ?? "recruit";
    if (r.mission === "colony") {
      save.colonyWins[dk] = (save.colonyWins[dk] ?? 0) + 1;
      save.colonyBest = Math.max(save.colonyBest, r.total);
    } else {
      save.missionsWon++;
      save.wins[dk] = (save.wins[dk] ?? 0) + 1;
      save.bestScore = Math.max(save.bestScore, r.total);
    }
    save.log.unshift(`MISSION ${num} COMPLETE (${difficultyDef(r.difficulty).name}): +${r.total} PTS`);
  } else if (r.total > 0) save.log.unshift(`MISSION ${num} FAILED: +${r.total} PTS KEPT`);
  save.log.unshift(`POINTS TOTAL: ${save.points}`);
  save.log = save.log.slice(0, 8);
  writeSave(save);
}

game.onEnd = (r) => {
  bank(r, true);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.show(false);
  mode = "menu";
  audio.setTension(0);
  menu.showResults(r);
};

function lockPointer(): void {
  const c = renderer.domElement as HTMLCanvasElement & { requestPointerLock: (o?: unknown) => Promise<void> | void };
  try {
    const p = c.requestPointerLock();
    if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => undefined);
  } catch {
    /* ignored: needs a gesture */
  }
}

function pause(): void {
  if (mode !== "play" || !game.running || game.player.dead) return;
  mode = "paused";
  audio.setPaused(true);
  sensInput.value = String(save.sens);
  pauseEl.hidden = false;
  pauseEl.querySelector<HTMLButtonElement>("[data-p=quit]")!.textContent = currentMission === "training" ? "SKIP TRAINING" : "QUIT TO MAIN MENU";
  pauseEl.querySelector<HTMLButtonElement>("[data-p=restart]")!.textContent = currentMission === "training" ? "RESTART TRAINING" : "RESTART MISSION";
  hud.setTactical(false);
}
function resume(): void {
  pauseEl.hidden = true;
  audio.setPaused(false);
  mode = "play";
  lockPointer();
}

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer.domElement;
  hud.setLockHint(!locked && mode === "play" && game.running && !game.player.dead);
  if (!locked && mode === "play" && game.running && !game.player.dead && game.stage < 5) pause();
});

root.addEventListener("pointerdown", (e) => {
  if (mode === "intro") {
    startMission();
    return;
  }
  if (mode !== "play") return;
  if (document.pointerLockElement !== renderer.domElement) {
    lockPointer();
    return;
  }
  setButton(e.button, true);
});

/**
 * Keep fire / aim in step with the buttons actually held. Browsers send pointerdown only
 * for the FIRST button and pointerup only for the LAST one: pressing or releasing a second
 * button while another is held (fire while aiming, aim while firing) arrives as a
 * pointermove whose `button` names the changed button. Plain moves (button -1) are ignored
 * because their `buttons` field is not reliable while the mouse is locked.
 */
const BIT: Record<number, number> = { 0: 1, 2: 2 };
function setButton(button: number, down: boolean): void {
  const p = game.player;
  const active = mode === "play" && document.pointerLockElement === renderer.domElement;
  if (button === 0) {
    const on = down && active;
    if (on && !p.mouseDown) p.queuePress();
    p.mouseDown = on;
  } else if (button === 2) p.rightDown = down && active;
}
window.addEventListener("pointermove", (e) => {
  if (e.button === 0 || e.button === 2) setButton(e.button, (e.buttons & BIT[e.button]) !== 0);
});
window.addEventListener("pointerup", (e) => setButton(e.button, false));
window.addEventListener("pointercancel", () => {
  setButton(0, false);
  setButton(2, false);
});
// per-button mouse events as a second source (they fire for every button, even chorded)
window.addEventListener("mousedown", (e) => setButton(e.button, true));
window.addEventListener("mouseup", (e) => setButton(e.button, false));
root.addEventListener("contextmenu", (e) => e.preventDefault());
// mouse wheel cycles weapons in play
let wheelAcc = 0;
window.addEventListener(
  "wheel",
  (e) => {
    if (mode !== "play" || document.pointerLockElement !== renderer.domElement) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) >= 40) {
      game.player.cycleSlot(wheelAcc > 0 ? 1 : -1);
      wheelAcc = 0;
    }
  },
  { passive: false },
);
document.addEventListener("mousemove", (e) => {
  // ignore the occasional huge spike some browsers report right after locking the pointer
  if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
  if (mode === "play" && document.pointerLockElement === renderer.domElement) game.player.onMouseMove(e.movementX, e.movementY);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Tab") e.preventDefault();
  if (mode === "intro" && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) {
    startMission();
    return;
  }
  if (mode !== "play") return;
  const p = game.player;
  if (e.code.startsWith("Control") || e.code === "Space") e.preventDefault();
  p.keys.add(e.code);
  if (e.repeat) return;
  switch (e.code) {
    case "KeyQ":
      p.useAbility();
      break;
    case "Digit1":
      p.selectSlot(0);
      break;
    case "Digit2":
      p.selectSlot(1);
      break;
    case "Digit3":
      p.selectSlot(2);
      break;
    case "KeyV":
      p.melee();
      break;
    case "KeyG":
    case "Digit4":
      p.useGadget(0);
      break;
    case "KeyT":
    case "Digit5":
      p.useGadget(1);
      break;
    case "KeyR":
      p.reload();
      break;
    case "KeyF":
      p.toggleFlashlight();
      break;
    case "KeyE":
      p.useHeld = true;
      break;
    case "Tab":
      hud.setTactical(!hud.tactical);
      break;
    case "KeyP":
      if (document.pointerLockElement) document.exitPointerLock();
      else pause();
      break;
  }
});
window.addEventListener("keyup", (e) => {
  game.player.keys.delete(e.code);
  if (e.code === "KeyE") game.player.useHeld = false;
});
window.addEventListener("blur", () => {
  game.player.keys.clear();
  game.player.mouseDown = false;
  game.player.rightDown = false;
  game.player.clearPress();
  game.player.useHeld = false;
});

// ---------------------------------------------------------------- loop
// soft studio reflections so metal, visors and glass pick up realistic highlights
{
  const pm = new PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  const set = (sc: Scene, k: number): void => {
    sc.environment = env;
    sc.environmentIntensity = k;
  };
  set(menu.scene, 0.55);
  set(intro.scene, 0.45);
  set(game.scene, 0.3);
  set(game.player.vmScene, 0.22);
}
await breathe();
renderer.compile(menu.scene, menu.camera);
// dynamic resolution: quietly trade sharpness for smoothness on slower machines
let fpsFrames = 0;
let fpsTime = 0;
function adaptResolution(dt: number): void {
  if (mode === "paused" || document.hidden) return;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime < 1.2) return;
  const fps = fpsFrames / fpsTime;
  fpsFrames = 0;
  fpsTime = 0;
  let next = dynScale;
  if (fps < 45) next = Math.max(0.6, dynScale - 0.15);
  else if (fps > 55) next = Math.min(1, dynScale + 0.1);
  if (Math.abs(next - dynScale) > 0.01) {
    dynScale = next;
    renderer.setPixelRatio(basePixelRatio() * dynScale);
    resize();
  }
}
let last = performance.now();
let last0 = last;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  adaptResolution((now - last0) / 1000);
  last0 = now;
  audio.update(dt);
  if (mode === "menu") {
    if (menu.idle) return; // goodbye card: paused and silent
    menu.update(dt);
    renderer.render(menu.scene, menu.camera);
    return;
  }
  if (mode === "intro") {
    const done = intro.update(dt);
    updateCine();
    renderer.render(intro.scene, intro.camera);
    if (done) startMission();
    return;
  }
  if (mode === "play") game.update(dt, document.pointerLockElement === renderer.domElement);
  renderer.autoClear = true;
  renderer.render(game.scene, game.camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(game.player.vmScene, game.player.vmCamera);
  renderer.autoClear = true;
});

// QA / debugging handle
(window as unknown as { __game: unknown }).__game = { game, menu, intro, save, deploy, startMission, renderer, hud, res: () => dynScale };
