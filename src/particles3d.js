// particles3d.js — GPU-accelerated 3D particle system for Emperor's Conquest
// Export: ParticleSystem3D  |  Uses global THREE (no import)

const MAX_PARTICLES = 50000;
const ATTR_STRIDE = 9; // x y z vx vy vz life maxLife size

/* ── GLSL ─────────────────────────────────────────────────────── */

const VERT = /* glsl */`
attribute float aLife;
attribute float aMaxLife;
attribute float aSize;
attribute vec3  aVelocity;

uniform float uTime;
uniform vec3  uSunDir;

varying float vLife;
varying float vMaxLife;
varying vec3  vSunFactor;

void main(){
  float progress = 1.0 - aLife / aMaxLife;
  vec3  pos   = position + aVelocity * progress * aMaxLife;

  vLife   = aLife;
  vMaxLife = aMaxLife;
  vSunFactor = uSunDir;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = aSize * (280.0 / -mv.z) * (1.0 - 0.4 * progress);
  gl_Position  = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
varying float vLife;
varying float vMaxLife;
varying vec3  vSunFactor;

void main(){
  float d = length(gl_PointCoord - 0.5);
  if(d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.1, d);

  float t = 1.0 - vLife / vMaxLife;          // 0→1 over life
  alpha *= 1.0 - t * t;                       // fade out

  // Slight colour warm-up from sun
  vec3 col = mix(vec3(1.0), vec3(1.0, 0.95, 0.85), dot(vSunFactor, vec3(0,1,0)) * 0.3);

  gl_FragColor = vec4(col, alpha);
}
`;

/* ── Colour helpers ──────────────────────────────────────────── */

function hsl2rgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [r, g, b];
}

function colorArray(hex) {
  return [(hex >> 16 & 0xFF) / 255, (hex >> 8 & 0xFF) / 255, (hex & 0xFF) / 255];
}

/* ── Presets ───────────────────────────────────────────────────── */

