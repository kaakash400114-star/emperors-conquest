/**
 * Beasts3D — Mythological beasts with procedural 3D models and idle animations.
 * 5 types: minotaur, hydra, pegasus, manticore, dragon
 */

export class Beasts3D {
  constructor(renderer) {
    this.scene = renderer._scene;
    this.camera = renderer._camera;
    this.T = (typeof THREE !== 'undefined') ? THREE : {};
    this.beasts = new Map();
    this._nextId = 0;
  }

  getBeast(id) { return this.beasts.get(id) || null; }
  removeBeast(id) {
    const b = this.beasts.get(id);
    if (!b) return;
    this.scene.remove(b.group);
    b.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    this.beasts.delete(id);
  }

  spawnBeast(type, position) {
    const T = this.T;
    const group = new T.Group();
    const id = this._nextId++;

    switch (type) {
      case 'minotaur': this._buildMinotaur(group); break;
      case 'hydra':    this._buildHydra(group); break;
      case 'pegasus':  this._buildPegasus(group); break;
      case 'manticore': this._buildManticore(group); break;
      case 'dragon':   this._buildDragon(group); break;
      default: return;
    }

    group.position.copy(position);
    group.userData = { type, id };
    this.scene.add(group);
    this.beasts.set(id, {
      group, type, id,
      wanderDir: new T.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
      wanderTimer: 0,
      animTime: Math.random() * 10
    });
    return id;
  }

  update(dt) {
    for (const [id, b] of this.beasts) {
      b.animTime += dt;
      const g = b.group;
      const t = b.animTime;

      // Floating bob
      g.position.y = 1 + Math.sin(t * 1.5) * 0.15;

      // Wander
      b.wanderTimer -= dt;
      if (b.wanderTimer <= 0) {
        b.wanderDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        b.wanderTimer = 3 + Math.random() * 5;
      }
      g.position.x += b.wanderDir.x * dt * 0.3;
      g.position.z += b.wanderDir.z * dt * 0.3;

      // Clamp to world bounds
      g.position.x = Math.max(-45, Math.min(45, g.position.x));
      g.position.z = Math.max(-30, Math.min(30, g.position.z));

      // Type-specific animations
      this._animate(b, t);
    }
  }

  _animate(b, t) {
    const g = b.group;
    switch (b.type) {
      case 'minotaur': {
        // Breathing scale
        g.scale.y = 1 + Math.sin(t * 2) * 0.03;
        break;
      }
      case 'hydra': {
        // Head swaying
        const heads = g.userData.heads || [];
        heads.forEach((h, i) => {
          h.rotation.z = Math.sin(t * 2 + i * 1.5) * 0.15;
          h.rotation.x = Math.sin(t * 1.5 + i * 2) * 0.1;
        });
        break;
      }
      case 'pegasus': {
        // Wing flapping
        const wings = g.userData.wings || [];
        wings.forEach((w, i) => {
          w.rotation.z = (i === 0 ? 1 : -1) * Math.sin(t * 4) * 0.4;
        });
        break;
      }
      case 'manticore': {
        // Tail sway + wing flap
        const segs = g.userData.tailSegs || [];
        segs.forEach((s, i) => {
          s.rotation.z = Math.sin(t * 3 + i * 0.8) * 0.2;
        });
        const wings = g.userData.wings || [];
        wings.forEach((w, i) => {
          w.rotation.z = (i === 0 ? 1 : -1) * Math.sin(t * 3) * 0.3;
        });
        break;
      }
      case 'dragon': {
        // Wing flap + fire breathing cycle
        const wings = g.userData.wings || [];
        wings.forEach((w, i) => {
          w.rotation.z = (i === 0 ? 1 : -1) * Math.sin(t * 2.5) * 0.5;
        });
        const fireLight = g.userData.fireLight;
        if (fireLight) {
          const fireCycle = Math.sin(t * 1.2);
          fireLight.intensity = fireCycle > 0.5 ? 2 : 0;
        }
        break;
      }
    }
  }

  // ── Material helper ──
  _m(c, o = {}) { return new this.T.MeshStandardMaterial({ color: c, ...o }); }

  // ═══════════════════════════════════════════════════════
  //  BEAST BUILDERS
  // ═══════════════════════════════════════════════════════

