/**
 * vegetation3d.js — Procedural 3D vegetation for Emperor's Conquest.
 * Trees (oak, pine, birch, palm), grass, flowers, rocks per terrain type.
 * Wind sway animation, shared geometries/materials for performance.
 */

const { Group, Mesh, MeshLambertMaterial,
        BoxGeometry, SphereGeometry, ConeGeometry, CylinderGeometry,
        PlaneGeometry, DodecahedronGeometry, DoubleSide } = THREE;

import { TERRITORIES } from './map.js';

const WS = 0.1;
const TERRAIN_H = { plains:1, desert:0.6, mountains:3.5, coast:0.3, island:0.4, forest:1.6, peninsula:0.8 };
const FLOWER_WARM = [0xE53935, 0xFDD835, 0x8E24AA, 0xF06292, 0xFF7043];
const FLOWER_TROPICAL = [0xE91E63, 0xFFEB3B, 0x7C4DFF, 0x00BCD4, 0xFF9800];

// ── Shared geometries ──
const G = {
    oakTrunk: new CylinderGeometry(0.06, 0.08, 0.6, 6),
    oakCanopy: new SphereGeometry(0.35, 7, 5),
    pineTrunk: new CylinderGeometry(0.04, 0.06, 0.8, 6),
    pineFoliage: new ConeGeometry(0.25, 0.7, 6),
    birchTrunk: new CylinderGeometry(0.05, 0.05, 0.7, 6),
    birchCanopy: new SphereGeometry(0.3, 7, 5),
    palmSeg: new CylinderGeometry(0.05, 0.07, 0.5, 6),
    palmLeaf: new PlaneGeometry(0.45, 0.12),
    deadTrunk: new CylinderGeometry(0.04, 0.06, 0.5, 5),
    deadBranch: new ConeGeometry(0.12, 0.25, 4),
    grass: new BoxGeometry(0.02, 0.08, 0.02),
    flower: new SphereGeometry(0.03, 5, 4),
    rock: new SphereGeometry(0.05, 5, 4),
    bigRock: new DodecahedronGeometry(0.15, 0),
    oliveCanopy: new SphereGeometry(0.25, 6, 5),
};

// ── Shared materials ──
const M = {
    brown: new MeshLambertMaterial({ color: 0x6B4226 }),
    dkBrown: new MeshLambertMaterial({ color: 0x4A3218 }),
    white: new MeshLambertMaterial({ color: 0xD8D0C4 }),
    green: new MeshLambertMaterial({ color: 0x2E7D32 }),
    dkGreen: new MeshLambertMaterial({ color: 0x1B5E20 }),
    ltGreen: new MeshLambertMaterial({ color: 0x66BB6A }),
    palmG: new MeshLambertMaterial({ color: 0x388E3C, side: DoubleSide }),
    gray: new MeshLambertMaterial({ color: 0x757575 }),
    ltGray: new MeshLambertMaterial({ color: 0x9E9E9E }),
    grass: new MeshLambertMaterial({ color: 0x558B2F }),
    olive: new MeshLambertMaterial({ color: 0x7B8B3A }),
};
const _sharedMats = new Set(Object.values(M));

// ── Utilities ──
let _seed;
function rng(s) { _seed = s; return () => { _seed = (_seed * 16807 + 7) % 2147483647; return (_seed - 1) / 2147483646; }; }
function rr(r, a, b) { return a + r() * (b - a); }
function pos(t) { return { x: t.cx * WS - 48, z: t.cy * WS - 32 }; }

