import { CanvasTexture, SRGBColorSpace } from "three";
import type { SaveData } from "./data";
import { ARMORY_BONUS, COLONY_BONUS, MISSION_BONUS, RESCUE_BONUS, ROBOT_POINTS, difficultyDef, scaledPoints, type Difficulty } from "./data";
import type { RobotKind } from "./models";
import { KINDS } from "./robots";
import { jungleTex } from "./textures";

// ====================================================================== robot database
export interface RobotIntel {
  kind: RobotKind;
  name: string;
  unit: string;
  cls: string;
  threat: number;
  desc: string;
  attack: string;
  weak: string;
  tactics: string;
  found: string;
  colour: string;
}

export const ROBOT_INTEL: RobotIntel[] = [
  {
    kind: "drone",
    name: "SCOUT DRONE",
    unit: "UNIT V1.1",
    cls: "LIGHT SCOUT",
    threat: 1,
    desc: "A light, fast recon walker on bird-like legs that patrols in packs. Its camera-pod head has the sharpest sensors of any robot, and the moment one spots you its comms mast raises the alarm and calls the others.",
    attack: "Twin wrist blasters firing rapid pulse bolts (ranged)",
    weak: "The glowing red eye in its sensor head (critical hit ×2). Thin armour pops off quickly.",
    tactics: "Take them out fast and quietly before they call for help. Crouch to stay out of sight and strike from behind cover.",
    found: "Abandoned Freighter · every deck",
    colour: "#9fe8ff",
  },
  {
    kind: "sentinel",
    name: "BLADE SENTINEL",
    unit: "UNIT V1.5",
    cls: "MELEE GUARD",
    threat: 2,
    desc: "An armoured guardian that hovers on a whirling ring of scythe blades and guards important rooms. It charges in swinging two long sword-arms, but won't chase you far from the post it protects.",
    attack: "Twin sword-arms and a spinning blade skirt (close range only)",
    weak: "The eye on its chest, and its slow turn. It cannot shoot back.",
    tactics: "Keep your distance and shoot as it glides in. Backing out of its guard zone makes it give up and return.",
    found: "Abandoned Freighter · guarding key rooms",
    colour: "#b8ffc8",
  },
  {
    kind: "ripper",
    name: "RIPPER",
    unit: "UNIT V1.10",
    cls: "ASSAULT HUNTER",
    threat: 3,
    desc: "A fast hunter with spinning saw arms. Once it sees you it sprints straight at you, faster than any hero can run.",
    attack: "Twin spinning saws (close range, heavy hits)",
    weak: "The eye, and its straight-line charge.",
    tactics: "Don't try to outrun it. Hold a corridor, aim for the eye as it charges, and use Brutus's shield or Cloya's cloak if it gets close.",
    found: "Abandoned Freighter · living quarters",
    colour: "#ffc870",
  },
  {
    kind: "bulwark",
    name: "BULWARK",
    unit: "UNIT V1.15",
    cls: "HEAVY GUNNER",
    threat: 4,
    desc: "A slow, heavily armoured gunner. It fires big plasma shots from long range that can hurt anything standing near where they land.",
    attack: "Heavy plasma cannon (long range, blast damage)",
    weak: "Its slow speed and slow-moving shots.",
    tactics: "Sidestep its shots and keep moving. Flank it through side rooms, and bring plenty of ammo: it takes a lot to bring down.",
    found: "Abandoned Freighter · Engineering",
    colour: "#ff9a70",
  },
  {
    kind: "warlord",
    name: "WARLORD",
    unit: "UNIT V1.20",
    cls: "COMMAND WALKER",
    threat: 5,
    desc: "The robots' commander: a towering walker with twin rotary cannons that shred anything in the open. Get too close and it slams the deck with a ground-shaking stomp.",
    attack: "Twin rotary cannons (storm of bullets) · Stomp shockwave up close",
    weak: "The eye, and the pause while its cannons spin up.",
    tactics: "Stay out of stomp range. Duck behind cover when its cannons start spinning, pop out to hit the eye, and never stand still.",
    found: "Abandoned Freighter · the Bridge (boss)",
    colour: "#ff6a50",
  },
];

