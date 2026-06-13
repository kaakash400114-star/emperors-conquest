// naval3d.js – 3D Naval Warfare System for Emperor's Conquest
export class Naval3D {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = renderer._scene;
    this.camera = renderer._camera;
    this.g = renderer.g;
    this.ships = [];
    this.shipGroup = new THREE.Group();
    this.shipGroup.name = 'navalGroup';
    this.scene.add(this.shipGroup);
    this.nextId = 0;
  }

  buildShip(type, factionId, startX, startZ) {
    const faction = this.g.empires[factionId];
    const color = new THREE.Color(faction ? faction.color : '#888888');
    const group = new THREE.Group();
    const mats = {
      hull: new THREE.MeshPhongMaterial({ color: color.clone().multiplyScalar(0.6) }),
      deck: new THREE.MeshPhongMaterial({ color: 0x8B7355 }),
      ram: new THREE.MeshPhongMaterial({ color: 0xCD7F32 }),
      oar: new THREE.MeshPhongMaterial({ color: 0x654321 }),
      sail: new THREE.MeshPhongMaterial({ color: 0xFAEBD7, side: THREE.DoubleSide }),
    };

    if (type === 'trireme') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 1), mats.hull);
      hull.position.y = 0.15; group.add(hull);
      for (let row = 0; row < 3; row++) {
        for (let side = -1; side <= 1; side += 2) {
          for (let i = 0; i < 5; i++) {
            const oar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.8), mats.oar);
            oar.position.set(-1.4 + i * 0.7, -0.1 + row * 0.15, side * 0.7);
            group.add(oar);
          }
        }
      }
      const ram = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.8, 6), mats.ram);
      ram.rotation.z = -Math.PI / 2; ram.position.set(2.3, 0.05, 0);
      group.add(ram);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), mats.sail);
      sail.position.set(0, 1.1, 0); group.add(sail);
    } else if (type === 'longship') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 0.8), mats.hull);
      hull.position.y = 0.12; group.add(hull);
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 6; i++) {
          const oar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.7), mats.oar);
          oar.position.set(-1.5 + i * 0.6, -0.05, side * 0.6);
          group.add(oar);
        }
      }
      const prow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 6), mats.ram);
      prow.rotation.z = -Math.PI / 2; prow.position.set(2.7, 0.3, 0);
      group.add(prow);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 6), mats.ram);
      tail.rotation.z = Math.PI / 2; tail.position.set(-2.5, 0.2, 0);
      group.add(tail);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8), mats.sail);
      sail.position.set(0, 1.2, 0);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2),
        new THREE.MeshPhongMaterial({ color: 0xCC2222, side: THREE.DoubleSide }));
      stripe.position.set(0, 1.0, 0.01); group.add(sail); group.add(stripe);
    } else if (type === 'junk') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 1.4), mats.hull);
      hull.position.y = 0.15; group.add(hull);
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.5, 1, 4, 1, false, 0, Math.PI),
        new THREE.MeshPhongMaterial({ color: 0xCD7F32 }));
      bow.rotation.z = Math.PI / 2; bow.rotation.y = Math.PI / 4;
      bow.position.set(2, 0.2, 0); group.add(bow);
      const mastMat = new THREE.MeshPhongMaterial({ color: 0x654321 });
      const mast1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2), mastMat);
      mast1.position.set(0.3, 1.3, 0); group.add(mast1);
      const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2), mastMat);
      mast2.position.set(-1.0, 1.3, 0); group.add(mast2);
      const redSail = new THREE.MeshPhongMaterial({ color: 0xCC1111, side: THREE.DoubleSide });
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), redSail);
      s1.position.set(0.3, 1.5, 0); group.add(s1);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), redSail);
      s2.position.set(-1.0, 1.5, 0); group.add(s2);
    }

    const stats = { trireme: { hp: 120, spd: 2.0, dmg: 25 }, longship: { hp: 80, spd: 3.0, dmg: 20 }, junk: { hp: 150, spd: 1.5, dmg: 15 } };
    const s = stats[type] || stats.trireme;
    const ship = {
      id: this.nextId++, type, factionId, group,
      x: startX, z: startZ, targetX: startX, targetZ: startZ,
      hp: s.hp, maxHp: s.hp, speed: s.spd, damage: s.dmg,
      moving: false, attacking: false, attackTarget: null,
      flashTimer: 0, oarPhase: 0, sinkProgress: 0, alive: true,
    };
    ship.group.position.set(startX, 0, startZ);
    this.ships.push(ship);
    this.shipGroup.add(group);
    return ship.id;
  }

  moveShip(shipId, targetX, targetZ) {
    const ship = this.ships.find(s => s.id === shipId);
    if (!ship || !ship.alive) return;
    ship.targetX = targetX;
    ship.targetZ = targetZ;
    ship.moving = true;
    ship.attacking = false;
    ship.attackTarget = null;
  }

  attackShip(shipId, targetId) {
    const ship = this.ships.find(s => s.id === shipId);
    const target = this.ships.find(s => s.id === targetId);
    if (!ship || !target || !ship.alive || !target.alive) return;
    ship.attacking = true;
    ship.attackTarget = targetId;
    ship.moving = false;
  }

  removeShip(shipId) {
    const idx = this.ships.findIndex(s => s.id === shipId);
    if (idx < 0) return;
    const ship = this.ships[idx];
    this.shipGroup.remove(ship.group);
    ship.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); } });
    this.ships.splice(idx, 1);
  }

  update(dt) {
    const t = performance.now() * 0.001;
    for (const ship of this.ships) {
      if (!ship.alive) { this._sinkShip(ship, t, dt); continue; }

      // Attack logic: chase and ram
      if (ship.attacking && ship.attackTarget !== null) {
        const tgt = this.ships.find(s => s.id === ship.attackTarget);
        if (!tgt || !tgt.alive) { ship.attacking = false; ship.attackTarget = null; continue; }
        const dx = tgt.x - ship.x, dz = tgt.z - ship.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 1.5) {
          const moveSpd = ship.speed * dt;
          ship.x += (dx / dist) * moveSpd;
          ship.z += (dz / dist) * moveSpd;
        } else {
          tgt.hp -= ship.damage * dt;
          tgt.flashTimer = 0.15;
          if (tgt.hp <= 0) { tgt.hp = 0; tgt.alive = false; tgt.sinkProgress = 0; }
        }
      }

      // Move toward target
      if (ship.moving) {
        const dx = ship.targetX - ship.x, dz = ship.targetZ - ship.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.3) {
          const moveSpd = ship.speed * dt;
          ship.x += (dx / dist) * moveSpd;
          ship.z += (dz / dist) * moveSpd;
        } else { ship.moving = false; }
      }

      // Rotate toward movement direction
      const vx = (ship.moving ? ship.targetX - ship.x : 0) || (ship.attacking && ship.attackTarget !== null ? (() => { const tg = this.ships.find(s => s.id === ship.attackTarget); return tg ? tg.x - ship.x : 0; })() : 0);
      const vz = (ship.moving ? ship.targetZ - ship.z : 0) || (ship.attacking && ship.attackTarget !== null ? (() => { const tg = this.ships.find(s => s.id === ship.attackTarget); return tg ? tg.z - ship.z : 0; })() : 0);
      if (Math.abs(vx) + Math.abs(vz) > 0.01) {
        const angle = Math.atan2(vx, vz);
        ship.group.rotation.y += (angle - ship.group.rotation.y) * 3 * dt;
      }

      // Wave bobbing
      const waveY = Math.sin(t * 1.5 + ship.x * 0.8) * 0.15 + Math.sin(t * 0.7 + ship.z * 0.6) * 0.1;
      const waveRot = Math.sin(t * 1.2 + ship.x * 0.5) * 0.03;

      // Oar animation
      ship.oarPhase += dt * 3;
      const oarAngle = Math.sin(ship.oarPhase) * 0.3;
      const oars = [];
      ship.group.traverse(c => { if (c.geometry && c.geometry.parameters && c.geometry.parameters.width < 0.07 && c.geometry.parameters.depth > 0.5) oars.push(c); });
      oars.forEach((o, i) => { o.rotation.x = oarAngle * ((i % 2) * 2 - 1); });

      // Sail flutter
      ship.group.traverse(c => {
        if (c.geometry && c.geometry.parameters && c.geometry.parameters.width > 0.8 && c.geometry.parameters.height > 1) {
          c.rotation.z = Math.sin(t * 2 + ship.x) * 0.05;
        }
      });

      // Flash on damage
      if (ship.flashTimer > 0) {
        ship.flashTimer -= dt;
        const f = Math.sin(ship.flashTimer * 40) > 0;
        ship.group.traverse(c => { if (c.material && c.material.emissive) c.material.emissive.setHex(f ? 0xff0000 : 0x000000); });
      } else {
        ship.group.traverse(c => { if (c.material && c.material.emissive) c.material.emissive.setHex(0x000000); });
      }

      // Apply position
      if (ship.alive) {
        ship.group.position.set(ship.x, waveY, ship.z);
        ship.group.rotation.z = waveRot;
      }
    }
  }

  _sinkShip(ship, t, dt) {
    const waveY = Math.sin(t * 1.5 + ship.x * 0.8) * 0.15 + Math.sin(t * 0.7 + ship.z * 0.6) * 0.1;
    ship.sinkProgress += dt * 0.5;
    ship.group.position.y = waveY - ship.sinkProgress;
    ship.group.rotation.z = ship.sinkProgress * 0.5;
    if (ship.sinkProgress > 2) this.removeShip(ship.id);
  }
}