// ── Tree builders: each returns {group, sway:[{mesh,speed,phase}]} ──
function oak(r) {
    const g = new Group(), s = rr(r,0.8,1.2), ph = r()*6.28;
    const _t = new Mesh(G.oakTrunk, M.brown); _t.position.set(0,0.3,0); g.add(_t);
    const c = new Mesh(G.oakCanopy, M.green); c.position.y = 0.75;
    g.add(c); g.scale.setScalar(s);
    return { group: g, sway: [{ mesh: c, speed: 2, phase: ph }] };
}
function pine(r) {
    const g = new Group(), s = rr(r,0.8,1.2), ph = r()*6.28;
    const _t = new Mesh(G.pineTrunk, M.dkBrown); _t.position.set(0,0.4,0); g.add(_t);
    const f = new Mesh(G.pineFoliage, M.dkGreen); f.position.y = 0.9;
    g.add(f); g.scale.setScalar(s);
    return { group: g, sway: [{ mesh: f, speed: 1.8, phase: ph }] };
}
function birch(r) {
    const g = new Group(), s = rr(r,0.85,1.15), ph = r()*6.28;
    const _t = new Mesh(G.birchTrunk, M.white); _t.position.set(0,0.35,0); g.add(_t);
    const c = new Mesh(G.birchCanopy, M.ltGreen); c.position.y = 0.8;
    g.add(c); g.scale.setScalar(s);
    return { group: g, sway: [{ mesh: c, speed: 2.5, phase: ph }] };
}
function palm(r) {
    const g = new Group(), s = rr(r,0.8,1.2), ph = r()*6.28;
    const segs = 2 + Math.floor(r()*2), ang = rr(r,-0.2,0.2);
    let py = 0;
    for (let i = 0; i < segs; i++) {
        const seg = new Mesh(G.palmSeg, M.brown);
        seg.position.y = py + 0.25; seg.rotation.z = ang * (i+1) * 0.5;
        g.add(seg); py += 0.45;
    }
    const top = new Group(); top.position.y = py + 0.1;
    const lc = 5 + Math.floor(r()*3);
    for (let i = 0; i < lc; i++) {
        const lf = new Mesh(G.palmLeaf, M.palmG), a = (i/lc)*6.28;
        lf.rotation.y = a; lf.rotation.x = -0.4;
        lf.position.set(Math.cos(a)*0.2, 0, Math.sin(a)*0.2);
        top.add(lf);
    }
    g.add(top); g.scale.setScalar(s);
    return { group: g, sway: [{ mesh: top, speed: 1.5, phase: ph }] };
}
function deadTree(r) {
    const g = new Group(), s = rr(r,0.7,1.2);
    const _t = new Mesh(G.deadTrunk, M.dkBrown); _t.position.set(0,0.25,0); g.add(_t);
    const br = new Mesh(G.deadBranch, M.dkBrown);
    br.position.y = 0.55; br.rotation.z = rr(r,-0.4,0.4);
    g.add(br); g.scale.setScalar(s);
    return { group: g, sway: [] };
}
function olive(r) {
    const g = new Group(), s = rr(r,0.8,1.1), ph = r()*6.28;
    const tk = new Mesh(G.oakTrunk, M.gray); tk.position.y = 0.25; tk.scale.set(0.8,0.7,0.8);
    g.add(tk);
    const c = new Mesh(G.oliveCanopy, M.olive); c.position.y = 0.55;
    g.add(c); g.scale.setScalar(s);
    return { group: g, sway: [{ mesh: c, speed: 2, phase: ph }] };
}

// ── Detail builders ──
function grassTuft(r) {
    const m = new Mesh(G.grass, M.grass); m.position.y = 0.04;
    m.rotation.y = r()*6.28;
    return { mesh: m, speed: 4, phase: r()*6.28 };
}
function flower(r, cols) {
    const mat = new MeshLambertMaterial({ color: cols[Math.floor(r()*cols.length)] });
    const m = new Mesh(G.flower, mat); m.position.y = 0.06;
    return { mesh: m, speed: 3.5, phase: r()*6.28 };
}
function rock(r) {
    const m = new Mesh(G.rock, M.gray); m.position.y = 0.03;
    m.rotation.set(r()*0.5, r()*6.28, r()*0.3);
    const s = rr(r,0.6,1.4); m.scale.set(s, s*0.7, s);
    return m;
}
function bigRock(r) {
    const m = new Mesh(G.bigRock, M.ltGray); m.position.y = 0.1;
    m.rotation.set(r()*0.4, r()*6.28, r()*0.3);
    const s = rr(r,0.7,1.3); m.scale.set(s, s*0.6, s);
    return m;
}

// ═══════════════════════════════════════════════════════════
export class Vegetation3D {
    constructor(renderer) {
        this._scene = renderer._scene;
        this._groups = [];
        this._sway = [];
        this._time = 0;
        this._buildAll();
    }

