/**
 * Seasons3D — Cycles seasons every 60s with gradual terrain tint transitions.
 * Spring=green, Summer=golden, Autumn=orange, Winter=snow/blue-white.
 */

const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
const CYCLE_DURATION = 60;   // seconds per full season
const LERP_DURATION  = 2;    // seconds to blend between seasons

// Base tints applied as multiplicative overlays on existing vertex color
const TINTS = {
  spring: { r: 1.00, g: 1.10, b: 0.95 },
  summer: { r: 1.05, g: 1.03, b: 0.92 },
  autumn: { r: 1.15, g: 0.90, b: 0.80 },
  winter: { r: 0.92, g: 0.95, b: 1.15 },
};

// Additional white-blend factor for winter snow
const WHITE_BLEND = { spring: 0, summer: 0, autumn: 0, winter: 0.12 };

export class Seasons3D {

  constructor(renderer) {
    this._r = renderer;
    this._scene  = renderer._scene;
    this._mesh   = renderer._terrainMesh;
    this._geo    = renderer._terrainGeo;
    this._terrId = renderer._terrIdData || null;

    this._season   = 'spring';
    this._timer    = 0;
    this._lerpT    = 1;           // 1 = fully arrived at target
    this._fromTint = { ...TINTS.spring };
    this._fromWhite = 0;
    this._toTint    = { ...TINTS.spring };
    this._toWhite   = 0;

    // Particles
    this._particles  = null;
    this._particleT  = 0;
    this._initParticles();

    // Snapshot original vertex colors on first frame
    this._originalColors = null;
    this._snapshotted    = false;
  }

  // ── public API ───────────────────────────────────────────────

  getSeason()    { return this._season; }

  setSeason(name) {
    name = name.toLowerCase();
    if (!TINTS[name]) return;
    if (name === this._season && this._lerpT >= 1) return;
    this._startTransition(name);
  }

  update(dt) {
    // Snapshot original colors once
    if (!this._snapshotted && this._geo) {
      const attr = this._geo.attributes.color;
      this._originalColors = new Float32Array(attr.array.length);
      this._originalColors.set(attr.array);
      this._snapshotted = true;
    }

    // Season timer
    this._timer += dt;
    if (this._timer >= CYCLE_DURATION) {
      this._timer -= CYCLE_DURATION;
      const idx = (SEASON_ORDER.indexOf(this._season) + 1) % 4;
      this._startTransition(SEASON_ORDER[idx]);
    }

    // Lerp progress
    if (this._lerpT < 1) {
      this._lerpT = Math.min(1, this._lerpT + dt / LERP_DURATION);
    }

    this._applyTerrainTint();
    this._updateParticles(dt);
  }

  // ── transitions ───────────────────────────────────────────────

  _startTransition(name) {
    const factor = this._lerpT;  // how far we already got
    // Compute current effective tint as new "from"
    this._fromTint  = this._lerpColor(this._fromTint, this._toTint, factor);
    this._fromWhite = this._fromWhite + (this._toWhite - this._fromWhite) * factor;
    this._toTint    = { ...TINTS[name] };
    this._toWhite   = WHITE_BLEND[name];
    this._lerpT     = 0;
    this._season    = name;
  }

  // ── terrain tint ──────────────────────────────────────────────

  _applyTerrainTint() {
    if (!this._originalColors || !this._geo) return;
    const attr = this._geo.attributes.color;
    const arr  = attr.array;
    const orig = this._originalColors;
    const t    = this._smoothstep(this._lerpT);
    const tr   = this._fromTint.r  + (this._toTint.r  - this._fromTint.r)  * t;
    const tg   = this._fromTint.g  + (this._toTint.g  - this._fromTint.g)  * t;
    const tb   = this._fromTint.b  + (this._toTint.b  - this._fromTint.b)  * t;
    const tw   = this._fromWhite   + (this._toWhite    - this._fromWhite)   * t;

    for (let i = 0; i < arr.length; i += 3) {
      let r = orig[i]     * tr;
      let g = orig[i + 1] * tg;
      let b = orig[i + 2] * tb;
      // Blend toward white for winter snow
      if (tw > 0) {
        r = r + (1 - r) * tw;
        g = g + (1 - g) * tw;
        b = b + (1 - b) * tw;
      }
      arr[i]     = r;
      arr[i + 1] = g;
      arr[i + 2] = b;
    }
    attr.needsUpdate = true;
  }

  // ── particles ────────────────────────────────────────────────

  _initParticles() {
    const count = 400;
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this._particles = new THREE.Points(geo, mat);
    this._particles.visible = false;
    this._scene.add(this._particles);
  }

  _updateParticles(dt) {
    const s = this._season;
    const show = s === 'spring' || s === 'autumn' || s === 'winter';
    this._particles.visible = show;
    if (!show) { this._particleT = 0; return; }

    this._particleT += dt;
    const posArr = this._particles.geometry.attributes.position.array;
    const colArr = this._particles.geometry.attributes.color.array;
    const count  = posArr.length / 3;
    const bound  = this._mesh ? this._mesh.geometry.boundingBox : null;
    if (!bound) return;
    const w = bound.max.x - bound.min.x;
    const h = bound.max.z - bound.min.z;
    const yBase = bound.max.y + 2;
    const speed = s === 'winter' ? 3.5 : s === 'autumn' ? 2.0 : 1.2;

    for (let i = 0; i < count; i++) {
      const phase = i / count;
      const life  = ((this._particleT * speed * 0.15 + phase) % 1);
      posArr[i * 3]     = bound.min.x + ((phase * 173.17) % 1) * w;
      posArr[i * 3 + 1] = yBase - life * 6;
      posArr[i * 3 + 2] = bound.min.z + ((phase * 91.37)  % 1) * h;

      if (s === 'spring') {
        colArr[i * 3] = 1.0; colArr[i * 3 + 1] = 0.4; colArr[i * 3 + 2] = 0.7;
      } else if (s === 'autumn') {
        colArr[i * 3] = 0.9; colArr[i * 3 + 1] = 0.45; colArr[i * 3 + 2] = 0.15;
      } else {
        colArr[i * 3] = 0.92; colArr[i * 3 + 1] = 0.95; colArr[i * 3 + 2] = 1.0;
      }
    }
    this._particles.geometry.attributes.position.needsUpdate = true;
    this._particles.geometry.attributes.color.needsUpdate    = true;
  }

  // ── helpers ─────────────────────────────────────────────────

  _lerpColor(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    };
  }

  _smoothstep(t) {
    return t * t * (3 - 2 * t);
  }
}
