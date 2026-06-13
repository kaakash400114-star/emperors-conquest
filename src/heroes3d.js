// heroes3d.js — 3D hero units for Emperor's Conquest
// Procedural hero models from basic Three.js geometries with auras & floating animation.

const { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial,
        BoxGeometry, SphereGeometry, ConeGeometry, PlaneGeometry,
        TorusGeometry, CylinderGeometry, RingGeometry, CircleGeometry,
        Color, DoubleSide, FrontSide } = THREE;

import { TERRITORIES, EMPIRES } from './map.js';

const WS = 0.1;           // map → world scale
const HERO_SCALE = 1.5;    // base height in world units
const AURA_RADIUS = 0.9;

// ── Territory centre → world position ──
function _territoryPos(tid) {
    const t = TERRITORIES[tid];
    return { x: t.cx * WS - 48, z: t.cy * WS - 32 };
}

// ── Build glowing ring (aura) tinted to empire colour ──
function _makeAura(empireColor) {
    const col = new Color(empireColor || '#ffffff');
    const auraMat = new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 });
    const ring = new Mesh(new TorusGeometry(AURA_RADIUS, 0.04, 8, 32), auraMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    // inner glow disc
    const discMat = new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, side: DoubleSide });
    const disc = new Mesh(new CircleGeometry(AURA_RADIUS, 32), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    return { ring, disc };
}

