// ═══════════════════════════════════════════════════════════════════
// fogofwar3d.js — Emperor's Conquest Fog of War System
// Dark fog planes over territories. Player-owned = clear,
// adjacent = dimmed (0.4), unknown = dark (0.85). Gradual transitions.
// ═══════════════════════════════════════════════════════════════════

import { TERRITORIES } from './map.js';

const { PlaneGeometry, MeshBasicMaterial, Mesh, Group, MathUtils } = THREE;

const WS = 0.1;
const TERRAIN_H = { plains:1.0, desert:0.6, mountains:3.5, coast:0.3, island:0.4, forest:1.6, peninsula:0.8 };
const FOG_CLEAR = 0;
const FOG_DIM   = 0.4;
const FOG_DARK  = 0.85;
const LERP_SPEED = 2.5;    // per second (~2s to converge)
const WOBBLE_AMP = 0.06;

function mapTo3D(cx, cy) { return { x: cx * WS - 48, z: cy * WS - 32 }; }

export class FogOfWar3D {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene    = renderer._scene;
    this.game     = renderer.g;
    this.group    = new Group();
    this.scene.add(this.group);
    this.time     = 0;

    this.fogData = new Map();   // tid → { mesh, target, opacity, origPos }
    this.adjacencyCache = this._buildAdjacencyCache();
    this._buildFogPlanes();
  }

  _buildAdjacencyCache() {
    // Build a reverse lookup: territory → set of all neighbors
    const adj = new Map();
    for (const t of TERRITORIES) adj.set(t.id, new Set(t.adj));
    return adj;
  }

  _buildFogPlanes() {
    const geom = new PlaneGeometry(3, 3, 8, 8);
    const mat  = new MeshBasicMaterial({
      color: 0x050510, transparent: true, opacity: FOG_DARK,
      depthWrite: false, side: THREE.DoubleSide
    });

    // Cache original vertex positions for wobble
    const posArr = geom.attributes.position.array;
    const origPos = new Float32Array(posArr.length);
    origPos.set(posArr);

    for (const t of TERRITORIES) {
      const mesh = new THREE.Mesh(geom.clone(), mat.clone());
      mesh.rotation.x = -Math.PI / 2;

      const h = TERRAIN_H[t.terrain] || 1.0;
      const p = mapTo3D(t.cx, t.cy);
      mesh.position.set(p.x, h + 0.5, p.z);

      // Store original positions for this clone
      const mPosArr = mesh.geometry.attributes.position.array;
      const mOrig   = new Float32Array(mPosArr.length);
      mOrig.set(mPosArr);

      this.group.add(mesh);
      this.fogData.set(t.id, {
        mesh, target: FOG_DARK, opacity: FOG_DARK, origPos: mOrig
      });
    }

    geom.dispose();
    mat.dispose();
  }

  revealTerritory(terrId) {
    const d = this.fogData.get(terrId);
    if (d) { d.target = FOG_CLEAR; }
  }

  hideTerritory(terrId) {
    const d = this.fogData.get(terrId);
    if (d) { d.target = FOG_DARK; }
  }

  _computeTargets() {
    const pid = this.game.player;
    const ts  = this.game.ts;
    if (pid == null) return;

    // Find all player-owned territory ids
    const owned = new Set();
    for (const t of TERRITORIES) {
      if (ts[t.id] && ts[t.id].owner === pid) owned.add(t.id);
    }

    const cache = this.adjacencyCache;
    for (const t of TERRITORIES) {
      const d = this.fogData.get(t.id);
      if (!d) continue;

      if (owned.has(t.id)) {
        d.target = FOG_CLEAR;
      } else {
        // Check if any neighbor is player-owned
        const neighbors = cache.get(t.id);
        let isAdj = false;
        if (neighbors) {
          for (const nid of neighbors) {
            if (owned.has(nid)) { isAdj = true; break; }
          }
        }
        d.target = isAdj ? FOG_DIM : FOG_DARK;
      }
    }
  }

  _wobble(mesh, origPos, time) {
    const pos = mesh.geometry.attributes.position;
    const arr = pos.array;
    // Only displace vertices near edges (skip center region)
    for (let i = 0; i < pos.count; i++) {
      const ox = origPos[i * 3];
      const oy = origPos[i * 3 + 1];
      // Distance from center normalized to 0..1
      const dx = Math.abs(ox) / 1.5;
      const dy = Math.abs(oy) / 1.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const edgeFactor = MathUtils.smoothstep(0.5, 1.0, dist);
      // Rotate to be in world XZ by applying wobble to Y in pre-rotation space
      // Since mesh is rotated -PI/2 on X, local Y → world -Z, local Z → world Y
      // We wobble in the pre-rotation local Z (becomes world Y)
      const wobble = Math.sin(time * 1.5 + ox * 3.0 + oy * 2.0) * WOBBLE_AMP * edgeFactor;
      arr[i * 3 + 2] = origPos[i * 3 + 2] + wobble;
    }
    pos.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this._computeTargets();

    for (const [, d] of this.fogData) {
      // Lerp opacity toward target
      const diff = d.target - d.opacity;
      if (Math.abs(diff) > 0.001) {
        d.opacity += MathUtils.lerp(0, diff, 1 - Math.exp(-LERP_SPEED * dt));
        d.mesh.material.opacity = d.opacity;
      }

      // Wobble the fog plane edges
      this._wobble(d.mesh, d.origPos, this.time);
    }
  }

  dispose() {
    for (const [, d] of this.fogData) {
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
      this.group.remove(d.mesh);
    }
    this.fogData.clear();
    this.scene.remove(this.group);
  }
}
