/**
 * All sound is synthesised live on Web Audio (no audio files). The context is created on the
 * first click, because browsers only allow audio after a user gesture.
 *
 * Routing:
 *   UI / world voices ─────────────────────→ sfxBus ─┐
 *   weapon voices → gunBus (soft saturation) → sfxBus │
 *   any voice's reverb send → sfxVerb ──────→ sfxBus  ├→ comp → master → speakers
 *   music layers (menu, intro, ambient, combat, hangar) → musicBus → duck → pause filter ┘
 *   (each music layer has a matching reverb send that fades with it)
 *
 * Music is step-sequenced in D minor: a heroic hangar theme for the menu, a taiko build for the
 * dropship ride, and in missions an eerie stealth bed that crossfades into a driving combat track
 * as robots get suspicious / spot you (setTension).
 */
let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let gunBus: GainNode;
let sfxVerbIn: GainNode;
let musicBus: GainNode;
let musicDuck: GainNode;
let musicLP: BiquadFilterNode;
let musicVerb: ConvolverNode;
let noiseBuf: AudioBuffer;
let brownBuf: AudioBuffer;
let sfxVol = 0.8;
let musicVol = 0.5;

interface Out {
  dry: AudioNode;
  wet: AudioNode;
}
let sfxOut: Out;
let gunOut: Out;

const mf = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Attack (linear when slow, exponential when snappy), optional hold, exponential decay. Returns the end time. */
function env(p: AudioParam, t: number, a: number, peak: number, hold: number, d: number): number {
  const v = Math.max(0.0002, peak);
  p.setValueAtTime(0.0001, t);
  if (a > 0.03) p.linearRampToValueAtTime(v, t + a);
  else p.exponentialRampToValueAtTime(v, t + a);
  if (hold > 0) p.setValueAtTime(v, t + a + hold);
  p.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  return t + a + hold + d;
}

function send(node: AudioNode, out: Out, wet: number, pan: number): void {
  const c = ctx!;
  let n = node;
  if (pan) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    n.connect(p);
    n = p;
  }
  n.connect(out.dry);
  if (wet > 0) {
    const w = c.createGain();
    w.gain.value = wet;
    n.connect(w);
    w.connect(out.wet);
  }
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  /** seconds for the pitch glide (defaults to the whole note) */
  glide?: number;
  dur: number;
  vol: number;
  a?: number;
  hold?: number;
  delay?: number;
  /** absolute context time (music scheduling) */
  at?: number;
  lp?: number;
  lpEnd?: number;
  q?: number;
  detune?: number;
  out?: Out;
  wet?: number;
  pan?: number;
}
function tone(o: ToneOpts): void {
  if (!ctx || o.vol <= 0.0003) return;
  const t = o.at ?? ctx.currentTime + (o.delay ?? 0);
  const a = o.a ?? 0.003;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f0, t);
  const f1 = o.f1 ?? o.f0;
  if (f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + (o.glide ?? a + (o.hold ?? 0) + o.dur));
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const end = env(g.gain, t, a, o.vol, o.hold ?? 0, o.dur);
  let head: AudioNode = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.lp, t);
    if (o.lpEnd) f.frequency.exponentialRampToValueAtTime(o.lpEnd, end);
    osc.connect(f);
    head = f;
  }
  head.connect(g);
  send(g, o.out ?? sfxOut, o.wet ?? 0, o.pan ?? 0);
  osc.start(t);
  osc.stop(end + 0.03);
}

interface NoiseOpts {
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  dur: number;
  vol: number;
  a?: number;
  hold?: number;
  delay?: number;
  at?: number;
  brown?: boolean;
  out?: Out;
  wet?: number;
  pan?: number;
}
function nz(o: NoiseOpts): void {
  if (!ctx || o.vol <= 0.0003) return;
  const t = o.at ?? ctx.currentTime + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = o.brown ? brownBuf : noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? "lowpass";
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.f0, t);
  const g = ctx.createGain();
  const end = env(g.gain, t, o.a ?? 0.003, o.vol, o.hold ?? 0, o.dur);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), end);
  src.connect(f).connect(g);
  send(g, o.out ?? sfxOut, o.wet ?? 0, o.pan ?? 0);
  src.start(t, Math.random() * 1.5);
  src.stop(end + 0.03);
}

/** Brassy horn: two detuned saws through a filter that blooms open, with a gentle vibrato. */
function horn(f: number, t: number, len: number, out: Out, vol: number, wet = 0.55): void {
  const c = ctx!;
  const flt = c.createBiquadFilter();
  flt.type = "lowpass";
  flt.Q.value = 1.1;
  flt.frequency.setValueAtTime(380, t);
  flt.frequency.exponentialRampToValueAtTime(2600, t + 0.08);
  flt.frequency.exponentialRampToValueAtTime(1100, t + 0.08 + Math.min(0.7, len + 0.1));
  const g = c.createGain();
  const end = env(g.gain, t, 0.045, vol, Math.max(0, len - 0.2), 0.35);
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.2;
  const lg = c.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(f * 0.005, t + Math.min(0.6, len));
  lfo.connect(lg);
  for (const d of [-7, 7]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = d;
    lg.connect(o.frequency);
    o.connect(flt);
    o.start(t);
    o.stop(end + 0.03);
  }
  lfo.start(t);
  lfo.stop(end + 0.03);
  flt.connect(g);
  send(g, out, wet, 0);
}

/** Distance handling for world sounds: quieter, darker and more reverberant the further away. */
function att(dist: number): number {
  return Math.max(0, 1 - dist / 30) ** 1.5;
}
function world(dist: number, floor = 0): { a: number; out: Out; wet: number } {
  const a = Math.max(floor, att(dist));
  if (!ctx || a <= 0.015) return { a: 0, out: sfxOut, wet: 0 };
  const k = Math.min(1, Math.max(0, dist) / 30);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 0.5;
  f.frequency.value = 700 + 17000 * (1 - k) ** 2;
  f.connect(sfxBus);
  return { a, out: { dry: f, wet: sfxVerbIn }, wet: 0.12 + k * 0.55 };
}

/** A metal-room reverb: dense noise tail with a few hard early reflections. */
function impulse(sec: number, decay: number, damp: number): AudioBuffer {
  const c = ctx!;
  const sr = c.sampleRate;
  const len = Math.floor(sr * sec);
  const b = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (damp + (1 - damp) * (1 - u) ** 2);
      d[i] = lp * Math.pow(1 - u, decay);
    }
    for (const [ms, v] of [
      [9, 0.6],
      [21, 0.4],
      [34, 0.3],
      [52, 0.2],
    ]) {
      const j = Math.floor((sr * ms) / 1000) + ch * 11;
      if (j < len) d[j] += v * (ch ? -1 : 1);
    }
  }
  return b;
}

function satCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  const tk = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / tk;
  }
  return c;
}

// ================================================================ music
type MusicMode = "menu" | "intro" | "game" | "off";
interface Layer extends Out {
  g: GainNode;
  w: GainNode;
  target: number;
}
let musicStarted = false;
let tension = 0; // 0 = sneaking, 0.35 = suspicious, 1 = combat
let targetTension = 0;
let mode: MusicMode = "off";
let layers: Record<"menu" | "intro" | "amb" | "act" | "hangar", Layer>;
let ride: { g: GainNode; f: BiquadFilterNode; o: OscillatorNode; src: AudioBufferSourceNode } | null = null;
let clockMode: MusicMode = "off";
let nextStep = 0;
let step = 0;
const BPM: Record<MusicMode, number> = { menu: 92, intro: 84, game: 138, off: 100 };
const spb = (): number => 60 / BPM[clockMode] / 4; // sixteenth notes