// ═══════════════════════════════════════════════════════════════════
//  HERO MODEL BUILDERS — each returns a Group
// ═══════════════════════════════════════════════════════════════════
const _builders = {
    alexander(r) {
        const g = new Group();
        // golden body
        g.add(_box(0, 0.45, 0, 0.28, 0.5, 0.18, 0xd4af37, 0.6));
        // head
        g.add(_sphere(0, 0.85, 0, 0.12, 0xead6a6));
        // helmet crest
        g.add(_box(0, 0.97, 0, 0.03, 0.15, 0.03, 0x8b0000));
        // cape
        const cape = _plane(0, 0.5, -0.14, 0.35, 0.55, 0xc0392b, true);
        cape.rotation.y = 0.15;
        g.add(cape);
        // sword
        g.add(_box(0.22, 0.55, 0, 0.02, 0.35, 0.02, 0xc0c0c0, 0.8));
        g.add(_box(0.22, 0.75, 0, 0.06, 0.03, 0.02, 0xd4af37));
        // legs
        g.add(_box(-0.08, 0.1, 0, 0.08, 0.25, 0.1, 0x8b7355));
        g.add(_box(0.08, 0.1, 0, 0.08, 0.25, 0.1, 0x8b7355));
        return g;
    },
    caesar(r) {
        const g = new Group();
        // silver body armor
        g.add(_box(0, 0.45, 0, 0.3, 0.5, 0.2, 0xb0b0b0, 0.7));
        g.add(_sphere(0, 0.85, 0, 0.12, 0xead6a6));
        // laurel wreath (two small torus arcs)
        const wreath = new Mesh(new TorusGeometry(0.14, 0.02, 6, 16, Math.PI),
            new MeshStandardMaterial({ color: 0x2d8c2d, metalness: 0.2 }));
        wreath.position.set(0, 0.95, 0);
        wreath.rotation.x = Math.PI / 2;
        g.add(wreath);
        // red cape
        g.add(_plane(0, 0.55, -0.15, 0.4, 0.6, 0x8b0000, true));
        // legs
        g.add(_box(-0.09, 0.1, 0, 0.09, 0.25, 0.1, 0xb22222));
        g.add(_box(0.09, 0.1, 0, 0.09, 0.25, 0.1, 0xb22222));
        return g;
    },
    suntzu(r) {
        const g = new Group();
        // flowing robes
        g.add(_box(0, 0.4, 0, 0.26, 0.55, 0.18, 0x3a5a3a, 0.4));
        g.add(_sphere(0, 0.82, 0, 0.11, 0xead6a6));
        // bamboo hat (cone)
        const hat = new Mesh(new ConeGeometry(0.24, 0.12, 12),
            new MeshStandardMaterial({ color: 0xc8a84e, metalness: 0.1 }));
        hat.position.set(0, 0.93, 0);
        g.add(hat);
        // staff
        g.add(_cylinder(0.2, 0.3, 0, 0.025, 0.55, 0x6b4423));
        // legs
        g.add(_box(-0.07, 0.08, 0, 0.07, 0.2, 0.08, 0x2c2c2c));
        g.add(_box(0.07, 0.08, 0, 0.07, 0.2, 0.08, 0x2c2c2c));
        return g;
    },
    genghis(r) {
        const g = new Group();
        // dark fur armor
        g.add(_box(0, 0.45, 0, 0.28, 0.5, 0.2, 0x3d2b1f, 0.5));
        g.add(_sphere(0, 0.83, 0, 0.11, 0xead6a6));
        // fur helmet (cone + rim)
        const helm = new Mesh(new ConeGeometry(0.16, 0.18, 8),
            new MeshStandardMaterial({ color: 0x5c4033, metalness: 0.1 }));
        helm.position.set(0, 0.96, 0);
        g.add(helm);
        // fur brim
        const brim = new Mesh(new TorusGeometry(0.15, 0.03, 6, 16),
            new MeshStandardMaterial({ color: 0x5c4033 }));
        brim.rotation.x = Math.PI / 2; brim.position.set(0, 0.9, 0);
        g.add(brim);
        // bow (curved cylinder + line)
        g.add(_cylinder(-0.22, 0.5, 0, 0.02, 0.4, 0x6b4423));
        // legs
        g.add(_box(-0.08, 0.1, 0, 0.08, 0.25, 0.1, 0x3d2b1f));
        g.add(_box(0.08, 0.1, 0, 0.08, 0.25, 0.1, 0x3d2b1f));
        return g;
    },
    cleopatra(r) {
        const g = new Group();
        // flowing dress
        g.add(_box(0, 0.38, 0, 0.24, 0.5, 0.16, 0x1a3c6e, 0.3));
        g.add(_sphere(0, 0.78, 0, 0.11, 0xead6a6));
        // gold headdress
        const crown = new Mesh(new ConeGeometry(0.1, 0.22, 4),
            new MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, emissive: 0x332200 }));
        crown.position.set(0, 0.93, 0);
        g.add(crown);
        // gold饰品 collar
        const collar = new Mesh(new TorusGeometry(0.14, 0.02, 6, 12),
            new MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, emissive: 0x332200 }));
        collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.68, 0.04);
        g.add(collar);
        // snake bracelet (small torus on arm)
        const snake = new Mesh(new TorusGeometry(0.06, 0.015, 6, 12),
            new MeshStandardMaterial({ color: 0x00b36b, emissive: 0x003322 }));
        snake.position.set(0.18, 0.5, 0); snake.rotation.z = Math.PI / 2;
        g.add(snake);
        return g;
    },
    joan(r) {
        const g = new Group();
        // silver armor
        g.add(_box(0, 0.45, 0, 0.26, 0.5, 0.18, 0xc0c0c0, 0.7));
        g.add(_sphere(0, 0.85, 0, 0.11, 0xead6a6));
        // banner (plane with cross)
        const banner = _plane(0.18, 0.7, 0, 0.25, 0.3, 0xf0f0f0, true);
        g.add(banner);
        // cross on banner
        g.add(_box(0.18, 0.72, 0.01, 0.025, 0.2, 0.01, 0x222222));
        g.add(_box(0.18, 0.72, 0.01, 0.12, 0.025, 0.01, 0x222222));
        // glowing sword
        g.add(_box(0.22, 0.4, 0.1, 0.02, 0.32, 0.02, 0xe0e8ff, 0.9, 0x4466aa));
        // legs
        g.add(_box(-0.08, 0.1, 0, 0.08, 0.25, 0.1, 0xa0a0a0));
        g.add(_box(0.08, 0.1, 0, 0.08, 0.25, 0.1, 0xa0a0a0));
        return g;
    }
};

