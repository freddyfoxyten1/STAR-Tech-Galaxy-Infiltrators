import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PointLight,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { glowSpriteTex } from "./textures";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Material, TorusGeometry } from "three";

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

interface Particle {
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  drag: number;
  s0: number;
  s1: number;
  r: number;
  gC: number;
  b: number;
  bounce: boolean;
}

class ParticleSystem {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly parts: (Particle | null)[];
  private cursor = 0;
  private readonly geo: BufferGeometry;
  readonly mat: ShaderMaterial;

  constructor(private readonly cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.parts = new Array(cap).fill(null);
    this.geo = new BufferGeometry();
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("pcolor", new BufferAttribute(this.col, 3));
    this.geo.setAttribute("size", new BufferAttribute(this.size, 1));
    this.geo.setAttribute("alpha", new BufferAttribute(this.alpha, 1));
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p: Vector3, v: Vector3, color: Color, life: number, s0: number, s1: number, g = 0, drag = 0, bounce = false): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.parts[i] = { life, max: life, vx: v.x, vy: v.y, vz: v.z, g, drag, s0, s1, r: color.r, gC: color.g, b: color.b, bounce };
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
  }

  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      const q = this.parts[i];
      if (!q) {
        this.alpha[i] = 0;
        continue;
      }
      q.life -= dt;
      if (q.life <= 0) {
        this.parts[i] = null;
        this.alpha[i] = 0;
        continue;
      }
      const k = 1 - q.life / q.max;
      q.vy -= q.g * dt;
      const dr = Math.max(0, 1 - q.drag * dt);
      q.vx *= dr;
      q.vy *= dr;
      q.vz *= dr;
      this.pos[i * 3] += q.vx * dt;
      this.pos[i * 3 + 1] += q.vy * dt;
      this.pos[i * 3 + 2] += q.vz * dt;
      if (q.bounce && this.pos[i * 3 + 1] < 0.02) {
        this.pos[i * 3 + 1] = 0.02;
        q.vy = Math.abs(q.vy) * 0.35;
        q.vx *= 0.6;
        q.vz *= 0.6;
      }
      this.size[i] = q.s0 + (q.s1 - q.s0) * k;
      this.alpha[i] = Math.min(1, (1 - k) * 1.6);
      this.col[i * 3] = q.r;
      this.col[i * 3 + 1] = q.gC;
      this.col[i * 3 + 2] = q.b;
    }
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.pcolor as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.alpha as BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.parts.fill(null);
    this.alpha.fill(0);
  }
}

interface Tracer {
  mesh: Mesh;
  life: number;
  max: number;
}

interface Debris {
  obj: Object3D;
  v: Vector3;
  w: Vector3;
  life: number;
  s: number;
}

const tmpV = new Vector3();
const tmpC = new Color();
const UP = new Vector3(0, 1, 0);

