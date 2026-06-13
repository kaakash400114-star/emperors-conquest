/**
 * battle3d.js — 3D battle animation for Emperor's Conquest.
 * 8-second phased battle: charge → clash → projectiles → resolution.
 */
import { TERRITORIES, EMPIRES } from './map.js';

const { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial,
        BoxGeometry, SphereGeometry, CylinderGeometry, Color, Vector3 } = THREE;

const WS = 0.1, DURATION = 8;
const _bodyGeo = new BoxGeometry(0.15, 0.3, 0.1);
const _headGeo = new SphereGeometry(0.08, 8, 8);
const _weaponGeo = new BoxGeometry(0.02, 0.35, 0.02);
const _arrowGeo = new CylinderGeometry(0.012, 0.012, 0.6, 4);
const _sparkGeo = new SphereGeometry(0.06, 6, 6);

function _pos(tid) {
    const t = TERRITORIES[tid];
    return { x: t.cx * WS - 48, z: t.cy * WS - 32 };
}

function _empireKey(g, tid) {
    for (const k of Object.keys(g.empires || {}))
        if ((g.territories || {})[tid]?.owner === k) return k;
    return null;
}

function _buildSoldier(color) {
    const g = new Group();
    const mat = new MeshStandardMaterial({ color, metalness: 0.2 });
    const skin = new MeshStandardMaterial({ color: 0xead6a6, metalness: 0.1 });
    const wep = new MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6 });
    const body = new Mesh(_bodyGeo, mat); body.position.y = 0.2; g.add(body);
    const head = new Mesh(_headGeo, skin); head.position.y = 0.42; g.add(head);
    const weapon = new Mesh(_weaponGeo, wep);
    weapon.position.set(0.12, 0.3, 0); weapon.rotation.z = 0.15; g.add(weapon);
    return g;
}

// ── BattleGroup: all meshes & state for one battle ──
class BattleGroup {
    constructor(scene, atkPos, defPos, atkColor, defColor) {
        this.scene = scene;
        this.root = new Group();
        scene.add(this.root);
        this.t = 0;
        this.atkSoldiers = [];
        this.defSoldiers = [];
        this.arrows = [];
        this.sparks = [];
        this.dustCloud = null;
        this.finished = false;
        this.shakeIntensity = 0;
        this._particles = null;

        this.atkOrigin = new Vector3(atkPos.x, 0, atkPos.z);
        this.defOrigin = new Vector3(defPos.x, 0, defPos.z);
        this.midpoint = new Vector3().lerpVectors(this.atkOrigin, this.defOrigin, 0.5);

        const dir = new Vector3().subVectors(this.defOrigin, this.atkOrigin).normalize();
        const perp = new Vector3(-dir.z, 0, dir.x);
        for (let i = 0; i < 9; i++) {
            const offset = perp.clone().multiplyScalar((i - 4) * 0.25);
            const a = _buildSoldier(atkColor);
            a.position.copy(this.atkOrigin).add(offset).addScaledVector(dir, -1.0 - i * 0.15);
            a.position.y = 0;
            a.userData.startPos = a.position.clone();
            this.root.add(a); this.atkSoldiers.push(a);

            const d = _buildSoldier(defColor);
            d.position.copy(this.defOrigin).add(offset);
            d.position.y = 0; d.rotation.y = Math.PI;
            d.userData.startPos = d.position.clone();
            this.root.add(d); this.defSoldiers.push(d);
        }
    }

    _emitDust(pos) { this._particles?.emit({ x: pos.x, y: 0.1, z: pos.z || 0 }, 'dust', 3); }
    _emitSparks(pos) { this._particles?.emit({ x: pos.x, y: 0.4, z: pos.z || 0 }, 'spark', 5); }

    _updateCharge(dt) {
        const p = Math.min(this.t / 2, 1);
        for (const s of this.atkSoldiers) {
            const target = new Vector3().lerpVectors(s.userData.startPos, this.midpoint, p);
            s.position.x = target.x; s.position.z = target.z;
            s.position.y = Math.sin(p * Math.PI) * 0.3;
        }
        if (Math.random() < 0.3 && this.t < 1.8) this._emitDust(this.midpoint);
    }