    // Scatter items within radius around container center
    _scatter(c, items, r, radius) {
        for (const item of items) {
            const a = r()*6.28, d = r()*radius;
            item.position.x += Math.cos(a)*d;
            item.position.z += Math.sin(a)*d;
            c.add(item);
        }
    }

    // Add trees: registers sway, scatters within container
    _addTrees(c, treeList, r, radius) {
        const placed = [];
        for (const t of treeList) {
            placed.push(t.group);
            for (const s of t.sway) this._sway.push(s);
        }
        this._scatter(c, placed, r, radius);
    }

    // Add swayable details (grass/flowers)
    _addDetails(c, detailList) {
        for (const d of detailList) { c.add(d.mesh); this._sway.push(d); }
    }

    _buildAll() {
        for (const t of TERRITORIES) {
            const r = rng(t.id * 7919 + 42);
            const p = pos(t), by = TERRAIN_H[t.terrain] || 1;
            const c = new Group(); c.position.set(p.x, by, p.z);
            this._populate(c, t.terrain, r);
            this._scene.add(c); this._groups.push(c);
        }
    }

    _populate(c, terrain, r) {
        switch (terrain) {
            case 'forest': {
                const n = 12 + Math.floor(r()*9), types = [oak, pine, birch];
                this._addTrees(c, Array.from({length:n}, () => types[Math.floor(r()*3)](r)), r, 1.8);
                this._addDetails(c, Array.from({length: 8+Math.floor(r()*5)}, () => grassTuft(r)));
                break;
            }
            case 'plains': {
                this._addTrees(c, Array.from({length: 6+Math.floor(r()*5)}, () => oak(r)), r, 2.5);
                this._addDetails(c, Array.from({length: 15+Math.floor(r()*6)}, () => grassTuft(r)));
                this._addDetails(c, Array.from({length: 5+Math.floor(r()*4)}, () => flower(r, FLOWER_WARM)));
                break;
            }
            case 'desert': {
                this._addTrees(c, Array.from({length: 3+Math.floor(r()*3)}, () => deadTree(r)), r, 2.2);
                const rocks = Array.from({length: 8+Math.floor(r()*5)}, () => rock(r));
                this._scatter(c, rocks, r, 2.5);
                break;
            }
            case 'coast': {
                this._addTrees(c, Array.from({length: 4+Math.floor(r()*3)}, () => palm(r)), r, 2.0);
                const rocks = Array.from({length: 3+Math.floor(r()*3)}, () => rock(r));
                this._scatter(c, rocks, r, 2.5);
                break;
            }
            case 'mountains': {
                const pines = Array.from({length: 2+Math.floor(r()*3)}, () => pine(r));
                pines.forEach(p => p.group.position.y -= 0.5);
                this._addTrees(c, pines, r, 1.5);
                const rocks = Array.from({length: 6+Math.floor(r()*3)}, () => bigRock(r));
                this._scatter(c, rocks, r, 2.5);
                break;
            }
            case 'island': {
                this._addTrees(c, Array.from({length: 8+Math.floor(r()*5)}, () => palm(r)), r, 1.8);
                this._addDetails(c, Array.from({length: 4+Math.floor(r()*4)}, () => flower(r, FLOWER_TROPICAL)));
                break;
            }
            case 'peninsula': {
                this._addTrees(c, Array.from({length: 4+Math.floor(r()*3)}, () => oak(r)), r, 2.0);
                this._addTrees(c, Array.from({length: 2+Math.floor(r()*3)}, () => olive(r)), r, 2.0);
                this._addDetails(c, Array.from({length: 6+Math.floor(r()*4)}, () => grassTuft(r)));
                break;
            }
        }
    }

    // ── Wind sway ──
    update(dt) {
        this._time += dt;
        for (const s of this._sway) {
            const amp = s.speed > 3 ? 0.15 : 0.05;
            s.mesh.rotation.z = Math.sin(this._time * s.speed + s.phase) * amp;
        }
    }

    // ── Cleanup ──
    dispose() {
        for (const g of this._groups) {
            g.traverse(ch => {
                if (ch.isMesh && !_sharedMats.has(ch.material)) ch.material.dispose();
            });
            this._scene.remove(g);
        }
        this._groups.length = 0;
        this._sway.length = 0;
    }
}
