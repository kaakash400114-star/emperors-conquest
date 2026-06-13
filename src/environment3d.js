/**
 * environment3d.js — Ambient 3D environment effects for Emperor's Conquest.
 * Campfires, torches, lava flows, waterfalls, smoke chimneys.
 * Night-only campfires/torches with dayFactor fade.
 */

import { TERRITORIES, EMPIRES } from './map.js';

const { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
        BoxGeometry, SphereGeometry, CylinderGeometry, PointLight,
        MathUtils } = THREE;

const WS = 0.1;
const TERRAIN_H = { plains:1, desert:0.6, mountains:3.5, coast:0.3,
                     island:0.4, forest:1.6, peninsula:0.8 };

function _pos(tid) {
    const t = TERRITORIES[tid];
    return { x: t.cx * WS - 48, z: t.cy * WS - 32 };
}

// ── Shared geometries & materials ──
const GEO = {
    log:        new BoxGeometry(0.06, 0.06, 0.3),
    spark:      new SphereGeometry(0.04, 5, 4),
    torchPole:  new CylinderGeometry(0.02, 0.02, 0.5, 5),
    flame:      new BoxGeometry(0.04, 0.08, 0.04),
    lava:       new BoxGeometry(0.1, 0.05, 0.3),
    drop:       new SphereGeometry(0.03, 5, 4),
    mist:       new SphereGeometry(0.15, 6, 5),
    chimney:    new CylinderGeometry(0.03, 0.03, 0.3, 5),
    smoke:      new SphereGeometry(0.06, 5, 4),
};
const MAT = {
    log:     new MeshStandardMaterial({ color: 0x4A3218, roughness: 0.9 }),
    fire:    new MeshBasicMaterial({ color: 0xff6600, transparent: true }),
    pole:    new MeshStandardMaterial({ color: 0x5C4033 }),
    flame:   new MeshBasicMaterial({ color: 0xff8833 }),
    lava:    new MeshBasicMaterial({ color: 0xff4400 }),
    water:   new MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 }),
    mist:    new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
    chimney: new MeshStandardMaterial({ color: 0x555555 }),
    smoke:   new MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.4 }),
};
// Shared materials we clone — skip dispose for these
const SHARED = new Set(Object.values(MAT));

// ── CAMPFIRE: hexagonal log ring + sparks + orange light ──
function _createCampfire(tid) {
    const p = _pos(tid), g = new Group();
    g.userData = { type: 'campfire', tid, sparks: [] };
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const log = new Mesh(GEO.log, MAT.log);
        log.position.set(Math.cos(a) * 0.12, 0.03, Math.sin(a) * 0.12);
        log.rotation.y = a + 0.5;
        g.add(log);
    }
    const light = new PointLight(0xff6600, 1.5, 3);
    light.position.y = 0.15;
    g.add(light);
    g.userData.light = light;
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
        const s = new Mesh(GEO.spark, MAT.fire.clone());
        s.userData.phase = Math.random() * Math.PI * 2;
        s.userData.speed = 0.4 + Math.random() * 0.3;
        s.position.set((Math.random() - 0.5) * 0.08, 0.08 + Math.random() * 0.1,
                        (Math.random() - 0.5) * 0.08);
        g.add(s);
        g.userData.sparks.push(s);
    }
    g.position.set(p.x, 0, p.z);
    return g;
}

// ── TORCHES: 2 torches per territory ──
function _createTorches(tid) {
    const p = _pos(tid), g = new Group();
    g.userData = { type: 'torches', tid, flames: [], lights: [] };
    const offs = [[-0.35, -0.15], [0.35, -0.15]];
    for (const [ox, oz] of offs) {
        const tg = new Group();
        const pole = new Mesh(GEO.torchPole, MAT.pole);
        pole.position.y = 0.25; tg.add(pole);
        const fl = new Mesh(GEO.flame, MAT.flame.clone());
        fl.position.y = 0.54;
        fl.userData.phase = Math.random() * Math.PI * 2;
        tg.add(fl);
        const lt = new PointLight(0xff8833, 0.8, 2);
        lt.position.y = 0.56; tg.add(lt);
        g.userData.flames.push(fl);
        g.userData.lights.push(lt);
        tg.position.set(ox, 0, oz);
        g.add(tg);
    }
    g.position.set(p.x, 0, p.z);
    return g;
}