function makeLayer(): Layer {
  const c = ctx!;
  const g = c.createGain();
  const w = c.createGain();
  g.gain.value = 0;
  w.gain.value = 0;
  g.connect(musicBus);
  w.connect(musicVerb);
  return { g, w, dry: g, wet: w, target: 0 };
}

/** Sustained sources that just fade with their layer: the freighter's hum and the hangar's air handling. */
function drones(): void {
  const c = ctx!;
  // mission bed: low detuned saws on D through a slowly breathing filter, plus ship air
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 300;
  lp.Q.value = 2.5;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoG = c.createGain();
  lfoG.gain.value = 140;
  lfo.connect(lfoG).connect(lp.frequency);
  lfo.start();
  for (const [f, v] of [
    [36.7, 0.06],
    [36.95, 0.06],
    [55, 0.04],
    [73.4, 0.018],
  ]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = v;
    o.connect(g).connect(lp);
    o.start();
  }
  lp.connect(layers.amb.g);
  const air = c.createBufferSource();
  air.buffer = brownBuf;
  air.loop = true;
  const airF = c.createBiquadFilter();
  airF.type = "lowpass";
  airF.frequency.value = 260;
  const airG = c.createGain();
  airG.gain.value = 0.09;
  air.connect(airF).connect(airG).connect(layers.amb.g);
  air.start();
  // hangar: big air handlers and a faint mains hum
  const h = c.createBufferSource();
  h.buffer = brownBuf;
  h.loop = true;
  const hf = c.createBiquadFilter();
  hf.type = "lowpass";
  hf.frequency.value = 180;
  const hg = c.createGain();
  hg.gain.value = 0.08;
  h.connect(hf).connect(hg).connect(layers.hangar.g);
  h.start();
  for (const [f, v] of [
    [50, 0.012],
    [100, 0.005],
    [150, 0.002],
  ]) {
    const o = c.createOscillator();
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = v;
    o.connect(g).connect(layers.hangar.g);
    o.start();
  }
}

function startMusic(): void {
  if (!ctx || musicStarted) return;
  musicStarted = true;
  layers = { menu: makeLayer(), intro: makeLayer(), amb: makeLayer(), act: makeLayer(), hangar: makeLayer() };
  drones();
}

// ---- instruments
function pad(notes: number[], t: number, len: number, out: Out, vol: number): void {
  for (const m of notes) for (const d of [-9, 9]) tone({ type: "sawtooth", f0: mf(m), detune: d, a: 1.1, hold: Math.max(0.1, len - 1.1), dur: 1.6, vol, lp: 1150, q: 0.4, at: t, out, wet: 0.75 });
}
function taiko(t: number, out: Out, vol: number): void {
  tone({ f0: 115, f1: 46, glide: 0.22, dur: 0.55, vol, at: t, out, wet: 0.45 });
  nz({ type: "lowpass", f0: 1000, f1: 140, dur: 0.16, vol: vol * 0.4, at: t, out, wet: 0.5 });
}
function kick(t: number, out: Out, vol: number): void {
  tone({ f0: 160, f1: 44, glide: 0.1, dur: 0.26, vol, at: t, out });
  nz({ type: "lowpass", f0: 2200, f1: 400, dur: 0.018, vol: vol * 0.35, at: t, out });
}
function snare(t: number, out: Out, vol: number, wet: number): void {
  nz({ type: "bandpass", f0: 2000, f1: 900, q: 0.7, dur: 0.22, vol, at: t, out, wet });
  tone({ type: "triangle", f0: 240, f1: 165, dur: 0.1, vol: vol * 0.7, at: t, out, wet: wet * 0.5 });
}
function hat(t: number, out: Out, vol: number, pan = 0): void {
  nz({ type: "highpass", f0: 7600, dur: 0.03, vol, at: t, out, pan });
}
function tom(t: number, out: Out, vol: number, f: number): void {
  tone({ f0: f, f1: f * 0.55, glide: 0.2, dur: 0.3, vol, at: t, out, wet: 0.35 });
  nz({ type: "bandpass", f0: f * 4, f1: f * 2, dur: 0.08, vol: vol * 0.3, at: t, out, wet: 0.35 });
}

// ---- menu theme "Hangar Bay 2": 16 bars, i–VI–III–VII / i–VI–iv–V in D minor
const MENU_CHORDS: { bass: number; pad: number[] }[] = [
  { bass: 38, pad: [57, 62, 65, 69] }, // Dm
  { bass: 34, pad: [58, 62, 65, 70] }, // Bb
  { bass: 41, pad: [57, 60, 65, 69] }, // F
  { bass: 36, pad: [55, 60, 64, 67] }, // C
  { bass: 38, pad: [57, 62, 65, 69] }, // Dm
  { bass: 34, pad: [58, 62, 65, 70] }, // Bb
  { bass: 43, pad: [55, 58, 62, 67] }, // Gm
  { bass: 45, pad: [57, 61, 64, 69] }, // A
];
/** the heroic horn line over the second half: [16th from bar 8, midi note, length in 16ths] */
const MENU_LEAD: [number, number, number][] = [
  [0, 69, 8],
  [8, 74, 8],
  [16, 77, 12],
  [28, 76, 4],
  [32, 77, 6],
  [38, 76, 2],
  [40, 74, 8],
  [48, 70, 16],
  [64, 67, 8],
  [72, 70, 8],
  [80, 74, 12],
  [92, 72, 4],
  [96, 73, 8],
  [104, 76, 8],
  [112, 69, 14],
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1];
const OSTINATO = [0, 3, 6, 8, 11, 14];

function menuStep(s: number, t: number): void {
  const L = layers.menu;
  const sp = spb();
  const loop = Math.floor(s / 256);
  const s2 = s % 256;
  const bar = Math.floor(s2 / 16);
  const pos = s2 % 16;
  const ch = MENU_CHORDS[Math.floor(bar / 2)];
  const intro = loop === 0 && bar < 2;
  if (pos === 0 && bar % 2 === 0) {
    pad(ch.pad, t, sp * 32, L, 0.014);
    tone({ f0: mf(ch.bass - 12), a: 0.8, hold: sp * 32 - 0.8, dur: 1.2, vol: 0.05, at: t, out: L });
  }
  if (!intro) {
    if (OSTINATO.includes(pos)) {
      const acc = pos === 0 || pos === 8;
      tone({ f0: mf(ch.bass), dur: sp * 2.2, vol: acc ? 0.15 : 0.1, at: t, out: L });
      tone({ type: "sawtooth", f0: mf(ch.bass + 12), dur: sp * 1.6, vol: 0.03, lp: 480, at: t, out: L });
    }
    const tones = [ch.pad[1], ch.pad[2], ch.pad[3], ch.pad[1] + 12, ch.pad[2] + 12];
    const n = mf(tones[ARP[pos]] + 12);
    const pan = pos % 2 ? 0.35 : -0.35;
    tone({ type: "triangle", f0: n, dur: 0.2, vol: 0.026, lp: 3400, at: t, out: L, wet: 0.45, pan });
    tone({ type: "triangle", f0: n, dur: 0.2, vol: 0.01, lp: 2200, at: t + sp * 3, out: L, wet: 0.7, pan: -pan }); // dotted-eighth echo
  }
  if (loop > 0 || bar >= 4) {
    if (pos === 0 || pos === 10) taiko(t, L, pos === 0 ? 0.42 : 0.26);
    if (bar >= 8 && pos === 8) snare(t, L, 0.1, 0.9);
    if (bar >= 8 && pos % 2 === 1) hat(t, L, pos % 4 === 3 ? 0.03 : 0.015, 0.2);
    if (bar === 15 && pos >= 12) tom(t, L, 0.22, 190 - (pos - 12) * 25);
  }
  if (s2 >= 128) for (const [o, m, len] of MENU_LEAD) if (s2 - 128 === o) horn(mf(m), t, len * sp, L, 0.04);
  // life in the hangar: far-off clanks and the occasional PA chime
  if (pos === 4 && Math.random() < 0.18) {
    const f = rnd(240, 700);
    tone({ type: "triangle", f0: f, f1: f * 0.9, dur: 0.5, vol: 0.022, at: t + Math.random() * 0.4, out: layers.hangar, wet: 0.95 });
    nz({ type: "bandpass", f0: f * 3, q: 3, dur: 0.1, vol: 0.02, at: t, out: layers.hangar, wet: 0.95 });
  }
  if (s2 === 100 && loop % 2 === 0) {
    tone({ f0: 659, dur: 0.9, vol: 0.02, at: t, out: layers.hangar, wet: 0.95 });
    tone({ f0: 523, dur: 1.3, vol: 0.02, at: t + 0.45, out: layers.hangar, wet: 0.95 });
  }
}