// ── Geometry helpers ──
function _box(x, y, z, w, h, d, color, metal = 0.3, emissive = 0x000000) {
    const m = new Mesh(new BoxGeometry(w, h, d),
        new MeshStandardMaterial({ color, metalness: metal, emissive }));
    m.position.set(x, y, z);
    return m;
}
function _sphere(x, y, z, r, color, metal = 0.2) {
    const m = new Mesh(new SphereGeometry(r, 10, 10),
        new MeshStandardMaterial({ color, metalness: metal }));
    m.position.set(x, y, z);
    return m;
}
function _cylinder(x, y, z, r, h, color) {
    const m = new Mesh(new CylinderGeometry(r, r, h, 8),
        new MeshStandardMaterial({ color, metalness: 0.2 }));
    m.position.set(x, y, z);
    return m;
}
function _plane(x, y, z, w, h, color, doubleSide = false) {
    const m = new Mesh(new PlaneGeometry(w, h),
        new MeshStandardMaterial({ color, side: doubleSide ? DoubleSide : FrontSide }));
    m.position.set(x, y, z);
    return m;
}
// (no-op — constants moved to top destructuring)

// ═══════════════════════════════════════════════════════════════════
//  HEROES3D CLASS
// ═══════════════════════════════════════════════════════════════════
export class Heroes3D {
    constructor(renderer) {
        this.r = renderer;       // renderer with ._scene, ._camera, .g
        this.heroes = new Map(); // territoryId → { group, aura, type, time }
    }

    /** Spawn a hero at the territory's world position */
    spawnHero(typeKey, territoryId) {
        if (this.heroes.has(territoryId)) this.removeHero(territoryId);

        const builder = _builders[typeKey];
        if (!builder) { console.warn(`Unknown hero type: ${typeKey}`); return; }

        // empire colour for aura tinting
        const ts = this.r.g.ts[territoryId];
        const empKey = ts && ts.owner;
        const empColor = empKey && EMPIRES[empKey] ? EMPIRES[empKey].color : '#ffffff';

        const group = new Group();
        const model = builder(this.r);
        model.scale.setScalar(HERO_SCALE / 1.0); // normalise to ~1.5 units
        group.add(model);

        // glowing aura
        const { ring, disc } = _makeAura(empColor);
        group.add(ring);
        group.add(disc);

        // place at territory centre
        const pos = _territoryPos(territoryId);
        group.position.set(pos.x, 0, pos.z);

        this.r._scene.add(group);
        this.heroes.set(territoryId, { group, ring, disc, type: typeKey, time: 0 });
    }

    /** Per-frame update: floating bob, aura pulse */
    update(dt) {
        const t = performance.now() * 0.001;
        for (const [tid, hero] of this.heroes) {
            hero.time += dt;
            const g = hero.group;
            // floating sin-wave bob
            g.position.y = 0.15 + Math.sin(hero.time * 2.0 + tid * 1.3) * 0.12;
            // gentle rotation
            g.rotation.y += dt * 0.4;
            // aura pulse
            const pulse = 0.3 + Math.sin(hero.time * 3.0) * 0.1;
            hero.ring.material.opacity = pulse;
            hero.disc.material.opacity = pulse * 0.35;
        }
    }

    /** Remove hero from scene */
    removeHero(territoryId) {
        const hero = this.heroes.get(territoryId);
        if (!hero) return;
        this.r._scene.remove(hero.group);
        hero.group.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
        this.heroes.delete(territoryId);
    }

    /** Get hero data for a territory */
    getHero(tid) {
        return this.heroes.get(tid) || null;
    }
}