// ── LAVA FLOW: winding emissive segments down mountain ──
function _createLava(tid) {
    const p = _pos(tid);
    const bH = TERRAIN_H[TERRITORIES[tid].terrain] || 3.5;
    const g = new Group();
    g.userData = { type: 'lava', tid, segs: [] };
    for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const seg = new Mesh(GEO.lava, MAT.lava.clone());
        seg.position.set(Math.sin(t * Math.PI * 2.5) * 0.3,
                         bH * (1 - t * 0.7) - 0.025,
                         Math.cos(t * Math.PI * 1.8) * 0.2);
        seg.rotation.y = Math.sin(t * Math.PI * 2) * 0.5;
        g.add(seg);
        g.userData.segs.push(seg);
    }
    const lt = new PointLight(0xff4400, 2, 4);
    lt.position.y = bH * 0.9; g.add(lt);
    g.userData.light = lt;
    g.position.set(p.x, 0, p.z);
    return g;
}

// ── WATERFALL: falling drops + mist at base ──
function _createWaterfall(tid) {
    const p = _pos(tid);
    const bH = TERRAIN_H[TERRITORIES[tid].terrain] || 3.5;
    const g = new Group();
    g.userData = { type: 'waterfall', tid, drops: [], mists: [] };
    const n = 15 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
        const d = new Mesh(GEO.drop, MAT.water.clone());
        d.userData.phase = Math.random();
        d.userData.drift = (Math.random() - 0.5) * 0.04;
        d.userData.speed = 0.5 + Math.random() * 0.4;
        d.position.set((Math.random() - 0.5) * 0.15,
                        bH * (0.3 + Math.random() * 0.6),
                        (Math.random() - 0.5) * 0.08);
        g.add(d); g.userData.drops.push(d);
    }
    for (let i = 0; i < 5; i++) {
        const m = new Mesh(GEO.mist, MAT.mist.clone());
        m.userData.phase = Math.random() * Math.PI * 2;
        m.position.set((Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.15,
                        (Math.random() - 0.5) * 0.2);
        g.add(m); g.userData.mists.push(m);
    }
    const lt = new PointLight(0x4488ff, 0.5, 3);
    lt.position.y = 0.2; g.add(lt);
    g.position.set(p.x, 0, p.z);
    return g;
}

// ── SMOKE CHIMNEY: rising expanding puffs ──
function _createSmoke(tid) {
    const p = _pos(tid), g = new Group();
    g.userData = { type: 'smoke', tid, puffs: [] };
    const ch = new Mesh(GEO.chimney, MAT.chimney);
    ch.position.set(0.15, 0.95, 0); g.add(ch);
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
        const pf = new Mesh(GEO.smoke, MAT.smoke.clone());
        pf.userData.phase = (i / n) * Math.PI * 2;
        pf.userData.bx = 0.15; pf.userData.by = 1.1;
        g.add(pf); g.userData.puffs.push(pf);
    }
    g.position.set(p.x, 0, p.z);
    return g;
}

// ═══════════════════════════════════════════════════════════════════
//  ENVIRONMENT3D CLASS
// ═══════════════════════════════════════════════════════════════════
export class Environment3D {
    constructor(renderer) {
        this.r = renderer;
        this.scene = renderer._scene;
        this.g = renderer.g;
        this.dn = renderer.dayNight3d;
        this.campfires = new Map();
        this.torches = new Map();
        this.lavas = new Map();
        this.waterfalls = new Map();
        this.smokes = new Map();

        // Pre-identify static terrain effects
        this._mtnIds = [];
        this._wfIds = [];
        for (const t of TERRITORIES) {
            if (t.terrain === 'mountains') {
                this._mtnIds.push(t.id);
                if (t.adj.some(a => { const at = TERRITORIES[a]; return at && (at.terrain === 'coast' || at.terrain === 'island'); }))
                    this._wfIds.push(t.id);
            }
        }
    }