// ---- dropship ride: tense taiko build under the briefing
function introStep(s: number, t: number): void {
  const L = layers.intro;
  const sp = spb();
  const bar = Math.floor(s / 16);
  const pos = s % 16;
  const build = Math.min(1, 0.4 + bar * 0.12);
  const minor = bar % 4 < 2;
  if (pos === 0 && bar % 2 === 0) {
    pad(minor ? [50, 57, 62, 65] : [46, 53, 58, 62], t, sp * 32, L, 0.013);
    tone({ f0: mf(minor ? 26 : 22), a: 0.6, hold: sp * 32 - 0.6, dur: 1.2, vol: 0.09, at: t, out: L });
  }
  if (pos === 0 || pos === 3 || pos === 8 || pos === 11) taiko(t, L, (pos === 0 || pos === 8 ? 0.45 : 0.25) * build);
  if (pos % 2 === 0) tone({ type: "sawtooth", f0: mf(minor ? 38 : 34), dur: sp * 1.4, vol: 0.045 * build, lp: 400, at: t, out: L });
  if (pos % 4 === 2) hat(t, L, 0.02 * build);
  if (bar % 4 === 3 && pos === 0) nz({ type: "bandpass", f0: 400, f1: 4200, q: 1.4, a: sp * 15, dur: 0.25, vol: 0.05, at: t, out: L, wet: 0.6 });
  if (bar >= 2 && pos === 0 && bar % 2 === 1) horn(mf(minor ? 62 : 58), t, sp * 12, L, 0.03, 0.7);
}

// ---- missions: stealth bed + combat track on one 138 bpm clock
const RIFF = [0, 0, 12, 0, 0, 3, 0, -2, 0, 0, 12, 0, 5, 3, 0, -2];
const ROOTS = [38, 38, 34, 36]; // D D Bb C
const QUALITY: Record<number, number> = { 38: 3, 34: 4, 36: 4 };
const EERIE = [74, 77, 72, 81, 69];

function gameStep(s: number, t: number): void {
  const sp = spb();
  const bar = Math.floor(s / 16);
  const pos = s % 16;
  const A = layers.amb;
  const C = layers.act;
  // ---- stealth: a slow heartbeat, eerie high tones, hull groans and a far sonar ping
  if (pos % 8 === 0) tone({ f0: 58, f1: 42, dur: 0.28, vol: 0.07, at: t, out: A });
  if (pos % 8 === 2) tone({ f0: 52, f1: 40, dur: 0.24, vol: 0.04, at: t, out: A });
  if (pos === 0 && bar % 4 === 0) {
    const m = EERIE[Math.floor(bar / 4) % EERIE.length];
    tone({ f0: mf(m), a: 1.6, hold: 1.4, dur: 2.5, vol: 0.02, at: t, out: A, wet: 0.9 });
    tone({ type: "triangle", f0: mf(m - 12), detune: 7, a: 1.6, hold: 1.4, dur: 2.5, vol: 0.012, at: t, out: A, wet: 0.9 });
  }
  if (pos === 8 && Math.random() < 0.18) {
    const f = rnd(80, 190);
    tone({ type: "sawtooth", f0: f, f1: f * 0.78, a: 0.4, dur: 1.2, vol: 0.022, lp: 520, at: t, out: A, wet: 0.8 });
  }
  if (pos === 0 && bar % 8 === 6) tone({ f0: 1760, dur: 1.4, vol: 0.01, at: t, out: A, wet: 0.95 });
  if (tension < 0.05) return;
  // ---- suspicious and up: the driving bass riff and ticking hats
  const root = ROOTS[bar % 4];
  const third = QUALITY[root];
  tone({ type: "sawtooth", f0: mf(root + RIFF[pos]), dur: sp * 0.9, vol: pos % 4 === 0 ? 0.075 : 0.05, lp: 1000, lpEnd: 280, q: 2.5, at: t, out: C });
  if (pos % 4 === 0) tone({ f0: mf(root), dur: sp * 3.2, vol: 0.11, at: t, out: C });
  hat(t, C, pos % 2 ? 0.034 : 0.016, pos % 4 === 1 ? 0.3 : -0.15);
  if (tension < 0.6) return;
  // ---- full fight: drums, horn stabs, a pulsing arp and fills
  if (pos === 0 || pos === 7 || pos === 8 || (pos === 14 && bar % 2 === 1)) kick(t, C, 0.5);
  if (pos === 4 || pos === 12) snare(t, C, 0.17, 0.4);
  if (bar % 2 === 0 && (pos === 0 || pos === 10)) for (const iv of [12, 12 + third, 19]) horn(mf(root + iv), t, sp * 1.6, C, 0.028, 0.35);
  if (bar % 4 === 3 && pos >= 12) tom(t, C, 0.26, 210 - (pos - 12) * 32);
  if (pos % 2 === 0) {
    const arp = [0, 7, 12, 7, third, 7, 12, third + 12][(pos / 2) % 8];
    tone({ type: "square", f0: mf(root + 24 + arp), dur: 0.08, vol: 0.012, lp: 2800, at: t, out: C, wet: 0.3, pan: pos % 4 ? 0.3 : -0.3 });
  }
  if (bar % 8 === 0 && pos === 0) nz({ type: "highpass", f0: 5000, f1: 3000, dur: 1.4, vol: 0.05, at: t, out: C, wet: 0.6 }); // crash
}

function schedule(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (clockMode !== mode) {
    clockMode = mode;
    nextStep = now + 0.06;
    step = 0;
  }
  if (mode === "off") return;
  if (nextStep < now - 0.15) nextStep = now + 0.03; // after a stall, skip ahead rather than cram notes
  while (nextStep < now + 0.25) {
    if (mode === "menu") menuStep(step, nextStep);
    else if (mode === "intro") introStep(step, nextStep);
    else gameStep(step, nextStep);
    nextStep += spb();
    step++;
  }
}

function fade(l: Layer, v: number, tc: number): void {
  if (Math.abs(l.target - v) < 0.004) return;
  l.target = v;
  const now = ctx!.currentTime;
  l.g.gain.setTargetAtTime(v, now, tc);
  l.w.gain.setTargetAtTime(v, now, tc);
}

/** Dip the music under a stinger (win, lose, boss). */
function duck(level: number, sec: number): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  musicDuck.gain.cancelScheduledValues(now);
  musicDuck.gain.setTargetAtTime(level, now, 0.06);
  musicDuck.gain.setTargetAtTime(1, now + sec, 0.8);
}

