/**
 * upgrades3d.js — 3D upgrade/construction visual effects for Emperor's Conquest.
 * 5 effect types with timed animations and automatic cleanup.
 */
import { TERRITORIES, EMPIRES } from './map.js';

const { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, PointLight,
  BoxGeometry, PlaneGeometry, SphereGeometry, CylinderGeometry,
  BufferGeometry, Float32BufferAttribute, Color, Points, PointsMaterial,
  Sprite, SpriteMaterial, AdditiveBlending, DoubleSide } = THREE;

const WS = 0.1;
const _pos = tid => { const t = TERRITORIES[tid]; return { x: t.cx * WS - 48, z: t.cy * WS - 32 }; };

// Shared geometries
const G = {
  pole: new CylinderGeometry(0.02, 0.02, 2, 6),
  beam: new BoxGeometry(0.6, 0.02, 0.02),
  brick: new BoxGeometry(0.08, 0.08, 0.08),
  dust: new SphereGeometry(0.015, 4, 4),
  block: new BoxGeometry(0.12, 0.06, 0.06),
  crane: new CylinderGeometry(0.03, 0.03, 3, 6),
  craneArm: new BoxGeometry(1.2, 0.04, 0.04),
  wBody: new BoxGeometry(0.06, 0.12, 0.04),
  wHead: new SphereGeometry(0.04, 6, 6),
  beamCyl: new CylinderGeometry(0.15, 0.08, 4, 8, 1, true),
  scroll: new PlaneGeometry(0.8, 0.5),
  coin: new CylinderGeometry(0.05, 0.05, 0.02, 8),
  icon: new BoxGeometry(0.1, 0.1, 0.1),
};

// ── Animation tracker ──
class Anim {
  constructor(group, dur, onDone) {
    this.group = group; this.t = 0; this.dur = dur; this.done = false; this.onDone = onDone;
  }
  tick(dt) {
    this.t += dt;
    const p = Math.min(1, this.t / this.dur);
    if (p >= 1) { this.done = true; this.onDone?.(); }
    return p;
  }
}

// Helper: create a sprite from text
function _textSprite(text, color = '#ffdd00') {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
  const cx = cv.getContext('2d'); cx.fillStyle = color; cx.font = 'bold 24px Arial';
  cx.fillText(text, 4, 24);
  return new Sprite(new SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
}

// Helper: point cloud from positions array
function _points(positions, color, size, blending = AdditiveBlending) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(geo, new PointsMaterial({
    color, size, transparent: true, opacity: 1, blending, depthWrite: false
  }));
}

export class Upgrades3D {
  constructor(renderer) {
    this.scene = renderer._scene;
    this.g = renderer.g;
    this.anims = [];
  }

  update(dt) {
    for (const a of this.anims) a.tick(dt);
    const dead = this.anims.filter(a => a.done);
    for (const a of dead) { this._purge(a.group); this.scene.remove(a.group); }
    this.anims = this.anims.filter(a => !a.done);
  }

  startConstruction(terrId, type) {
    const p = _pos(terrId);
    ({ construction: () => this._construction(p), fortification: () => this._fortification(p),
       wonder: () => this._wonder(p), tech: () => this._tech(p), resource: () => this._resource(p),
    }[type] || this._construction(p))();
  }

  applyUpgrade(terrId, upgrade) { this.startConstruction(terrId, upgrade); }

