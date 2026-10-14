import { PerspectiveCamera, Vector3 } from "three";
import type { Game } from "./game";
import { GADGETS } from "./equipment";
import { GH, GW } from "./level";
import "./ui.css";

interface Floater {
  el: HTMLDivElement;
  pos: Vector3;
  t: number;
}

export class Hud {
  readonly el: HTMLDivElement;
  private readonly $ = <T extends HTMLElement>(sel: string): T => this.el.querySelector(sel) as T;
  private floaters: Floater[] = [];
  private hurtDirs: { from: Vector3 | null; t: number }[] = [];
  private radioT = 0;
  private hintT = 0;
  private roomT = 0;
  private spotT = 0;
  private hitT = 0;
  private mapCanvas: HTMLCanvasElement;
  private radar: HTMLCanvasElement;
  private arrows: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement | null = null;
  tactical = false;
  private scanT = 0;
  private radioQueue: [string, string][] = [];
  private radarT = 0;
  private readonly textCache = new Map<string, string>();
  private setText(sel: string, v: string): void {
    if (this.textCache.get(sel) === v) return;
    this.textCache.set(sel, v);
    this.$(sel).textContent = v;
  }

  camera: PerspectiveCamera = new PerspectiveCamera();

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="visor"></div>
      <div class="dmg-vignette"></div>
      <canvas class="arrows"></canvas>
      <div class="scope"><div class="lens"><i class="h"></i><i class="v"></i><i class="m m1"></i><i class="m m2"></i><i class="m m3"></i><i class="m m4"></i><b></b></div></div>
      <div class="crosshair"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="hitmark"></div>
      <div class="panel obj"><div class="ptitle">MISSION · ABANDONED FREIGHTER</div><ul></ul></div>
      <div class="panel score"><div class="ptitle">POINTS</div><div class="val">0</div></div>
      <div class="radar-wrap panel"><canvas class="radar" width="200" height="200"></canvas><div class="room"></div></div>
      <div class="panel vitals">
        <div class="hero"></div>
        <div class="bar hp"><div class="fill"></div><div class="bonus"></div><span></span></div>
        <div class="ability"><div class="ring"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="bg"/><circle cx="20" cy="20" r="17" class="fg"/></svg><b>Q</b></div><div class="aname"></div></div>
      </div>
      <div class="panel ammo"><div class="wname"></div><div class="count"><b class="mag">0</b><span>/</span><em class="res">0</em></div><div class="mel">MELEE · CLICK TO SWING</div><div class="rel">RELOADING</div><div class="flash-ind">F · LIGHT</div></div>
      <div class="panel loadout">
        <div class="lrow s0"><b>1</b><span></span></div><div class="lrow s1"><b>2</b><span></span><em></em></div><div class="lrow s2"><b>3</b><span></span><em>V</em></div>
        <div class="lrow g0 gad"><b>G</b><span></span><em></em></div><div class="lrow g1 gad"><b>T</b><span></span><em></em></div>
      </div>
      <div class="radio panel"><div class="who"></div><div class="msg"></div></div>
      <div class="hint"></div>
      <div class="prompt"><div class="ptext"></div><div class="pbar"><div></div></div></div>
      <div class="spotted">⚠ SPOTTED</div>
      <div class="alarm-banner">ALARM · REINFORCEMENTS INBOUND</div>
      <div class="boss"><div class="bname"></div><div class="bbar"><div></div></div></div>
      <div class="roomname"></div>
      <div class="floaters"></div>
      <div class="tactical"><div class="tt">TACTICAL MAP · <span>TAB</span> TO CLOSE</div><canvas></canvas><div class="legend"><span class="lg you">YOU</span><span class="lg bot">ROBOT</span><span class="lg obj">OBJECTIVE</span><span class="lg hp">HEALTH</span><span class="lg am">AMMO</span></div></div>
      <div class="fadeout"></div>
      <div class="deadscreen">SIGNAL LOST</div>
      <div class="lockhint">CLICK TO CONTINUE</div>
    `;
    root.appendChild(this.el);
    this.radar = this.$("canvas.radar");
    this.arrows = this.$("canvas.arrows");
    this.mapCanvas = this.$(".tactical canvas");
  }

  show(v: boolean): void {
    this.el.hidden = !v;
  }

  reset(heroName: string, weaponName: string, abilityName: string): void {
    this.floaters.forEach((f) => f.el.remove());
    this.floaters = [];
    this.$(".hero").textContent = heroName;
    this.$(".wname").textContent = weaponName;
    this.$(".aname").textContent = abilityName;
    this.$(".val").textContent = "0";
    this.setBoss(-1);
    this.alarm(false);
    this.$(".fadeout").classList.remove("on");
    this.$(".deadscreen").classList.remove("on");
    this.$(".radio").classList.remove("on");
    this.$(".hint").classList.remove("on");
    this.radioQueue = [];
    this.radioT = 0;
    this.setTactical(false);
  }

  /** Mission name on the objectives panel; also forgets the cached tactical map. */
  setMission(title: string, scoreTitle = "POINTS"): void {
    this.$(".obj .ptitle").textContent = title;
    this.$(".score .ptitle").textContent = scoreTitle;
    this.mapBase = null;
  }

  setLockHint(v: boolean): void {
    this.$(".lockhint").classList.toggle("on", v);
  }

  setObjectives(list: { text: string; done: boolean; optional?: boolean; active?: boolean }[]): void {
    this.$(".obj ul").innerHTML = list
      .map((o) => `<li class="${o.done ? "done" : ""} ${o.optional ? "opt" : ""} ${o.active ? "active" : ""}"><i>${o.done ? "✔" : o.active ? "▶" : "□"}</i>${o.text}</li>`)
      .join("");
  }

  setScore(n: number): void {
    const v = this.$(".val");
    v.textContent = String(n);
    v.classList.remove("pop");
    void v.offsetWidth;
    v.classList.add("pop");
  }

  radio(who: string, msg: string): void {
    this.radioQueue.push([who, msg]);
    if (this.radioT <= 0) this.nextRadio();
  }
  private nextRadio(): void {
    const m = this.radioQueue.shift();
    if (!m) return;
    this.$(".radio .who").textContent = `◉ ${m[0]}`;
    this.$(".radio .msg").innerHTML = m[1];
    this.$(".radio").classList.add("on");
    this.radioT = 4.5 + m[1].length * 0.03;
  }

  hint(msg: string, t: number): void {
    const h = this.$(".hint");
    h.innerHTML = msg;
    h.classList.add("on");
    this.hintT = t;
  }

  roomName(name: string): void {
    const r = this.$(".roomname");
    r.textContent = name.toUpperCase();
    r.classList.add("on");
    this.roomT = 2.2;
    this.$(".room").textContent = name.toUpperCase();
  }

  prompt(text: string | null, progress: number): void {
    const p = this.$(".prompt");
    p.classList.toggle("on", !!text);
    if (text) {
      this.$(".ptext").innerHTML = text;
      (this.$(".pbar div") as HTMLDivElement).style.width = `${Math.min(100, progress * 100)}%`;
    }
  }

  spotted(): void {
    this.spotT = 1.6;
    this.$(".spotted").classList.add("on");
  }

  alarm(on: boolean): void {
    this.$(".alarm-banner").classList.toggle("on", on);
  }

  setBoss(frac: number, name?: string): void {
    const b = this.$(".boss");
    b.classList.toggle("on", frac >= 0);
    if (name) this.$(".bname").textContent = name;
    if (frac >= 0) (this.$(".bbar div") as HTMLDivElement).style.width = `${Math.max(0, frac) * 100}%`;
  }

  hitmarker(crit: boolean, kill: boolean): void {
    const h = this.$(".hitmark");
    h.className = `hitmark on ${crit ? "crit" : ""} ${kill ? "kill" : ""}`;
    this.hitT = kill ? 0.3 : 0.12;
  }

  hurt(from: Vector3 | null, frac: number): void {
    this.hurtDirs.push({ from, t: 1 });
    const v = this.$(".dmg-vignette");
    v.style.opacity = String(Math.min(0.9, 0.35 + frac * 3));
  }

  flashScan(): void {
    this.scanT = 0.6;
    this.el.classList.add("scanpulse");
    setTimeout(() => this.el.classList.remove("scanpulse"), 600);
  }

  floatText(pos: Vector3, text: string, scale: number): void {
    const el = document.createElement("div");
    el.className = "floater";
    el.textContent = text;
    el.style.fontSize = `${22 * scale}px`;
    this.$(".floaters").appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 1.4 });
  }

  dead(): void {
    this.$(".deadscreen").classList.add("on");
  }
  fade(): void {
    this.$(".fadeout").classList.add("on");
  }

  setTactical(v: boolean): void {
    this.tactical = v;
    this.$(".tactical").classList.toggle("on", v);
  }

  // ------------------------------------------------------------------ per-frame
  update(g: Game, dt: number): void {
    const p = g.player;
    const maxHp = p.maxHp;
    const hpEl = this.$(".hp .fill") as HTMLDivElement;
    hpEl.style.width = `${Math.min(100, (Math.min(p.hp, maxHp) / maxHp) * 100)}%`;
    hpEl.classList.toggle("low", p.hp < maxHp * 0.3);
    (this.$(".hp .bonus") as HTMLDivElement).style.width = `${Math.max(0, ((p.hp - maxHp) / maxHp) * 100)}%`;
    this.setText(".hp span", `${Math.ceil(p.hp)} / ${maxHp + p.bonusHp}`);
    this.setText(".wname", p.weaponName.toUpperCase());
    const melee = p.slot === 2;
    this.$(".ammo").classList.toggle("melee", melee);
    this.setText(".mag", String(p.curMag));
    this.setText(".res", String(Math.floor(p.curReserve)));
    this.$(".mag").classList.toggle("low", !melee && p.curMag <= Math.ceil(p.curMagMax * 0.2));
    // loadout: three weapons and two gadgets
    for (const s of [0, 1, 2] as const) {
      this.setText(`.s${s} span`, p.slotName(s).toUpperCase());
      this.$(`.s${s}`).classList.toggle("on", p.slot === s);
    }
    this.setText(".s1 em", String(p.mag2 + Math.floor(p.reserve2)));
    for (const i of [0, 1] as const) {
      const n = p.gadgets[i];
      this.setText(`.g${i} span`, GADGETS[p.gadgetKind(i)].name.toUpperCase());
      this.setText(`.g${i} em`, `×${n}`);
      this.$(`.g${i}`).classList.toggle("empty", n <= 0);
    }
    this.$(".rel").classList.toggle("on", p.reloadT > 0);
    this.$(".flash-ind").classList.toggle("on", p.flashlight);
    // ability ring
    const fg = this.$(".ability .fg") as unknown as SVGCircleElement;
    const C = 2 * Math.PI * 17;
    let frac: number;
    if (p.abilityT > 0 && p.stats.abilityDur > 0) frac = p.abilityT / p.stats.abilityDur;
    else frac = 1 - p.abilityCd / p.stats.abilityCd;
    fg.style.strokeDasharray = `${C * frac} ${C}`;
    const ab = this.$(".ability");
    ab.classList.toggle("ready", p.abilityCd <= 0);
    ab.classList.toggle("active", p.abilityT > 0);
    // crosshair spread
    const ch = this.$(".crosshair");
    ch.style.setProperty("--gap", `${6 + (p.moving ? 6 : 0) + (1 - p.ads) * 4}px`);
    ch.classList.toggle("ads", p.ads > 0.6);
    // scope view for the sniper rifle and the Precision Optic
    const sk = p.scopeK;
    const sc = this.$(".scope");
    sc.style.opacity = sk.toFixed(3);
    sc.style.setProperty("--kick", `${(p.kickK * 14).toFixed(1)}px`);
    sc.style.setProperty("--grow", (0.94 + sk * 0.06).toFixed(3));
    ch.classList.toggle("scoped", sk > 0.5);
    // the red-dot sight has its own dot, so the crosshair steps aside while aiming through it
    ch.classList.toggle("reflex", !p.gun?.scope && p.gun?.model === "rifle" && p.slot === 0 && p.ads > 0.75);
    // timers
    if (this.radioT > 0) {
      this.radioT -= dt;
      if (this.radioT <= 0) {
        this.$(".radio").classList.remove("on");
        setTimeout(() => this.nextRadio(), 350);
      }
    }
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) this.$(".hint").classList.remove("on");
    if (this.roomT > 0 && (this.roomT -= dt) <= 0) this.$(".roomname").classList.remove("on");
    if (this.spotT > 0 && (this.spotT -= dt) <= 0) this.$(".spotted").classList.remove("on");
    if (this.hitT > 0 && (this.hitT -= dt) <= 0) this.$(".hitmark").classList.remove("on");
    const v = this.$(".dmg-vignette");
    v.style.opacity = String(Math.max(0, parseFloat(v.style.opacity || "0") - dt * 1.2) + (p.hp < maxHp * 0.3 ? 0.25 + Math.sin(performance.now() / 200) * 0.1 : 0));
    this.el.classList.toggle("od", p.overdrive);
    this.el.classList.toggle("shieldup", p.shieldUp);
    // floaters
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t -= dt;
      f.pos.y += dt * 0.8;
      const s = f.pos.clone().project(this.camera);
      if (s.z > 1 || f.t <= 0) {
        f.el.style.display = s.z > 1 ? "none" : "";
      }
      f.el.style.transform = `translate(${((s.x + 1) / 2) * w}px, ${((1 - s.y) / 2) * h}px) translate(-50%,-50%)`;
      f.el.style.opacity = String(Math.min(1, f.t * 2));
      if (f.t <= 0) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
    this.radarT -= dt;
    if (this.radarT <= 0) {
      this.radarT = 0.05;
      this.drawRadar(g);
    }
    this.drawArrows(g, dt);
    if (this.tactical) this.drawTactical(g);
  }

  private drawRadar(g: Game): void {
    const c = this.radar;
    const x = c.getContext("2d")!;
    const S = c.width;
    const p = g.player;
    const scale = 7; // px per metre
    x.clearRect(0, 0, S, S);
    x.save();
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    x.clip();
    x.fillStyle = "rgba(4,18,10,0.82)";
    x.fillRect(0, 0, S, S);
    x.translate(S / 2, S / 2);
    x.rotate(p.yaw);
    x.translate(-p.pos.x * scale, -p.pos.z * scale);
    // walls
    const lv = g.level;
    const r = 16;
    x.fillStyle = "rgba(60,255,120,0.10)";
    for (let cz = Math.floor(p.pos.z - r); cz <= p.pos.z + r; cz++)
      for (let cx = Math.floor(p.pos.x - r); cx <= p.pos.x + r; cx++) {
        const t = lv.cell(cx, cz);
        if (t === 1 || t === 2) x.fillRect(cx * scale, cz * scale, scale + 0.5, scale + 0.5);
      }
    x.fillStyle = "rgba(60,255,120,0.55)";
    for (let cz = Math.floor(p.pos.z - r); cz <= p.pos.z + r; cz++)
      for (let cx = Math.floor(p.pos.x - r); cx <= p.pos.x + r; cx++) {
        const t = lv.cell(cx, cz);
        if (t === 0 || t === 3) {
          const nb = lv.cell(cx + 1, cz) === 1 || lv.cell(cx - 1, cz) === 1 || lv.cell(cx, cz + 1) === 1 || lv.cell(cx, cz - 1) === 1 || lv.cell(cx + 1, cz) === 2 || lv.cell(cx - 1, cz) === 2 || lv.cell(cx, cz + 1) === 2 || lv.cell(cx, cz - 1) === 2;
          if (nb) x.fillRect(cx * scale, cz * scale, scale, scale);
        }
      }
    for (const d of lv.doors) {
      x.fillStyle = d.locked ? "#ff4030" : "rgba(90,255,150,0.9)";
      x.fillRect(d.cx * scale - 2.5, d.cz * scale - 2.5, 5, 5);
    }
    // pickups
    for (const k of g.pickups) {
      if (k.taken) continue;
      x.fillStyle = k.kind === "health" ? "#40ff80" : "#40d8ff";
      x.fillRect(k.pos.x * scale - 2, k.pos.z * scale - 2, 4, 4);
    }
    // robots
    const now = performance.now() / 1000;
    for (const b of g.robots) {
      if (!b.alive) continue;
      const d = b.pos.distanceTo(p.pos);
      if (d > 18 && !p.scanning) continue;
      const col = b.state === "combat" ? "#ff2a1a" : b.state === "suspicious" || b.state === "search" ? "#ffc020" : b.state === "stunned" ? "#40c0ff" : b.state === "dormant" ? "#802010" : "#ff6a50";
      x.fillStyle = col;
      x.beginPath();
      const rr = b.kind === "warlord" ? 6 : b.kind === "bulwark" ? 4.5 : 3.5;
      x.arc(b.pos.x * scale, b.pos.z * scale, rr + (b.state === "combat" ? Math.sin(now * 12) : 0), 0, Math.PI * 2);
      x.fill();
      // facing tick
      x.strokeStyle = col;
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(b.pos.x * scale, b.pos.z * scale);
      x.lineTo((b.pos.x + Math.sin(b.yaw) * 1.3) * scale, (b.pos.z + Math.cos(b.yaw) * 1.3) * scale);
      x.stroke();
    }
    // objective
    const o = g.objectiveTarget();
    if (o) {
      x.strokeStyle = "#ffe060";
      x.lineWidth = 2;
      x.beginPath();
      x.arc(o.x * scale, o.z * scale, 5 + Math.sin(now * 5) * 1.5, 0, Math.PI * 2);
      x.stroke();
    }
    x.restore();
    // objective arrow at edge if off radar
    if (o) {
      const dx = o.x - p.pos.x;
      const dz = o.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist * scale > S / 2 - 10) {
        const ang = Math.atan2(dz, dx) + p.yaw;
        const rx = S / 2 + Math.cos(ang) * (S / 2 - 10);
        const ry = S / 2 + Math.sin(ang) * (S / 2 - 10);
        x.fillStyle = "#ffe060";
        x.beginPath();
        x.arc(rx, ry, 4, 0, Math.PI * 2);
        x.fill();
      }
    }
    // player chevron
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.moveTo(S / 2, S / 2 - 7);
    x.lineTo(S / 2 + 5, S / 2 + 5);
    x.lineTo(S / 2, S / 2 + 2);
    x.lineTo(S / 2 - 5, S / 2 + 5);
    x.fill();
    x.strokeStyle = "rgba(60,255,120,0.7)";
    x.lineWidth = 2;
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    x.stroke();
  }

  private drawArrows(g: Game, dt: number): void {
    const c = this.arrows;
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, w, h);
    const p = g.player;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.22;
    const drawArrow = (ang: number, col: string, alpha: number, size: number): void => {
      x.save();
      x.translate(cx + Math.sin(ang) * R, cy - Math.cos(ang) * R);
      x.rotate(ang);
      x.globalAlpha = alpha;
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, -size);
      x.lineTo(size * 0.9, size * 0.5);
      x.lineTo(-size * 0.9, size * 0.5);
      x.fill();
      x.restore();
    };
    // robots that see you and are off-screen
    for (const b of g.robots) {
      if (!b.alive || b.state !== "combat" || !b.canSee) continue;
      const s = b.center.project(this.camera);
      const on = s.z < 1 && Math.abs(s.x) < 0.95 && Math.abs(s.y) < 0.95;
      if (on) continue;
      const ang = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      const rel = -(ang - (p.yaw + Math.PI));
      drawArrow(rel, "#ff2a1a", 0.85, 14);
    }
    // recent damage directions
    for (let i = this.hurtDirs.length - 1; i >= 0; i--) {
      const d = this.hurtDirs[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.hurtDirs.splice(i, 1);
        continue;
      }
      if (!d.from) continue;
      const ang = Math.atan2(d.from.x - p.pos.x, d.from.z - p.pos.z);
      const rel = -(ang - (p.yaw + Math.PI));
      x.save();
      x.translate(cx, cy);
      x.rotate(rel);
      x.globalAlpha = d.t;
      x.strokeStyle = "#ff3020";
      x.lineWidth = 6;
      x.beginPath();
      x.arc(0, 0, R * 0.8, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35);
      x.stroke();
      x.restore();
    }
    // objective marker in world
    const o = g.objectiveTarget();
    if (o) {
      const wp = new Vector3(o.x, 1.6, o.z);
      const s = wp.clone().project(this.camera);
      const dist = Math.hypot(o.x - p.pos.x, o.z - p.pos.z);
      if (s.z < 1 && Math.abs(s.x) < 1 && Math.abs(s.y) < 1) {
        const sx = ((s.x + 1) / 2) * w;
        const sy = ((1 - s.y) / 2) * h;
        x.save();
        x.translate(sx, sy);
        x.strokeStyle = "#ffe060";
        x.fillStyle = "#ffe060";
        x.lineWidth = 2;
        x.rotate(Math.PI / 4);
        x.strokeRect(-8, -8, 16, 16);
        x.rotate(-Math.PI / 4);
        x.font = "bold 13px 'Share Tech Mono', monospace";
        x.textAlign = "center";
        x.fillText(`${Math.round(dist)}m`, 0, 26);
        x.restore();
      } else {
        const ang = Math.atan2(o.x - p.pos.x, o.z - p.pos.z);
        const rel = -(ang - (p.yaw + Math.PI));
        drawArrow(rel, "#ffe060", 0.9, 10);
      }
    }
  }

  private drawTactical(g: Game): void {
    const c = this.mapCanvas;
    const lv = g.level;
    const scale = Math.floor(Math.min((this.el.clientWidth * 0.86) / GW, (this.el.clientHeight * 0.7) / GH));
    const W = GW * scale;
    const H = GH * scale;
    if (c.width !== W || c.height !== H || !this.mapBase) {
      c.width = W;
      c.height = H;
      // static base layer
      const b = document.createElement("canvas");
      b.width = W;
      b.height = H;
      const x = b.getContext("2d")!;
      x.fillStyle = "rgba(2,10,6,0.9)";
      x.fillRect(0, 0, W, H);
      for (let cz = 0; cz < GH; cz++)
        for (let cx = 0; cx < GW; cx++) {
          const t = lv.cell(cx, cz);
          if (t === 1 || t === 2) {
            x.fillStyle = "rgba(60,255,120,0.13)";
            x.fillRect(cx * scale, cz * scale, scale, scale);
          }
        }
      x.fillStyle = "rgba(60,255,120,0.75)";
      for (let cz = 0; cz < GH; cz++)
        for (let cx = 0; cx < GW; cx++) {
          const t = lv.cell(cx, cz);
          if (t !== 0 && t !== 3) continue;
          let nb = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = lv.cell(cx + dx, cz + dz);
            if (n === 1 || n === 2) nb = true;
          }
          if (!nb) continue;
          x.fillStyle = t === 3 ? "rgba(100,220,255,0.8)" : "rgba(60,255,120,0.75)";
          x.fillRect(cx * scale, cz * scale, scale, scale);
        }
      x.fillStyle = "rgba(60,255,120,0.28)";
      for (const pr of lv.props) x.fillRect(pr.minX * scale, pr.minZ * scale, (pr.maxX - pr.minX) * scale, (pr.maxZ - pr.minZ) * scale);
      x.font = `bold ${Math.max(10, scale * 0.62)}px 'Share Tech Mono', monospace`;
      x.textAlign = "center";
      x.fillStyle = "rgba(200,255,210,0.9)";
      for (const r of lv.rooms) {
        if (r.id === "c1" || r.id === "c2") continue;
        const words = r.name.toUpperCase().split(" ");
        const cx = ((r.x0 + r.x1 + 1) / 2) * scale;
        const cy = ((r.z0 + r.z1 + 1) / 2) * scale;
        const lines = words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [words.join(" ")];
        lines.forEach((l, i) => x.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * scale * 0.8));
      }
      this.mapBase = b;
    }
    const x = c.getContext("2d")!;
    x.drawImage(this.mapBase, 0, 0);
    for (const d of lv.doors) {
      x.fillStyle = d.locked ? "#ff4030" : "#50ff90";
      for (const [cx, cz] of d.cells) x.fillRect(cx * scale + scale * 0.2, cz * scale + scale * 0.2, scale * 0.6, scale * 0.6);
    }
    for (const k of g.pickups) {
      if (k.taken) continue;
      x.fillStyle = k.kind === "health" ? "#40ff80" : "#40d8ff";
      x.fillRect(k.pos.x * scale - 3, k.pos.z * scale - 3, 6, 6);
    }
    const p = g.player;
    for (const b of g.robots) {
      if (!b.alive) continue;
      const known = b.pos.distanceTo(p.pos) < 18 || p.scanning || b.state === "combat" || b.kind === "warlord";
      if (!known) continue;
      x.fillStyle = b.state === "combat" ? "#ff2a1a" : b.state === "suspicious" || b.state === "search" ? "#ffc020" : "#ff6a50";
      x.beginPath();
      x.arc(b.pos.x * scale, b.pos.z * scale, b.kind === "warlord" ? scale * 0.7 : scale * 0.35, 0, Math.PI * 2);
      x.fill();
    }
    const o = g.objectiveTarget();
    if (o) {
      x.strokeStyle = "#ffe060";
      x.lineWidth = 3;
      x.beginPath();
      x.arc(o.x * scale, o.z * scale, scale * 0.9 + Math.sin(performance.now() / 150) * 2, 0, Math.PI * 2);
      x.stroke();
    }
    x.save();
    x.translate(p.pos.x * scale, p.pos.z * scale);
    x.rotate(-p.yaw);
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.moveTo(0, -scale * 0.8);
    x.lineTo(scale * 0.55, scale * 0.55);
    x.lineTo(-scale * 0.55, scale * 0.55);
    x.fill();
    x.restore();
  }
}
