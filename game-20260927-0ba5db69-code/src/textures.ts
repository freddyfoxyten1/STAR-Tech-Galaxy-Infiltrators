import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace, Texture } from "three";

const cache = new Map<string, Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function finish(c: HTMLCanvasElement, repeat = true): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

let seed = 1337;
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amount: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * amount})`;
    const s = 1 + rnd() * 3;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
  // grime streaks
  for (let i = 0; i < count / 60; i++) {
    const x = rnd() * w;
    const grad = g.createLinearGradient(x, 0, x, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(rnd(), `rgba(0,0,0,${amount * 0.8})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x, 0, 2 + rnd() * 6, h);
  }
}

/** Sci-fi metal wall panels. */
export function panelTex(key: string, base: string, seam: string, cols = 2, rows = 2, accent?: string): Texture {
  const k = `panel:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 0.12, 1800);
  const pw = S / cols;
  const ph = S / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * pw;
      const py = y * ph;
      // bevel
      g.strokeStyle = seam;
      g.lineWidth = 4;
      g.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 1;
      g.strokeRect(px + 5, py + 5, pw - 10, ph - 10);
      // rivets
      g.fillStyle = "rgba(0,0,0,0.45)";
      for (const [rx, ry] of [[10, 10], [pw - 10, 10], [10, ph - 10], [pw - 10, ph - 10]]) {
        g.beginPath();
        g.arc(px + rx, py + ry, 2.5, 0, Math.PI * 2);
        g.fill();
      }
      if (accent && (x + y) % 2 === 0) {
        g.fillStyle = accent;
        g.fillRect(px + pw * 0.2, py + ph * 0.45, pw * 0.6, 4);
      }
    }
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

export function woodTex(): Texture {
  const k = "wood";
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  const planks = 6;
  for (let i = 0; i < planks; i++) {
    const hue = 22 + rnd() * 8;
    const light = 30 + rnd() * 10;
    g.fillStyle = `hsl(${hue},55%,${light}%)`;
    const y = (i * S) / planks;
    g.fillRect(0, y, S, S / planks);
    for (let l = 0; l < 26; l++) {
      g.strokeStyle = `rgba(40,20,5,${0.1 + rnd() * 0.25})`;
      g.lineWidth = 1;
      g.beginPath();
      const yy = y + rnd() * (S / planks);
      g.moveTo(0, yy);
      g.bezierCurveTo(S * 0.3, yy + rnd() * 4 - 2, S * 0.6, yy + rnd() * 4 - 2, S, yy);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(0, y, S, 2);
    const cut = rnd() * S;
    g.fillRect(cut, y, 2, S / planks);
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

export function diamondPlateTex(key: string, base: string): Texture {
  const k = `diamond:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 0.18, 2400);
  for (let y = 0; y < S; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 0; x < S; x += 16) {
      g.save();
      g.translate(x + 4, y + 8);
      g.rotate(((y / 16) % 2 ? 1 : -1) * 0.7);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(-5, -1.5, 10, 3);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(-5, 1.5, 10, 1.5);
      g.restore();
    }
  }
  // rust spots
  for (let i = 0; i < 14; i++) {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    grd.addColorStop(0, "rgba(120,60,20,0.35)");
    grd.addColorStop(1, "rgba(120,60,20,0)");
    g.save();
    g.translate(rnd() * S, rnd() * S);
    g.fillStyle = grd;
    g.fillRect(-30, -30, 60, 60);
    g.restore();
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

export function grateTex(key: string, base: string, glow?: string): Texture {
  const k = `grate:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = glow ?? "#050505";
  g.fillRect(0, 0, S, S);
  g.fillStyle = base;
  for (let y = 0; y < S; y += 12) g.fillRect(0, y, S, 7);
  for (let x = 0; x < S; x += 64) g.fillRect(x, 0, 6, S);
  noise(g, S, S, 0.2, 1500);
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 3;
  g.strokeRect(1, 1, S - 2, S - 2);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

export function hazardTex(): Texture {
  const k = "hazard";
  if (cache.has(k)) return cache.get(k)!;
  const [c, g] = canvas(128, 32);
  g.fillStyle = "#e0a800";
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = "#111";
  for (let x = -32; x < 160; x += 24) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 12, 32);
    g.lineTo(x + 44, 0);
    g.lineTo(x + 32, 0);
    g.fill();
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Glowing console screen with scrolling-looking text lines. */
export function screenTex(key: string, color: string, bg = "#021018"): Texture {
  const k = `screen:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const [c, g] = canvas(128, 96);
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = color;
  g.globalAlpha = 0.9;
  for (let y = 8; y < 90; y += 7) {
    const w = 20 + rnd() * 90;
    g.fillRect(6, y, w, 3);
  }
  g.globalAlpha = 0.5;
  g.strokeStyle = color;
  g.strokeRect(2, 2, 124, 92);
  g.beginPath();
  for (let x = 0; x < 50; x++) g.lineTo(70 + x, 60 + Math.sin(x * 0.5) * 10 * rnd());
  g.stroke();
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

/** Stencilled text plate (numbers on robots, S-T-E on the dropship, shield lettering). */
export function labelTex(text: string, fg: string, bg: string, w = 256, h = 128, font = "bold 72px Impact, Arial Black, sans-serif", lines?: string[]): Texture {
  const k = `label:${text}:${fg}:${bg}:${w}x${h}`;
  if (cache.has(k)) return cache.get(k)!;
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.15, 600);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const ls = lines ?? [text];
  const step = h / (ls.length + 1);
  ls.forEach((l, i) => g.fillText(l, w / 2, step * (i + 1)));
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

/** The STAR-Tech winged-gear badge with crossed rifles (drawn on a transparent canvas). */
export function drawEmblem(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, gold = "#c9b27a", dark = "#1d2a1d"): void {
  g.save();
  g.translate(cx, cy);
  // gear teeth
  g.fillStyle = gold;
  for (let i = 0; i < 12; i++) {
    g.save();
    g.rotate((i / 12) * Math.PI * 2);
    g.fillRect(-r * 0.13, -r * 1.02, r * 0.26, r * 0.25);
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  g.fill();
  // wings
  g.fillStyle = gold;
  for (const s of [-1, 1]) {
    g.save();
    g.scale(s, 1);
    for (let f = 0; f < 4; f++) {
      g.beginPath();
      g.moveTo(r * 0.05, -r * 0.05 + f * r * 0.08);
      g.quadraticCurveTo(r * 0.6, -r * 0.55 + f * r * 0.12, r * (1.05 - f * 0.12), -r * (0.62 - f * 0.1));
      g.quadraticCurveTo(r * 0.55, -r * 0.2 + f * r * 0.1, r * 0.05, r * 0.08 + f * r * 0.08);
      g.fill();
    }
    g.restore();
  }
  // spear / star point
  g.beginPath();
  g.moveTo(0, -r * 0.62);
  g.lineTo(r * 0.12, -r * 0.1);
  g.lineTo(0, r * 0.05);
  g.lineTo(-r * 0.12, -r * 0.1);
  g.fill();
  // ship silhouette
  g.beginPath();
  g.moveTo(0, -r * 0.05);
  g.lineTo(r * 0.22, r * 0.45);
  g.lineTo(0, r * 0.35);
  g.lineTo(-r * 0.22, r * 0.45);
  g.fill();
  // crossed rifles
  g.strokeStyle = gold;
  g.lineWidth = r * 0.06;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * r * 0.55, r * 0.05);
    g.lineTo(-s * r * 0.05, r * 0.6);
    g.stroke();
  }
  g.restore();
}

export function emblemTex(): Texture {
  const k = "emblem";
  if (cache.has(k)) return cache.get(k)!;
  const [c, g] = canvas(256, 256);
  drawEmblem(g, 128, 128, 110);
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

export function emblemDataUrl(size = 256): string {
  const [c, g] = canvas(size, size);
  drawEmblem(g, size / 2, size / 2, size * 0.43);
  return c.toDataURL();
}

/** Deep-space panorama for the sky sphere: stars, purple/teal nebulae and distant planets. */
export function spaceTex(): Texture {
  const k = "space";
  if (cache.has(k)) return cache.get(k)!;
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#03040a";
  g.fillRect(0, 0, W, H);
  const nebula = (x: number, y: number, r: number, col: string): void => {
    for (let i = 0; i < 18; i++) {
      const ox = x + (rnd() - 0.5) * r * 1.6;
      const oy = y + (rnd() - 0.5) * r * 0.8;
      const rr = r * (0.3 + rnd() * 0.6);
      const grd = g.createRadialGradient(ox, oy, 0, ox, oy, rr);
      grd.addColorStop(0, col);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(ox - rr, oy - rr, rr * 2, rr * 2);
    }
  };
  nebula(400, 420, 380, "rgba(120,40,160,0.10)");
  nebula(1300, 600, 420, "rgba(30,110,150,0.09)");
  nebula(1800, 300, 300, "rgba(170,60,90,0.08)");
  nebula(900, 250, 260, "rgba(60,80,170,0.08)");
  for (let i = 0; i < 4200; i++) {
    const b = rnd();
    g.fillStyle = `rgba(${200 + rnd() * 55},${200 + rnd() * 55},255,${0.3 + b * 0.7})`;
    const s = b > 0.985 ? 2.2 : b > 0.9 ? 1.4 : 0.8;
    g.fillRect(rnd() * W, rnd() * H, s, s);
  }
  const planet = (x: number, y: number, r: number, a: string, b: string): void => {
    const grd = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    grd.addColorStop(0, a);
    grd.addColorStop(1, b);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  planet(1500, 380, 60, "#7fa9d6", "#0b1522");
  planet(300, 700, 22, "#d69a6a", "#241408");
  planet(1100, 820, 14, "#b6d68f", "#122208");
  const t = finish(c, false);
  t.wrapS = RepeatWrapping;
  cache.set(k, t);
  return t;
}

/** Painting of the overgrown jungle-ruins planet shown on the hangar monitor. */
export function jungleTex(): Texture {
  const k = "jungle";
  if (cache.has(k)) return cache.get(k)!;
  const W = 512;
  const H = 320;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#7fb5c9");
  sky.addColorStop(0.6, "#cfe0d0");
  sky.addColorStop(1, "#5f7f5a");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // distant ruin spires
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 55 + rnd() * 20;
    const h = 80 + rnd() * 120;
    g.fillStyle = `rgba(80,100,95,${0.4 + rnd() * 0.3})`;
    g.fillRect(x, H * 0.7 - h, 18 + rnd() * 14, h);
    g.fillStyle = "rgba(60,110,60,0.6)";
    g.fillRect(x - 3, H * 0.7 - h, 26, 10);
  }
  // hills
  g.fillStyle = "#3d6b3a";
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.72 + Math.sin(x * 0.02) * 16 + rnd() * 8);
  g.lineTo(W, H);
  g.fill();
  // temple
  g.fillStyle = "#8a9a8a";
  g.fillRect(200, 190, 110, 60);
  g.fillStyle = "#1b231b";
  g.fillRect(240, 215, 30, 35);
  g.fillStyle = "#6c7c6c";
  g.fillRect(190, 180, 130, 12);
  // vines
  g.strokeStyle = "#2f5a2a";
  g.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    const x = rnd() * W;
    g.moveTo(x, rnd() * H * 0.6);
    g.quadraticCurveTo(x + 20 * (rnd() - 0.5), H * 0.7, x + 30 * (rnd() - 0.5), H);
    g.stroke();
  }
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

export function hologramTex(): Texture {
  const k = "holo";
  if (cache.has(k)) return cache.get(k)!;
  const [c, g] = canvas(128, 128);
  g.strokeStyle = "rgba(90,220,255,0.9)";
  g.lineWidth = 2;
  for (let y = 4; y < 128; y += 6) {
    g.globalAlpha = 0.3 + rnd() * 0.5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

export function glowSpriteTex(): Texture {
  const k = "glow";
  if (cache.has(k)) return cache.get(k)!;
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.7)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  cache.set(k, t);
  return t;
}

// =====================================================================================
// Surface detail: bump maps derived from the painted textures, plus richer painted sets
// for props, vehicles, armour and robots.
// =====================================================================================

const bumpCache = new Map<Texture, Texture>();
/** Greyscale height map from a painted texture (dark seams sink, bright rivets rise). */
export function bumpOf(t: Texture): Texture {
  const hit = bumpCache.get(t);
  if (hit) return hit;
  const src = t.image as HTMLCanvasElement;
  const [c, g] = canvas(src.width, src.height);
  g.filter = "grayscale(1) contrast(1.6)";
  g.drawImage(src, 0, 0);
  const b = new CanvasTexture(c);
  b.wrapS = t.wrapS;
  b.wrapT = t.wrapT;
  b.repeat.copy(t.repeat);
  b.anisotropy = 4;
  bumpCache.set(t, b);
  return b;
}

function scratches(g: CanvasRenderingContext2D, w: number, h: number, n: number, light = true): void {
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    g.strokeStyle = light ? `rgba(220,220,210,${0.08 + rnd() * 0.18})` : `rgba(0,0,0,${0.1 + rnd() * 0.2})`;
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * 26;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

function grime(g: CanvasRenderingContext2D, w: number, h: number, n: number, col = "0,0,0", a = 0.25): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 10 + rnd() * w * 0.18;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${col},${a * rnd()})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function rivetRow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, step: number, r = 2): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.beginPath();
    g.arc(x + 0.6, y + 0.6, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.arc(x - 0.4, y - 0.4, r * 0.7, 0, Math.PI * 2);
    g.fill();
  }
}