const PRESETS = {
  fire: (p, i) => {
    p.px[i] = (Math.random() - 0.5) * 0.6;
    p.py[i] = Math.random() * 0.3;
    p.pz[i] = (Math.random() - 0.5) * 0.6;
    p.vx[i] = (Math.random() - 0.5) * 1.2;
    p.vy[i] = 2.5 + Math.random() * 2;
    p.vz[i] = (Math.random() - 0.5) * 1.2;
    p.life[i] = 0.4 + Math.random() * 0.8;
    p.size[i] = 3 + Math.random() * 4;
    const c = hsl2rgb(0.05 + Math.random() * 0.08, 1, 0.5 + Math.random() * 0.2);
    p.r[i] = c[0]; p.g[i] = c[1]; p.b[i] = c[2]; p.a[i] = 1;
  },
  smoke: (p, i) => {
    p.px[i] = (Math.random() - 0.5) * 1.0;
    p.py[i] = Math.random() * 0.2;
    p.pz[i] = (Math.random() - 0.5) * 1.0;
    p.vx[i] = (Math.random() - 0.5) * 0.8;
    p.vy[i] = 1.0 + Math.random() * 1.5;
    p.vz[i] = (Math.random() - 0.5) * 0.8;
    p.life[i] = 1.0 + Math.random() * 2.0;
    p.size[i] = 5 + Math.random() * 8;
    const v = 0.3 + Math.random() * 0.25;
    p.r[i] = v; p.g[i] = v; p.b[i] = v; p.a[i] = 0.5;
  },
  dust: (p, i) => {
    p.px[i] = (Math.random() - 0.5) * 2;
    p.py[i] = Math.random() * 0.1;
    p.pz[i] = (Math.random() - 0.5) * 2;
    p.vx[i] = (Math.random() - 0.5) * 3;
    p.vy[i] = 0.2 + Math.random() * 0.8;
    p.vz[i] = (Math.random() - 0.5) * 3;
    p.life[i] = 0.5 + Math.random() * 1.5;
    p.size[i] = 2 + Math.random() * 3;
    p.r[i] = 0.76; p.g[i] = 0.70; p.b[i] = 0.50; p.a[i] = 0.7;
  },
  spark: (p, i) => {
    p.px[i] = (Math.random() - 0.5) * 0.4;
    p.py[i] = Math.random() * 0.2;
    p.pz[i] = (Math.random() - 0.5) * 0.4;
    const sp = 4 + Math.random() * 6;
    const th = Math.random() * Math.PI * 2;
    p.vx[i] = Math.cos(th) * sp;
    p.vy[i] = 3 + Math.random() * 5;
    p.vz[i] = Math.sin(th) * sp;
    p.life[i] = 0.2 + Math.random() * 0.5;
    p.size[i] = 1 + Math.random() * 2;
    p.r[i] = 1; p.g[i] = 0.85 + Math.random() * 0.15; p.b[i] = 0.3; p.a[i] = 1;
  },
  blood: (p, i) => {
    p.px[i] = (Math.random() - 0.5) * 0.3;
    p.py[i] = 0.5 + Math.random() * 0.5;
    p.pz[i] = (Math.random() - 0.5) * 0.3;
    p.vx[i] = (Math.random() - 0.5) * 2;
    p.vy[i] = 1 + Math.random() * 3;
    p.vz[i] = (Math.random() - 0.5) * 2;
    p.life[i] = 0.3 + Math.random() * 0.7;
    p.size[i] = 2 + Math.random() * 3;
    p.r[i] = 0.7; p.g[i] = 0.02; p.b[i] = 0.02; p.a[i] = 0.9;
  },
  rain: (p, i) => {
    p.px[i] = (Math.random() - 0.5) * 30;
    p.py[i] = 15 + Math.random() * 10;
    p.pz[i] = (Math.random() - 0.5) * 30;
    p.vx[i] = -0.3;
    p.vy[i] = -18 - Math.random() * 6;
    p.vz[i] = 0.2;
    p.life[i] = 1.5 + Math.random() * 1.0;
    p.size[i] = 0.8 + Math.random() * 1.2;
    p.r[i] = 0.5; p.g[i] = 0.6; p.b[i] = 0.9; p.a[i] = 0.6;
  },
  snow: (p, i) => {
    p.px[i] = (Math.random() - 0.5) * 30;
    p.py[i] = 15 + Math.random() * 10;
    p.pz[i] = (Math.random() - 0.5) * 30;
    p.vx[i] = (Math.random() - 0.5) * 1;
    p.vy[i] = -1.5 - Math.random() * 1;
    p.vz[i] = (Math.random() - 0.5) * 1;
    p.life[i] = 3 + Math.random() * 4;
    p.size[i] = 1.5 + Math.random() * 2.5;
    p.r[i] = 1; p.g[i] = 1; p.b[i] = 1; p.a[i] = 0.8;
  },
  celebration: (p, i) => {
    const ang = Math.random() * Math.PI * 2;
    const sp2 = 3 + Math.random() * 5;
    p.px[i] = (Math.random() - 0.5) * 0.5;
    p.py[i] = Math.random() * 0.3;
    p.pz[i] = (Math.random() - 0.5) * 0.5;
    p.vx[i] = Math.cos(ang) * sp2;
    p.vy[i] = 5 + Math.random() * 4;
    p.vz[i] = Math.sin(ang) * sp2;
    p.life[i] = 0.8 + Math.random() * 1.5;
    p.size[i] = 2 + Math.random() * 3;
    const c = hsl2rgb(Math.random(), 1, 0.55);
    p.r[i] = c[0]; p.g[i] = c[1]; p.b[i] = c[2]; p.a[i] = 1;
  },
  explosion: (p, i) => {
    const ang = Math.random() * Math.PI * 2;
    const elev = (Math.random() - 0.3) * Math.PI;
    const sp3 = 4 + Math.random() * 8;
    p.px[i] = (Math.random() - 0.5) * 0.5;
    p.py[i] = (Math.random() - 0.5) * 0.5;
    p.pz[i] = (Math.random() - 0.5) * 0.5;
    p.vx[i] = Math.cos(ang) * Math.cos(elev) * sp3;
    p.vy[i] = Math.sin(elev) * sp3;
    p.vz[i] = Math.sin(ang) * Math.cos(elev) * sp3;
    p.life[i] = 0.3 + Math.random() * 1.0;
    p.size[i] = 3 + Math.random() * 6;
    const t2 = Math.random();
    if (t2 < 0.33) { p.r[i] = 1; p.g[i] = 0.9; p.b[i] = 0.3; }
    else if (t2 < 0.66) { p.r[i] = 1; p.g[i] = 0.4; p.b[i] = 0.1; }
    else { p.r[i] = 1; p.g[i] = 0.15; p.b[i] = 0.05; }
    p.a[i] = 1;
  },
  magic: (p, i) => {
    const ang = Math.random() * Math.PI * 2;
    const sp4 = 1 + Math.random() * 2;
    p.px[i] = (Math.random() - 0.5) * 1.0;
    p.py[i] = (Math.random() - 0.5) * 1.0;
    p.pz[i] = (Math.random() - 0.5) * 1.0;
    p.vx[i] = Math.cos(ang) * sp4 * 0.5;
    p.vy[i] = 1.5 + Math.random() * 2;
    p.vz[i] = Math.sin(ang) * sp4 * 0.5;
    p.life[i] = 0.5 + Math.random() * 1.5;
    p.size[i] = 2 + Math.random() * 4;
    const c = hsl2rgb(0.7 + Math.random() * 0.15, 0.8, 0.6);
    p.r[i] = c[0]; p.g[i] = c[1]; p.b[i] = c[2]; p.a[i] = 0.9;
  },
};

