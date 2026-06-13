import { TERRITORIES, EMPIRES } from './map.js';

const WS = 0.1;

function mapTo3D(cx, cy) {
  return { x: cx * WS - 48, z: cy * WS - 32 };
}

export class Flags3D {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = renderer._scene;
    this.game = renderer.g;
    this.flags = new Map();
    this.time = 0;

    this._initMaterials();
    this.syncOwnership();
  }

  _initMaterials() {
    this.poleMat = new THREE.MeshStandardMaterial({
      color: 0x888888, metalness: 0.8, roughness: 0.3
    });
    this.baseMat = new THREE.MeshStandardMaterial({
      color: 0x666666, metalness: 0.7, roughness: 0.4
    });
    this.capMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, metalness: 0.9, roughness: 0.2
    });
    this.clothGeoms = new Map();
    this.clothOriginals = new Map();
  }

  _getClothGeom(scale) {
    const key = scale.toFixed(2);
    if (this.clothGeoms.has(key)) return this.clothGeoms.get(key);
    const geom = new THREE.PlaneGeometry(0.5 * scale, 0.3 * scale, 8, 5);
    this.clothGeoms.set(key, geom);
    return geom;
  }

  _storeOriginals(geom) {
    const id = geom.id;
    if (!this.clothOriginals.has(id)) {
      const pos = geom.attributes.position;
      const arr = new Float32Array(pos.count * 3);
      arr.set(pos.array);
      this.clothOriginals.set(id, arr);
    }
    return this.clothOriginals.get(id);
  }

  _getColor(tid) {
    const ts = this.game.ts[tid];
    return ts && ts.owner >= 0 ? EMPIRES[ts.owner].color : null;
  }

  _getTroops(tid) {
    const ts = this.game.ts[tid];
    return ts ? (ts.troops || 0) : 0;
  }

  _getTier(tid) {
    const t = this._getTroops(tid);
    if (t >= 200) return 3;
    if (t >= 100) return 2;
    return 1;
  }

  _getPosition(tid) {
    const armies3d = this.renderer.armies3d;
    if (armies3d && armies3d.getMesh) {
      const m = armies3d.getMesh(tid);
      if (m) return m.position.clone();
    }
    const territory = TERRITORIES[tid];
    if (territory) {
      const p = mapTo3D(territory.cx, territory.cy);
      return new THREE.Vector3(p.x, 0.5, p.z);
    }
    return new THREE.Vector3(0, 0.5, 0);
  }

  _createFlag(tid, position, scale, clothColor) {
    const group = new THREE.Group();

    // Pole
    const poleH = 1.2 * scale;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, poleH, 6),
      this.poleMat
    );
    pole.position.y = poleH / 2;
    group.add(pole);

    // Base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 * scale, 0.05, 0.1 * scale),
      this.baseMat
    );
    group.add(base);

    // Cloth
    const clothGeom = this._getClothGeom(scale);
    const clothMat = new THREE.MeshStandardMaterial({
      color: clothColor,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1
    });
    const cloth = new THREE.Mesh(clothGeom, clothMat);
    cloth.position.set(0.25 * scale, poleH - 0.08, 0);
    group.add(cloth);

    // Golden cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 * scale, 8, 8),
      this.capMat
    );
    cap.position.y = poleH + 0.02;
    group.add(cap);

    // Store cloth refs for animation
    this._storeOriginals(clothGeom);

    group.position.copy(position);
    this.scene.add(group);

    return { group, cloth, clothGeom, clothMat, scale, tid };
  }

  _addFlagsForTerritory(tid) {
    const color = this._getColor(tid);
    if (!color) return;

    const pos = this._getPosition(tid);
    const tier = this._getTier(tid);
    const flags = [];

    // Main flag
    const main = this._createFlag(tid, pos, 1.0, color);
    flags.push(main);

    if (tier >= 2) {
      // Side flags for fortresses
      const offset = new THREE.Vector3(0.35, 0, 0.25);
      const side1 = this._createFlag(tid, pos.clone().sub(offset), 0.7, color);
      const side2 = this._createFlag(tid, pos.clone().add(new THREE.Vector3(-0.35, 0, -0.25)), 0.7, color);
      flags.push(side1, side2);
    }

    if (tier >= 3) {
      // Golden eagle standard for wonders
      const eagleGroup = new THREE.Group();
      const eagleBody = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.12, 4),
        this.capMat
      );
      eagleBody.position.y = 1.35;
      eagleGroup.add(eagleBody);
      const eagleRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.04, 0.008, 8, 12),
        this.capMat
      );
      eagleRing.position.y = 1.3;
      eagleGroup.add(eagleRing);
      eagleGroup.position.copy(pos);
      eagleGroup.position.x += 0.15;
      this.scene.add(eagleGroup);
      flags.push({ group: eagleGroup, isEagle: true });
    }

    this.flags.set(tid, { tier, flags, owner: this.game.ts[tid].owner });
  }

  _removeFlagsForTerritory(tid) {
    const entry = this.flags.get(tid);
    if (!entry) return;
    for (const f of entry.flags) {
      if (f.clothGeom) {
        // Don't remove shared geometry, just dispose material
        f.clothMat.dispose();
      }
      if (f.group) {
        this.scene.remove(f.group);
        f.group.traverse(child => {
          if (child.geometry && !this.clothGeoms.has(child.geometry.id.toFixed ? child.geometry.parameters?.width?.toFixed(2) : '')) {
            child.geometry.dispose();
          }
          if (child.material && child.material !== this.poleMat &&
              child.material !== this.baseMat && child.material !== this.capMat) {
            child.material.dispose();
          }
        });
      }
    }
    this.flags.delete(tid);
  }

  syncOwnership() {
    for (let tid = 0; tid < TERRITORIES.length; tid++) {
      const ts = this.game.ts[tid];
      const entry = this.flags.get(tid);
      const owner = ts ? ts.owner : -1;

      if (!entry && owner >= 0) {
        this._addFlagsForTerritory(tid);
      } else if (entry && owner < 0) {
        this._removeFlagsForTerritory(tid);
      } else if (entry && owner >= 0) {
        const newTier = this._getTier(tid);
        const color = EMPIRES[owner].color;
        if (entry.tier !== newTier || entry.owner !== owner) {
          this._removeFlagsForTerritory(tid);
          this._addFlagsForTerritory(tid);
        }
      }
    }
  }

  update(dt) {
    this.time += dt;

    for (const [, entry] of this.flags) {
      for (const f of entry.flags) {
        if (f.isEagle || !f.clothGeom) continue;
        const geom = f.clothGeom;
        const originals = this._storeOriginals(geom);
        const pos = geom.attributes.position;
        const count = pos.count;

        for (let i = 0; i < count; i++) {
          const ox = originals[i * 3];
          const oy = originals[i * 3 + 1];
          const oz = originals[i * 3 + 2];
          const wave = Math.sin(ox * 8 / f.scale + this.time * 5) * 0.05 * f.scale;
          pos.setXYZ(i, ox, oy, oz + wave);
        }

        pos.needsUpdate = true;
        geom.computeVertexNormals();
      }
    }

    this.syncOwnership();
  }

  dispose() {
    for (const [tid] of this.flags) {
      this._removeFlagsForTerritory(tid);
    }
    this.flags.clear();
    for (const [, geom] of this.clothGeoms) {
      geom.dispose();
    }
    this.clothGeoms.clear();
    this.clothOriginals.clear();
    this.poleMat.dispose();
    this.baseMat.dispose();
    this.capMat.dispose();
  }
}
