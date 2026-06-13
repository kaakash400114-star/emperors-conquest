// weather3d.js — 3D Weather System for Emperor's Conquest
// ES module export. Uses global THREE.

const WEATHER_CONFIGS = {
  clear: {
    sunIntensity: 1.2,
    sunColor: 0xfff4e0,
    ambientIntensity: 0.6,
    ambientColor: 0x8899bb,
    fogType: 'none',
    particles: null,
    particleRate: 0,
  },
  rain: {
    sunIntensity: 0.4,
    sunColor: 0x8899aa,
    ambientIntensity: 0.4,
    ambientColor: 0x667788,
    fogType: 'linear',
    fogColor: 0x334455,
    fogNear: 10,
    fogFar: 120,
    particles: 'rain',
    particleRate: 600,
  },
  storm: {
    sunIntensity: 0.15,
    sunColor: 0x556677,
    ambientIntensity: 0.2,
    ambientColor: 0x445566,
    fogType: 'linear',
    fogColor: 0x222233,
    fogNear: 5,
    fogFar: 80,
    particles: 'rain',
    particleRate: 1200,
  },
  fog: {
    sunIntensity: 0.3,
    sunColor: 0x99aa99,
    ambientIntensity: 0.5,
    ambientColor: 0x99aa88,
    fogType: 'exp2',
    fogColor: 0x99aa99,
    fogDensity: 0.04,
    particles: null,
    particleRate: 0,
  },
  snow: {
    sunIntensity: 0.5,
    sunColor: 0xccccdd,
    ambientIntensity: 0.6,
    ambientColor: 0xaabbcc,
    fogType: 'linear',
    fogColor: 0xbbbbcc,
    fogNear: 20,
    fogFar: 150,
    particles: 'snow',
    particleRate: 300,
  },
  sandstorm: {
    sunIntensity: 0.6,
    sunColor: 0xccaa77,
    ambientIntensity: 0.7,
    ambientColor: 0xbb9966,
    fogType: 'exp2',
    fogColor: 0xccaa77,
    fogDensity: 0.06,
    particles: 'sand',
    particleRate: 800,
  },
};

export class Weather3D {
  constructor(renderer, particleSystem) {
    this.renderer = renderer;
    this.scene = renderer._scene;
    this.camera = renderer._camera;
    this.sun = renderer._sun;
    this.game = renderer.g;
    this.particleSystem = particleSystem;

    this.currentWeather = 'clear';
    this.targetWeather = 'clear';
    this.transitionProgress = 1.0; // 1 = fully transitioned
    this.transitionSpeed = 0.4;

    // Store original sun values for blending
    this._origSunIntensity = this.sun.intensity;
    this._origSunColor = this.sun.color.clone();

    // Ambient light ref (create if missing)
    this.ambientLight = this._findOrCreateAmbient();

    // Store original ambient
    this._origAmbientIntensity = this.ambientLight.intensity;
    this._origAmbientColor = this.ambientLight.color.clone();

    // Transition state (from values)
    this._fromSunIntensity = this._origSunIntensity;
    this._fromSunColor = this._origSunColor.clone();
    this._fromAmbientIntensity = this._origAmbientIntensity;
    this._fromAmbientColor = this._origAmbientColor.clone();

    // Lightning system
    this._lightningLight = null;
    this._lightningTimer = 0;
    this._lightningDuration = 0;
    this._lightningActive = false;

    // Particle wind direction for drift
    this._windAngle = 0;

    // Saved fog reference for cleanup
    this._activeFog = null;
    this._fromFogDensity = 0;
    this._fromFogNear = 1;
    this._fromFogFar = 1000;

    // Active particle type
    this._activeParticleType = null;
  }

  _findOrCreateAmbient() {
    let ambient = null;
    this.scene.traverse((obj) => {
      if (!ambient && obj.isAmbientLight) ambient = obj;
    });
    if (!ambient) {
      ambient = new THREE.AmbientLight(0x8899bb, 0.6);
      this.scene.add(ambient);
    }
    return ambient;
  }

  setWeather(type) {
    if (!WEATHER_CONFIGS[type]) {
      console.warn(`Weather3D: unknown type "${type}"`);
      return;
    }
    if (type === this.targetWeather && this.transitionProgress >= 1.0) return;

    // Snapshot current interpolated values as "from"
    this._fromSunIntensity = this.sun.intensity;
    this._fromSunColor = this.sun.color.clone();
    this._fromAmbientIntensity = this.ambientLight.intensity;
    this._fromAmbientColor = this.ambientLight.color.clone();

    // Snapshot fog
    if (this.scene.fog) {
      if (this.scene.fog.isFog) {
        this._fromFogNear = this.scene.fog.near;
        this._fromFogFar = this.scene.fog.far;
      } else {
        this._fromFogDensity = this.scene.fog.density;
      }
    }

    this._activeParticleType = this.activeParticleType;

    // Stop current particles
    if (this.particleSystem && this.particleSystem.stop) {
      this.particleSystem.stop(this.activeParticleType);
    }

    this.targetWeather = type;
    this.currentWeather = type;
    this.transitionProgress = 0;

    // Remove lightning if leaving storm
    if (type !== 'storm' && this._lightningLight) {
      this.scene.remove(this._lightningLight);
      this._lightningLight.dispose();
      this._lightningLight = null;
      this._lightningActive = false;
    }
  }