  // 1. CONSTRUCTION — scaffolding + rising bricks + dust
  _construction(p) {
    const g = new Group(); g.position.set(p.x, 0, p.z);
    const sc = new MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });
    const corners = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
    // Scaffold poles + beams
    for (const [cx, cz] of corners) {
      const pole = new Mesh(G.pole, sc.clone()); pole.position.set(cx, 1, cz); g.add(pole);
    }
    for (const [a, b] of [[0,1],[2,3],[0,2],[1,3]]) {
      const bm = new Mesh(G.beam, sc.clone());
      bm.position.set((corners[a][0]+corners[b][0])/2, 2, (corners[a][1]+corners[b][1])/2);
      if (Math.abs(corners[a][1]-corners[b][1]) > 0.01) bm.rotation.y = Math.PI/2;
      g.add(bm);
    }
    // Rising bricks
    const bricks = [];
    for (let i = 0; i < 12; i++) {
      const br = new Mesh(G.brick, new MeshStandardMaterial({ color: 0x996644, roughness: 0.8 }));
      br.position.set((Math.random()-0.5)*0.5, -0.5-Math.random()*1.5, (Math.random()-0.5)*0.5);
      br.userData.ty = 0.2 + Math.random()*1.6; br.userData.dl = Math.random()*0.4;
      g.add(br); bricks.push(br);
    }
    // Dust particles
    const dust = [];
    for (let i = 0; i < 15; i++) {
      const d = new Mesh(G.dust, new MeshBasicMaterial({ color: 0xccbb99, transparent: true, opacity: 0.7 }));
      d.position.set((Math.random()-0.5)*0.6, 0, (Math.random()-0.5)*0.6);
      d.userData.vy = 0.3+Math.random()*0.5; g.add(d); dust.push(d);
    }
    this.scene.add(g);
    const a = new Anim(g, 3); a._br = bricks; a._du = dust;
    a.tick = dt => {
      const t = Anim.prototype.tick.call(a, dt);
      for (const br of a._br) { if (t >= br.userData.dl) br.position.y += (br.userData.ty - br.position.y)*0.15; }
      for (const d of a._du) { d.position.y += d.userData.vy*dt; d.material.opacity = Math.max(0,1-t); }
      if (t > 0.85) g.children.forEach(c => { if(c.material?.opacity!==undefined) c.material.opacity *= 0.92; });
      return t;
    };
    this.anims.push(a);
  }

  // 2. FORTIFICATION — golden flash + blocks + sparkle
  _fortification(p) {
    const g = new Group(); g.position.set(p.x, 0, p.z);
    const blocks = [];
    for (let i = 0; i < 8; i++) {
      const bl = new Mesh(G.block, new MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.3 }));
      bl.material.emissive = new Color(0xffaa00); bl.material.emissiveIntensity = 2;
      bl.position.set((Math.random()-0.5)*0.6, 0.8+i*0.08, (Math.random()-0.5)*0.6);
      bl.visible = false; g.add(bl); blocks.push(bl);
    }
    const sp = new Float32Array(120);
    for (let i = 0; i < 40; i++) { sp[i*3]=(Math.random()-0.5)*1.2; sp[i*3+1]=0.5+Math.random()*2; sp[i*3+2]=(Math.random()-0.5)*1.2; }
    const pts = _points(sp, 0xffdd44, 0.06); g.add(pts);
    const lt = new PointLight(0xffaa00, 3, 4); lt.position.y = 1.5; g.add(lt);
    this.scene.add(g);
    const a = new Anim(g, 2); a._bl = blocks; a._pts = pts; a._lt = lt;
    a.tick = dt => {
      const t = Anim.prototype.tick.call(a, dt);
      for (let i = 0; i < a._bl.length; i++) {
        if (t > i*0.1) { a._bl[i].visible = true; a._bl[i].material.emissiveIntensity = Math.max(0,(1-(t-i*0.1)*2))*2; }
      }
      a._lt.intensity = 3*Math.max(0,1-t*1.5); a._pts.material.opacity = Math.max(0,1-t);
      return t;
    };
    this.anims.push(a);
  }

  // 3. WONDER — cranes + workers + golden beam + building stages
  _wonder(p) {
    const g = new Group(); g.position.set(p.x, 0, p.z);
    // Crane
    const crane = new Group();
    const _cr = new Mesh(G.crane, new MeshStandardMaterial({ color: 0x666666, metalness: 0.5 })); _cr.position.set(0, 1.5, 0); crane.add(_cr);
    const _ca = new Mesh(G.craneArm, new MeshStandardMaterial({ color: 0x888800, metalness: 0.4 })); _ca.position.set(0.4, 3, 0); crane.add(_ca);
    g.add(crane);
    // Workers orbit
    const workers = [];
    for (let i = 0; i < 5; i++) {
      const wg = new Group();
      const body = new Mesh(G.wBody, new MeshStandardMaterial({ color: 0x885533 })); body.position.y = 0.06; wg.add(body);
      const head = new Mesh(G.wHead, new MeshStandardMaterial({ color: 0xddbb99 })); head.position.y = 0.16; wg.add(head);
      wg.userData.ang = (i/5)*Math.PI*2; wg.userData.r = 0.4+Math.random()*0.3;
      wg.position.set(Math.cos(wg.userData.ang)*wg.userData.r, 0, Math.sin(wg.userData.ang)*wg.userData.r);
      g.add(wg); workers.push(wg);
    }
    // Golden beam
    const _bm = new Mesh(G.beamCyl, new MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.25, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })); _bm.position.set(0, 2, 0); g.add(_bm);
    // Building stages
    const base = new Mesh(new BoxGeometry(1.2,0.3,1.2), new MeshStandardMaterial({ color: 0xccaa88, transparent: true }));
    base.position.y = 0.15; base.visible = false; g.add(base);
    const pillars = [];
    for (let i = 0; i < 4; i++) {
      const pil = new Mesh(new CylinderGeometry(0.06,0.06,1.4,6), new MeshStandardMaterial({ color: 0xeeeedd }));
      pil.position.set(i%2===0?-0.45:0.45, 1.0, i<2?-0.45:0.45); pil.visible = false; g.add(pil); pillars.push(pil);
    }
    const roof = new Mesh(new BoxGeometry(1.4,0.12,1.4), new MeshStandardMaterial({ color: 0xddcc99, metalness: 0.2 }));
    roof.position.y = 1.76; roof.visible = false; g.add(roof);
    this.scene.add(g);
    const a = new Anim(g, 5); a._w = workers; a._cr = crane; a._base = base; a._pil = pillars; a._roof = roof;
    a.tick = dt => {
      const t = Anim.prototype.tick.call(a, dt);
      a._cr.rotation.y = t*Math.PI*2;
      for (const w of a._w) { w.userData.ang += dt*1.5; w.position.x = Math.cos(w.userData.ang)*w.userData.r; w.position.z = Math.sin(w.userData.ang)*w.userData.r; }
      base.visible = t > 0.15; base.material.opacity = Math.min(1,(t-0.15)*5);
      for (let i = 0; i < pillars.length; i++) {
        if (t > 0.35+i*0.08) { pillars[i].visible = true; pillars[i].scale.y = Math.min(1,(t-0.35-i*0.08)*6); }
      }
      roof.visible = t > 0.7;
      return t;
    };
    this.anims.push(a);
  }

  // 4. TECH — scroll unrolling + runes + blue particles
  _tech(p) {
    const g = new Group(); g.position.set(p.x, 1.2, p.z);
    const scrollMat = new MeshStandardMaterial({ color: 0xf5e6c8, side: DoubleSide, transparent: true, opacity: 0.9 });
    const scroll = new Mesh(G.scroll, scrollMat); scroll.rotation.x = -0.4; g.add(scroll);
    const runes = [];
    for (let i = 0; i < 6; i++) {
      const sp = new Sprite(new SpriteMaterial({ color: 0x44aaff, transparent: true, opacity: 0, blending: AdditiveBlending }));
      sp.scale.set(0.1, 0.1, 0.1); sp.position.set(-0.25+i*0.1, (Math.random()-0.5)*0.2, 0.02);
      sp.userData.dl = 0.3+i*0.15; g.add(sp); runes.push(sp);
    }
    const pp = new Float32Array(90);
    for (let i = 0; i < 30; i++) { pp[i*3]=(Math.random()-0.5)*0.6; pp[i*3+2]=(Math.random()-0.5)*0.3; }
    const pts = _points(pp, 0x66ccff, 0.04); g.add(pts);
    this.scene.add(g);
    const a = new Anim(g, 2); a._sc = scroll; a._ru = runes; a._pts = pts;
    a.tick = dt => {
      const t = Anim.prototype.tick.call(a, dt);
      scroll.scale.x = Math.min(1, t*3);
      for (const r of a._ru) { if(t>r.userData.dl) r.material.opacity = Math.min(1,(t-r.userData.dl)*4)*(1-Math.max(0,t-0.7)*3); }
      const arr = pts.geometry.attributes.position.array;
      for (let i = 0; i < 30; i++) arr[i*3+1] += dt*(0.5+Math.random()*0.3);
      pts.geometry.attributes.position.needsUpdate = true;
      pts.material.opacity = Math.max(0,1-t);
      scroll.material.opacity = Math.max(0,1-Math.max(0,t-0.75)*4);
      return t;
    };
    this.anims.push(a);
  }

  // 5. RESOURCE BONUS — floating icons + coins + text
  _resource(p) {
    const g = new Group(); g.position.set(p.x, 0, p.z);
    const _ic = new Mesh(G.icon, new MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 })); _ic.position.set(0, 0.5, 0); g.add(_ic);
    const coins = [];
    for (let i = 0; i < 6; i++) {
      const c = new Mesh(G.coin, new MeshStandardMaterial({
        color: 0xffdd22, metalness: 0.8, roughness: 0.2, emissive: 0x886600, emissiveIntensity: 0.3
      }));
      c.position.set((Math.random()-0.5)*0.4, 0.3+Math.random()*0.3, (Math.random()-0.5)*0.4);
      c.userData.sp = 3+Math.random()*3; g.add(c); coins.push(c);
    }
    const txt = _textSprite('+100 Gold'); txt.scale.set(0.6, 0.15, 1); txt.position.y = 0.8; g.add(txt);
    this.scene.add(g);
    const a = new Anim(g, 1.5); a._co = coins; a._tx = txt;
    a.tick = dt => {
      const t = Anim.prototype.tick.call(a, dt);
      g.position.y = t*1.5;
      for (const c of a._co) { c.rotation.x += c.userData.sp*dt; c.position.y += dt*0.3; }
      a._tx.material.opacity = Math.max(0,1-t*t);
      return t;
    };
    this.anims.push(a);
  }

  _purge(group) {
    group.traverse(c => {
      if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
      if (c.geometry && !Object.values(G).includes(c.geometry)) c.geometry.dispose();
    });
  }

  dispose() {
    for (const a of this.anims) { this._purge(a.group); this.scene.remove(a.group); }
    this.anims.length = 0;
  }
}