export const audio = {
  unlock(): void {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 1;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(master);
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxVol;
      sfxBus.connect(comp);
      // weapons: a touch of drive for punch
      gunBus = ctx.createGain();
      gunBus.gain.value = 1.15;
      const shaper = ctx.createWaveShaper();
      shaper.curve = satCurve(2.2);
      shaper.oversample = "2x";
      const gunOutG = ctx.createGain();
      gunOutG.gain.value = 0.8;
      gunBus.connect(shaper).connect(gunOutG).connect(sfxBus);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicVol;
      musicDuck = ctx.createGain();
      musicLP = ctx.createBiquadFilter();
      musicLP.type = "lowpass";
      musicLP.frequency.value = 20000;
      musicBus.connect(musicDuck).connect(musicLP).connect(comp);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      brownBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const bd = brownBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bd.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        bd[i] = last * 3.5;
      }
      // reverbs: a bright metal room for effects, a long dark hall for the music
      const sfxVerb = ctx.createConvolver();
      sfxVerb.buffer = impulse(1.7, 3.2, 0.25);
      sfxVerbIn = ctx.createGain();
      sfxVerbIn.gain.value = 0.55;
      sfxVerbIn.connect(sfxVerb).connect(sfxBus);
      musicVerb = ctx.createConvolver();
      musicVerb.buffer = impulse(3.4, 2.6, 0.12);
      const mv = ctx.createGain();
      mv.gain.value = 0.7;
      musicVerb.connect(mv).connect(musicBus);
      sfxOut = { dry: sfxBus, wet: sfxVerbIn };
      gunOut = { dry: gunBus, wet: sfxVerbIn };
      startMusic();
    }
    if (ctx.state !== "running") void ctx.resume();
  },
  setVolumes(sfx: number, music: number): void {
    sfxVol = sfx;
    musicVol = music;
    if (!ctx) return;
    sfxBus.gain.value = sfx;
    musicBus.gain.value = music;
  },
  setMode(m: MusicMode): void {
    mode = m;
  },
  setTension(t: number): void {
    targetTension = t;
  },
  /** Pause menu: the music drops behind a muffling filter. */
  setPaused(p: boolean): void {
    if (!ctx) return;
    const now = ctx.currentTime;
    musicLP.frequency.cancelScheduledValues(now);
    musicLP.frequency.setTargetAtTime(p ? 650 : 20000, now, 0.12);
  },
  update(dt: number): void {
    if (!ctx || !musicStarted) return;
    tension += (targetTension - tension) * Math.min(1, dt * (targetTension > tension ? 3 : 0.5));
    fade(layers.amb, mode === "game" ? 1 - tension * 0.55 : 0, 0.4);
    fade(layers.act, mode === "game" ? Math.round(tension * 50) / 50 : 0, 0.25);
    fade(layers.menu, mode === "menu" ? 1.4 : 0, 0.6);
    fade(layers.hangar, mode === "menu" ? 1 : 0, 0.8);
    fade(layers.intro, mode === "intro" ? 1 : 0, 0.8);
    schedule();
  },

  // ---------- weapons ----------
  shoot(kind: string): void {
    const v = rnd(0.94, 1.06);
    const G = gunOut;
    if (kind === "rifle") {
      // Pulse Rifle: tight twin energy pulse with a punchy thump
      nz({ type: "highpass", f0: 6000, dur: 0.012, vol: 0.3, out: G });
      tone({ type: "square", f0: 1500 * v, f1: 260 * v, dur: 0.08, vol: 0.12, lp: 5200, out: G });
      tone({ type: "sawtooth", f0: 780 * v, f1: 150 * v, dur: 0.1, vol: 0.1, lp: 3000, out: G, wet: 0.2 });
      tone({ f0: 165, f1: 50, dur: 0.09, vol: 0.42, out: G });
      nz({ type: "bandpass", f0: 2600, f1: 700, q: 0.9, dur: 0.09, vol: 0.22, out: G, wet: 0.35 });
    } else if (kind === "sniper") {
      // Precision Rifle: rail-gun crack, deep boom, long tail, then the bolt and recharge
      tone({ f0: 3400, f1: 900, dur: 0.04, vol: 0.05, out: G });
      nz({ type: "highpass", f0: 7000, dur: 0.02, vol: 0.45, out: G });
      tone({ type: "sawtooth", f0: 2600 * v, f1: 70, dur: 0.45, vol: 0.15, lp: 6000, lpEnd: 400, out: G, wet: 0.4 });
      tone({ type: "square", f0: 900 * v, f1: 60, dur: 0.3, vol: 0.08, lp: 2500, out: G });
      tone({ f0: 115, f1: 32, dur: 0.5, vol: 0.65, out: G });
      nz({ type: "lowpass", f0: 6000, f1: 150, dur: 0.75, vol: 0.4, out: G, wet: 0.65 });
      nz({ type: "bandpass", f0: 2600, q: 2, dur: 0.03, vol: 0.16, delay: 0.5 });
      tone({ type: "square", f0: 1800, f1: 1300, dur: 0.02, vol: 0.04, delay: 0.5 });
      nz({ type: "bandpass", f0: 1800, q: 2, dur: 0.04, vol: 0.18, delay: 0.68 });
      tone({ f0: 400, f1: 1700, dur: 0.35, vol: 0.025, delay: 0.62, wet: 0.3 });
    } else if (kind === "pistol") {
      // Heavy Blaster Pistol: fat plasma bolt
      nz({ type: "highpass", f0: 5500, dur: 0.014, vol: 0.32, out: G });
      tone({ type: "sawtooth", f0: 950 * v, f1: 110 * v, dur: 0.16, vol: 0.14, lp: 3600, out: G, wet: 0.2 });
      tone({ type: "square", f0: 460 * v, f1: 70, dur: 0.18, vol: 0.09, lp: 1800, out: G });
      tone({ f0: 150, f1: 40, dur: 0.16, vol: 0.55, out: G });
      nz({ type: "lowpass", f0: 4200, f1: 300, dur: 0.2, vol: 0.35, out: G, wet: 0.35 });
    } else if (kind === "shotgun") {
      // Breacher Shotgun: a wide blast, then the pump
      nz({ type: "highpass", f0: 4000, dur: 0.02, vol: 0.45, out: G });
      nz({ type: "lowpass", f0: 3400, f1: 140, dur: 0.38, vol: 0.55, out: G, wet: 0.45 });
      tone({ f0: 150, f1: 38, dur: 0.32, vol: 0.6, out: G });
      tone({ type: "sawtooth", f0: 420 * v, f1: 60, dur: 0.18, vol: 0.08, lp: 1800, out: G });
      nz({ type: "bandpass", f0: 1500, f1: 1100, q: 2, dur: 0.06, vol: 0.22, delay: 0.42 });
      nz({ type: "bandpass", f0: 1200, f1: 900, q: 2, dur: 0.06, vol: 0.24, delay: 0.56 });
      tone({ type: "triangle", f0: 700, f1: 520, dur: 0.04, vol: 0.05, delay: 0.56 });
    } else if (kind === "smg") {
      // Whisper SMG (and the Sentry): suppressed "thwip"
      nz({ type: "bandpass", f0: 1900 * v, f1: 700, q: 1.2, dur: 0.05, vol: 0.16, out: G, wet: 0.1 });
      tone({ f0: 330 * v, f1: 120, dur: 0.04, vol: 0.12, out: G });
      nz({ type: "highpass", f0: 5000, dur: 0.01, vol: 0.07 });
    } else if (kind === "revolver") {
      // Hand Cannon: a huge boom with a ringing tail
      nz({ type: "highpass", f0: 5000, dur: 0.018, vol: 0.45, out: G });
      tone({ type: "sawtooth", f0: 620 * v, f1: 55, dur: 0.3, vol: 0.14, lp: 2800, out: G });
      tone({ f0: 100, f1: 30, dur: 0.45, vol: 0.75, out: G });
      nz({ type: "lowpass", f0: 5000, f1: 120, dur: 0.5, vol: 0.5, out: G, wet: 0.55 });
      tone({ type: "triangle", f0: 2600, f1: 2450, dur: 0.3, vol: 0.018, wet: 0.5 });
    } else if (kind === "sidearm") {
      // Service Pistol: crisp and bright
      nz({ type: "highpass", f0: 6000, dur: 0.012, vol: 0.3, out: G });
      tone({ type: "square", f0: 1300 * v, f1: 220, dur: 0.09, vol: 0.1, lp: 4500, out: G });
      tone({ f0: 170, f1: 55, dur: 0.1, vol: 0.38, out: G });
      nz({ type: "bandpass", f0: 3000, f1: 900, dur: 0.1, vol: 0.26, out: G, wet: 0.3 });
    } else {
      // Rotary Blaster: quick buzzy energy bursts (fires fast, so kept lean)
      tone({ type: "square", f0: 1150 * v, f1: 340, dur: 0.045, vol: 0.09, lp: 4500, out: G });
      tone({ type: "sawtooth", f0: 540 * v, f1: 200, dur: 0.05, vol: 0.07, lp: 2500, out: G });
      tone({ f0: 125, f1: 55, dur: 0.05, vol: 0.28, out: G });
      nz({ type: "bandpass", f0: 3200, f1: 1400, dur: 0.045, vol: 0.18, out: G, wet: 0.15 });
    }
  },
  spin(): void {
    tone({ type: "sawtooth", f0: 80, f1: 520, dur: 0.45, vol: 0.05, lp: 1800 });
    tone({ f0: 160, f1: 1040, dur: 0.45, vol: 0.035 });
    nz({ type: "bandpass", f0: 600, f1: 2400, q: 2, dur: 0.4, vol: 0.07 });
  },
  reload(): void {
    // mag release, mag out, new mag clacks in, the cell charges, ready chirp
    tone({ type: "square", f0: 2200, f1: 1800, dur: 0.015, vol: 0.05 });
    nz({ type: "bandpass", f0: 3000, q: 2, dur: 0.03, vol: 0.2 });
    nz({ type: "bandpass", f0: 900, f1: 1700, q: 2, dur: 0.14, vol: 0.12, delay: 0.08 });
    nz({ type: "bandpass", f0: 2300, f1: 1400, q: 1.5, dur: 0.04, vol: 0.3, delay: 0.4 });
    tone({ type: "triangle", f0: 700, f1: 500, dur: 0.05, vol: 0.09, delay: 0.4 });
    tone({ f0: 180, f1: 80, dur: 0.06, vol: 0.2, delay: 0.4 });
    tone({ f0: 300, f1: 1500, dur: 0.3, vol: 0.04, delay: 0.55 });
    tone({ type: "sawtooth", f0: 150, f1: 600, dur: 0.3, vol: 0.02, lp: 900, delay: 0.55 });
    tone({ type: "square", f0: 1400, dur: 0.035, vol: 0.035, lp: 4000, delay: 0.9 });
    tone({ type: "square", f0: 1900, dur: 0.05, vol: 0.035, lp: 4000, delay: 0.96 });
  },
  weaponSwap(): void {
    nz({ type: "lowpass", f0: 1300, f1: 400, dur: 0.12, vol: 0.1 });
    nz({ type: "bandpass", f0: 3000, q: 2, dur: 0.03, vol: 0.12, delay: 0.1 });
    tone({ type: "square", f0: 1600, dur: 0.015, vol: 0.045, delay: 0.16 });
    tone({ f0: 200, f1: 620, dur: 0.15, vol: 0.035, delay: 0.12 });
  },
  swing(kind: string): void {
    const heavy = kind === "maul" || kind === "axe";
    if (heavy) nz({ type: "bandpass", f0: 500, f1: 1900, q: 2.5, a: 0.08, dur: 0.24, vol: 0.3, delay: 0.1 });
    else nz({ type: "bandpass", f0: 1200, f1: 4200, q: 3, a: 0.04, dur: 0.13, vol: 0.24, delay: 0.03 });
    if (kind === "blade") {
      tone({ type: "sawtooth", f0: 110, f1: 260, dur: 0.35, vol: 0.06, lp: 1200 });
      tone({ f0: 220, f1: 520, dur: 0.3, vol: 0.045 });
    } else if (kind === "maul") tone({ type: "sawtooth", f0: 60, dur: 0.3, vol: 0.035, lp: 600, delay: 0.08 });
  },
  meleeHit(kind: string): void {
    if (kind === "blade") {
      nz({ type: "highpass", f0: 5000, f1: 2500, dur: 0.2, vol: 0.28 });
      tone({ type: "sawtooth", f0: 1200, f1: 180, dur: 0.2, vol: 0.12, lp: 5000 });
      tone({ f0: 160, f1: 60, dur: 0.12, vol: 0.35 });
    } else if (kind === "maul") {
      tone({ f0: 130, f1: 35, dur: 0.35, vol: 0.65 });
      nz({ type: "lowpass", f0: 2500, f1: 150, dur: 0.3, vol: 0.5, wet: 0.3 });
      tone({ type: "square", f0: 2400, f1: 600, dur: 0.12, vol: 0.05, lp: 5000 });
      for (let i = 0; i < 4; i++) nz({ type: "highpass", f0: 6000, dur: 0.01, vol: 0.12, delay: 0.03 + i * rnd(0.02, 0.05) });
    } else {
      nz({ type: "bandpass", f0: 3500, f1: 1500, q: 2, dur: 0.1, vol: 0.38 });
      tone({ type: "square", f0: 1400, f1: 500, dur: 0.07, vol: 0.09, lp: 5000 });
      tone({ f0: 190, f1: 60, dur: 0.12, vol: 0.4 });
      tone({ type: "triangle", f0: rnd(2000, 2600), dur: 0.22, vol: 0.03, wet: 0.35 });
    }
  },
  throwGadget(): void {
    tone({ type: "square", f0: 2400, dur: 0.015, vol: 0.05 });
    nz({ type: "bandpass", f0: 800, f1: 2800, q: 2, a: 0.05, dur: 0.16, vol: 0.2, delay: 0.04 });
  },
  stim(): void {
    nz({ type: "highpass", f0: 5000, f1: 3500, dur: 0.18, vol: 0.24 });
    tone({ f0: 90, f1: 45, dur: 0.12, vol: 0.3, delay: 0.15 });
    tone({ f0: 80, f1: 42, dur: 0.12, vol: 0.22, delay: 0.32 });
    [660, 880, 1320].forEach((f, i) => tone({ f0: f, f1: f * 1.12, dur: 0.18, vol: 0.09, delay: 0.2 + i * 0.09, wet: 0.4 }));
  },
  decoyBeep(dist: number): void {
    const w = world(dist * 0.7);
    if (!w.a) return;
    tone({ type: "square", f0: 1600, dur: 0.06, vol: 0.12 * w.a, lp: 5000, out: w.out, wet: w.wet });
    tone({ type: "square", f0: 1200, dur: 0.06, vol: 0.09 * w.a, lp: 5000, delay: 0.1, out: w.out, wet: w.wet });
  },
  empty(): void {
    nz({ type: "highpass", f0: 4000, dur: 0.012, vol: 0.16 });
    tone({ type: "square", f0: 1800, f1: 1500, dur: 0.02, vol: 0.045 });
    tone({ f0: 420, dur: 0.06, vol: 0.035, delay: 0.03 });
  },
  hitmarker(crit: boolean): void {
    nz({ type: "highpass", f0: 7000, dur: 0.014, vol: 0.16 });
    tone({ f0: crit ? 3000 : 2500, dur: 0.035, vol: 0.07 });
    if (crit) tone({ type: "triangle", f0: 3400, f1: 3600, dur: 0.14, vol: 0.05, wet: 0.25 });
  },

  // ---------- world ----------
  robotShot(dist: number, heavy: boolean): void {
    const w = world(dist);
    if (!w.a) return;
    if (heavy) {
      tone({ type: "sawtooth", f0: 420, f1: 60, dur: 0.25, vol: 0.2 * w.a, lp: 2000, out: w.out, wet: w.wet });
      tone({ f0: 120, f1: 40, dur: 0.25, vol: 0.45 * w.a, out: w.out });
      nz({ type: "lowpass", f0: 2500, f1: 200, dur: 0.2, vol: 0.3 * w.a, out: w.out, wet: w.wet });
    } else {
      const v = rnd(0.92, 1.08);
      tone({ type: "square", f0: 1800 * v, f1: 480, dur: 0.1, vol: 0.11 * w.a, lp: 5000, out: w.out, wet: w.wet });
      tone({ type: "sawtooth", f0: 900 * v, f1: 300, dur: 0.1, vol: 0.07 * w.a, lp: 3000, out: w.out });
      nz({ type: "bandpass", f0: 3000, dur: 0.04, vol: 0.1 * w.a, out: w.out });
    }
  },
  gatling(dist: number): void {
    const w = world(dist);
    if (!w.a) return;
    tone({ type: "square", f0: 300, f1: 130, dur: 0.05, vol: 0.14 * w.a, lp: 2500, out: w.out, wet: w.wet });
    nz({ type: "bandpass", f0: 1800, f1: 700, dur: 0.04, vol: 0.2 * w.a, out: w.out });
    tone({ f0: 110, f1: 50, dur: 0.05, vol: 0.22 * w.a, out: w.out });
  },
  robotHit(dist: number): void {
    const w = world(dist);
    if (!w.a) return;
    nz({ type: "bandpass", f0: 4000, f1: 2200, q: 3, dur: 0.07, vol: 0.3 * w.a, out: w.out });
    tone({ type: "triangle", f0: rnd(2000, 3000), dur: 0.12, vol: 0.05 * w.a, out: w.out, wet: w.wet });
    for (let i = 0; i < 3; i++) nz({ type: "highpass", f0: 6500, dur: 0.008, vol: 0.1 * w.a, delay: rnd(0.02, 0.12), out: w.out });
  },
  plateClang(dist: number, heavy = false): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    const f = (heavy ? 900 : 1400) * rnd(0.85, 1.15);
    tone({ type: "triangle", f0: f, f1: f * 0.82, dur: 0.24, vol: 0.12 * w.a, out: w.out, wet: w.wet + 0.2 });
    tone({ type: "square", f0: f * 2.7, f1: f * 2.2, dur: 0.09, vol: 0.035 * w.a, lp: 6000, out: w.out });
    nz({ type: "bandpass", f0: 4200, f1: 2000, q: 2, dur: 0.12, vol: 0.28 * w.a, out: w.out });
    tone({ type: "triangle", f0: f * 0.6, f1: f * 0.5, dur: 0.1, vol: 0.06 * w.a, delay: rnd(0.28, 0.38), out: w.out, wet: w.wet });
  },
  fizz(dist: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    for (let i = 0; i < 6; i++) nz({ type: "highpass", f0: rnd(4000, 8000), dur: 0.01, vol: 0.12 * w.a, delay: rnd(0, 0.3), out: w.out });
    tone({ type: "sawtooth", f0: 120, f1: 50, dur: 0.3, vol: 0.04 * w.a, lp: 900, out: w.out });
  },
  explode(dist: number, big = false): void {
    const w = world(dist * (big ? 0.5 : 1));
    if (!w.a) return;
    const a = w.a;
    nz({ type: "highpass", f0: 3000, f1: 800, dur: 0.06, vol: 0.5 * a, out: w.out });
    tone({ f0: 120, f1: 28, dur: big ? 1.0 : 0.6, vol: 0.9 * a, out: w.out });
    nz({ type: "lowpass", f0: 3000, f1: 60, dur: big ? 1.5 : 0.9, vol: 0.75 * a, out: w.out, wet: w.wet + 0.3 });
    nz({ type: "lowpass", f0: 320, dur: big ? 2.2 : 1.2, a: 0.08, vol: 0.5 * a, brown: true, delay: 0.04, out: w.out, wet: 0.7 });
    for (let i = 0; i < 6; i++) tone({ type: "triangle", f0: rnd(1500, 4000), f1: 900, dur: 0.07, vol: 0.04 * a, delay: rnd(0.18, 0.95), out: w.out, wet: 0.4 });
  },
  step(dist: number, heavy: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    tone({ f0: 70 / heavy + 30, f1: 28, dur: 0.14 * heavy, vol: 0.28 * w.a * heavy, out: w.out });
    nz({ type: "lowpass", f0: 900, f1: 150, dur: 0.07, vol: 0.12 * w.a, out: w.out });
    tone({ type: "triangle", f0: 400 / heavy, dur: 0.06, vol: 0.035 * w.a, out: w.out, wet: w.wet });
    if (Math.random() < 0.3) nz({ type: "highpass", f0: 4000, dur: 0.1, vol: 0.03 * w.a, delay: 0.05, out: w.out });
  },
  servo(dist: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    tone({ type: "sawtooth", f0: 220, f1: 360, dur: 0.25, vol: 0.03 * w.a, lp: 1800, out: w.out });
    tone({ type: "square", f0: 440, f1: 720, dur: 0.2, vol: 0.01 * w.a, lp: 2500, out: w.out });
  },
  playerStep(sprint: boolean): void {
    // boots on a metal deck
    nz({ type: "lowpass", f0: 700, f1: 150, dur: 0.06, vol: sprint ? 0.17 : 0.08 });
    tone({ f0: rnd(100, 120), f1: 60, dur: 0.05, vol: sprint ? 0.12 : 0.05 });
    nz({ type: "bandpass", f0: rnd(2400, 3200), q: 3, dur: 0.02, vol: sprint ? 0.04 : 0.018 });
  },
  hurt(): void {
    tone({ f0: 150, f1: 50, dur: 0.18, vol: 0.5 });
    nz({ type: "highpass", f0: 3000, f1: 1500, dur: 0.12, vol: 0.2 });
    tone({ type: "sawtooth", f0: 220, f1: 90, dur: 0.18, vol: 0.12, lp: 1200 });
    tone({ type: "square", f0: 900, dur: 0.05, vol: 0.025, lp: 3000, delay: 0.05 });
  },
  shieldBlock(): void {
    tone({ type: "triangle", f0: 1100, f1: 700, dur: 0.15, vol: 0.17, wet: 0.3 });
    tone({ f0: 2200, f1: 1800, dur: 0.2, vol: 0.05, wet: 0.35 });
    nz({ type: "highpass", f0: 3000, f1: 2000, dur: 0.1, vol: 0.18 });
    tone({ f0: 140, f1: 60, dur: 0.1, vol: 0.25 });
  },
  alert(dist: number): void {
    // a robot has spotted you: harsh digital chirp
    const w = world(dist, 0.3);
    tone({ type: "square", f0: 700, f1: 1400, dur: 0.07, vol: 0.13 * w.a, lp: 4000, out: w.out, wet: w.wet });
    tone({ type: "square", f0: 1400, dur: 0.12, vol: 0.15 * w.a, lp: 4000, delay: 0.09, out: w.out, wet: w.wet });
    nz({ type: "bandpass", f0: 2000, q: 5, dur: 0.05, vol: 0.1 * w.a, delay: 0.05, out: w.out });
  },
  suspicious(dist: number): void {
    // "...huh?": a questioning robotic warble
    const w = world(dist, 0.2);
    tone({ f0: 520, f1: 760, dur: 0.16, vol: 0.1 * w.a, out: w.out, wet: w.wet });
    tone({ type: "triangle", f0: 760, f1: 640, dur: 0.12, vol: 0.07 * w.a, delay: 0.17, out: w.out, wet: w.wet });
  },
  alarm(): void {
    for (let i = 0; i < 3; i++) {
      tone({ type: "sawtooth", f0: 440, f1: 660, dur: 0.42, vol: 0.09, lp: 1600, q: 3, delay: i * 0.6, wet: 0.5 });
      tone({ type: "square", f0: 220, f1: 330, dur: 0.42, vol: 0.04, lp: 1200, delay: i * 0.6, wet: 0.5 });
      tone({ type: "sawtooth", f0: 660, f1: 440, dur: 0.12, vol: 0.07, lp: 1600, delay: i * 0.6 + 0.44, wet: 0.5 });
    }
  },
  pickup(kind: string): void {
    if (kind === "health") {
      tone({ f0: 523, f1: 784, dur: 0.12, vol: 0.13 });
      tone({ f0: 784, f1: 1046, dur: 0.15, vol: 0.11, delay: 0.08 });
      tone({ type: "triangle", f0: 2093, dur: 0.25, vol: 0.035, delay: 0.16, wet: 0.45 });
    } else {
      nz({ type: "bandpass", f0: 2000, q: 1.5, dur: 0.04, vol: 0.24 });
      tone({ f0: 660, f1: 990, dur: 0.1, vol: 0.1, delay: 0.04 });
      tone({ f0: 990, f1: 1320, dur: 0.12, vol: 0.09, delay: 0.11, wet: 0.3 });
    }
  },
  door(dist: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    nz({ type: "highpass", f0: 3000, f1: 1500, dur: 0.25, vol: 0.16 * w.a, out: w.out });
    nz({ type: "bandpass", f0: 400, f1: 1400, q: 2, a: 0.1, dur: 0.4, vol: 0.18 * w.a, delay: 0.05, out: w.out, wet: w.wet });
    tone({ type: "sawtooth", f0: 90, f1: 130, dur: 0.5, vol: 0.05 * w.a, lp: 600, out: w.out });
    tone({ f0: 110, f1: 45, dur: 0.15, vol: 0.28 * w.a, delay: 0.55, out: w.out, wet: w.wet });
  },
  hackTick(p: number): void {
    const f = (700 + p * 900) * [1, 1.25, 1.5][Math.floor(Math.random() * 3)];
    tone({ type: "square", f0: f, dur: 0.03, vol: 0.045, lp: 4000 });
    nz({ type: "highpass", f0: 6000, dur: 0.008, vol: 0.05 });
  },
  hackDone(): void {
    [659, 880, 1109, 1319].forEach((f, i) => tone({ type: "square", f0: f, dur: 0.07, vol: 0.07, lp: 3500, delay: i * 0.07, wet: 0.3 }));
    for (const f of [880, 1109, 1319]) tone({ type: "triangle", f0: f, dur: 0.5, vol: 0.03, delay: 0.28, wet: 0.5 });
  },
  radio(): void {
    nz({ type: "bandpass", f0: 2500, f1: 1800, q: 4, dur: 0.15, vol: 0.18 });
    tone({ f0: 1400, dur: 0.06, vol: 0.07, delay: 0.18 });
    nz({ type: "bandpass", f0: 3200, q: 6, dur: 0.25, vol: 0.04, delay: 0.2 });
  },
  ability(kind: string): void {
    if (kind === "brutus") {
      tone({ f0: 60, f1: 180, dur: 0.5, vol: 0.35 });
      tone({ type: "sawtooth", f0: 90, f1: 270, dur: 0.5, vol: 0.06, lp: 900 });
      nz({ type: "lowpass", f0: 1500, f1: 200, dur: 0.3, vol: 0.3, wet: 0.4 });
      tone({ type: "triangle", f0: 880, dur: 0.4, vol: 0.04, delay: 0.3, wet: 0.5 });
    } else if (kind === "hale") {
      tone({ type: "sawtooth", f0: 200, f1: 1400, dur: 0.5, vol: 0.13, lp: 3000 });
      tone({ type: "square", f0: 100, f1: 700, dur: 0.5, vol: 0.05, lp: 2000 });
      nz({ type: "highpass", f0: 1500, f1: 7000, a: 0.3, dur: 0.2, vol: 0.08 });
      tone({ f0: 1760, dur: 0.3, vol: 0.05, delay: 0.5, wet: 0.5 });
    } else if (kind === "cloya") {
      for (let i = 0; i < 4; i++) tone({ f0: 1200, f1: 1800, dur: 0.25, vol: 0.1 * (1 - i * 0.2), delay: i * 0.18, wet: 0.7 });
      tone({ f0: 300, f1: 150, dur: 0.6, vol: 0.08, wet: 0.4 });
    } else {
      tone({ type: "square", f0: 2400, dur: 0.015, vol: 0.05 });
      nz({ type: "bandpass", f0: 800, f1: 2800, q: 2, a: 0.05, dur: 0.16, vol: 0.2, delay: 0.04 });
      tone({ f0: 1000, dur: 0.05, vol: 0.06, delay: 0.2 });
    }
  },
  pulse(dist: number): void {
    const w = world(dist * 0.6);
    if (!w.a) return;
    tone({ f0: 50, f1: 900, dur: 0.5, vol: 0.4 * w.a, out: w.out });
    nz({ type: "bandpass", f0: 3000, f1: 300, q: 2, dur: 0.7, vol: 0.45 * w.a, out: w.out, wet: 0.6 });
    tone({ type: "sawtooth", f0: 1200, f1: 40, dur: 0.8, vol: 0.07 * w.a, lp: 2000, out: w.out, wet: 0.5 });
    for (let i = 0; i < 5; i++) nz({ type: "highpass", f0: 6000, dur: 0.01, vol: 0.1 * w.a, delay: rnd(0.1, 0.7), out: w.out });
  },
  electric(dist: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    nz({ type: "highpass", f0: 4000, f1: 2500, dur: 0.35, vol: 0.26 * w.a, out: w.out });
    tone({ type: "sawtooth", f0: 60, dur: 0.35, vol: 0.12 * w.a, lp: 800, out: w.out });
    for (let i = 0; i < 4; i++) nz({ type: "highpass", f0: 7000, dur: 0.008, vol: 0.14 * w.a, delay: rnd(0, 0.3), out: w.out });
  },
  flame(dist: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    nz({ type: "lowpass", f0: 900, f1: 400, dur: 1.4, vol: 0.32 * w.a, out: w.out });
    nz({ type: "lowpass", f0: 300, dur: 1.4, vol: 0.3 * w.a, brown: true, out: w.out, wet: w.wet });
  },
  steam(dist: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    nz({ type: "highpass", f0: 2500, f1: 1500, dur: 1.2, vol: 0.24 * w.a, out: w.out, wet: w.wet });
  },
  hiss(dist: number): void {
    const w = world(dist);
    if (w.a <= 0.02) return;
    nz({ type: "highpass", f0: 6000, f1: 5000, dur: 0.6, vol: 0.08 * w.a, out: w.out });
  },

  // ---------- interface: clean holographic blips ----------
  click(): void {
    tone({ f0: 2000, f1: 1500, dur: 0.025, vol: 0.07, wet: 0.15 });
    tone({ type: "triangle", f0: 900, dur: 0.04, vol: 0.045 });
    nz({ type: "highpass", f0: 6000, dur: 0.008, vol: 0.05 });
  },
  hover(): void {
    tone({ f0: 2600 * rnd(0.97, 1.03), dur: 0.018, vol: 0.022, wet: 0.1 });
    tone({ type: "triangle", f0: 1300, dur: 0.03, vol: 0.01 });
  },
  confirm(): void {
    tone({ type: "triangle", f0: 660, dur: 0.1, vol: 0.12 });
    tone({ type: "triangle", f0: 990, dur: 0.16, vol: 0.12, delay: 0.07, wet: 0.3 });
    tone({ f0: 1980, dur: 0.22, vol: 0.03, delay: 0.07, wet: 0.45 });
    nz({ type: "bandpass", f0: 1200, f1: 3000, q: 1.5, a: 0.05, dur: 0.15, vol: 0.04 });
  },
  upgrade(): void {
    tone({ f0: 120, f1: 60, dur: 0.2, vol: 0.18 });
    [587, 740, 880, 1175, 1480].forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.14, vol: 0.11, delay: i * 0.055, wet: 0.35 }));
    tone({ f0: 2349, dur: 0.5, vol: 0.03, delay: 0.3, wet: 0.6 });
    nz({ type: "highpass", f0: 2000, f1: 8000, a: 0.2, dur: 0.1, vol: 0.04 });
  },
  denied(): void {
    tone({ type: "square", f0: 220, f1: 200, dur: 0.09, vol: 0.09, lp: 1500 });
    tone({ type: "square", f0: 165, dur: 0.14, vol: 0.09, lp: 1200, delay: 0.11 });
  },
  /** The menu camera gliding between stations in the hangar. */
  whoosh(sec = 1.6): void {
    nz({ type: "bandpass", f0: 300, f1: 1400, q: 1.2, a: sec * 0.4, dur: sec * 0.6, vol: 0.05, wet: 0.4 });
    tone({ f0: 60, f1: 95, a: sec * 0.35, dur: sec * 0.6, vol: 0.03 });
  },

  // ---------- dropship ride ----------
  /** Continuous dropship cabin rumble for the ride in; `rideLevel` follows the thrust, `rideStop` fades it out. */
  rideStart(): void {
    if (!ctx) return;
    audio.rideStop();
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = brownBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 1.2);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 40;
    const og = ctx.createGain();
    og.gain.value = 0.2;
    src.connect(f).connect(g);
    o.connect(og).connect(f);
    g.connect(sfxBus);
    src.start(t);
    o.start(t);
    ride = { g, f, o, src };
  },
  rideLevel(k: number): void {
    if (!ctx || !ride) return;
    const now = ctx.currentTime;
    ride.f.frequency.setTargetAtTime(200 + k * 1000, now, 0.25);
    ride.g.gain.setTargetAtTime(0.2 + k * 0.3, now, 0.25);
    ride.o.frequency.setTargetAtTime(38 + k * 34, now, 0.3);
  },
  rideStop(): void {
    if (!ctx || !ride) return;
    const r = ride;
    ride = null;
    const now = ctx.currentTime;
    r.g.gain.cancelScheduledValues(now);
    r.g.gain.setTargetAtTime(0.0001, now, 0.15);
    r.src.stop(now + 0.8);
    r.o.stop(now + 0.8);
  },
  rampMotor(): void {
    tone({ type: "sawtooth", f0: 170, f1: 250, dur: 1.8, vol: 0.05, lp: 1400 });
    nz({ type: "bandpass", f0: 650, f1: 900, q: 3, dur: 1.8, vol: 0.09, wet: 0.3 });
    tone({ f0: 90, f1: 38, dur: 0.35, vol: 0.32, delay: 1.85 });
    nz({ type: "lowpass", f0: 900, f1: 180, dur: 0.25, vol: 0.26, delay: 1.85, wet: 0.4 });
  },
  thrustBoom(): void {
    nz({ type: "lowpass", f0: 2600, f1: 180, dur: 2.4, vol: 0.36, wet: 0.3 });
    nz({ type: "lowpass", f0: 200, dur: 2.4, vol: 0.3, brown: true });
    tone({ type: "sawtooth", f0: 72, f1: 34, dur: 1.8, vol: 0.14, lp: 500 });
  },
  rcsPuffs(): void {
    for (let i = 0; i < 6; i++) nz({ type: "highpass", f0: 3200, f1: 2200, dur: 0.14, vol: 0.13, delay: i * 0.33 });
    tone({ f0: 60, f1: 45, dur: 1.8, vol: 0.12 });
  },
  dockClamp(): void {
    tone({ f0: 115, f1: 42, dur: 0.4, vol: 0.36 });
    nz({ type: "lowpass", f0: 1400, f1: 150, dur: 0.3, vol: 0.3, wet: 0.4 });
    tone({ f0: 100, f1: 40, dur: 0.35, vol: 0.3, delay: 0.38 });
    nz({ type: "lowpass", f0: 1200, f1: 150, dur: 0.25, vol: 0.26, delay: 0.38, wet: 0.4 });
    nz({ type: "highpass", f0: 5200, f1: 3000, dur: 0.9, vol: 0.1, delay: 0.75 });
  },
  engines(): void {
    nz({ type: "lowpass", f0: 300, f1: 1200, dur: 3.5, vol: 0.35 });
    tone({ type: "sawtooth", f0: 50, f1: 90, dur: 3.5, vol: 0.1, lp: 800 });
  },

  // ---------- stingers ----------
  win(): void {
    // brass fanfare with timpani: D – G – A – D
    if (!ctx) return;
    duck(0.25, 3.2);
    const t = ctx.currentTime + 0.02;
    const hit = (dt: number, notes: number[], len: number, vol: number): void => {
      for (const m of notes) horn(mf(m), t + dt, len, sfxOut, vol, 0.5);
      tone({ f0: 75, f1: 70, dur: 0.6, vol: 0.4, at: t + dt, wet: 0.4 });
      nz({ type: "lowpass", f0: 600, f1: 120, dur: 0.25, vol: 0.15, at: t + dt, wet: 0.4 });
    };
    hit(0, [62, 66, 69], 0.14, 0.05);
    hit(0.2, [62, 66, 69], 0.14, 0.05);
    hit(0.4, [67, 71, 74], 0.3, 0.05);
    hit(0.8, [69, 73, 76], 0.3, 0.05);
    hit(1.2, [62, 66, 69, 74], 1.6, 0.055);
    nz({ type: "highpass", f0: 5000, f1: 3000, dur: 1.8, vol: 0.08, at: t + 1.2, wet: 0.6 });
  },
  lose(): void {
    if (!ctx) return;
    duck(0.2, 3.4);
    const t = ctx.currentTime + 0.02;
    tone({ f0: 80, f1: 30, dur: 1.5, vol: 0.6, at: t });
    nz({ type: "lowpass", f0: 400, dur: 2.2, a: 0.2, vol: 0.3, brown: true, at: t, wet: 0.6 });
    for (const m of [50, 53, 57]) horn(mf(m), t + 0.1, 1.0, sfxOut, 0.045, 0.6);
    for (const m of [46, 50, 53]) horn(mf(m), t + 1.3, 1.6, sfxOut, 0.045, 0.7);
    tone({ type: "sawtooth", f0: 300, f1: 50, dur: 1.4, vol: 0.08, lp: 1200, at: t + 0.1 });
  },
  bossRoar(): void {
    duck(0.45, 1.6);
    tone({ type: "sawtooth", f0: 90, f1: 45, dur: 1.2, vol: 0.3, lp: 1400 });
    tone({ type: "sawtooth", f0: 93, f1: 44, dur: 1.2, vol: 0.2, lp: 1200 });
    tone({ type: "square", f0: 180, f1: 90, dur: 0.8, vol: 0.1, lp: 900 });
    tone({ f0: 50, f1: 30, dur: 1.2, vol: 0.5 });
    nz({ type: "lowpass", f0: 800, f1: 100, dur: 1.0, vol: 0.32, wet: 0.5 });
    tone({ type: "sawtooth", f0: 1400, f1: 700, dur: 0.6, vol: 0.035, lp: 3000, delay: 0.2, wet: 0.4 });
  },
};
