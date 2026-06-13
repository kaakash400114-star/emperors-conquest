/**
 * armies3d.js -- Procedural 3D soldier formations for Emperor's Conquest.
 * One group per territory with troops; empire-colored soldiers with idle bobbing.
 */

import { TERRITORIES, EMPIRES } from './map.js';

const { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, Sprite, SpriteMaterial,
        BoxGeometry, SphereGeometry, Color, CanvasTexture } = THREE;

const WS = 0.1;
const MAX_VISUAL = 12;
const COLS = 6;
const SPACING = 0.22;

// Reusable geometries (shared, never disposed individually)
const _bodyGeo = new BoxGeometry(0.15, 0.3, 0.1);
const _headGeo = new SphereGeometry(0.08, 8, 8);
const _weaponGeo = new BoxGeometry(0.02, 0.35, 0.02);

// ── Territory centre → world xz ──
function _pos(tid) {
    const t = TERRITORIES[tid];
    return { x: t.cx * WS - 48, z: t.cy * WS - 32 };
}

// ── Build a single soldier model (body + head + weapon) ──
function _buildSoldier(color) {
    const g = new Group();
    const mat = new MeshStandardMaterial({ color, metalness: 0.2 });
    const skinMat = new MeshStandardMaterial({ color: 0xead6a6, metalness: 0.1 });
    const weaponMat = new MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6 });

    // body
    const body = new Mesh(_bodyGeo, mat);
    body.position.y = 0.2;
    g.add(body);

    // head
    const head = new Mesh(_headGeo, skinMat);
    head.position.y = 0.42;
    g.add(head);

    // weapon (right side, angled slightly)
    const weapon = new Mesh(_weaponGeo, weaponMat);
    weapon.position.set(0.12, 0.3, 0);
    weapon.rotation.z = 0.15;
    g.add(weapon);

    return g;
}

// ── Canvas-texture sprite showing troop count ──
function _makeLabel(count, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 48);

    // Background pill
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    const _rr = ctx.roundRect || ((x, y, w, h, r) => {
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); });
    _rr.call(ctx, 8, 6, 112, 36, 12);
    ctx.fill();

    // Text
    ctx.fillStyle = color || '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), 64, 24);

    const tex = new CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new Sprite(mat);
    sprite.scale.set(1.2, 0.45, 1);
    sprite.position.y = 0.7;
    return sprite;
}

// ═══════════════════════════════════════════════════════════════════
//  ARMIES3D CLASS
// ═══════════════════════════════════════════════════════════════════
export class Armies3D {
    constructor(renderer) {
        this.r = renderer;
        this.scene = renderer._scene;
        this.g = renderer.g;
        this.armies = new Map(); // tid → { group, soldiers[], label, count, owner }
    }

    // ── Main update: sync with game state every frame ──
    update(dt) {
        const ts = this.g.ts;
        if (!ts) return;

        for (const t of TERRITORIES) {
            const state = ts[t.id];
            if (!state) continue;

            if (state.troops > 0 && state.owner) {
                this._ensureArmy(t.id, state);
            } else {
                this._removeArmy(t.id);
            }
        }

        // Animate all existing armies
        const time = performance.now() * 0.001;
        for (const [tid, army] of this.armies) {
            army.time = (army.time || 0) + dt;
            if (!army.tid) army.tid = tid;
            this._animate(army, time);
        }
    }

    // ── Ensure an army group exists and matches current troops/owner ──
    _ensureArmy(tid, state) {
        const army = this.armies.get(tid);

        // Check if owner changed
        if (army && army.owner !== state.owner) {
            this._removeArmy(tid);
        }

        const current = this.armies.get(tid);
        const visualCount = Math.min(state.troops, MAX_VISUAL);

        if (!current) {
            // Fresh army
            const group = this._buildGroup(tid, state.owner, visualCount);
            this.scene.add(group);
            this.armies.set(tid, {
                group, soldiers: group.userData.soldiers,
                label: group.userData.label,
                count: state.troops, owner: state.owner, tid, time: 0
            });
        } else if (current.count !== state.troops || current.soldiers.length !== visualCount) {
            // Troop count changed — rebuild soldiers & label
            this._refreshGroup(current, tid, state.owner, visualCount, state.troops);
        }
    }

    // ── Build a fresh army group ──
    _buildGroup(tid, owner, visualCount) {
        const pos = _pos(tid);
        const group = new Group();
        group.position.set(pos.x, 0, pos.z);

        const empData = EMPIRES[owner];
        const color = empData ? empData.color : '#ffffff';
        const soldiers = [];

        for (let i = 0; i < visualCount; i++) {
            const soldier = _buildSoldier(color);
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const offsetX = (col - (Math.min(visualCount, COLS) - 1) / 2) * SPACING;
            const offsetZ = row * SPACING;
            soldier.position.set(offsetX, 0, offsetZ);
            soldier.userData.phase = i * 0.7; // staggered bobbing phase
            group.add(soldier);
            soldiers.push(soldier);
        }

        const label = _makeLabel(this.g.ts[tid].troops, color);
        group.add(label);
        group.userData.soldiers = soldiers;
        group.userData.label = label;
        return group;
    }

    // ── Refresh soldiers & label in-place ──
    _refreshGroup(army, tid, owner, visualCount, realCount) {
        const group = army.group;
        const empData = EMPIRES[owner];
        const color = empData ? empData.color : '#ffffff';

        // Remove old soldiers
        for (const s of army.soldiers) {
            group.remove(s);
            s.traverse(c => {
                if (c.material) {
                    if (c.material !== army._sharedMat) c.material.dispose();
                }
            });
        }
        // Remove old label
        if (army.label) {
            group.remove(army.label);
            if (army.label.material.map) army.label.material.map.dispose();
            army.label.material.dispose();
        }

        const soldiers = [];
        for (let i = 0; i < visualCount; i++) {
            const soldier = _buildSoldier(color);
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const offsetX = (col - (Math.min(visualCount, COLS) - 1) / 2) * SPACING;
            const offsetZ = row * SPACING;
            soldier.position.set(offsetX, 0, offsetZ);
            soldier.userData.phase = i * 0.7;
            group.add(soldier);
            soldiers.push(soldier);
        }

        const label = _makeLabel(realCount, color);
        group.add(label);

        army.soldiers = soldiers;
        army.label = label;
        army.count = realCount;
        army.owner = owner;
    }

    // ── Idle bobbing animation ──
    _animate(army, time) {
        for (const s of army.soldiers) {
            const phase = s.userData.phase || 0;
            s.position.y = Math.sin(time * 2.5 + phase) * 0.03;
        }
        // Subtle group pulse for selected territory
        if (this.g.sel === army.tid) {
            const pulse = 1.0 + Math.sin(time * 4.0) * 0.06;
            army.group.scale.set(pulse, pulse, pulse);
        } else {
            army.group.scale.set(1, 1, 1);
        }
    }

    // ── Remove army group from scene ──
    _removeArmy(tid) {
        const army = this.armies.get(tid);
        if (!army) return;
        this.scene.remove(army.group);
        army.group.traverse(c => {
            if (c.material) {
                if (c.material.map) c.material.map.dispose();
                c.material.dispose();
            }
        });
        this.armies.delete(tid);
    }

    // ── Full cleanup ──
    dispose() {
        for (const [tid] of this.armies) {
            this._removeArmy(tid);
        }
    }
}
