// ── Emperor's Conquest – Visual Effects System ──────────────────────────────
const { Scene, Camera, DirectionalLight, Mesh, PlaneGeometry, CircleGeometry,
  ConeGeometry, ShaderMaterial, MeshBasicMaterial, PointsMaterial, Points,
  SpriteMaterial, Sprite, CanvasTexture, Color, Vector2, Vector3, FogExp2,
  BufferGeometry, Float32BufferAttribute, AdditiveBlending, DoubleSide,
  LinearMipmapLinearFilter, ClampToEdgeWrapping } = THREE;

// ── Reusable canvas-texture helpers ──────────────────────────────────────────
function _makeCloudTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, r = 16 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = ClampToEdgeWrapping;
  return t;
}

function _makeFlareTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.1, 'rgba(255,220,150,0.7)');
  g.addColorStop(0.35, 'rgba(255,180,80,0.2)');
  g.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

function _makeGlowTex(size) {
  const s = size || 64;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return new CanvasTexture(c);
}

function _makeFoamTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 64, y = Math.random() * 64;
    ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ── Simple seeded pseudo-noise (no external dep) ─────────────────────────────
class _Noise {
  constructor(seed = 42) { this._s = seed; }
  _hash(n) { let x = Math.sin(n + this._s) * 43758.5453; return x - Math.floor(x); }
  noise1D(x) { const i = Math.floor(x), f = x - i;
    return this._hash(i) * (1 - f) + this._hash(i + 1) * f; }
  noise2D(x, y) { return (this.noise1D(x + y * 157.3) + this.noise1D(x * 3.7 - y * 1.3)) * 0.5; }
}

// ═══════════════════════════════════════════════════════════════════════════════
export class Visuals3D {
  constructor(renderer) {
    this._r = renderer;
    this._scene = renderer._scene;
    this._cam = renderer._camera;
    this._sun = renderer._sun;
    this._game = renderer.g;
    this._terrain = renderer._terrainMesh;
    this._ocean = renderer._ocean;
    this._time = 0;
    this._elapsed = 0;
    this._noise = new _Noise();

    this._buildFog();
    this._buildClouds();
    this._buildGodRays();
    this._buildFoam();
    this._buildSpecular();
    this._buildParticles();
    this._buildLensFlare();
    this._buildBorderGlow();
  }

  // ── Day factor 0 (midnight) → 1 (noon) ────────────────────────────────────
  get _dayFactor() {
    const g = this._game;
    if (!g || g.dayNight == null) return 1;
    return g.dayNight;
  }

  // ── 1. Atmospheric Fog ─────────────────────────────────────────────────────
  _buildFog() {
    this._origFog = this._scene.fog;
    const d = this._dayFactor;
    const col = new Color().lerpColors(
      new Color(0x0a0a1e), new Color(0xc8dae8), d
    );
    this._scene.fog = new FogExp2(col, 0.0025);
    this._fogColor = col;
  }

  _updateFog() {
    const d = this._dayFactor;
    this._fogColor.lerpColors(new Color(0x0a0a1e), new Color(0xc8dae8), d);
    this._scene.fog.color.copy(this._fogColor);
    this._scene.fog.density = 0.0015 + (1 - d) * 0.003;
    if (!this._scene.background) return;
    if (this._scene.background.isColor)
      this._scene.background.lerpColors(new Color(0x070714), new Color(0x87ceeb), d);
  }