  _buildMinotaur(g) {
    const T = this.T;
    const br = this._m(0x8B4513), dk = this._m(0x5C3317);
    const em = this._m(0xff0000, { emissive: 0xff0000, emissiveIntensity: 0.8 });

    // Body (large humanoid)
    const body = new T.Mesh(new T.BoxGeometry(1.2, 1.6, 0.8), br);
    body.position.set(0, 1.6, 0); g.add(body);

    // Bull head
    const head = new T.Mesh(new T.BoxGeometry(0.7, 0.7, 0.6), br);
    head.position.set(0, 2.7, 0); g.add(head);

    // Horns
    const hg = new T.ConeGeometry(0.08, 0.6, 6);
    [-1, 1].forEach(s => {
      const horn = new T.Mesh(hg, this._m(0xDEB887));
      horn.position.set(s * 0.2, 3.2, 0);
      horn.rotation.z = s * -0.4;
      g.add(horn);
    });

    // Eyes
    [-1, 1].forEach(s => {
      const eye = new T.Mesh(new T.SphereGeometry(0.06, 6, 6), em);
      eye.position.set(s * 0.2, 2.8, 0.3);
      g.add(eye);
    });

    // Arms
    [-1, 1].forEach(s => {
      const arm = new T.Mesh(new T.BoxGeometry(0.3, 1.2, 0.3), br);
      arm.position.set(s * 0.9, 1.4, 0);
      g.add(arm);
    });

    // Legs
    [-1, 1].forEach(s => {
      const leg = new T.Mesh(new T.BoxGeometry(0.35, 1.0, 0.35), dk);
      leg.position.set(s * 0.35, 0.5, 0);
      g.add(leg);
    });
  }

  _buildHydra(g) {
    const T = this.T;
    const gr = this._m(0x2E8B57);
    const em = this._m(0xff0000, { emissive: 0xff0000, emissiveIntensity: 0.8 });

    // 5 body segments
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const seg = new T.Mesh(new T.SphereGeometry(0.4 - i * 0.04, 8, 6), gr);
      seg.position.set(0, 1.0 + i * 0.5, -i * 0.5);
      g.add(seg);
      segs.push(seg);
    }
    g.userData.segs = segs;

