/**
 * trade3d.js — 3D trade route system for Emperor's Conquest.
 * Golden dashed lines between same-empire adjacent territories,
 * caravan cart groups moving along routes, trade docks on coast.
 */

import { TERRITORIES, EMPIRES } from './map.js';

const { Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, BoxGeometry,
        CylinderGeometry, LineDashedMaterial, BufferGeometry, Vector3,
        Float32BufferAttribute, MathUtils } = THREE;

const WS = 0.1;
const ROUTE_Y = 0.8;

// ── Map territory center → 3D world xz ──
function _pos(tid) {
    const t = TERRITORIES[tid];
    return new Vector3(t.cx * WS - 48, ROUTE_Y, t.cy * WS - 32);
}

// ── Shared geometries ──
const _cartBody = new BoxGeometry(0.15, 0.08, 0.1);
const _cartCargo = new BoxGeometry(0.1, 0.06, 0.08);
const _wheel = new CylinderGeometry(0.04, 0.04, 0.02, 8);
const _dockGeo = new BoxGeometry(0.3, 0.02, 0.15);
const _boatGeo = new BoxGeometry(0.1, 0.03, 0.05);

// ── Shared materials ──
const _goldMat = new LineDashedMaterial({ color: 0xFFD700, dashSize: 0.3, gapSize: 0.15 });
const _woodMat = new MeshStandardMaterial({ color: 0x8B5A2B, metalness: 0.1 });
const _cargoMat = new MeshStandardMaterial({ color: 0x6B3A1F, metalness: 0.1 });
const _wheelMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.4 });
const _boatMat = new MeshStandardMaterial({ color: 0x5C4033, metalness: 0.15 });