/* ── ParticleSystem3D ────────────────────────────────────────── */

export class ParticleSystem3D {
  constructor(renderer) {
    this._renderer = renderer;
    this._scene = renderer._scene;
    this._count = 0;
    this._time = 0;

    // SoA CPU arrays
    const N = MAX_PARTICLES;
    this._pos  = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N) };
    this._vel  = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N) };
    this._life    = new Float32Array(N);
    this._maxLife = new Float32Array(N);
    this._size    = new Float32Array(N);
    this._col  = { r: new Float32Array(N), g: new Float32Array(N), b: new Float32Array(N), a: new Float32Array(N) };
    this._gravity = new Float32Array(N);

    // Buffers sent to GPU every frame
    this._bPos  = new Float32Array(N * 3);
    this._bVel  = new Float32Array(N * 3);
    this._bLife = new Float32Array(N);
    this._bMax  = new Float32Array(N);
    this._bSize = new Float32Array(N);
    this._bCol  = new Float32Array(N * 4);

    // THREE geometry + material
    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position',  new THREE.BufferAttribute(this._bPos, 3).setUsage(THREE.DynamicDrawUsage));
    this._geo.setAttribute('aVelocity',  new THREE.BufferAttribute(this._bVel, 3).setUsage(THREE.DynamicDrawUsage));
    this._geo.setAttribute('aLife',      new THREE.BufferAttribute(this._bLife, 1).setUsage(THREE.DynamicDrawUsage));
    this._geo.setAttribute('aMaxLife',   new THREE.BufferAttribute(this._bMax, 1).setUsage(THREE.DynamicDrawUsage));
    this._geo.setAttribute('aSize',      new THREE.BufferAttribute(this._bSize, 1).setUsage(THREE.DynamicDrawUsage));

    this._sunDir = new THREE.Vector3(0, 1, 0.3).normalize();
    if (renderer._sun) {
      this._sunDir.copy(renderer._sun.position).normalize();
    }

    this._mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: this._sunDir },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._points = new THREE.Points(this._geo, this._mat);
    this._geo.setDrawRange(0, 0);
    this._scene.add(this._points);
  }

  /* ── emit ─────────────────────────────────────────────────── */

  emit(position, type, count = 10) {
    const preset = PRESETS[type];
    if (!preset) return;

    const p = {
      px: this._pos.x, py: this._pos.y, pz: this._pos.z,
      vx: this._vel.x, vy: this._vel.y, vz: this._vel.z,
      life: this._life, maxLife: this._maxLife, size: this._size,
      r: this._col.r, g: this._col.g, b: this._col.b, a: this._col.a,
    };
    const ox = position.x || 0, oy = position.y || 0, oz = position.z || 0;
    let spawned = 0;

    for (let n = 0; n < count; n++) {
      if (this._count >= MAX_PARTICLES) break;
      const i = this._count++;
      preset(p, i);
      this._pos.x[i] += ox;
      this._pos.y[i] += oy;
      this._pos.z[i] += oz;
      this._gravity[i] = type === 'rain' ? -15 : type === 'snow' ? -0.3 : -9.8;
      spawned++;
    }
    return spawned;
  }

  /* ── update ───────────────────────────────────────────────── */

  update(dt) {
    if (this._count === 0) { this._geo.setDrawRange(0, 0); return; }
    dt = Math.min(dt, 0.05); // clamp for stability
    this._time += dt;

    let alive = 0;
    const N = this._count;
    const px = this._pos.x, py = this._pos.y, pz = this._pos.z;
    const vx = this._vel.x, vy = this._vel.y, vz = this._vel.z;
    const life = this._life, maxLife = this._maxLife, size = this._size;
    const cr = this._col.r, cg = this._col.g, cb = this._col.b, ca = this._col.a;
    const grav = this._gravity;

    // Buffers
    const bPos = this._bPos, bVel = this._bVel;
    const bLife = this._bLife, bMax = this._bMax, bSize = this._bSize;
    const bCol = this._bCol;

    for (let i = 0; i < N; i++) {
      life[i] -= dt;
      if (life[i] <= 0) continue;

      // Integrate
      vy[i] += grav[i] * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;

      const j = alive * 3;
      bPos[j] = px[i]; bPos[j+1] = py[i]; bPos[j+2] = pz[i];
      bVel[j] = vx[i]; bVel[j+1] = vy[i]; bVel[j+2] = vz[i];
      bLife[alive] = life[i];
      bMax[alive]  = maxLife[i];
      bSize[alive] = size[i];

      const k = alive * 4;
      const fade = life[i] / maxLife[i];
      bCol[k]   = cr[i] * ca[i] * fade;
      bCol[k+1] = cg[i] * ca[i] * fade;
      bCol[k+2] = cb[i] * ca[i] * fade;
      bCol[k+3] = fade * ca[i];

      alive++;
    }

    // Compact arrays (swap dead particles out)
    if (alive < N) {
      for (let a = alive, i = 0; a < N && i < N; i++) {
        if (life[i] <= 0) {
          // Swap particle at end of current range into slot i
          while (a < N && life[a] <= 0) a++;
          if (a >= N) break;
          // If a > i, copy a→i and compact
          if (a !== i) {
            px[i] = px[a]; py[i] = py[a]; pz[i] = pz[a];
            vx[i] = vx[a]; vy[i] = vy[a]; vz[i] = vz[a];
            life[i] = life[a]; maxLife[i] = maxLife[a]; size[i] = size[a];
            cr[i] = cr[a]; cg[i] = cg[a]; cb[i] = cb[a]; ca[i] = ca[a];
            grav[i] = grav[a];
            life[a] = 0;
          }
          a++;
        }
      }
      this._count = alive;
    }

    // Upload to GPU
    this._geo.attributes.position.needsUpdate  = true;
    this._geo.attributes.aVelocity.needsUpdate = true;
    this._geo.attributes.aLife.needsUpdate     = true;
    this._geo.attributes.aMaxLife.needsUpdate  = true;
    this._geo.attributes.aSize.needsUpdate     = true;
    this._geo.setDrawRange(0, alive);

    this._mat.uniforms.uTime.value = this._time;
    if (this._renderer._sun) {
      this._mat.uniforms.uSunDir.value.copy(this._renderer._sun.position).normalize();
    }
  }

  /* ── dispose ──────────────────────────────────────────────── */

  dispose() {
    this._scene.remove(this._points);
    this._geo.dispose();
    this._mat.dispose();
    this._count = 0;
  }
}