    _updateClash(dt) {
        const p = this.t - 2;
        if (p < 1.0 && Math.random() < 0.5) {
            const mat = new MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffcc00 : 0xff8800 });
            const spark = new Mesh(_sparkGeo, mat);
            spark.position.set(
                this.midpoint.x + (Math.random() - 0.5) * 0.5,
                0.3 + Math.random() * 0.4,
                this.midpoint.z + (Math.random() - 0.5) * 0.5);
            spark.userData.life = 0.2 + Math.random() * 0.3;
            this.root.add(spark); this.sparks.push(spark);
            this._emitSparks(this.midpoint);
        }
        if (p < 0.05) this._playClashSound();

        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.userData.life -= dt; s.position.y += dt * 2;
            s.scale.setScalar(Math.max(0, s.userData.life / 0.5));
            if (s.userData.life <= 0) {
                this.root.remove(s); s.material.dispose(); this.sparks.splice(i, 1);
            }
        }
        this.shakeIntensity = Math.max(0, 0.15 * (1 - p / 2));
    }

    _updateProjectiles(dt) {
        const p = this.t - 4;
        const dir = new Vector3().subVectors(this.atkOrigin, this.defOrigin).normalize();
        if (p < 0.8 && Math.random() < 0.3) {
            const mat = new MeshStandardMaterial({ color: 0x8B4513 });
            const arrow = new Mesh(_arrowGeo, mat);
            arrow.position.set(
                this.midpoint.x + (Math.random() - 0.5) * 2, 3,
                this.defOrigin.z + (Math.random() - 0.5) * 0.5);
            arrow.userData.startY = 3; arrow.userData.progress = 0;
            arrow.userData.speed = 0.6 + Math.random() * 0.4;
            this.root.add(arrow); this.arrows.push(arrow);
        }
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const a = this.arrows[i];
            a.userData.progress += dt * a.userData.speed;
            const t = a.userData.progress;
            a.position.x += dir.x * dt * 6; a.position.z += dir.z * dt * 6;
            a.position.y = 3 + 4 * t - 12 * t * t;
            a.rotation.z = Math.atan2(-24 * t + 4, 6) * (dir.x < 0 ? -1 : 1);
            if (a.position.y < 0.05) {
                this._emitDust({ x: a.position.x, z: a.position.z });
                this.root.remove(a); a.material.dispose(); this.arrows.splice(i, 1);
            }
        }
    }

    _updateResolution(dt) {
        const p = (this.t - 6) / 2;
        for (const s of this.atkSoldiers) {
            s.rotation.x = p * Math.PI * 0.5;
            s.position.y = Math.max(0, s.position.y - dt * 0.5);
            for (const c of s.children) if (c.material) c.material.opacity = 1 - p;
        }
        for (const s of this.defSoldiers) {
            s.position.y = Math.abs(Math.sin(p * Math.PI * 4)) * 0.4;
        }
        if (!this.dustCloud) {
            const mat = new MeshBasicMaterial({ color: 0xc4b37a, transparent: true, opacity: 0.5, depthWrite: false });
            this.dustCloud = new Mesh(new SphereGeometry(0.5, 12, 12), mat);
            this.dustCloud.position.set(this.midpoint.x, 0.5, this.midpoint.z);
            this.root.add(this.dustCloud);
        }
        this.dustCloud.scale.setScalar(1 + p * 4);
        this.dustCloud.material.opacity = 0.5 * (1 - p);
    }

    update(dt) {
        if (this.finished) return;
        this.t += dt;
        this.shakeIntensity = 0;
        if (this.t < 2) this._updateCharge(dt);
        else if (this.t < 4) this._updateClash(dt);
        else if (this.t < 6) this._updateProjectiles(dt);
        else if (this.t < DURATION) this._updateResolution(dt);
        else this.finished = true;
    }

    _playClashSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        } catch (_) {}
    }

    dispose() {
        this.root.traverse(c => { if (c.isMesh && c.material) c.material.dispose(); });
        this.scene.remove(this.root);
        this.atkSoldiers = []; this.defSoldiers = [];
        this.arrows = []; this.sparks = []; this.dustCloud = null;
    }
}

// ═══════════════════════════════════════════════════════════
export class Battle3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = renderer._scene;
        this.camera = renderer._camera;
        this.battles = [];
        this._cameraBasePos = null;
    }

    triggerBattle(attackId, defendId) {
        const g = this.renderer.g;
        const atkKey = _empireKey(g, attackId);
        const defKey = _empireKey(g, defendId);
        if (!atkKey || !defKey) return;
        const atkEmp = EMPIRES[atkKey] || EMPIRES.roman;
        const defEmp = EMPIRES[defKey] || EMPIRES.roman;
        const bg = new BattleGroup(this.scene, _pos(attackId), _pos(defendId),
            new Color(atkEmp.color).getHex(), new Color(defEmp.color).getHex());
        bg._particles = this.renderer.particles;
        this.battles.push(bg);
        if (!this._cameraBasePos) this._cameraBasePos = this.camera.position.clone();
    }

    update(dt) {
        let shake = 0;
        for (let i = this.battles.length - 1; i >= 0; i--) {
            const b = this.battles[i];
            b.update(dt);
            if (b.shakeIntensity > 0) shake = Math.max(shake, b.shakeIntensity);
            if (b.finished) { b.dispose(); this.battles.splice(i, 1); }
        }
        if (shake > 0 && this._cameraBasePos) {
            const s = shake;
            this.camera.position.set(
                this._cameraBasePos.x + (Math.random() - 0.5) * s,
                this._cameraBasePos.y + (Math.random() - 0.5) * s * 0.5,
                this._cameraBasePos.z + (Math.random() - 0.5) * s);
        } else if (this._cameraBasePos && this.battles.length === 0) {
            this.camera.position.copy(this._cameraBasePos); this._cameraBasePos = null;
        }
    }

    dispose() {
        for (const b of this.battles) b.dispose();
        this.battles = [];
        if (this._cameraBasePos) {
            this.camera.position.copy(this._cameraBasePos); this._cameraBasePos = null;
        }
    }
}