  // ── 2. Volumetric Clouds ─────────────────────────────────────────────────
  _buildClouds() {
    this._clouds = [];
    const tex = _makeCloudTex();
    for (let i = 0; i < 18; i++) {
      const w = 40 + Math.random() * 60, h = w * (0.3 + Math.random() * 0.2);
      const geo = new PlaneGeometry(w, h);
      const mat = new MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.35 + Math.random() * 0.25,
        depthWrite: false, side: DoubleSide, fog: true
      });
      const m = new Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        (Math.random() - 0.5) * 300,
        22 + Math.random() * 8,
        (Math.random() - 0.5) * 300
      );
      m.userData.speed = 0.3 + Math.random() * 0.6;
      m.userData.baseY = m.position.y;
      this._scene.add(m);
      this._clouds.push(m);
    }
  }

  _updateClouds(dt) {
    const d = this._dayFactor;
    const tint = new Color().lerpColors(new Color(0x1a1a3a), new Color(0xffffff), d);
    const nightFade = 0.15 + d * 0.85;
    for (const c of this._clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 180) c.position.x = -180;
      c.position.y = c.userData.baseY + Math.sin(this._elapsed * 0.15 + c.position.z) * 0.6;
      c.material.color.copy(tint);
      c.material.opacity = (0.3 + Math.sin(this._elapsed * 0.3 + c.position.x * 0.1) * 0.05) * nightFade;
      if (this._cam.position.distanceTo(c.position) > 250) c.visible = false;
      else c.visible = true;
    }
  }

  // ── 3. God Rays ────────────────────────────────────────────────────────────
  _buildGodRays() {
    const geo = new ConeGeometry(50, 120, 32, 1, true);
    const mat = new ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.0 },
        uColor: { value: new Color(0xffcc66) },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        void main(){
          float fade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float flicker = 0.9 + 0.1 * sin(uTime * 2.0 + vUv.x * 10.0);
          float a = fade * flicker * uOpacity * (1.0 - vUv.y) * 0.6;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true, depthWrite: false, side: DoubleSide,
      blending: AdditiveBlending, fog: false
    });
    this._godRay = new Mesh(geo, mat);
    this._godRay.frustumCulled = false;
    this._scene.add(this._godRay);
  }

  _updateGodRays() {
    const sunPos = new Vector3();
    this._sun.getWorldPosition(sunPos);
    const sunY = sunPos.y;
    let target = 0.0;
    if (sunY > 0) {
      this._godRay.position.copy(sunPos).add(new Vector3(0, -50, 0));
      this._godRay.lookAt(sunPos.clone().multiplyScalar(2));
      const angle = sunY / 80;
      target = Math.max(0, (1 - angle) * 0.18);
    }
    this._godRay.material.uniforms.uOpacity.value +=
      (target - this._godRay.material.uniforms.uOpacity.value) * 0.02;
    this._godRay.material.uniforms.uTime.value = this._elapsed;
    this._godRay.visible = this._godRay.material.uniforms.uOpacity.value > 0.005;
  }

  // ── 4. Water Foam & Shimmer ────────────────────────────────────────────────
  _buildFoam() {
    if (!this._ocean) return;
    const geo = new PlaneGeometry(400, 400, 64, 64);
    const tex = _makeFoamTex();
    const mat = new MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.4, depthWrite: false,
      side: DoubleSide, blending: AdditiveBlending, fog: true
    });
    this._foam = new Mesh(geo, mat);
    this._foam.rotation.x = -Math.PI / 2;
    this._foam.position.y = this._ocean.position.y + 0.05;
    this._scene.add(this._foam);
  }

  _updateFoam() {
    if (!this._foam) return;
    this._foam.material.map.offset.set(this._elapsed * 0.01, this._elapsed * 0.008);
    this._foam.material.opacity = 0.25 + Math.sin(this._elapsed * 0.5) * 0.1;
  }

  _buildSpecular() {
    if (!this._ocean) return;
    const geo = new PlaneGeometry(3, 200, 1, 1);
    const mat = new MeshBasicMaterial({
      color: 0xfffde0, transparent: true, opacity: 0.3, depthWrite: false,
      side: DoubleSide, blending: AdditiveBlending, fog: true
    });
    this._specular = new Mesh(geo, mat);
    this._specular.rotation.x = -Math.PI / 2;
    this._specular.position.y = this._ocean.position.y + 0.1;
    this._scene.add(this._specular);
  }

  _updateSpecular() {
    if (!this._specular) return;
    const sunPos = new Vector3(); this._sun.getWorldPosition(sunPos);
    const sunAngle = Math.atan2(sunPos.x, sunPos.z);
    this._specular.position.x = Math.sin(sunAngle) * 30;
    this._specular.position.z = Math.cos(sunAngle) * 30;
    this._specular.rotation.z = -sunAngle;
    const d = this._dayFactor;
    const vis = sunPos.y > 0 ? d : 0;
    this._specular.material.opacity += (vis * 0.35 - this._specular.material.opacity) * 0.03;
  }

  // ── 5. Ambient Particles (fireflies / dust) ───────────────────────────────
  _buildParticles() {
    const N = 200;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200;
      pos[i * 3 + 1] = 2 + Math.random() * 25;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
      vel[i * 3] = (Math.random() - 0.5) * 0.3;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this._pVel = vel;
    const tex = _makeGlowTex(32);
    const mat = new PointsMaterial({
      size: 0.6, map: tex, transparent: true, depthWrite: false,
      blending: AdditiveBlending, vertexColors: true, fog: true
    });
    this._particles = new Points(geo, mat);
    this._particles.frustumCulled = false;
    this._scene.add(this._particles);
  }

  _updateParticles(dt) {
    if (!this._particles) return;
    const pos = this._particles.geometry.attributes.position.array;
    const N = pos.length / 3;
    const d = this._dayFactor;
    const dayCol = new Color(0xffcc44);
    const nightCol = new Color(0x88bbff);
    const col = dayCol.lerp(nightCol, 1 - d);
    this._particles.material.color.copy(col);
    this._particles.material.opacity = 0.5 + (1 - d) * 0.3;
    const sizeScale = d < 0.3 ? 0.8 + (1 - d) * 1.2 : 0.4;
    this._particles.material.size = sizeScale;

    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      pos[i3] += this._pVel[i3] * dt;
      pos[i3 + 1] += this._pVel[i3 + 1] * dt;
      pos[i3 + 2] += this._pVel[i3 + 2] * dt;
      // gentle noise drift
      pos[i3] += this._noise.noise1D(this._elapsed * 0.2 + i) * dt * 0.4;
      pos[i3 + 1] += Math.sin(this._elapsed * 0.8 + i * 0.5) * dt * 0.2;
      // wrap
      if (pos[i3] > 100) pos[i3] = -100;
      if (pos[i3] < -100) pos[i3] = 100;
      pos[i3 + 1] = Math.max(1, Math.min(30, pos[i3 + 1]));
      if (pos[i3 + 2] > 100) pos[i3 + 2] = -100;
      if (pos[i3 + 2] < -100) pos[i3 + 2] = 100;
    }
    this._particles.geometry.attributes.position.needsUpdate = true;
  }

  // ── 6. Lens Flare ─────────────────────────────────────────────────────────
  _buildLensFlare() {
    const tex = _makeFlareTex();
    const mat = new SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthTest: false,
      blending: AdditiveBlending, fog: false
    });
    this._flare = new Sprite(mat);
    this._flare.scale.set(12, 12, 1);
    this._scene.add(this._flare);
  }

  _updateLensFlare() {
    if (!this._flare) return;
    const sunPos = new Vector3();
    this._sun.getWorldPosition(sunPos);
    if (sunPos.y <= 0) {
      this._flare.material.opacity *= 0.92;
      return;
    }
    const projected = sunPos.clone().project(this._cam);
    // only visible if in front of camera
    if (projected.z > 1) { this._flare.material.opacity *= 0.9; return; }
    this._flare.position.copy(sunPos).multiplyScalar(0.95);
    const d = this._dayFactor;
    const targetOp = d * 0.6 * Math.max(0, sunPos.y / 40);
    this._flare.material.opacity += (targetOp - this._flare.material.opacity) * 0.05;
    this._flare.scale.setScalar(10 + Math.sin(this._elapsed * 1.5) * 2);
  }

  // ── 7. Emissive Border Glow at Night ─────────────────────────────────────
  _buildBorderGlow() {
    this._borderGlows = [];
    this._borderGroup = new THREE.Group();
    this._borderGroup.visible = false;
    this._scene.add(this._borderGroup);
    // borders are rebuilt when territory data is available
    this._tryBuildBorders();
  }

  _tryBuildBorders() {
    const g = this._game;
    if (!g || !g.territories) return;
    this._buildBorderLines();
  }

  _buildBorderLines() {
    // clear old
    while (this._borderGroup.children.length) {
      const c = this._borderGroup.children[0];
      c.geometry?.dispose(); c.material?.dispose();
      this._borderGroup.remove(c);
    }
    this._borderGlows = [];
    const g = this._game;
    const terrs = g.territories;
    if (!terrs || !terrs.length) return;

    const glowTex = _makeGlowTex(16);
    const col = new Color(0x44aaff);

    // Sample border points from terrain mesh vertices grouped by owner
    if (!this._terrain) return;
    for (let t = 0; t < terrs.length; t++) {
      const terr = terrs[t];
      if (!terr.borderPoints || !terr.borderPoints.length) continue;
      const pts = terr.borderPoints;
      const geo = new BufferGeometry().setFromPoints(pts);
      const mat = new PointsMaterial({
        size: 0.6, map: glowTex, transparent: true, color: col,
        depthWrite: false, blending: AdditiveBlending, fog: true
      });
      const pts3d = new Points(geo, mat);
      this._borderGroup.add(pts3d);
      this._borderGlows.push(pts3d);
    }
  }

  _updateBorderGlow() {
    if (!this._borderGroup) return;
    const d = this._dayFactor;
    // visible only at night
    if (d > 0.65) {
      this._borderGroup.visible = false;
      return;
    }
    if (!this._borderGroup.children.length) this._tryBuildBorders();
    this._borderGroup.visible = true;
    const intensity = (0.65 - d) / 0.65;
    const pulse = 0.6 + 0.4 * Math.sin(this._elapsed * 1.5);
    const op = intensity * pulse * 0.7;
    for (const g of this._borderGlows) {
      g.material.opacity = op;
      g.material.size = 0.4 + intensity * 0.4;
    }
  }

  // ── Main Update ────────────────────────────────────────────────────────────
  update(dt) {
    this._time += dt;
    this._elapsed += dt;
    this._updateFog();
    this._updateClouds(dt);
    this._updateGodRays();
    this._updateFoam();
    this._updateSpecular();
    this._updateParticles(dt);
    this._updateLensFlare();
    this._updateBorderGlow();
  }

  // ── Dispose ──────────────────────────────────────────────────────────────
  dispose() {
    // clouds
    for (const c of this._clouds) {
      c.geometry.dispose(); c.material.dispose();
      if (c.material.map) c.material.map.dispose();
      this._scene.remove(c);
    }
    // god rays
    if (this._godRay) {
      this._godRay.geometry.dispose(); this._godRay.material.dispose();
      this._scene.remove(this._godRay);
    }
    // foam
    if (this._foam) {
      this._foam.geometry.dispose(); this._foam.material.dispose();
      if (this._foam.material.map) this._foam.material.map.dispose();
      this._scene.remove(this._foam);
    }
    // specular
    if (this._specular) {
      this._specular.geometry.dispose(); this._specular.material.dispose();
      this._scene.remove(this._specular);
    }
    // particles
    if (this._particles) {
      this._particles.geometry.dispose(); this._particles.material.dispose();
      if (this._particles.material.map) this._particles.material.map.dispose();
      this._scene.remove(this._particles);
    }
    // flare
    if (this._flare) {
      this._flare.material.dispose();
      if (this._flare.material.map) this._flare.material.map.dispose();
      this._scene.remove(this._flare);
    }
    // borders
    if (this._borderGroup) {
      while (this._borderGroup.children.length) {
        const c = this._borderGroup.children[0];
        c.geometry?.dispose(); c.material?.dispose();
        if (c.material?.map) c.material.map.dispose();
        this._borderGroup.remove(c);
      }
      this._scene.remove(this._borderGroup);
    }
    // restore fog
    if (this._origFog) this._scene.fog = this._origFog;
    this._clouds = []; this._borderGlows = [];
  }
}