// ── Build a caravan cart group ──
function _buildCaravan(empireColor) {
    const g = new Group();
    const mat = new MeshStandardMaterial({ color: empireColor, metalness: 0.2 });

    // Cart body
    const body = new Mesh(_cartBody, mat);
    body.position.y = 0.1;
    g.add(body);

    // Cargo on top
    const cargo = new Mesh(_cartCargo, _cargoMat);
    cargo.position.y = 0.17;
    g.add(cargo);

    // Wheels (left + right)
    for (const xOff of [-0.07, 0.07]) {
        const w = new Mesh(_wheel, _wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(xOff, 0.04, 0.06);
        g.add(w);
    }

    return g;
}

// ── Build a dock for coastal territories ──
function _buildDock() {
    const g = new Group();
    const dock = new Mesh(_dockGeo, _woodMat);
    dock.position.y = 0.01;
    g.add(dock);

    const boat = new Mesh(_boatGeo, _boatMat);
    boat.position.set(0.2, 0.02, 0);
    g.add(boat);

    return g;
}

// ── Create a trade line between two territories ──
function _createLine(posA, posB) {
    const geo = new BufferGeometry().setFromPoints([
        new Vector3(posA.x, posA.y, posA.z),
        new Vector3(posB.x, posB.y, posB.z)
    ]);
    geo.computeLineDistances();
    const line = new THREE.Line(geo, _goldMat.clone());
    line.castShadow = false;
    return line;
}

// ── Route key from territory pair ──
function _routeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export class Trade3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = renderer._scene;
        this.g = renderer.g;
        this.container = new Group();
        this.container.name = 'trade_routes';
        this.scene.add(this.container);

        // Maps: routeKey → { line, caravans:[], tidA, tidB, empire }
        this.routes = new Map();
        // Map: tid → dock mesh
        this.docks = new Map();
        // Track ownership for change detection
        this._ownerCache = {};
        this._dashOffset = 0;
    }

    // ── Get current owner of a territory ──
    _getOwner(tid) {
        const ts = this.g?.ts;
        if (!ts) return null;
        return ts[tid]?.owner || null;
    }

    // ── Check if any ownership changed since last frame ──
    _ownershipChanged() {
        const ts = this.g?.ts;
        if (!ts) return false;
        for (let tid = 0; tid < TERRITORIES.length; tid++) {
            const owner = ts[tid]?.owner || null;
            if (this._ownerCache[tid] !== owner) return true;
        }
        return false;
    }

    // ── Rebuild all trade routes from scratch ──
    _rebuildRoutes() {
        // Cache ownership
        for (let tid = 0; tid < TERRITORIES.length; tid++) {
            this._ownerCache[tid] = this._getOwner(tid);
        }

        const newKeys = new Set();

        // Find all same-empire adjacent pairs
        for (let tid = 0; tid < TERRITORIES.length; tid++) {
            const owner = this._getOwner(tid);
            if (!owner) continue;
            const t = TERRITORIES[tid];
            for (const adjId of t.adj) {
                if (adjId <= tid) continue; // skip duplicates
                if (this._getOwner(adjId) !== owner) continue;
                const key = _routeKey(tid, adjId);
                newKeys.add(key);

                if (!this.routes.has(key)) {
                    this._addRoute(tid, adjId, owner);
                }
            }
        }

        // Remove routes that no longer exist
        for (const [key, route] of this.routes) {
            if (!newKeys.has(key)) {
                this._removeRoute(key, route);
            }
        }

        // Update docks
        this._updateDocks();
    }

    // ── Add a single route ──
    _addRoute(tidA, tidB, empireId) {
        const key = _routeKey(tidA, tidB);
        const posA = _pos(tidA);
        const posB = _pos(tidB);
        const color = EMPIRES[empireId]?.color || 0xFFD700;

        const line = _createLine(posA, posB);
        this.container.add(line);

        // Spawn 1-2 caravans
        const caravans = [];
        const count = Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const cart = _buildCaravan(color);
            cart.userData = {
                tidA, tidB,
                progress: i * 0.5 + Math.random() * 0.2,
                speed: 0.1 + Math.random() * 0.04,
                direction: 1,
                posA: posA.clone(),
                posB: posB.clone()
            };
            this.container.add(cart);
            caravans.push(cart);
        }

        this.routes.set(key, { line, caravans, tidA, tidB, empireId });
    }

    // ── Remove a single route ──
    _removeRoute(key, route) {
        this.container.remove(route.line);
        route.line.geometry.dispose();
        route.line.material.dispose();
        for (const c of route.caravans) {
            this.container.remove(c);
        }
        this.routes.delete(key);
    }

    // ── Update trade docks on coastal territories ──
    _updateDocks() {
        for (let tid = 0; tid < TERRITORIES.length; tid++) {
            const t = TERRITORIES[tid];
            const isCoastal = t.terrain === 'coast' || t.terrain === 'island' || t.terrain === 'peninsula';
            const owner = this._getOwner(tid);
            const hasTradeRoute = this._hasRouteFor(tid);

            // Should have dock: coastal + owned + has trade route
            if (isCoastal && owner && hasTradeRoute) {
                if (!this.docks.has(tid)) {
                    const dock = _buildDock();
                    const pos = _pos(tid);
                    dock.position.set(pos.x + 0.15, 0, pos.z + 0.12);
                    this.container.add(dock);
                    this.docks.set(tid, dock);
                }
            } else {
                if (this.docks.has(tid)) {
                    this.container.remove(this.docks.get(tid));
                    this.docks.delete(tid);
                }
            }
        }
    }

    _hasRouteFor(tid) {
        for (const [, r] of this.routes) {
            if (r.tidA === tid || r.tidB === tid) return true;
        }
        return false;
    }

    // ── Main update loop ──
    update(dt) {
        if (!this.g || !this.g.ts) return;

        // Dynamic routing: check for ownership changes (throttled every ~0.5s)
        this._checkTimer = (this._checkTimer || 0) + dt;
        if (this._checkTimer > 0.5 && this._ownershipChanged()) {
            this._rebuildRoutes();
            this._checkTimer = 0;
        }

        // Animate dash offset on all route lines
        this._dashOffset -= dt * 1.5;
        for (const [, route] of this.routes) {
            route.line.material.dashOffset = this._dashOffset;

            // Animate caravans along their routes
            for (const cart of route.caravans) {
                const d = cart.userData;
                d.progress += d.speed * d.direction * dt;

                // Reverse direction at endpoints
                if (d.progress >= 1) { d.progress = 1; d.direction = -1; }
                if (d.progress <= 0) { d.progress = 0; d.direction = 1; }

                // Interpolate position with slight bobbing
                const t = d.progress;
                const x = d.posA.x + (d.posB.x - d.posA.x) * t;
                const z = d.posA.z + (d.posB.z - d.posA.z) * t;
                const bob = Math.sin(d.progress * Math.PI * 4 + this._dashOffset * 3) * 0.02;

                cart.position.set(x, ROUTE_Y + bob, z);

                // Face direction of travel
                const dx = d.posB.x - d.posA.x;
                const dz = d.posB.z - d.posA.z;
                if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                    cart.rotation.y = Math.atan2(dx * d.direction, dz * d.direction);
                }
            }
        }
    }

    // ── Cleanup ──
    dispose() {
        for (const [, route] of this.routes) {
            this._removeRoute(_routeKey(route.tidA, route.tidB), route);
        }
        this.routes.clear();
        for (const [, dock] of this.docks) {
            this.container.remove(dock);
        }
        this.docks.clear();
        this.scene.remove(this.container);
    }
}