  update(dt) {
    if (this.transitionProgress < 1.0) {
      this.transitionProgress = Math.min(1.0, this.transitionProgress + dt * this.transitionSpeed);
      this._applyTransition(this.transitionProgress);
    }

    // Lightning for storms
    if (this.currentWeather === 'storm' && this.transitionProgress >= 1.0) {
      this._updateLightning(dt);
    }

    // Continuous particle emission
    this._emitParticles(dt);

    // Animate particle wind
    this._windAngle += dt * 0.1;
  }

  _applyTransition(t) {
    const cfg = WEATHER_CONFIGS[this.targetWeather];
    const ease = t * t * (3 - 2 * t); // smoothstep

    // Sun
    this.sun.intensity = this._lerp(this._fromSunIntensity, cfg.sunIntensity, ease);
    this.sun.color.lerpColors(this._fromSunColor, new THREE.Color(cfg.sunColor), ease);

    // Ambient
    this.ambientLight.intensity = this._lerp(this._fromAmbientIntensity, cfg.ambientIntensity, ease);
    this.ambientLight.color.lerpColors(this._fromAmbientColor, new THREE.Color(cfg.ambientColor), ease);

    // Fog
    this._applyFog(cfg, ease);

    // Particles — start emitting once transition passes 30%
    if (ease > 0.3 && cfg.particles) {
      this._activeParticleType = cfg.particles;
      this._particleRate = cfg.particleRate;
    } else if (ease > 0.7 && !cfg.particles) {
      this._activeParticleType = null;
      this._particleRate = 0;
    }
  }

  _applyFog(cfg, ease) {
    if (cfg.fogType === 'none') {
      if (ease > 0.5) this.scene.fog = null;
      return;
    }

    if (cfg.fogType === 'linear') {
      const fog = new THREE.Fog(cfg.fogColor, 1, 1000);
      fog.near = this._lerp(this._fromFogNear, cfg.fogNear, ease);
      fog.far = this._lerp(this._fromFogFar, cfg.fogFar, ease);
      this.scene.fog = fog;
    } else if (cfg.fogType === 'exp2') {
      const density = this._lerp(this._fromFogDensity, cfg.fogDensity, ease);
      this.scene.fog = new THREE.FogExp2(cfg.fogColor, density);
    }
  }

  _emitParticles(dt) {
    if (!this._activeParticleType || !this.particleSystem) return;
    const rate = this._particleRate || 0;
    if (rate <= 0) return;

    const count = Math.ceil(rate * dt);
    const cam = this.camera.position;
    const windX = Math.sin(this._windAngle) * 2;

    for (let i = 0; i < count; i++) {
      const x = cam.x + (Math.random() - 0.5) * 60;
      const y = cam.y + 20 + Math.random() * 15;
      const z = cam.z + (Math.random() - 0.5) * 60;
      const vx = windX + (Math.random() - 0.5) * 0.5;
      const vy = -8 - Math.random() * 6;
      const vz = (Math.random() - 0.5) * 0.5;

      if (this._activeParticleType === 'snow') {
        // Snow drifts more, falls slower
        const opts = this._makeParticleOpts(x, y, z, vx * 0.5, -2 - Math.random() * 2, vz * 0.3, 0xffffff, 3);
        this.particleSystem.emit(this._activeParticleType, opts);
      } else if (this._activeParticleType === 'sand') {
        const opts = this._makeParticleOpts(x, y, z, 4 + Math.random() * 4, -1 + Math.random() * 2, vz, 0xccaa77, 2);
        this.particleSystem.emit(this._activeParticleType, opts);
      } else {
        // rain
        const opts = this._makeParticleOpts(x, y, z, vx, vy, vz, 0xaaccff, 1.5);
        this.particleSystem.emit(this._activeParticleType, opts);
      }
    }
  }

  _makeParticleOpts(x, y, z, vx, vy, vz, color, life) {
    return {
      position: { x, y, z },
      velocity: { x: vx, y: vy, z: vz },
      color,
      life,
      size: 0.15 + Math.random() * 0.1,
    };
  }

  _updateLightning(dt) {
    if (this._lightningActive) {
      this._lightningDuration -= dt;
      if (this._lightningDuration <= 0) {
        this._lightningActive = false;
        if (this._lightningLight) {
          this._lightningLight.intensity = 0;
        }
        this._lightningTimer = 1 + Math.random() * 4; // next strike
      } else {
        // Flicker
        if (this._lightningLight) {
          this._lightningLight.intensity = (Math.random() > 0.3) ? 3 + Math.random() * 4 : 0;
        }
      }
      return;
    }

    this._lightningTimer -= dt;
    if (this._lightningTimer <= 0) {
      // Strike!
      if (!this._lightningLight) {
        this._lightningLight = new THREE.DirectionalLight(0xeeeeff, 0);
        this._lightningLight.position.set(
          this.camera.position.x + (Math.random() - 0.5) * 40,
          30,
          this.camera.position.z + (Math.random() - 0.5) * 40
        );
        this.scene.add(this._lightningLight);
      } else {
        this._lightningLight.position.set(
          this.camera.position.x + (Math.random() - 0.5) * 40,
          30,
          this.camera.position.z + (Math.random() - 0.5) * 40
        );
      }
      this._lightningLight.intensity = 5 + Math.random() * 3;
      this._lightningActive = true;
      this._lightningDuration = 0.1 + Math.random() * 0.2;
    }
  }

  getCurrentWeather() {
    return this.currentWeather;
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }
}
