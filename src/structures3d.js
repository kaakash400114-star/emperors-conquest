/**
 * structures3d.js -- Procedural 3D buildings/structures for Emperor's Conquest.
 * Three tiers: City (troops>=50), Fortress (troops>=100), Wonder (troops>=200).
 * Empire-colored with idle animations (glow pulse, flag wave).
 */

import { TERRITORIES, EMPIRES } from './map.js';

const { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, PointLight,
        BoxGeometry, PlaneGeometry, CylinderGeometry, BufferGeometry,
        BufferAttribute, Color, DoubleSide } = THREE;

const WS = 0.1;

// ── Territory centre → world xz ──
function _pos(tid) {
    const t = TERRITORIES[tid];
    return { x: t.cx * WS - 48, z: t.cy * WS - 32 };
}

// ── Determine structure tier from troop count ──
function _tier(troops) {
    if (troops >= 200) return 3; // wonder
    if (troops >= 100) return 2; // fortress
    if (troops >= 50)  return 1; // city
    return 0;
}

// ── Reusable shared geometries ──
const _geos = {
    cityBody:   new BoxGeometry(0.6, 0.8, 0.6),
    cityRoof:   new PlaneGeometry(0.8, 0.8),
    cityDoor:   new BoxGeometry(0.15, 0.25, 0.02),
    fortBody:   new BoxGeometry(1.0, 1.2, 0.8),
    fortTower:  new BoxGeometry(0.2, 1.5, 0.2),
    fortWall:   new BoxGeometry(0.8, 0.7, 0.06),
    fortFlag:   new PlaneGeometry(0.25, 0.18),
    fortPole:   new BoxGeometry(0.02, 0.5, 0.02),
    wonderBase: new BoxGeometry(1.5, 0.4, 1.5),
    pillar:     new CylinderGeometry(0.08, 0.08, 2.0, 8),
};

// ── Triangle roof geometry for wonder ──
const _roofVerts = new Float32Array([
    -0.7, 0, -0.7,   0.7, 0, -0.7,   0.7, 0,  0.7,
    -0.7, 0, -0.7,   0.7, 0,  0.7,  -0.7, 0,  0.7,  // bottom
     0.7, 0, -0.7,   0.7, 0,  0.7,   0, 0.7, 0,     // +x slope
    -0.7, 0, -0.7,   0.7, 0, -0.7,   0, 0.7, 0,     // -z slope
    -0.7, 0,  0.7,  -0.7, 0, -0.7,   0, 0.7, 0,     // -x slope
     0.7, 0,  0.7,  -0.7, 0,  0.7,   0, 0.7, 0,     // +z slope
]);
const _wonderRoofGeo = new BufferGeometry();
_wonderRoofGeo.setAttribute('position', new BufferAttribute(_roofVerts, 3));
_wonderRoofGeo.computeVertexNormals();