    // 3 heads
    const heads = [];
    for (let h = 0; h < 3; h++) {
      const headGroup = new T.Group();
      const neck = new T.Mesh(new T.SphereGeometry(0.2, 6, 6), gr);
      neck.position.set(0, 3.4, -2.0);
      neck.position.x += (h - 1) * 0.5;
      headGroup.add(neck);

      // Skull
      const skull = new T.Mesh(new T.ConeGeometry(0.25, 0.5, 6), gr);
      skull.position.y = 0.4;
      skull.rotation.x = Math.PI;
      headGroup.add(skull);

      // Eyes
      [-1, 1].forEach(s => {
        const eye = new T.Mesh(new T.SphereGeometry(0.05, 6, 6), em);
        eye.position.set(s * 0.12, 0.3, -0.15);
        headGroup.add(eye);
      });

      g.add(headGroup);
      heads.push(headGroup);
    }
    g.userData.heads = heads;
  }

  _buildPegasus(g) {
    const T = this.T;
    const w = this._m(0xF5F5DC);
    const em = this._m(0x333333);

    // Body
    const body = new T.Mesh(new T.BoxGeometry(1.8, 0.9, 0.7), w);
    body.position.set(0, 2.0, 0); g.add(body);

    // Neck + head
    const neck = new T.Mesh(new T.BoxGeometry(0.35, 0.8, 0.35), w);
    neck.position.set(0, 2.7, -0.7); neck.rotation.x = 0.5; g.add(neck);

    const head = new T.Mesh(new T.BoxGeometry(0.5, 0.35, 0.5), w);
    head.position.set(0, 3.15, -1.0); g.add(head);

    // Eyes
    [-1, 1].forEach(s => {
      const eye = new T.Mesh(new T.SphereGeometry(0.04, 6, 6), em);
      eye.position.set(s * 0.15, 3.2, -1.25);
      g.add(eye);
    });

    // Wings
    const wg = new T.PlaneGeometry(2.0, 1.0);
    const wm = this._m(0xFFFFFF, { side: T.DoubleSide, transparent: true, opacity: 0.9 });
    const wl = new T.Mesh(wg, wm);
    wl.position.set(-1.2, 2.5, 0); wl.rotation.y = -0.3;
    g.add(wl);
    const wr = new T.Mesh(wg, wm);
    wr.position.set(1.2, 2.5, 0); wr.rotation.y = 0.3;
    g.add(wr);
    g.userData.wings = [wl, wr];

    // Legs
    const legG = new T.BoxGeometry(0.15, 1.0, 0.15);
    [[-0.5, 0.4], [0.5, 0.4], [-0.5, -0.4], [0.5, -0.4]].forEach(([x, z]) => {
      const leg = new T.Mesh(legG, w);
      leg.position.set(x, 1.0, z);
      g.add(leg);
    });

    // Tail
    const tail = new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 0.8, 6), w);
    tail.position.set(0, 1.8, 0.6); tail.rotation.x = 0.8;
    g.add(tail);
  }

  _buildManticore(g) {
    const T = this.T;
    const og = this._m(0xD2691E);
    const dk = this._m(0x4A3520);
    const em = this._m(0xff0000, { emissive: 0xff0000, emissiveIntensity: 0.8 });

    // Lion body
    const body = new T.Mesh(new T.BoxGeometry(1.6, 0.8, 0.7), og);
    body.position.set(0, 1.0, 0); g.add(body);

    // Head
    const head = new T.Mesh(new T.BoxGeometry(0.6, 0.5, 0.5), og);
    head.position.set(0, 1.5, -0.7); g.add(head);

    // Eyes
    [-1, 1].forEach(s => {
      const eye = new T.Mesh(new T.SphereGeometry(0.05, 6, 6), em);
      eye.position.set(s * 0.15, 1.55, -0.97);
      g.add(eye);
    });

    // Mane
    const mane = new T.Mesh(new T.TorusGeometry(0.4, 0.15, 6, 8), dk);
    mane.position.set(0, 1.6, -0.5); mane.rotation.x = Math.PI / 2;
    g.add(mane);

    // Legs
    const legG = new T.BoxGeometry(0.2, 0.8, 0.2);
    [[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.3], [0.5, -0.3]].forEach(([x, z]) => {
      const leg = new T.Mesh(legG, og);
      leg.position.set(x, 0.4, z);
      g.add(leg);
    });

    // Scorpion tail
    const tailSegs = [];
    for (let i = 0; i < 6; i++) {
      const seg = new T.Mesh(new T.SphereGeometry(0.08 - i * 0.005, 6, 6), dk);
      seg.position.set(0, 1.2 + i * 0.2, 0.5 + i * 0.2);
      seg.rotation.x = -0.3;
      g.add(seg);
      tailSegs.push(seg);
    }
    // Stinger
    const sting = new T.Mesh(new T.ConeGeometry(0.05, 0.2, 5), em);
    sting.position.set(0, 2.5, 1.8);
    sting.rotation.x = Math.PI;
    g.add(sting);
    g.userData.tailSegs = tailSegs;

    // Bat wings
    const wg = new T.PlaneGeometry(2.5, 1.0);
    const wm = this._m(0x3B2020, { side: T.DoubleSide, transparent: true, opacity: 0.85 });
    const wl = new T.Mesh(wg, wm);
    wl.position.set(-1.5, 1.5, 0); wl.rotation.y = -0.2;
    g.add(wl);
    const wr = new T.Mesh(wg, wm);
    wr.position.set(1.5, 1.5, 0); wr.rotation.y = 0.2;
    g.add(wr);
    g.userData.wings = [wl, wr];
  }

  _buildDragon(g) {
    const T = this.T;
    const rg = this._m(0xB22222);
    const gd = this._m(0xDAA520);
    const em = this._m(0xff4400, { emissive: 0xff4400, emissiveIntensity: 1.2 });

    // Body
    const body = new T.Mesh(new T.BoxGeometry(2.0, 1.2, 1.0), gd);
    body.position.set(0, 2.0, 0); g.add(body);

    // Neck
    const neck = new T.Mesh(new T.BoxGeometry(0.5, 0.8, 0.5), rg);
    neck.position.set(0, 2.8, -0.8); neck.rotation.x = 0.5; g.add(neck);

    // Head
    const head = new T.Mesh(new T.BoxGeometry(0.7, 0.5, 0.6), rg);
    head.position.set(0, 3.2, -1.4); g.add(head);

    // Eyes
    [-1, 1].forEach(s => {
      const eye = new T.Mesh(new T.SphereGeometry(0.07, 6, 6), em);
      eye.position.set(s * 0.2, 3.3, -1.73);
      g.add(eye);
    });

    // Spiky ridges
    const sg = new T.ConeGeometry(0.1, 0.5, 5);
    for (let i = 0; i < 6; i++) {
      const spine = new T.Mesh(sg, gd);
      spine.position.set(0, 2.6 + Math.sin(i * 0.5) * 0.15, -0.3 + i * 0.5);
      g.add(spine);
    }

    // Wings
    const wg = new T.PlaneGeometry(3.0, 1.2);
    const wm = this._m(0x8B0000, { side: T.DoubleSide, transparent: true, opacity: 0.9 });
    const wl = new T.Mesh(wg, wm);
    wl.position.set(-1.8, 2.8, 0.2); wl.rotation.y = -0.2;
    g.add(wl);
    const wr = new T.Mesh(wg, wm);
    wr.position.set(1.8, 2.8, 0.2); wr.rotation.y = 0.2;
    g.add(wr);
    g.userData.wings = [wl, wr];

    // Tail (chain of spheres)
    const tailSegs = [];
    for (let i = 0; i < 5; i++) {
      const seg = new T.Mesh(new T.SphereGeometry(0.2 - i * 0.02, 6, 6), rg);
      seg.position.set(0, 1.8 - i * 0.1, 1.0 + i * 0.4);
      g.add(seg);
      tailSegs.push(seg);
    }
    g.userData.tailSegs = tailSegs;

    // Legs
    const legG = new T.BoxGeometry(0.25, 1.0, 0.25);
    [[-0.7, 0.3], [0.7, 0.3], [-0.7, -0.3], [0.7, -0.3]].forEach(([x, z]) => {
      const leg = new T.Mesh(legG, rg);
      leg.position.set(x, 0.5, z);
      g.add(leg);
    });

    // Fire light
    const fireLight = new T.PointLight(0xff4400, 0, 8);
    fireLight.position.set(0, 3.2, -2.0);
    g.add(fireLight);
    g.userData.fireLight = fireLight;
  }
}
