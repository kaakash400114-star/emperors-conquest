// daynight3d.js — 3D day/night cycle for Emperor's Conquest
// ES module export. Expects global THREE.

export class DayNight3D {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = renderer._scene;
    this.camera = renderer._camera;
    this.sun = renderer._sun;
    this.sky = renderer._sky;

    // Time of day: 0 = midnight, 0.5 = noon
    this.timeOfDay = 0.35; // start at morning

    // Full cycle duration in real seconds (120s default)
    this.cycleDuration = 120;
    this.speedMultiplier = 1;

    // Sun orbit
    this.sunOrbitRadius = 80;

    // Color palettes [r, g, b] 0-1
    this.skyColors = {
      dawn:  new THREE.Color(1.0, 0.75, 0.4),
      day:   new THREE.Color(0.53, 0.81, 0.98),
      dusk:  new THREE.Color(1.0, 0.55, 0.3),
      night: new THREE.Color(0.05, 0.05, 0.15),
    };

    this._initMoon();
    this._initAmbient();
  }

  _initMoon() {
    this.moon = new THREE.DirectionalLight(0x8888cc, 0.0);
    this.scene.add(this.moon);
  }

  _initAmbient() {
    this.ambient = this.scene.getObjectByName('ambient') ||
      (this.scene.children.find(c => c.isAmbientLight));
    if (!this.ambient) {
      this.ambient = new THREE.AmbientLight(0xffffff, 0.4);
      this.scene.add(this.ambient);
      this.ambient.name = 'ambient';
    }
  }

  // --- Public API ---

  update(dt) {
    // Advance time of day
    const timeDelta = (dt * this.speedMultiplier) / this.cycleDuration;
    this.timeOfDay = (this.timeOfDay + timeDelta) % 1.0;

    this._updateSunPosition();
    this._updateSkyColor();
    this._updateLighting();
    this._updateMoon();
  }

  setSpeed(multiplier) {
    this.speedMultiplier = Math.max(0.01, multiplier);
  }

  getTimeOfDay() {
    return this.timeOfDay;
  }

  isNight() {
    // Night: roughly 0.75–0.25 (wraps around midnight)
    return this.timeOfDay >= 0.75 || this.timeOfDay < 0.25;
  }

  // --- Internal ---

  _updateSunPosition() {
    // Map timeOfDay to angle: noon (0.5) → π/2 (top), midnight (0.0) → -π/2 (bottom)
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const r = this.sunOrbitRadius;

    this.sun.position.set(
      r * Math.cos(angle),
      r * Math.sin(angle),
      0
    );
    // Sun always points at scene origin
    this.sun.target.position.set(0, 0, 0);
  }

  _updateSkyColor() {
    if (!this.sky || !this.sky.material) return;

    const t = this.timeOfDay;
    let color;

    if (t >= 0.2 && t < 0.3) {
      // Dawn transition
      color = this._lerpColor(this.skyColors.night, this.skyColors.dawn, (t - 0.2) / 0.1);
    } else if (t >= 0.3 && t < 0.4) {
      // Dawn → day
      color = this._lerpColor(this.skyColors.dawn, this.skyColors.day, (t - 0.3) / 0.1);
    } else if (t >= 0.4 && t < 0.65) {
      // Full day
      color = this.skyColors.day.clone();
    } else if (t >= 0.65 && t < 0.75) {
      // Day → dusk
      color = this._lerpColor(this.skyColors.day, this.skyColors.dusk, (t - 0.65) / 0.1);
    } else if (t >= 0.75 && t < 0.85) {
      // Dusk → night
      color = this._lerpColor(this.skyColors.dusk, this.skyColors.night, (t - 0.75) / 0.1);
    } else {
      // Full night (0.85–1.0 and 0.0–0.2)
      color = this.skyColors.night.clone();
    }

    this.sky.material.color = color;

    // Also set emissive if material supports it
    if (this.sky.material.emissive) {
      this.sky.material.emissive = color;
    }
  }

  _updateLighting() {
    const t = this.timeOfDay;
    let sunIntensity, ambientIntensity;

    if (t >= 0.25 && t < 0.35) {
      // Dawn ramp
      const f = (t - 0.25) / 0.1;
      sunIntensity = THREE.MathUtils.lerp(0.05, 0.6, f);
      ambientIntensity = THREE.MathUtils.lerp(0.08, 0.3, f);
    } else if (t >= 0.35 && t < 0.65) {
      // Daytime
      sunIntensity = 1.0;
      ambientIntensity = 0.4;
    } else if (t >= 0.65 && t < 0.75) {
      // Dusk fade
      const f = (t - 0.65) / 0.1;
      sunIntensity = THREE.MathUtils.lerp(0.6, 0.05, f);
      ambientIntensity = THREE.MathUtils.lerp(0.3, 0.08, f);
    } else {
      // Night
      sunIntensity = 0.02;
      ambientIntensity = 0.06;
    }

    this.sun.intensity = sunIntensity;

    // Warm sun at dawn/dusk
    if (t >= 0.25 && t < 0.4) {
      this.sun.color.set(0xffcc77);
    } else if (t >= 0.6 && t < 0.75) {
      this.sun.color.set(0xffaa55);
    } else {
      this.sun.color.set(0xffffff);
    }

    if (this.ambient) {
      this.ambient.intensity = ambientIntensity;
    }
  }

  _updateMoon() {
    // Moon is opposite the sun
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2 + Math.PI;
    const r = this.sunOrbitRadius;

    this.moon.position.set(
      r * Math.cos(angle),
      r * Math.sin(angle),
      0
    );
    this.moon.target.position.set(0, 0, 0);

    // Moon intensity only at night
    if (this.isNight()) {
      this.moon.intensity = 0.15;
    } else {
      this.moon.intensity = 0.0;
    }
  }

  _lerpColor(a, b, t) {
    const c = new THREE.Color();
    c.r = a.r + (b.r - a.r) * t;
    c.g = a.g + (b.g - a.g) * t;
    c.b = a.b + (b.b - a.b) * t;
    return c;
  }
}