/** 1–5 bars for the database, from the robots' real numbers. */
export function robotBars(kind: RobotKind): { armour: number; damage: number; speed: number; senses: number } {
  const k = KINDS[kind];
  const dps = k.dmg * k.rate;
  const lv = (v: number, steps: number[]): number => 1 + steps.filter((s) => v >= s).length;
  return {
    armour: lv(k.hp, [70, 120, 200, 800]),
    damage: lv(dps, [10, 17, 21, 40]),
    speed: lv(k.run, [2.2, 3.4, 3.9, 5]),
    senses: lv(k.view, [11, 12.5, 14, 20]),
  };
}

/** The robot's numbers on a mission at the given difficulty (matches how robots.ts scales them). */
export function robotNumbers(kind: RobotKind, diff: Difficulty = "recruit") {
  const k = KINDS[kind];
  const d = difficultyDef(diff);
  const r1 = (v: number): number => Math.round(v * 10) / 10;
  return {
    hp: Math.round(k.hp * d.hp),
    dmg: r1(k.dmg * d.dmg),
    rate: r1(k.rate * d.rate),
    run: r1(k.run * d.speed),
    view: r1(k.view * d.senses),
    range: k.melee ? "Close range" : `${k.range} m`,
    points: scaledPoints(ROBOT_POINTS[kind], diff),
  };
}

// ====================================================================== mission briefings
export type MissionKey = "training" | "freighter" | "colony" | "jungle";

export interface MissionInfo {
  key: MissionKey;
  num: string;
  name: string;
  live: boolean;
  threat: number;
  location: string;
  desc: string;
  objectives: string[];
  hostiles: [string, string][];
  rewards: string[];
  tip: string;
}

export const MISSIONS: MissionInfo[] = [
  {
    key: "training",
    num: "00",
    name: "STAR-TECH ACADEMY",
    live: true,
    threat: 0,
    location: "STAR-Tech orbital station · training deck",
    desc: "Your first stop, recruit. Learn to move, shoot, sneak, hack and use your hero's special ability on the Academy's training course, then pass the final exam.",
    objectives: ["Sprint, crouch and crawl course", "Firing range: aim and hit the eye", "Flashlight, hacking and stealth", "Ability room, map maze, final exam"],
    hostiles: [["Training drones", "#9fe8ff"], ["Stealth patrol bot", "#b8ffc8"], ["Exam bots", "#ffc870"]],
    rewards: ["+30 points first time", "+5 for a new best time", "Grade: Recruit / Specialist / Elite"],
    tip: "Recommended for new recruits",
  },
  {
    key: "freighter",
    num: "01",
    name: "ABANDONED FREIGHTER",
    live: true,
    threat: 2,
    location: "Deep space · long-haul cargo freighter",
    desc: "A human cargo freighter has been taken over by alien robots. Board through the airlock, shut down their control relay, take the Bridge from the Warlord and get out alive.",
    objectives: ["Shut down the robot relay in Engineering", "Optional: hack the Armory", "Defeat the Warlord on the Bridge", "Take control at the main console", "Return to the dropship"],
    hostiles: [["Scout Drones · Unit V1.1", "#9fe8ff"], ["Blade Sentinels · Unit V1.5", "#b8ffc8"], ["Rippers · Unit V1.10", "#ffc870"], ["Bulwark · Unit V1.15", "#ff9a70"], ["WARLORD · Unit V1.20", "#ff6a50"]],
    rewards: ["Points for every robot destroyed", "+25 Armory bonus", "+50 mission bonus"],
    tip: "Cloya's cloak and quiet boots help you slip past patrols",
  },
  {
    key: "colony",
    num: "02",
    name: "REMOTE COLONY",
    live: true,
    threat: 3,
    location: "Outer rim · Helios mining colony domes",
    desc: "Helios Colony has been silent for nine days. Land on the pad, fight through the domes, get the power back on, then go down the mine to find what's making the robots, and wreck it.",
    objectives: ["Restart the generator in the Power Station", "Optional: rescue survivors in the Medical Bay", "Go down the mine and find the robot signal", "Destroy the Robot Factory's 3 power cores", "Get back to the landing pad"],
    hostiles: [["Scout Drones · Unit V1.1", "#9fe8ff"], ["Blade Sentinels · Unit V1.5", "#b8ffc8"], ["Rippers · Unit V1.10", "#ffc870"], ["Bulwarks · Unit V1.15", "#ff9a70"], ["ROBOT FACTORY · keeps building more", "#ff6a50"]],
    rewards: ["Points for every robot destroyed", "+30 survivor rescue bonus", "+75 mission bonus"],
    tip: "The factory keeps building robots while you're inside, so hit its cores fast. Dax's pulse blast clears the assembly bays.",
  },
  {
    key: "jungle",
    num: "03",
    name: "JUNGLE PLANET RUINS",
    live: false,
    threat: 4,
    location: "Uncharted world · ancient ruins",
    desc: "Ancient ruins swallowed by jungle. Something is building an army beneath them, and it's getting bigger.",
    objectives: ["Classified"],
    hostiles: [["Unknown", "#ff6a50"]],
    rewards: ["Classified"],
    tip: "Coming soon",
  },
];