// ── Build CITY model ──
function _buildCity(empColor) {
    const g = new Group();
    const mat = new MeshStandardMaterial({ color: empColor, metalness: 0.2, roughness: 0.6 });
    const roofMat = new MeshStandardMaterial({ color: 0x8B4513, metalness: 0.1, roughness: 0.8 });
    const doorMat = new MeshStandardMaterial({ color: 0x3B2507, metalness: 0.05, roughness: 0.9 });

    // main body
    const body = new Mesh(_geos.cityBody, mat);
    body.position.y = 0.4;
    g.add(body);

    // flat roof
    const roof = new Mesh(_geos.cityRoof, roofMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = 0.81;
    g.add(roof);

    // door (front face)
    const door = new Mesh(_geos.cityDoor, doorMat);
    door.position.set(0, 0.125, 0.31);
    g.add(door);

    return g;
}

// ── Build FORTRESS model ──
function _buildFortress(empColor) {
    const g = new Group();
    const mat = new MeshStandardMaterial({ color: empColor, metalness: 0.3, roughness: 0.5 });
    const stoneMat = new MeshStandardMaterial({ color: 0x808080, metalness: 0.2, roughness: 0.7 });

    // main body
    const body = new Mesh(_geos.fortBody, stoneMat);
    body.position.y = 0.6;
    g.add(body);

    // 4 corner towers
    const offsets = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (const [ox, oz] of offsets) {
        const tower = new Mesh(_geos.fortTower, mat);
        tower.position.set(ox, 0.75, oz);
        g.add(tower);
    }

    // front and back walls
    const wallF = new Mesh(_geos.fortWall, stoneMat);
    wallF.position.set(0, 0.55, -0.5);
    g.add(wallF);
    const wallB = wallF.clone();
    wallB.position.z = 0.5;
    g.add(wallB);

    // side walls (use same geo, rotate)
    const sideWallGeo = new BoxGeometry(0.06, 0.7, 0.8);
    const wallL = new Mesh(sideWallGeo, stoneMat);
    wallL.position.set(-0.5, 0.55, 0);
    g.add(wallL);
    const wallR = wallL.clone();
    wallR.position.x = 0.5;
    g.add(wallR);

    // flag pole on top of front-left tower
    const pole = new Mesh(_geos.fortPole, stoneMat);
    pole.position.set(-0.5, 1.75, -0.5);
    g.add(pole);

    // flag (wavy plane)
    const flagMat = new MeshBasicMaterial({ color: empColor, side: DoubleSide, transparent: true });
    const flag = new Mesh(_geos.fortFlag, flagMat);
    flag.position.set(-0.37, 1.9, -0.5);
    flag.userData.isFlag = true;
    g.add(flag);

    return g;
}

// ── Build WONDER model ──
function _buildWonder(empColor) {
    const g = new Group();
    const mat = new MeshStandardMaterial({ color: empColor, metalness: 0.4, roughness: 0.4 });
    const goldMat = new MeshStandardMaterial({ color: 0xFFD700, metalness: 0.7, roughness: 0.2 });
    const roofMat = new MeshStandardMaterial({ color: empColor, metalness: 0.5, roughness: 0.3, emissive: empColor, emissiveIntensity: 0.15 });

    // massive base
    const base = new Mesh(_geos.wonderBase, mat);
    base.position.y = 0.2;
    g.add(base);

    // 4 tall pillars at corners
    const pOff = [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]];
    for (const [ox, oz] of pOff) {
        const pillar = new Mesh(_geos.pillar, mat);
        pillar.position.set(ox, 1.4, oz);
        g.add(pillar);
        // gold capital on top
        const cap = new Mesh(new BoxGeometry(0.2, 0.08, 0.2), goldMat);
        cap.position.set(ox, 2.44, oz);
        g.add(cap);
    }

    // triangle roof
    const roof = new Mesh(_wonderRoofGeo, roofMat);
    roof.position.y = 2.6;
    g.add(roof);

    // golden glow point light
    const light = new PointLight(0xFFD700, 1.5, 6);
    light.position.y = 2.8;
    light.userData.isGlow = true;
    g.add(light);

    return g;
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTURES3D CLASS
// ═══════════════════════════════════════════════════════════════════
export class Structures3D {
    constructor(renderer) {
        this.r = renderer;
        this.scene = renderer._scene;
        this.g = renderer.g;
        this.structures = new Map(); // tid → { group, tier, owner, time }
    }

    // ── Main update: sync structures with game state ──
    update(dt) {
        const ts = this.g.ts;
        if (!ts) return;
        const time = performance.now() * 0.001;

        for (const t of TERRITORIES) {
            const state = ts[t.id];
            if (!state || !state.troops || !state.owner) {
                this._removeStructure(t.id);
                continue;
            }

            const newTier = _tier(state.troops);
            const existing = this.structures.get(t.id);

            if (!existing) {
                if (newTier > 0) this._createStructure(t.id, state.owner, newTier);
            } else if (existing.owner !== state.owner || existing.tier !== newTier) {
                this._removeStructure(t.id);
                if (newTier > 0) this._createStructure(t.id, state.owner, newTier);
            }
        }

        // Animate all structures
        for (const [, s] of this.structures) {
            s.time = (s.time || 0) + dt;
            this._animate(s, time);
        }
    }

    // ── Create a structure group for a territory ──
    _createStructure(tid, owner, tier) {
        const pos = _pos(tid);
        const empData = EMPIRES[owner];
        const color = empData ? empData.color : '#ffffff';
        const c = new Color(color);

        let group;
        if (tier === 1) group = _buildCity(c);
        else if (tier === 2) group = _buildFortress(c);
        else group = _buildWonder(c);

        group.position.set(pos.x, 0, pos.z);
        this.scene.add(group);
        this.structures.set(tid, { group, tier, owner, time: 0 });
    }

    // ── Animate: glow pulse for wonders, flag wave for fortresses ──
    _animate(s, time) {
        if (s.tier === 2) {
            // flag wave
            s.group.traverse(child => {
                if (child.userData.isFlag) {
                    child.rotation.y = Math.sin(time * 3.0) * 0.35;
                    child.material.opacity = 0.85 + Math.sin(time * 2.5) * 0.15;
                }
            });
        } else if (s.tier === 3) {
            // glow pulse
            s.group.traverse(child => {
                if (child.userData.isGlow) {
                    child.intensity = 1.5 + Math.sin(time * 2.0) * 0.8;
                }
            });
            // subtle roof emissive pulse
            s.group.traverse(child => {
                if (child.material && child.material.emissiveIntensity !== undefined) {
                    child.material.emissiveIntensity = 0.15 + Math.sin(time * 1.5) * 0.1;
                }
            });
        }
    }

    // ── Remove a single structure ──
    _removeStructure(tid) {
        const s = this.structures.get(tid);
        if (!s) return;
        this.scene.remove(s.group);
        s.group.traverse(c => {
            if (c.material) {
                if (c.material.map) c.material.map.dispose();
                c.material.dispose();
            }
        });
        this.structures.delete(tid);
    }

    // ── Full cleanup ──
    dispose() {
        for (const [tid] of this.structures) {
            this._removeStructure(tid);
        }
    }
}