function stencil(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, col: string, rot = 0, align: CanvasTextAlign = "center"): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillStyle = col;
  g.globalAlpha = 0.85;
  g.fillText(text, 0, 0);
  // worn stencil gaps
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.6})`;
    g.fillRect((rnd() - 0.5) * size * text.length * 0.6, (rnd() - 0.5) * size, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  g.restore();
}

/** Worn sci-fi metal plating with seams, bolts, scratches and grime. */
export function wornMetalTex(key: string, base: string, opts: { cols?: number; rows?: number; seam?: string; size?: number; rust?: number; stripe?: string; bolts?: boolean } = {}): Texture {
  const k = `worn:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = opts.size ?? 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 0.08, S * 8);
  const cols = opts.cols ?? 2;
  const rows = opts.rows ?? 2;
  const pw = S / cols;
  const ph = S / rows;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = x * pw;
      const py = y * ph;
      // slight tone variation per plate
      g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${rnd() * 0.06})`;
      g.fillRect(px, py, pw, ph);
      g.strokeStyle = opts.seam ?? "rgba(0,0,0,0.75)";
      g.lineWidth = 3;
      g.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
      g.strokeStyle = "rgba(255,255,255,0.12)";
      g.lineWidth = 1;
      g.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
      if (opts.bolts !== false) {
        rivetRow(g, px + 9, py + 9, px + pw - 9, py + 9, pw / 4, S / 200);
        rivetRow(g, px + 9, py + ph - 9, px + pw - 9, py + ph - 9, pw / 4, S / 200);
      }
      // edge wear
      g.strokeStyle = "rgba(210,210,200,0.12)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px + 3, py + ph - 3);
      g.lineTo(px + 3 + rnd() * pw * 0.5, py + ph - 3);
      g.stroke();
    }
  if (opts.stripe) {
    g.fillStyle = opts.stripe;
    g.fillRect(0, S * 0.46, S, S * 0.04);
  }
  scratches(g, S, S, S / 4);
  grime(g, S, S, 14);
  if (opts.rust) grime(g, S, S, opts.rust, "110,55,20", 0.4);
  // streaks
  for (let i = 0; i < S / 40; i++) {
    const x = rnd() * S;
    const grd = g.createLinearGradient(x, 0, x, S);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5 + rnd() * 0.4, `rgba(0,0,0,${0.08 + rnd() * 0.15})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 1 + rnd() * 4, S);
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Glossy composite armour with faint panel seams (heroes). */
export function armourTex(key: string, base: string): Texture {
  const k = `armour:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  grime(g, S, S, 20, "255,255,255", 0.05);
  noise(g, S, S, 0.05, 1500);
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, S * 0.33);
  g.lineTo(S * 0.4, S * 0.33);
  g.lineTo(S * 0.5, S * 0.45);
  g.lineTo(S, S * 0.45);
  g.moveTo(S * 0.7, 0);
  g.lineTo(S * 0.7, S * 0.45);
  g.stroke();
  scratches(g, S, S, 60);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Olive-drab dropship hull with panel lines, chipped paint, rivets and hazard markings. */
export function hullTex(key: string, base = "#5f664c"): Texture {
  const k = `hull:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 0.07, 9000);
  grime(g, S, S, 30, "30,34,20", 0.35);
  // panel layout
  const lines: [number, number, number, number][] = [];
  for (let i = 1; i < 4; i++) lines.push([0, (S * i) / 4, S, (S * i) / 4]);
  for (let i = 1; i < 6; i++) lines.push([(S * i) / 6 + (i % 2 ? 20 : -15), 0, (S * i) / 6 + (i % 2 ? 20 : -15), S]);
  for (const [a, b, cc, d] of lines) {
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(cc, d);
    g.stroke();
    g.strokeStyle = "rgba(255,255,230,0.1)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(a + 2, b + 2);
    g.lineTo(cc + 2, d + 2);
    g.stroke();
    rivetRow(g, a + 7, b + 7, cc + 7, d + 7, 22, 2.2);
  }
  // chipped paint showing bare metal
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    g.fillStyle = `rgba(150,150,140,${0.3 + rnd() * 0.5})`;
    g.beginPath();
    const r = 1 + rnd() * 4;
    g.ellipse(x, y, r * (1 + rnd()), r, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // access hatches
  for (let i = 0; i < 6; i++) {
    const x = rnd() * (S - 120);
    const y = rnd() * (S - 90);
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.lineWidth = 2;
    g.strokeRect(x, y, 70 + rnd() * 50, 40 + rnd() * 40);
  }
  stencil(g, "S-T-E", S * 0.3, S * 0.62, 150, "#d9dccb");
  stencil(g, "STAR-TECH ENFORCEMENT", S * 0.72, S * 0.2, 34, "#d9dccb");
  stencil(g, "NO STEP", S * 0.15, S * 0.12, 26, "#d9dccb");
  stencil(g, "DS-07", S * 0.8, S * 0.86, 60, "#1e2218");
  scratches(g, S, S, 500);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Full crate face: frame, cross brace, bolts, stencils (each face UV 0..1). */
export function crateFaceTex(key: string, base: string, label: string, sub: string): Texture {
  const k = `cratef:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 0.1, 5000);
  grime(g, S, S, 10);
  // recessed centre panel
  g.fillStyle = "rgba(0,0,0,0.2)";
  g.fillRect(56, 56, S - 112, S - 112);
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 4;
  g.strokeRect(56, 56, S - 112, S - 112);
  // frame
  g.strokeStyle = "rgba(255,255,255,0.14)";
  g.lineWidth = 2;
  g.strokeRect(8, 8, S - 16, S - 16);
  g.strokeStyle = "rgba(0,0,0,0.7)";
  g.lineWidth = 6;
  g.strokeRect(3, 3, S - 6, S - 6);
  rivetRow(g, 28, 28, S - 28, 28, 60, 5);
  rivetRow(g, 28, S - 28, S - 28, S - 28, 60, 5);
  rivetRow(g, 28, 28, 28, S - 28, 60, 5);
  rivetRow(g, S - 28, 28, S - 28, S - 28, 60, 5);
  // hazard corner
  g.save();
  g.beginPath();
  g.rect(56, S - 130, 110, 74);
  g.clip();
  g.fillStyle = "#d9a300";
  g.fillRect(56, S - 130, 110, 74);
  g.fillStyle = "#111";
  for (let x = 20; x < 300; x += 30) {
    g.beginPath();
    g.moveTo(x, S - 56);
    g.lineTo(x + 15, S - 56);
    g.lineTo(x + 60, S - 130);
    g.lineTo(x + 45, S - 130);
    g.fill();
  }
  g.restore();
  stencil(g, label, S / 2, S * 0.4, 64, "#e8e2c6");
  stencil(g, sub, S / 2, S * 0.56, 30, "#e8e2c6");
  stencil(g, "▲ THIS SIDE UP ▲", S * 0.62, S - 93, 20, "#e8e2c6");
  scratches(g, S, S, 180);
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

/** Oil drum wrap: ribs, warning label, drips (u around, v up). */
export function barrelTex(key: string, base: string): Texture {
  const k = `barrel:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  noise(g, W, H, 0.1, 3000);
  grime(g, W, H, 12, "0,0,0", 0.35);
  for (const y of [H * 0.3, H * 0.7]) {
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(0, y - 5, W, 3);
    g.fillStyle = "rgba(255,255,255,0.2)";
    g.fillRect(0, y - 2, W, 3);
  }
  // label
  g.fillStyle = "#e8e0c0";
  g.fillRect(W * 0.1, H * 0.36, W * 0.3, H * 0.28);
  g.fillStyle = "#111";
  g.font = "bold 20px Impact, sans-serif";
  g.textAlign = "center";
  g.fillText("FUEL CELL", W * 0.25, H * 0.46);
  g.font = "12px Consolas, monospace";
  g.fillText("FLAMMABLE · CLASS 3", W * 0.25, H * 0.56);
  // warning diamond
  g.save();
  g.translate(W * 0.62, H * 0.5);
  g.rotate(Math.PI / 4);
  g.fillStyle = "#e0b000";
  g.fillRect(-22, -22, 44, 44);
  g.strokeStyle = "#111";
  g.lineWidth = 3;
  g.strokeRect(-18, -18, 36, 36);
  g.restore();
  g.fillStyle = "#111";
  g.font = "bold 26px Impact";
  g.fillText("!", W * 0.62, H * 0.55);
  // drips
  for (let i = 0; i < 10; i++) {
    const x = rnd() * W;
    const grd = g.createLinearGradient(x, 0, x, H * (0.2 + rnd() * 0.4));
    grd.addColorStop(0, "rgba(20,15,5,0.6)");
    grd.addColorStop(1, "rgba(20,15,5,0)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 2 + rnd() * 5, H);
  }
  scratches(g, W, H, 200);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

export function fabricTex(key: string, base: string): Texture {
  const k = `fabric:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 3) {
    g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.06})`;
    g.fillRect(0, y, S, 1);
  }
  for (let x = 0; x < S; x += 3) {
    g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.04})`;
    g.fillRect(x, 0, 1, S);
  }
  grime(g, S, S, 10, "0,0,0", 0.2);
  // quilt stitching
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.setLineDash([4, 4]);
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(0, (S * i) / 4);
    g.lineTo(S, (S * i) / 4);
    g.stroke();
  }
  g.setLineDash([]);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Locker door: vents, handle, number, dents. */
export function lockerTex(key: string, base: string, num: string): Texture {
  const k = `locker:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const W = 256;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  noise(g, W, H, 0.08, 3000);
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 4;
  g.strokeRect(10, 10, W - 20, H - 20);
  for (let i = 0; i < 6; i++) {
    const y = 40 + i * 16;
    g.fillStyle = "rgba(0,0,0,0.7)";
    g.fillRect(50, y, W - 100, 7);
    g.fillStyle = "rgba(255,255,255,0.15)";
    g.fillRect(50, y + 7, W - 100, 2);
  }
  for (let i = 0; i < 6; i++) {
    const y = H - 150 + i * 16;
    g.fillStyle = "rgba(0,0,0,0.7)";
    g.fillRect(50, y, W - 100, 7);
  }
  g.fillStyle = "#222";
  g.fillRect(W - 60, H * 0.45, 18, 60);
  g.fillStyle = "rgba(255,255,255,0.3)";
  g.fillRect(W - 58, H * 0.45 + 2, 4, 56);
  g.fillStyle = "#e8e2c6";
  g.fillRect(W / 2 - 40, 160, 80, 44);
  g.fillStyle = "#111";
  g.font = "bold 34px Impact";
  g.textAlign = "center";
  g.fillText(num, W / 2, 196);
  grime(g, W, H, 12, "0,0,0", 0.35);
  scratches(g, W, H, 120);
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

/** Backlit keyboard / button panel. */
export function keyboardTex(key: string, col: string): Texture {
  const k = `keys:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const W = 256;
  const H = 128;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#15181c";
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 14; x++) {
      const lit = rnd() < 0.12;
      g.fillStyle = lit ? col : "#2a2f35";
      g.fillRect(8 + x * 17, 10 + y * 18, 14, 14);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(8 + x * 17, 10 + y * 18, 14, 2);
    }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? "#ff5030" : col;
    g.beginPath();
    g.arc(20 + i * 38, 105, 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

/** Circular pressure gauge face. */
export function gaugeTex(): Texture {
  const k = "gauge";
  if (cache.has(k)) return cache.get(k)!;
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#e8e4d8";
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#222";
  g.lineWidth = 6;
  g.stroke();
  g.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    g.strokeStyle = i > 7 ? "#c02010" : "#222";
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
    g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54);
    g.stroke();
  }
  g.strokeStyle = "#c02010";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(64 + Math.cos(-0.6) * 46, 64 + Math.sin(-0.6) * 46);
  g.stroke();
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

// ======================================================================= realism pass
/** Clean, pale station panelling: soft rounded panels, fine seams, faint smudges. */
export function cleanPanelTex(key: string, base: string, seam: string, cols = 1, rows = 2, accent?: string): Texture {
  const k = `clean:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 0.025, 2500);
  const pw = S / cols;
  const ph = S / rows;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = x * pw + 5;
      const py = y * ph + 5;
      const w = pw - 10;
      const h = ph - 10;
      const r = 18;
      const path = (): void => {
        g.beginPath();
        g.moveTo(px + r, py);
        g.arcTo(px + w, py, px + w, py + h, r);
        g.arcTo(px + w, py + h, px, py + h, r);
        g.arcTo(px, py + h, px, py, r);
        g.arcTo(px, py, px + w, py, r);
        g.closePath();
      };
      // soft pillow shading
      const grd = g.createLinearGradient(px, py, px, py + h);
      grd.addColorStop(0, "rgba(255,255,255,0.10)");
      grd.addColorStop(0.5, "rgba(255,255,255,0)");
      grd.addColorStop(1, "rgba(0,0,0,0.10)");
      path();
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = seam;
      g.lineWidth = 5;
      path();
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 1.5;
      g.save();
      g.translate(1.5, 1.5);
      path();
      g.stroke();
      g.restore();
      // small fixings in the corners
      for (const [fx, fy] of [[px + 16, py + 16], [px + w - 16, py + 16], [px + 16, py + h - 16], [px + w - 16, py + h - 16]]) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath();
        g.arc(fx, fy, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  if (accent) {
    g.fillStyle = accent;
    g.globalAlpha = 0.8;
    g.fillRect(S * 0.08, ph - 3, S * 0.2, 6);
    g.globalAlpha = 1;
  }
  grime(g, S, S, 6, "0,0,0", 0.06);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Equirectangular painting of a blue-green world. */
export function planetTex(): Texture {
  const k = "planet";
  if (cache.has(k)) return cache.get(k)!;
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  const sea = g.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#1c3f66");
  sea.addColorStop(0.5, "#1f5d8a");
  sea.addColorStop(1, "#1c3f66");
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  // continents: clustered blobs, wrapped horizontally
  const land = ["#3f6b34", "#56773c", "#7a7046", "#8a7a52", "#35592e"];
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * W;
    const cy = H * (0.2 + rnd() * 0.6);
    const n = 30 + Math.floor(rnd() * 40);
    for (let j = 0; j < n; j++) {
      const x = cx + (rnd() - 0.5) * 260;
      const y = cy + (rnd() - 0.5) * 120;
      const r = 8 + rnd() * 36;
      g.fillStyle = land[Math.floor(rnd() * land.length)];
      for (const ox of [-W, 0, W]) {
        g.beginPath();
        g.ellipse(x + ox, y, r * 1.4, r, rnd(), 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // ice caps
  const cap = (y0: number, y1: number): void => {
    const grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, "rgba(235,245,255,1)");
    grd.addColorStop(1, "rgba(235,245,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  };
  cap(0, 50);
  cap(H, H - 50);
  noise(g, W, H, 0.05, 6000);
  const t = finish(c, false);
  t.wrapS = RepeatWrapping;
  cache.set(k, t);
  return t;
}

/** Swirling cloud cover (white on transparent). */
export function cloudTex(): Texture {
  const k = "clouds";
  if (cache.has(k)) return cache.get(k)!;
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  for (let i = 0; i < 420; i++) {
    const x = rnd() * W;
    const y = H * (0.08 + rnd() * 0.84);
    const r = 6 + rnd() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 2);
    grd.addColorStop(0, `rgba(255,255,255,${0.25 + rnd() * 0.4})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    for (const ox of [-W, 0, W]) {
      g.save();
      g.translate(x + ox, y);
      g.scale(2.6, 0.7);
      g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
      g.restore();
    }
  }
  const t = finish(c, false);
  t.wrapS = RepeatWrapping;
  cache.set(k, t);
  return t;
}

/** Charcoal acoustic foam wedges for the firing range. */
export function foamTex(): Texture {
  const k = "foam";
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#26282b";
  g.fillRect(0, 0, S, S);
  const n = 4;
  const s = S / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const vert = (x + y) % 2 === 0;
      for (let i = 0; i < 4; i++) {
        const grd = vert ? g.createLinearGradient(x * s + (i * s) / 4, 0, x * s + ((i + 1) * s) / 4, 0) : g.createLinearGradient(0, y * s + (i * s) / 4, 0, y * s + ((i + 1) * s) / 4);
        grd.addColorStop(0, "#15171a");
        grd.addColorStop(0.5, "#3a3d42");
        grd.addColorStop(1, "#15171a");
        g.fillStyle = grd;
        if (vert) g.fillRect(x * s + (i * s) / 4, y * s, s / 4, s);
        else g.fillRect(x * s, y * s + (i * s) / 4, s, s / 4);
      }
    }
  noise(g, S, S, 0.08, 2000);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Cargo netting (use with alphaTest). */
export function netTex(): Texture {
  const k = "net";
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = "#8b7a4e";
  g.lineWidth = 5;
  const step = S / 8;
  for (let i = -8; i <= 16; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step + S, S);
    g.stroke();
    g.beginPath();
    g.moveTo(i * step, S);
    g.lineTo(i * step + S, 0);
    g.stroke();
  }
  g.fillStyle = "#5e5234";
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) if ((x + y) % 2 === 0) g.fillRect(x * step - 5, y * step - 5, 10, 10);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Corrugated shipping container side with a painted company mark. */
export function containerTex(key: string, base: string, mark: string): Texture {
  const k = `cont:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 12) {
    const grd = g.createLinearGradient(x, 0, x + 12, 0);
    grd.addColorStop(0, "rgba(0,0,0,0.25)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.12)");
    grd.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 12, H);
  }
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 8;
  g.strokeRect(4, 4, W - 8, H - 8);
  stencil(g, mark, W / 2, H * 0.42, 64, "rgba(240,236,220,0.9)");
  stencil(g, `${key.toUpperCase()}-${Math.floor(1000 + rnd() * 8999)}`, W * 0.2, H * 0.8, 22, "rgba(240,236,220,0.8)", 0, "left");
  grime(g, W, H, 10, "90,50,20", 0.35);
  scratches(g, W, H, 60);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Grid of lit (and a few dark) windows for big exteriors. */
export function windowGridTex(key: string, cols: number, rows: number, lit = "#bfe8ff", onRate = 0.7): Texture {
  const k = `wins:${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const W = 512;
  const H = 128;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#0a0d12";
  g.fillRect(0, 0, W, H);
  const cw = W / cols;
  const rh = H / rows;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const on = rnd() < onRate;
      g.fillStyle = on ? lit : "#1a2230";
      g.globalAlpha = on ? 0.6 + rnd() * 0.4 : 1;
      g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.22, cw * 0.64, rh * 0.56);
    }
  g.globalAlpha = 1;
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Transparent stencilled wall lettering with an optional direction arrow (-1 left, 1 right). */
export function wallStencilTex(text: string, arrow: number, col = "#e6d7a8"): Texture {
  const k = `stn:${text}:${arrow}:${col}`;
  if (cache.has(k)) return cache.get(k)!;
  const W = 1024;
  const H = 192;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const size = Math.min(120, Math.floor(1500 / Math.max(6, text.length + (arrow ? 2 : 0))));
  const shift = arrow ? arrow * -70 : 0;
  stencil(g, text, W / 2 + shift, H / 2, size, col);
  if (arrow) {
    g.save();
    g.globalAlpha = 0.85;
    g.fillStyle = col;
    const ax = arrow > 0 ? W / 2 + shift + (text.length * size) / 3.4 + 50 : W / 2 + shift - (text.length * size) / 3.4 - 50;
    g.beginPath();
    g.moveTo(ax + arrow * 55, H / 2);
    g.lineTo(ax - arrow * 25, H / 2 - 50);
    g.lineTo(ax - arrow * 25, H / 2 - 20);
    g.lineTo(ax - arrow * 80, H / 2 - 20);
    g.lineTo(ax - arrow * 80, H / 2 + 20);
    g.lineTo(ax - arrow * 25, H / 2 + 20);
    g.lineTo(ax - arrow * 25, H / 2 + 50);
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}

/** Instructors watching from a lit observation booth. */
export function boothTex(): Texture {
  const k = "booth";
  if (cache.has(k)) return cache.get(k)!;
  const W = 1024;
  const H = 160;
  const [c, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#9fc4d8");
  grd.addColorStop(1, "#3c5566");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // back-wall screens
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? "#6fe8ff" : "#ffc870";
    g.globalAlpha = 0.7;
    g.fillRect(40 + i * 165, 18, 110, 40);
  }
  g.globalAlpha = 1;
  // desk
  g.fillStyle = "#1a242c";
  g.fillRect(0, H * 0.72, W, H * 0.28);
  // silhouettes
  g.fillStyle = "#0b1116";
  for (const x of [170, 330, 610, 820]) {
    g.beginPath();
    g.arc(x, 70, 18, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x - 42, H);
    g.quadraticCurveTo(x - 40, 92, x, 90);
    g.quadraticCurveTo(x + 40, 92, x + 42, H);
    g.fill();
  }
  // glass reflection streaks
  g.fillStyle = "rgba(255,255,255,0.12)";
  for (const x of [80, 460, 700]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 60, 0);
    g.lineTo(x - 20, H);
    g.lineTo(x - 80, H);
    g.fill();
  }
  const t = finish(c, false);
  cache.set(k, t);
  return t;
}