    update(dt) {
        const ts = this.g.ts;
        if (!ts) return;
        const time = performance.now() * 0.001;
        const dayF = this.dn ? this.dn.dayFactor : 1;
        const nightFade = MathUtils.smoothstep(0.6, 0.2, dayF);

        // ── Sync dynamic effects ──
        for (const t of TERRITORIES) {
            const st = ts[t.id];
            const tr = st ? (st.troops || 0) : 0;
            const own = st ? st.owner : null;
            if (tr > 10 && own) { if (!this.campfires.has(t.id)) { this._add(this.campfires, _createCampfire(t.id)); } }
            else this._del(t.id, this.campfires);
            if (tr >= 50 && own) { if (!this.torches.has(t.id)) { this._add(this.torches, _createTorches(t.id)); } }
            else this._del(t.id, this.torches);
            if (tr >= 100 && own) { if (!this.smokes.has(t.id)) { this._add(this.smokes, _createSmoke(t.id)); } }
            else this._del(t.id, this.smokes);
        }

        // ── Static terrain effects ──
        for (const mid of this._mtnIds) { if (!this.lavas.has(mid)) this._add(this.lavas, _createLava(mid)); }
        for (const wid of this._wfIds) { if (!this.waterfalls.has(wid)) this._add(this.waterfalls, _createWaterfall(wid)); }

        // ── Animate ──
        for (const [, cf] of this.campfires) {
            cf.visible = nightFade > 0.01;
            cf.userData.light.intensity = 1.5 * nightFade;
            for (const s of cf.userData.sparks) {
                const p = s.userData.phase + time * s.userData.speed;
                s.position.y = 0.08 + (Math.sin(p) * 0.5 + 0.5) * 0.35;
                s.material.opacity = nightFade * Math.max(0, 1 - (s.position.y - 0.08) / 0.43);
                s.position.x = Math.sin(p * 1.3 + 1) * 0.06;
            }
        }
        for (const [, tp] of this.torches) {
            tp.visible = nightFade > 0.01;
            const { flames, lights } = tp.userData;
            for (let i = 0; i < flames.length; i++) {
                const f = flames[i], ph = f.userData.phase;
                const fl = 0.8 + Math.sin(time * 8 + ph) * 0.15 + Math.sin(time * 13 + ph * 2) * 0.1;
                f.scale.set(fl, 1 + Math.sin(time * 10 + ph) * 0.2, fl);
                f.material.opacity = nightFade;
                lights[i].intensity = 0.8 * nightFade * fl;
            }
        }
        for (const [, lf] of this.lavas) {
            for (let i = 0; i < lf.userData.segs.length; i++) {
                const seg = lf.userData.segs[i];
                const pulse = 0.7 + Math.sin(time * 1.5 + i * 0.8) * 0.3;
                seg.material.color.setRGB(1, 0.27 * pulse, 0);
            }
            lf.userData.light.intensity = 2 + Math.sin(time * 2) * 0.5;
        }
        for (const [, wf] of this.waterfalls) {
            const bH = TERRAIN_H[TERRITORIES[wf.userData.tid].terrain] || 3.5;
            for (const d of wf.userData.drops) {
                d.userData.phase = (d.userData.phase + 0.016 * d.userData.speed) % 1;
                const t = d.userData.phase;
                d.position.y = bH * (0.7 - t * 0.65);
                d.position.x += d.userData.drift * 0.016;
                if (Math.abs(d.position.x) > 0.25) d.position.x *= -0.5;
                d.material.opacity = 0.5 + Math.sin(t * Math.PI) * 0.3;
            }
            for (const m of wf.userData.mists) {
                m.scale.setScalar(1 + Math.sin(time * 0.8 + m.userData.phase) * 0.2);
                m.material.opacity = 0.15 + Math.sin(time * 0.6 + m.userData.phase) * 0.1;
            }
        }
        for (const [, sc] of this.smokes) {
            for (const pf of sc.userData.puffs) {
                const p = pf.userData.phase + time * 0.5;
                const c = (p % (Math.PI * 2)) / (Math.PI * 2);
                pf.position.y = pf.userData.by + c * 0.8;
                pf.position.x = pf.userData.bx + Math.sin(p * 1.5) * 0.08;
                pf.scale.setScalar(0.5 + c * 1.5);
                pf.material.opacity = 0.4 * (1 - c);
            }
        }
    }

    _add(map, obj) { this.scene.add(obj); map.set(obj.userData.tid, obj); }

    _del(tid, map) {
        const obj = map.get(tid);
        if (!obj) return;
        this.scene.remove(obj);
        obj.traverse(c => { if (c.material && !SHARED.has(c.material)) c.material.dispose(); });
        map.delete(tid);
    }

    dispose() {
        for (const m of [this.campfires, this.torches, this.lavas, this.waterfalls, this.smokes])
            for (const [tid] of m) this._del(tid, m);
    }
}
