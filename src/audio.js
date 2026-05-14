/**
 * audio.js — Procedural Sound Effects
 *
 * Every sound in this game is generated mathematically using the Web Audio API.
 * No audio files needed — the browser creates the sounds on the fly.
 *
 * This technique is used by many indie games because:
 *   1. Zero file size (no audio assets to download)
 *   2. Can tweak sounds instantly (just change numbers)
 *   3. No licensing issues (you created the sound)
 *
 * Each sound is a short oscillator pattern: set frequency, duration,
 * waveform type, and volume envelope.
 */

export class Audio {
    constructor() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.ctx = null;
        }
        this.enabled = true;
    }

    _resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    _osc(type, freqStart, freqEnd, duration, volume = 0.15, delay = 0) {
        if (!this.ctx || !this.enabled) return;
        this._resume();
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        if (freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
        }
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
    }

    // ── Game Sounds ───────────────────────────────────────────

    /** Gold collected / income */
    coin() {
        this._osc('square', 800, 1200, 0.08, 0.1, 0);
        this._osc('square', 1000, 1400, 0.08, 0.1, 0.08);
    }

    /** Recruiting troops */
    recruit() {
        this._osc('triangle', 200, 400, 0.15, 0.12);
        this._osc('triangle', 300, 500, 0.1, 0.08, 0.1);
    }

    /** Troops marching */
    march() {
        this._osc('triangle', 100, 80, 0.3, 0.1);
    }

    /** Battle clash — dramatic */
    battle() {
        // War drums
        this._osc('triangle', 80, 60, 0.3, 0.2);
        this._osc('triangle', 80, 60, 0.2, 0.15, 0.15);
        this._osc('sawtooth', 150, 80, 0.4, 0.12, 0.05);
    }

    /** Dice roll sound */
    dice() {
        for (let i = 0; i < 5; i++) {
            this._osc('square', 200 + Math.random() * 400, 300 + Math.random() * 300, 0.04, 0.06, i * 0.05);
        }
    }

    /** Victory fanfare */
    victory() {
        this._osc('square', 523, 523, 0.15, 0.12, 0);
        this._osc('square', 659, 659, 0.15, 0.12, 0.15);
        this._osc('square', 784, 784, 0.15, 0.12, 0.3);
        this._osc('square', 1047, 1047, 0.3, 0.15, 0.45);
    }

    /** Territory captured */
    capture() {
        this._osc('square', 400, 800, 0.2, 0.12);
        this._osc('square', 600, 1000, 0.15, 0.1, 0.15);
    }

    /** Defeat / loss */
    defeat() {
        this._osc('sawtooth', 300, 100, 0.5, 0.15);
        this._osc('sawtooth', 200, 80, 0.6, 0.12, 0.3);
    }

    /** UI click */
    click() {
        this._osc('sine', 600, 800, 0.05, 0.08);
    }

    /** Error / invalid action */
    error() {
        this._osc('square', 200, 150, 0.15, 0.1);
    }

    /** Random event */
    event() {
        this._osc('triangle', 400, 600, 0.2, 0.1, 0);
        this._osc('triangle', 500, 700, 0.2, 0.1, 0.15);
        this._osc('triangle', 600, 800, 0.3, 0.1, 0.3);
    }

    /** Empire eliminated */
    eliminated() {
        this._osc('sawtooth', 400, 50, 0.8, 0.15);
    }

    /** Turn start */
    turnStart() {
        this._osc('triangle', 300, 450, 0.1, 0.08);
        this._osc('triangle', 450, 600, 0.1, 0.08, 0.1);
    }
}
