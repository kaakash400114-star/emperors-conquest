import { TERRITORIES } from './map.js';

const WS = 0.1;
const FLYOVER_DURATION = 4;
const ZOOM_DURATION = 1.5;
const VICTORY_DURATION = 8;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function territoryPos3D(terrId) {
  const t = TERRITORIES[terrId];
  if (!t) return { x: 0, y: 0, z: 0 };
  const cx = t.cx ?? ((t.x ?? 0) + (t.x ?? 0) + (t.corners?.[0]?.[0] ?? 0)) / 3;
  const cy = t.cy ?? ((t.y ?? 0) + (t.y ?? 0) + (t.corners?.[0]?.[1] ?? 0)) / 3;
  return { x: cx * WS - 48, y: 0, z: cy * WS - 32 };
}

function randomColor() {
  const c = new THREE.Color();
  c.setHSL(Math.random(), 0.9, 0.6);
  return c;
}

export class Cinematics3D {
  constructor(renderer) {
    this.r = renderer;
    this.scene = renderer._scene;
    this.camera = renderer._camera;
    this.g = renderer.g;
    this.particles = renderer.particles;
    this.controls = renderer.controls ?? renderer._controls ?? null;

    this.active = false;
    this.originalPos = new THREE.Vector3();
    this.originalTarget = new THREE.Vector3();

    this._flyover = null;
    this._zoom = null;
    this._fireworks = [];
    this._shake = null;
    this._fwTimer = 0;
    this._fwCount = 0;
    this._fwGroup = null;
  }

  _saveCamera() {
    this.originalPos.copy(this.camera.position);
    const t = this.controls?.target ?? new THREE.Vector3(0, 0, 0);
    this.originalTarget.copy(t);
  }

  _restoreCamera() {
    this.camera.position.copy(this.originalPos);
    if (this.controls) {
      this.controls.target.copy(this.originalTarget);
      this.controls.enabled = true;
    }
    this.camera.lookAt(this.controls?.target ?? this.originalTarget);
  }

  _disableControls() {
    if (this.controls) this.controls.enabled = false;
  }

  _ensureControls() {
    if (this.controls) this.controls.enabled = true;
  }

  playFlyover() {
    this._disableControls();
    this._saveCamera();
    this._flyover = {
      t: 0,
      startPos: new THREE.Vector3(this.originalPos.x, 60, this.originalPos.z),
      endPos: this.originalPos.clone(),
      startAngle: Math.atan2(this.originalPos.z, this.originalPos.x),
      rotation: Math.PI * 0.6,
    };
    this.active = true;
  }

  zoomToTerritory(terrId) {
    const pos = territoryPos3D(terrId);
    this._disableControls();
    this._saveCamera();
    const offset = new THREE.Vector3(8, 12, 8);
    const endPos = new THREE.Vector3(pos.x + offset.x, offset.y, pos.z + offset.z);
    this._zoom = {
      t: 0,
      startPos: this.originalPos.clone(),
      endPos,
      startTarget: this.originalTarget.clone(),
      endTarget: new THREE.Vector3(pos.x, 0, pos.z),
    };
    this.active = true;
  }

  playVictory(empireId) {
    this._disableControls();
    this._saveCamera();
    this._fwTimer = 0;
    this._fwCount = 0;
    this._fwGroup = new THREE.Group();
    this._fwGroup.name = 'fireworks';
    this.scene.add(this._fwGroup);
    this._fireworks = [];
    this.active = true;
  }