export class Fx {
  readonly add = new ParticleSystem(4000, true);
  readonly smoke = new ParticleSystem(1500, false);
  private readonly tracers: Tracer[] = [];
  private readonly debris: Debris[] = [];
  private readonly flashes: { s: Sprite; life: number; max: number; size: number }[] = [];
  private readonly flashLight: PointLight;
  private flashT = 0;
  private readonly tracerGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);

  constructor(private readonly scene: Scene) {
    scene.add(this.add.points, this.smoke.points);
    this.flashLight = new PointLight(0xffc080, 0, 10, 2);
    scene.add(this.flashLight);
  }

  setScale(h: number): void {
    this.add.mat.uniforms.uScale.value = h * 0.9;
    this.smoke.mat.uniforms.uScale.value = h * 0.9;
  }

  sparks(p: Vector3, n: Vector3, color = 0xffc070, count = 14, speed = 5): void {
    tmpC.setHex(color);
    for (let i = 0; i < count; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.4).add(n).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.add.emit(p, tmpV, tmpC, 0.25 + Math.random() * 0.35, 0.06, 0.01, 9, 1, true);
    }
    this.add.emit(p, tmpV.set(0, 0, 0), tmpC, 0.08, 0.6, 0.1);
  }

  burst(p: Vector3, color: number, count: number, speed: number, life: number, size: number, g = 0): void {
    tmpC.setHex(color);
    for (let i = 0; i < count; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      this.add.emit(p, tmpV, tmpC, life * (0.5 + Math.random() * 0.5), size, size * 0.2, g, 1.5);
    }
  }

  puff(p: Vector3, color: number, count: number, v: Vector3, spread: number, life: number, s0: number, s1: number, additive = false): void {
    tmpC.setHex(color);
    const sys = additive ? this.add : this.smoke;
    for (let i = 0; i < count; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread).add(v);
      sys.emit(p, tmpV, tmpC, life * (0.6 + Math.random() * 0.4), s0, s1, additive ? 0 : -0.3, 1.2);
    }
  }

  explosion(p: Vector3, big = false): void {
    const k = big ? 2 : 1;
    this.burst(p, 0xffa040, 40 * k, 7 * k, 0.6, 0.5 * k);
    this.burst(p, 0xfff0c0, 16 * k, 3 * k, 0.3, 0.9 * k);
    this.sparks(p, UP, 0xffd080, 30 * k, 9);
    this.puff(p, 0x222222, 18 * k, tmpV.set(0, 1.2, 0), 2.5 * k, 1.6, 0.6 * k, 2.2 * k);
    this.flash(p, 0xffa050, 14 * k, 0.25);
  }

  flash(p: Vector3, color: number, intensity: number, dur: number): void {
    this.flashLight.position.copy(p);
    this.flashLight.color.setHex(color);
    this.flashLight.intensity = intensity;
    this.flashT = dur;
  }

  private spritePool: Sprite[] = [];
  /** Re-usable additive glow sprite (no per-shot allocations). */
  takeSprite(color: number, size: number): Sprite {
    const s = this.spritePool.pop() ?? new Sprite(new SpriteMaterial({ map: glowSpriteTex(), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    s.material.color.setHex(color);
    s.material.opacity = 1;
    s.scale.setScalar(size);
    this.scene.add(s);
    return s;
  }
  giveSprite(s: Sprite): void {
    this.scene.remove(s);
    if (this.spritePool.length < 120) this.spritePool.push(s);
  }

  glow(p: Vector3, color: number, size: number, life: number): void {
    const s = this.takeSprite(color, size);
    s.position.copy(p);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.flashes.push({ s, life, max: life, size });
  }

  private tracerPool: Mesh[] = [];
  tracer(a: Vector3, b: Vector3, color: number, width = 0.015, life = 0.07): void {
    const m = this.tracerPool.pop() ?? new Mesh(this.tracerGeo, new MeshBasicMaterial({ transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false }));
    (m.material as MeshBasicMaterial).color.setHex(color);
    (m.material as MeshBasicMaterial).opacity = 1;
    const len = a.distanceTo(b);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(width, len, width);
    m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, tmpV.copy(b).sub(a).normalize()));
    this.scene.add(m);
    this.tracers.push({ mesh: m, life, max: life });
  }

  /** Detach a robot's parts into flying scrap. */
  private scrapGeos: BufferGeometry[] = [];
  scrap(root: Object3D, origin: Vector3, force: number, mats: Material[] = [], height = 2, radius = 0.5): void {
    if (!this.scrapGeos.length) {
      this.scrapGeos = [
        new RoundedBoxGeometry(0.34, 0.26, 0.05, 1, 0.015),
        new RoundedBoxGeometry(0.22, 0.4, 0.06, 1, 0.015),
        new RoundedBoxGeometry(0.16, 0.16, 0.16, 1, 0.03),
        new CylinderGeometry(0.1, 0.1, 0.05, 10),
        new TorusGeometry(0.09, 0.03, 6, 10),
        new CylinderGeometry(0.025, 0.025, 0.4, 6),
        new RoundedBoxGeometry(0.5, 0.12, 0.3, 1, 0.02),
      ];
    }
    void root;
    const n = Math.round(10 + height * 6);
    const k = Math.max(0.7, radius * 1.6);
    for (let i = 0; i < n && mats.length; i++) {
      const m = new Mesh(this.scrapGeos[i % this.scrapGeos.length], mats[i % mats.length]);
      m.scale.setScalar(k * (0.6 + Math.random() * 0.8));
      m.position.set(origin.x + (Math.random() - 0.5) * radius * 1.6, 0.3 + Math.random() * height * 0.9, origin.z + (Math.random() - 0.5) * radius * 1.6);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(m);
      const dir = m.position.clone().sub(origin);
      dir.y = Math.abs(dir.y) + 0.6;
      dir.normalize().multiplyScalar(force * (0.5 + Math.random()));
      this.debris.push({ obj: m, v: dir, w: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12), life: 5 + Math.random() * 2, s: m.scale.x });
    }
  }

  /** Throw an existing world-space object (e.g. a torn-off armour plate) as tumbling debris. */
  fling(obj: Object3D, v: Vector3, life = 2.6): void {
    if (!obj.parent) this.scene.add(obj);
    // cap loose plates so a long fight never piles up
    let loose = 0;
    for (const d of this.debris) if (d.life < 3.5) loose++;
    if (loose > 40) {
      const old = this.debris.find((d) => d.life < 3.5);
      if (old) old.life = Math.min(old.life, 0.3);
    }
    this.debris.push({ obj, v: v.clone(), w: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(16), life, s: obj.scale.x });
  }

  update(dt: number): void {
    this.add.update(dt);
    this.smoke.update(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      (t.mesh.material as MeshBasicMaterial).opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        if (this.tracerPool.length < 80) this.tracerPool.push(t.mesh);
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.s.scale.setScalar(f.size * (0.5 + k * 0.5));
      f.s.material.opacity = k;
      if (f.life <= 0) {
        this.giveSprite(f.s);
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.v.y -= 12 * dt;
      d.obj.position.addScaledVector(d.v, dt);
      if (d.obj.position.y < 0.08) {
        d.obj.position.y = 0.08;
        d.v.y = Math.abs(d.v.y) * 0.3;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
        d.w.multiplyScalar(0.6);
      }
      d.obj.rotation.x += d.w.x * dt;
      d.obj.rotation.y += d.w.y * dt;
      d.obj.rotation.z += d.w.z * dt;
      if (Math.random() < dt * 2 && d.life > 3) this.puff(d.obj.position, 0x333333, 1, tmpV.set(0, 0.8, 0), 0.3, 1, 0.2, 0.6);
      if (Math.random() < dt * 1.2 && d.life > 2) this.sparks(d.obj.position, UP, 0xffc060, 3, 2);
      if (d.life < 1) d.obj.scale.setScalar(d.s * Math.max(0.01, d.life));
      if (d.life <= 0) {
        d.obj.removeFromParent();
        this.debris.splice(i, 1);
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
  }

  clear(): void {
    this.add.clear();
    this.smoke.clear();
    for (const t of this.tracers) this.scene.remove(t.mesh);
    this.tracers.length = 0;
    for (const d of this.debris) d.obj.removeFromParent();
    this.debris.length = 0;
    for (const f of this.flashes) this.scene.remove(f.s);
    this.flashes.length = 0;
  }
}
