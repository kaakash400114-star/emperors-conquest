// emperors-conquest/src/disasters3d.js — 3D Disaster System
// Export class Disasters3D — requires global THREE, renderer exposes .g, ._scene, ._camera

export class Disasters3D {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = renderer._scene;
    this.camera = renderer._camera;
    this.activeDisasters = [];
    this._shakeOffset = new THREE.Vector3();
    this._shakeActive = false;
  }

  trigger(type, position) {
    const d = { type, pos: position.clone(), time: 0, objects: [], particles: [], done: false };
    switch (type) {
      case 'volcano':  this._initVolcano(d); break;
      case 'earthquake': this._initEarthquake(d); break;
      case 'tsunami':   this._initTsunami(d); break;
      case 'meteor':    this._initMeteor(d); break;
      default: return;
    }
    this.activeDisasters.push(d);
  }

  update(dt) {
    for (let i = this.activeDisasters.length - 1; i >= 0; i--) {
      const d = this.activeDisasters[i];
      d.time += dt;
      if (d.done || d.time > d.duration) { this._cleanup(d); this.activeDisasters.splice(i, 1); continue; }
      switch (d.type) {
        case 'volcano':    this._updateVolcano(d, dt); break;
        case 'earthquake': this._updateEarthquake(d, dt); break;
        case 'tsunami':    this._updateTsunami(d, dt); break;
        case 'meteor':     this._updateMeteor(d, dt); break;
      }
    }
    if (!this._shakeActive && !this.activeDisasters.some(d => d.type === 'earthquake' && d.time < d.duration)) {
      this.camera.position.sub(this._shakeOffset);
      this._shakeOffset.set(0, 0, 0);
    }
  }

  getActiveDisasters() { return this.activeDisasters.map(d => ({ type: d.type, time: d.time, duration: d.duration })); }

  // ---- VOLCANO ----
  _initVolcano(d) {
    d.duration = 8;
    const T = this.THREE;
    d.glow = this._mesh(T.SphereGeometry(0.3, 12, 12), T.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.9 }), d.pos);
    d.lava = this._mesh(T.CircleGeometry(0.1, 24), T.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8, side: T.DoubleSide }), d.pos.clone().setY(0.02));
    d.lava.rotation.x = -Math.PI / 2;
    d.ash = this._mesh(T.SphereGeometry(0.2, 16, 16), T.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 }), d.pos.clone().add(new T.Vector3(0, 2, 0)));
    d.erupted = false;
    d.objects.push(d.glow, d.lava, d.ash);
  }

  _updateVolcano(d, dt) {
    const T = this.THREE, t = d.time;
    if (t < 2) {
      const s = 0.3 + t * 1.2;
      d.glow.scale.set(s, s, s);
      d.glow.material.opacity = 0.9;
    } else if (t < 4) {
      if (!d.erupted) { d.erupted = true; d.glow.material.opacity = 0.5; }
      if (d.time - (d._lastErupt || 0) > 0.08) {
        d._lastErupt = t;
        for (let i = 0; i < 3; i++) this._spawnLavaParticle(d);
      }
      const s = 1.5 + (t - 2) * 0.5;
      d.glow.scale.set(s, s, s);
      d.glow.material.opacity = Math.max(0, 0.5 - (t - 2) * 0.2);
    } else {
      d.glow.material.opacity = Math.max(0, 0.1 - (t - 4) * 0.05);
      d.lava.scale.setScalar(Math.min(6, 1 + (t - 2) * 0.8));
      d.lava.material.opacity = Math.max(0, 0.8 - (t - 4) * 0.15);
      d.ash.scale.setScalar(1 + (t - 2) * 0.6);
      d.ash.material.opacity = Math.max(0, 0.5 - (t - 4) * 0.12);
    }
    for (let i = d.particles.length - 1; i >= 0; i--) {
      const p = d.particles[i];
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0 || p.mesh.position.y < 0) { this.scene.remove(p.mesh); d.particles.splice(i, 1); }
    }
  }

  _spawnLavaParticle(d) {
    const T = this.THREE;
    const geo = new T.SphereGeometry(Math.max(0.05, 0.05 + Math.random() * 0.08), 6, 6);
    const mat = new T.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff4400 : 0xff8800 });
    const mesh = this._mesh(geo, mat, d.pos.clone().add(new T.Vector3(0, 1, 0)));
    const ang = Math.random() * Math.PI * 2, spd = 3 + Math.random() * 4;
    mesh.userData.vel = new T.Vector3(Math.cos(ang) * spd, 5 + Math.random() * 5, Math.sin(ang) * spd);
    mesh.userData.life = 2 + Math.random() * 2;
    d.particles.push({ mesh, vel: mesh.userData.vel, life: mesh.userData.life });
  }

  // ---- EARTHQUAKE ----
  _initEarthquake(d) {
    d.duration = 5;
    const T = this.THREE, p = d.pos;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const len = 1 + Math.random() * 2;
      const pts = [new T.Vector3(0, 0.02, 0), new T.Vector3(Math.cos(ang) * len, 0.02, Math.sin(ang) * len)];
      const geo = new T.BufferGeometry().setFromPoints(pts);
      const line = new T.Line(geo, new T.LineBasicMaterial({ color: 0x3a2a1a }));
      line.position.copy(p);
      line.visible = false;
      this.scene.add(line);
      d.objects.push(line);
      d.cracks = d.cracks || [];
      d.cracks.push({ line, delay: Math.random() * 1.5 });
    }
    this._shakeActive = true;
  }

  _updateEarthquake(d, dt) {
    const T = this.THREE, t = d.time, intensity = Math.max(0, 1 - t / d.duration) * 0.3;
    this.camera.position.sub(this._shakeOffset);
    this._shakeOffset.set((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity * 0.5, (Math.random() - 0.5) * intensity);
    this.camera.position.add(this._shakeOffset);
    if (d.cracks) d.cracks.forEach(c => { if (t > c.delay) c.line.visible = true; });
    if (t < 3 && d.time - (d._lastDebris || 0) > 0.1) {
      d._lastDebris = t;
      const geo = new T.BoxGeometry(0.1, 0.1, 0.1);
      const mat = new T.MeshLambertMaterial({ color: 0x8B7355 });
      const mesh = this._mesh(geo, mat, d.pos.clone().add(new T.Vector3((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2)));
      mesh.userData.vel = new T.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2);
      mesh.userData.life = 1.5;
      d.particles.push({ mesh, vel: mesh.userData.vel, life: mesh.userData.life });
    }
    for (let i = d.particles.length - 1; i >= 0; i--) {
      const p = d.particles[i];
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 3; p.mesh.rotation.z += dt * 2;
      p.life -= dt;
      if (p.life <= 0 || p.mesh.position.y < 0) { this.scene.remove(p.mesh); d.particles.splice(i, 1); }
    }
    if (t >= d.duration) this._shakeActive = false;
  }

  // ---- TSUNAMI ----
  _initTsunami(d) {
    d.duration = 6;
    const T = this.THREE, p = d.pos;
    const geo = new T.PlaneGeometry(1, 6, 12, 1);
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), y = posAttr.getY(i);
      posAttr.setZ(i, Math.sin(y * 0.5) * 0.5);
    }
    geo.computeVertexNormals();
    const mat = new T.MeshPhongMaterial({ color: 0x1166cc, transparent: true, opacity: 0.75, side: T.DoubleSide, shininess: 80 });
    d.wall = this._mesh(geo, mat, p.clone().setY(2));
    d.wall.rotation.y = Math.random() * Math.PI;
    d.startPos = d.wall.position.clone();
    d.dir = new T.Vector3(Math.cos(d.wall.rotation.y), 0, Math.sin(d.wall.rotation.y));
    d.objects.push(d.wall);
  }

  _updateTsunami(d, dt) {
    const T = this.THREE, t = d.time;
    const move = t * 8;
    d.wall.position.copy(d.startPos).addScaledVector(d.dir, move);
    d.wall.position.y = 2 + Math.sin(t * 2) * 0.3;
    if (t > 2) d.wall.material.opacity = Math.max(0, 0.75 - (t - 2) * 0.15);
    if (t < 4 && d.time - (d._lastSpray || 0) > 0.05) {
      d._lastSpray = t;
      const geo = new T.SphereGeometry(0.06, 4, 4);
      const mat = new T.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.7 });
      const mesh = this._mesh(geo, mat, d.wall.position.clone().add(new T.Vector3((Math.random() - 0.5), 1 + Math.random() * 2, (Math.random() - 0.5))));
      mesh.userData.vel = new T.Vector3((Math.random() - 0.5) * 1.5, 3 + Math.random() * 3, (Math.random() - 0.5) * 1.5);
      mesh.userData.life = 1.2;
      d.particles.push({ mesh, vel: mesh.userData.vel, life: mesh.userData.life });
    }
    for (let i = d.particles.length - 1; i >= 0; i--) {
      const p = d.particles[i];
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      p.mesh.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) { this.scene.remove(p.mesh); d.particles.splice(i, 1); }
    }
  }

  // ---- METEOR ----
  _initMeteor(d) {
    d.duration = 7;
    const T = this.THREE;
    d.startPos = d.pos.clone().setY(60);
    d.meteor = this._mesh(T.SphereGeometry(0.8, 12, 12), T.MeshBasicMaterial({ color: 0xff6600 }), d.startPos.clone());
    d.trail = this._mesh(T.SphereGeometry(0.4, 8, 8), T.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.6 }), d.startPos.clone());
    d.impacted = false;
    d.objects.push(d.meteor, d.trail);
  }

  _updateMeteor(d, dt) {
    const T = this.THREE, t = d.time;
    if (!d.impacted) {
      const prog = Math.min(1, t / 3);
      const ease = prog * prog;
      d.meteor.position.lerpVectors(d.startPos, d.pos, ease);
      d.trail.position.copy(d.meteor.position).add(new T.Vector3((Math.random() - 0.5) * 0.3, 1.5, (Math.random() - 0.5) * 0.3));
      d.meteor.scale.setScalar(0.6 + prog * 0.4);
      if (prog >= 1) { d.impacted = true; d.meteor.visible = false; d.trail.visible = false; this._meteorImpact(d); }
    } else {
      const fade = t - 3;
      if (d.flash) d.flash.material.opacity = Math.max(0, 1 - fade * 2);
      if (d.crater) d.crater.material.opacity = Math.max(0, 0.8 - fade * 0.15);
      if (d.crater) d.crater.scale.setScalar(Math.min(3, 0.5 + fade * 0.5));
    }
    for (let i = d.particles.length - 1; i >= 0; i--) {
      const p = d.particles[i];
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.mesh); d.particles.splice(i, 1); }
    }
  }

  _meteorImpact(d) {
    const T = this.THREE;
    d.flash = this._mesh(T.SphereGeometry(2, 16, 16), T.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 1 }), d.pos.clone().setY(1));
    d.crater = this._mesh(T.CircleGeometry(0.5, 24), T.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: 0.8, side: T.DoubleSide }), d.pos.clone().setY(0.03));
    d.crater.rotation.x = -Math.PI / 2;
    d.objects.push(d.flash, d.crater);
    for (let i = 0; i < 30; i++) {
      const geo = new T.BoxGeometry(0.1, 0.1, 0.1);
      const mat = new T.MeshLambertMaterial({ color: 0x664422 });
      const mesh = this._mesh(geo, mat, d.pos.clone().setY(0.2));
      const ang = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 6;
      mesh.userData.vel = new T.Vector3(Math.cos(ang) * spd, 4 + Math.random() * 8, Math.sin(ang) * spd);
      mesh.userData.life = 1.5 + Math.random() * 2;
      d.particles.push({ mesh, vel: mesh.userData.vel, life: mesh.userData.life });
    }
  }

  // ---- UTILS ----
  _mesh(geo, mat, pos) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    this.scene.add(m);
    return m;
  }

  _cleanup(d) {
    d.objects.forEach(o => { this.scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    d.particles.forEach(p => { this.scene.remove(p.mesh); if (p.mesh.geometry) p.mesh.geometry.dispose(); if (p.mesh.material) p.mesh.material.dispose(); });
    if (d.type === 'earthquake') {
      this.camera.position.sub(this._shakeOffset);
      this._shakeOffset.set(0, 0, 0);
      this._shakeActive = false;
    }
  }
}