function fmt(t: number): string {
  if (!t) return "--:--";
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export function missionStatus(m: MissionInfo, s: SaveData): string {
  if (m.key === "training") return s.trainingDone ? `COMPLETED · BEST ${fmt(s.trainingBest)}` : "NEW";
  if (m.key === "freighter") return s.missionsWon > 0 ? `COMPLETED ×${s.missionsWon}` : "AVAILABLE";
  if (m.key === "colony") {
    const n = (s.colonyWins?.recruit ?? 0) + (s.colonyWins?.veteran ?? 0) + (s.colonyWins?.elite ?? 0);
    return n > 0 ? `COMPLETED ×${n}` : "AVAILABLE";
  }
  return "LOCKED";
}

// ====================================================================== screen painting
const MONO = "Consolas, 'Lucida Console', 'Courier New', monospace";
const HEAD = "Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif";

export class ScreenPainter {
  readonly tex: CanvasTexture;
  readonly g: CanvasRenderingContext2D;
  /** how far the content under the title bar is scrolled (canvas px) */
  scroll = 0;
  /** height of the last painted content (canvas px) */
  contentH = 0;
  /** top of the scrolling area, just under the title bar */
  readonly top = 52;
  constructor(readonly w: number, readonly h: number) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    this.g = c.getContext("2d")!;
    this.tex = new CanvasTexture(c);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
  }

  frame(title: string, col = "#6fe8ff"): void {
    const { g, w, h } = this;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#04121c");
    bg.addColorStop(1, "#020a10");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = col;
    g.globalAlpha = 0.7;
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.globalAlpha = 1;
    g.fillStyle = col;
    g.fillRect(6, 6, w - 12, 44);
    g.fillStyle = "#021018";
    g.font = `26px ${HEAD}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText(title, 20, 29);
    g.textAlign = "right";
    g.font = `bold 16px ${MONO}`;
    g.fillText("DS-07 ▮ LIVE", w - 18, 29);
    g.textAlign = "left";
  }

  get maxScroll(): number {
    return Math.max(0, this.contentH - (this.h - 12));
  }

  /** Start drawing the scrolling content (clipped under the title bar). */
  body(): void {
    const { g, w, h, top } = this;
    this.scroll = Math.max(0, Math.min(this.scroll, this.maxScroll));
    g.save();
    g.beginPath();
    g.rect(8, top, w - 16, h - top - 8);
    g.clip();
    g.translate(0, -this.scroll);
  }

  /** Finish the scrolling content; `bottom` is where it ended. Draws a scrollbar when it overflows. */
  endBody(bottom: number): void {
    const { g, w, h, top } = this;
    g.restore();
    this.contentH = bottom;
    const max = this.maxScroll;
    if (this.scroll > max) this.scroll = max;
    if (max <= 0) return;
    const trackH = h - top - 22;
    const thumbH = Math.max(40, (trackH * (h - top)) / (bottom - top));
    const ty = top + 6 + ((trackH - thumbH) * this.scroll) / max;
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.fillRect(w - 20, top + 6, 8, trackH);
    g.fillStyle = "#6fe8ff";
    g.fillRect(w - 20, ty, 8, thumbH);
    if (this.scroll < max - 2) {
      const f = g.createLinearGradient(0, h - 60, 0, h - 8);
      f.addColorStop(0, "rgba(2,10,16,0)");
      f.addColorStop(1, "rgba(2,10,16,0.95)");
      g.fillStyle = f;
      g.fillRect(8, h - 60, w - 30, 52);
      g.textAlign = "center";
      this.text("▼ SCROLL FOR MORE", w / 2, h - 16, 16, "#6fe8ff");
      g.textAlign = "left";
    }
  }

  scanlines(): void {
    const { g, w, h } = this;
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    this.tex.needsUpdate = true;
  }

  text(t: string, x: number, y: number, size: number, col: string, font = MONO, bold = true, maxW?: number): void {
    const g = this.g;
    g.font = `${bold ? "bold " : ""}${size}px ${font}`;
    g.fillStyle = col;
    g.textBaseline = "alphabetic";
    if (maxW) g.fillText(t, x, y, maxW);
    else g.fillText(t, x, y);
  }

  /** Word-wrapped paragraph; returns the y after the last line. */
  para(t: string, x: number, y: number, maxW: number, size: number, col: string, lh = 1.3): number {
    const g = this.g;
    g.font = `${size}px ${MONO}`;
    g.fillStyle = col;
    const words = t.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y);
        line = w;
        y += size * lh;
      } else line = test;
    }
    if (line) g.fillText(line, x, y);
    return y + size * lh;
  }
}

/** Left screen: the list of missions with the chosen one highlighted. */
export function paintMissionList(p: ScreenPainter, sel: number, s: SaveData): void {
  const { g, w } = p;
  p.frame("MISSIONS");
  p.body();
  MISSIONS.forEach((m, i) => {
    const y = 66 + i * 104;
    const on = i === sel;
    g.fillStyle = on ? "rgba(69,224,255,0.22)" : "rgba(255,255,255,0.04)";
    g.fillRect(18, y, w - 36, 92);
    if (on) {
      g.strokeStyle = "#6fe8ff";
      g.lineWidth = 3;
      g.strokeRect(18, y, w - 36, 92);
      g.fillStyle = "#6fe8ff";
      g.beginPath();
      g.moveTo(26, y + 36);
      g.lineTo(40, y + 46);
      g.lineTo(26, y + 56);
      g.fill();
    }
    const col = m.live ? (on ? "#ffffff" : "#cfe8f2") : "#5d6c74";
    p.text(m.num, 50, y + 58, 40, m.live ? "#6fe8ff" : "#44535a", HEAD, false);
    p.text(m.name, 118, y + 42, 30, col, HEAD, false, w - 150);
    const st = missionStatus(m, s);
    p.text(m.live ? st : "LOCKED", 118, y + 76, 19, m.live ? (st.startsWith("COMPLETED") ? "#3cff78" : "#ffd070") : "#8a6a5a");
  });
  p.endBody(66 + MISSIONS.length * 104);
  p.scanlines();
}

function drawArt(p: ScreenPainter, m: MissionInfo, x: number, y: number, w: number, h: number): void {
  const g = p.g;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const sky = g.createLinearGradient(0, y, 0, y + h);
  if (m.key === "colony") {
    sky.addColorStop(0, "#5a3218");
    sky.addColorStop(1, "#c07a3a");
  } else {
    sky.addColorStop(0, "#02040c");
    sky.addColorStop(1, "#0c1a30");
  }
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  if (m.key !== "colony" && m.key !== "jungle") {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 10) / 14})`;
      g.fillRect(x + ((i * 97) % w), y + ((i * 61) % h), 2, 2);
    }
  }
  if (m.key === "training") {
    const planet = g.createRadialGradient(x + w * 0.3, y + h * 1.5, h * 0.2, x + w * 0.3, y + h * 1.7, h * 1.4);
    planet.addColorStop(0, "#3f8a5a");
    planet.addColorStop(0.6, "#1f5d8a");
    planet.addColorStop(1, "#0c2a44");
    g.fillStyle = planet;
    g.beginPath();
    g.arc(x + w * 0.3, y + h * 1.75, h * 1.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#c8d4de";
    g.lineWidth = 10;
    g.beginPath();
    g.ellipse(x + w * 0.62, y + h * 0.45, h * 0.36, h * 0.3, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#dfe6ec";
    g.fillRect(x + w * 0.62 - 70, y + h * 0.45 - 16, 140, 32);
    g.fillStyle = "#6fe8ff";
    for (let i = 0; i < 8; i++) g.fillRect(x + w * 0.62 - 60 + i * 16, y + h * 0.45 - 4, 9, 6);
  } else if (m.key === "freighter") {
    const cx = x + w * 0.5;
    const cy = y + h * 0.55;
    g.fillStyle = "#7d848b";
    g.fillRect(cx - 250, cy - 26, 500, 52);
    const cols = ["#8a2f24", "#2d5a86", "#b98619", "#3d6739", "#a9adb0"];
    for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[i % 5];
      g.fillRect(cx - 170 + (i % 6) * 48, cy - 44 + Math.floor(i / 6) * 58, 44, 28);
    }
    g.fillStyle = "#9aa1a8";
    g.fillRect(cx - 290, cy - 60, 60, 60);
    g.fillStyle = "#bfe8ff";
    g.fillRect(cx - 285, cy - 52, 50, 8);
    g.fillStyle = "#474d54";
    g.fillRect(cx + 200, cy - 40, 70, 80);
    g.fillStyle = "rgba(95,184,255,0.8)";
    for (const dy of [-22, 22]) {
      g.beginPath();
      g.ellipse(cx + 290, cy + dy, 26, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "#c83020";
    g.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(cx + 120 + i * 18, cy - 26);
      g.quadraticCurveTo(cx + 110 + i * 16, cy, cx + 130 + i * 18, cy + 26);
      g.stroke();
    }
  } else if (m.key === "colony") {
    g.fillStyle = "#3a2414";
    g.fillRect(x, y + h * 0.72, w, h);
    for (const [dx, r] of [[0.25, 70], [0.5, 100], [0.74, 60]]) {
      g.fillStyle = "rgba(200,220,230,0.55)";
      g.beginPath();
      g.arc(x + w * dx, y + h * 0.74, r, Math.PI, 0);
      g.fill();
    }
    g.fillStyle = "#2a1a0e";
    g.fillRect(x + w * 0.86, y + h * 0.3, 16, h * 0.45);
  } else {
    const img = jungleTex().image as HTMLCanvasElement;
    g.drawImage(img, x, y, w, h);
  }
  if (!m.live) {
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(x, y, w, h);
    p.text("LOCKED", x + w / 2 - 110, y + h / 2 + 16, 48, "#ffffff", HEAD, false);
  }
  g.restore();
  g.strokeStyle = "#6fe8ff";
  g.lineWidth = 2;
  g.strokeRect(x, y, w, h);
}

/** Centre screen: artwork, title, threat and briefing text. */
export function paintBriefing(p: ScreenPainter, m: MissionInfo, s: SaveData): void {
  const { w } = p;
  p.frame(`MISSION ${m.num} · BRIEFING`);
  p.body();
  drawArt(p, m, 20, 62, w - 40, 250);
  p.text(m.name, 24, 364, 46, "#ffffff", HEAD, false, w - 260);
  p.g.textAlign = "right";
  if (m.threat === 0) p.text("TRAINING", w - 24, 360, 24, "#7fe8ff");
  else {
    p.text("THREAT", w - 24 - 5 * 30 - 10, 360, 22, "#ffb060");
    for (let i = 0; i < 5; i++) {
      p.g.fillStyle = i < m.threat ? "#ffb060" : "rgba(255,176,96,0.2)";
      p.g.fillRect(w - 24 - (5 - i) * 30, 342, 24, 16);
    }
  }
  p.g.textAlign = "left";
  p.text(m.location.toUpperCase(), 24, 396, 20, "#8fb8c8");
  let y = p.para(m.desc, 24, 434, w - 48, 23, "#d8e8ee");
  y += 6;
  p.text("OBJECTIVES", 24, y, 22, "#3cff78");
  y += 30;
  for (const o of m.objectives) {
    p.text("▸ " + o, 30, y, 20, "#c8dce4", MONO, false, w - 60);
    y += 26;
  }
  y += 14;
  const dif = difficultyDef(s.difficulty);
  p.g.textAlign = "right";
  if (m.key === "training") p.text("ALWAYS RECRUIT LEVEL", w - 24, 396, 18, "#8fb8c8");
  else if (m.live) p.text(`DIFFICULTY: ${dif.name} · REWARDS ×${dif.points}`, w - 24, 396, 20, dif.colour);
  const st = missionStatus(m, s);
  p.text(st, w - 24, y, 20, st.startsWith("COMPLETED") ? "#3cff78" : m.live ? "#ffd070" : "#8a6a5a");
  p.g.textAlign = "left";
  p.endBody(y + 20);
  p.scanlines();
}

/** Right screen: hostiles, rewards and your record. */
export function paintIntel(p: ScreenPainter, m: MissionInfo, s: SaveData): void {
  const { w } = p;
  p.frame("MISSION INTEL", "#3cff78");
  p.body();
  let y = 84;
  p.text("EXPECTED HOSTILES", 22, y, 22, "#3cff78");
  y += 28;
  for (const [n, c] of m.hostiles) {
    p.g.fillStyle = c;
    p.g.fillRect(26, y - 14, 12, 12);
    p.text(n, 48, y, 21, c, MONO, true, w - 70);
    y += 25;
  }
  y += 8;
  const dif = difficultyDef(s.difficulty);
  const scaled = m.key === "freighter" || m.key === "colony";
  p.text("REWARDS", 22, y, 22, "#3cff78");
  if (scaled) {
    p.g.textAlign = "right";
    p.text(`${dif.name} ×${dif.points}`, w - 22, y, 22, dif.colour);
    p.g.textAlign = "left";
  }
  y += 28;
  const col = m.key === "colony";
  const rewards = scaled
    ? [
        dif.points === 1 ? "Points for every robot destroyed" : `×${dif.points} points for every robot`,
        col ? `+${scaledPoints(RESCUE_BONUS, s.difficulty)} survivor rescue bonus` : `+${scaledPoints(ARMORY_BONUS, s.difficulty)} Armory bonus`,
        `+${scaledPoints(col ? COLONY_BONUS : MISSION_BONUS, s.difficulty)} mission bonus`,
      ]
    : m.rewards;
  for (const r of rewards) {
    p.text("+ " + r, 26, y, 19, "#ffe9a0", MONO, false, w - 50);
    y += 24;
  }
  y += 8;
  p.text("YOUR RECORD", 22, y, 22, "#3cff78");
  y += 28;
  const cw = s.colonyWins ?? { recruit: 0, veteran: 0, elite: 0 };
  const colWon = cw.recruit + cw.veteran + cw.elite > 0;
  const rec =
    m.key === "training"
      ? s.trainingDone
        ? `Best time ${fmt(s.trainingBest)}`
        : "Not attempted"
      : m.key === "freighter"
        ? s.missionsWon > 0
          ? `Best score ${s.bestScore} pts`
          : "Not yet completed"
        : m.key === "colony"
          ? colWon
            ? `Best score ${s.colonyBest} pts`
            : "Not yet completed"
          : "—";
  p.text(rec, 26, y, 20, "#d8e8ee", MONO, false, w - 50);
  const wins = m.key === "freighter" && s.missionsWon > 0 ? s.wins : m.key === "colony" && colWon ? cw : null;
  if (wins) {
    y += 24;
    let x = 26;
    for (const d of ["recruit", "veteran", "elite"] as const) {
      const t = `${difficultyDef(d).name} ×${wins[d]}`;
      p.text(t, x, y, 18, wins[d] > 0 ? difficultyDef(d).colour : "#5d6c74");
      x += p.g.measureText(t).width + 22;
    }
  }
  y += 34;
  y = p.para("TIP: " + m.tip, 22, y, w - 44, 18, "#8fb8c8");
  p.endBody(y + 4);
  p.scanlines();
}