  _spawnFirework() {
    if (!this._fwGroup) return;
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 30;
    const color = randomColor();
    const geo = new THREE.SphereGeometry(0.05, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    this._fwGroup.add(mesh);
    const vy = 15 + Math.random() * 10;
    this._fireworks.push({
      mesh, geo, mat, vy, exploded: false, peakY: vy * 0.4 + 5, particles: [],
    });
  }

  _explodeFirework(fw) {
    if (!this._fwGroup) return;
    this._fwGroup.remove(fw.mesh);
    fw.mesh.geometry?.dispose();
    fw.mesh.material?.dispose();
    fw.exploded = true;
    const count = 15 + Math.floor(Math.random() * 6);
    const color = fw.mat.color.clone();
    for (let i = 0; i < count; i++) {
      const pGeo = new THREE.SphereGeometry(0.03, 4, 4);
      const pMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.copy(fw.mesh.position);
      this._fwGroup.add(pMesh);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 4 + Math.random() * 6;
      this._fireworks.push({
        mesh: pMesh, geo: pGeo, mat: pMat,
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.sin(phi) * Math.sin(theta) * speed + 3,
        vz: Math.cos(phi) * speed,
        exploded: true, isParticle: true, life: 1.5 + Math.random() * 0.5,
        peakY: 0, particles: [],
      });
    }
  }

  shakeCamera(intensity, duration) {
    this._shake = { intensity, duration, remaining: duration, offset: new THREE.Vector3() };
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    let anyActive = false;

    // Flyover
    if (this._flyover) {
      anyActive = true;
      const f = this._flyover;
      f.t = Math.min(f.t + dt / FLYOVER_DURATION, 1);
      const e = easeInOutCubic(f.t);
      this.camera.position.lerpVectors(f.startPos, f.endPos, e);
      const angle = f.startAngle + f.rotation * e;
      const target = new THREE.Vector3(0, 0, 0);
      this.camera.lookAt(target);
      if (this.controls) this.controls.target.copy(target);
      if (f.t >= 1) {
        this._flyover = null;
        this._ensureControls();
      }
    }

    // Zoom
    if (this._zoom) {
      anyActive = true;
      const z = this._zoom;
      z.t = Math.min(z.t + dt / ZOOM_DURATION, 1);
      const e = easeInOutQuad(z.t);
      this.camera.position.lerpVectors(z.startPos, z.endPos, e);
      const target = new THREE.Vector3().lerpVectors(z.startTarget, z.endTarget, e);
      this.camera.lookAt(target);
      if (this.controls) this.controls.target.copy(target);
      if (z.t >= 1) {
        this._zoom = null;
        this._ensureControls();
      }
    }

    // Fireworks
    if (this._fwGroup) {
      anyActive = true;
      this._fwTimer += dt;
      while (this._fwTimer > 0.25 && this._fwCount < 25 + Math.floor(Math.random() * 6)) {
        this._spawnFirework();
        this._fwCount++;
        this._fwTimer -= 0.25 + Math.random() * 0.15;
      }
      for (let i = this._fireworks.length - 1; i >= 0; i--) {
        const fw = this._fireworks[i];
        if (!fw.isParticle && !fw.exploded) {
          fw.mesh.position.y += fw.vy * dt;
          fw.vy -= 12 * dt;
          if (fw.vy <= 0 || fw.mesh.position.y >= fw.peakY) {
            this._explodeFirework(fw);
          }
        } else if (fw.isParticle) {
          fw.mesh.position.x += fw.vx * dt;
          fw.mesh.position.y += fw.vy * dt;
          fw.mesh.position.z += fw.vz * dt;
          fw.vy -= 12 * dt;
          fw.vx *= 0.97;
          fw.vz *= 0.97;
          fw.life -= dt;
          fw.mat.opacity = Math.max(0, fw.life / 2);
          if (fw.life <= 0) {
            this._fwGroup.remove(fw.mesh);
            fw.mesh.geometry?.dispose();
            fw.mesh.material?.dispose();
            this._fireworks.splice(i, 1);
          }
        }
      }
      // Clean non-particle exploded refs
      this._fireworks = this._fireworks.filter(fw => !fw.exploded || fw.isParticle);
      if (this._fwCount >= 25 && this._fireworks.length === 0) {
        this.scene.remove(this._fwGroup);
        this._fwGroup = null;
        this._fireworks = [];
        this._ensureControls();
      }
    }

    // Shake
    if (this._shake) {
      anyActive = true;
      const s = this._shake;
      s.remaining -= dt;
      if (s.remaining <= 0) {
        this.camera.position.sub(s.offset);
        this._shake = null;
      } else {
        const decay = Math.exp(-3 * dt);
        s.intensity *= decay;
        const ox = (Math.random() - 0.5) * s.intensity;
        const oy = (Math.random() - 0.5) * s.intensity;
        const oz = (Math.random() - 0.5) * s.intensity;
        this.camera.position.sub(s.offset);
        s.offset.set(ox, oy, oz);
        this.camera.position.add(s.offset);
      }
    }

    this.active = anyActive || !!this._shake;
  }

  dispose() {
    if (this._fwGroup) {
      for (const fw of this._fireworks) {
        this._fwGroup.remove(fw.mesh);
        fw.mesh.geometry?.dispose();
        fw.mesh.material?.dispose();
        for (const p of fw.particles) {
          this._fwGroup.remove(p.mesh);
          p.mesh.geometry?.dispose();
          p.mesh.material?.dispose();
        }
      }
      this.scene.remove(this._fwGroup);
    }
    this._fireworks = [];
    this._fwGroup = null;
    this._flyover = null;
    this._zoom = null;
    this._shake = null;
    this.active = false;
    this._ensureControls();
  }
}
