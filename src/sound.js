// ═══════════════════════════════════════════════════════════
// SoundSystem — Procedural Background Music via Web Audio API
// Ambient generative music for each game state
// Enhanced with richer melodies, chord progressions, and variation
// ═══════════════════════════════════════════════════════════

export class SoundSystem {
    constructor() {
        this.initialized = false;
        this.muted = false;
        this.currentTrack = null;
        this.ctx = null;
        this.master = null;
        this.nodes = [];
        this.loopTimer = null;
        this.volume = 0.12;
        this._variation = 0; // melody variation counter
    }

    init() {
        if (this.initialized) {
            if (this.ctx && this.ctx.state === 'suspended') {
                try { this.ctx.resume(); } catch(e) {}
            }
            return;
        }
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC({ latencyHint: 'interactive', sampleRate: 44100 });
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : this.volume;
            this.master.connect(this.ctx.destination);
            this.initialized = true;
            // Auto-resume on first user gesture
            const resumeOnGesture = () => {
                if (!this.ctx) return;
                if (this.ctx.state === 'suspended') this.ctx.resume();
                document.removeEventListener('click', resumeOnGesture);
                document.removeEventListener('touchstart', resumeOnGesture);
                document.removeEventListener('keydown', resumeOnGesture);
            };
            document.addEventListener('click', resumeOnGesture);
            document.addEventListener('touchstart', resumeOnGesture);
            document.addEventListener('keydown', resumeOnGesture);
            if (this.ctx.state === 'suspended') {
                const res = this.ctx.resume();
                if (res && res.then) res.catch(() => {});
            }
        } catch (e) {
            console.warn('Audio init failed:', e);
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    _stop() {
        if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
        this.nodes.forEach(n => { try { n.stop(); } catch(e) {} try { n.disconnect(); } catch(e) {} });
        this.nodes = [];
    }

    // ── PAD: Long sustained chord tone ──
    _pad(freq, vol = 0.08, dur = 8) {
        if (!this.initialized || !this.ctx) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const f = this.ctx.createBiquadFilter();
        o.type = 'sine';
        o.frequency.value = freq;
        f.type = 'lowpass';
        f.frequency.value = 800;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol, t + 2);
        g.gain.setValueAtTime(vol, t + dur - 2);
        g.gain.linearRampToValueAtTime(0.001, t + dur);
        o.connect(f);
        f.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur);
        this.nodes.push(o);
        return dur;
    }

    // ── WARM PAD: Detuned pad for richer sound ──
    _warmPad(freq, vol = 0.05, dur = 8) {
        if (!this.initialized || !this.ctx) return;
        const t = this.ctx.currentTime;
        for (const detune of [-4, 0, 4]) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const f = this.ctx.createBiquadFilter();
            o.type = detune === 0 ? 'sine' : 'triangle';
            o.frequency.value = freq;
            o.detune.value = detune;
            f.type = 'lowpass';
            f.frequency.value = 600;
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(vol, t + 2.5);
            g.gain.setValueAtTime(vol, t + dur - 2.5);
            g.gain.linearRampToValueAtTime(0.001, t + dur);
            o.connect(f); f.connect(g); g.connect(this.master);
            o.start(t); o.stop(t + dur);
            this.nodes.push(o);
        }
        return dur;
    }

    // ── ARP: Arpeggiated melody ──
    _arp(notes, interval = 0.4, vol = 0.04) {
        if (!this.initialized || !this.ctx) return;
        let dur = 0;
        notes.forEach((freq, i) => {
            const t = this.ctx.currentTime + i * interval;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'triangle';
            o.frequency.value = freq;
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + interval * 0.9);
            o.connect(g);
            g.connect(this.master);
            o.start(t);
            o.stop(t + interval);
            this.nodes.push(o);
            dur = (i + 1) * interval;
        });
        return dur;
    }

    // ── MELODY: Sustained melody line with vibrato ──
    _melody(notes, interval = 0.5, vol = 0.035, type = 'sine') {
        if (!this.initialized || !this.ctx) return;
        let dur = 0;
        notes.forEach((freq, i) => {
            if (freq === 0) { dur = (i + 1) * interval; return; } // rest
            const t = this.ctx.currentTime + i * interval;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const vib = this.ctx.createOscillator();
            const vibGain = this.ctx.createGain();
            o.type = type;
            o.frequency.value = freq;
            vib.type = 'sine';
            vib.frequency.value = 5;
            vibGain.gain.value = 2;
            vib.connect(vibGain);
            vibGain.connect(o.frequency);
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.1);
            g.gain.setValueAtTime(vol * 0.8, t + interval * 0.7);
            g.gain.exponentialRampToValueAtTime(0.001, t + interval * 0.95);
            o.connect(g); g.connect(this.master);
            o.start(t); o.stop(t + interval);
            vib.start(t); vib.stop(t + interval);
            this.nodes.push(o, vib);
            dur = (i + 1) * interval;
        });
        return dur;
    }

    // ── DRUM: Percussive hit ──
    _drum(vol = 0.06) {
        if (!this.initialized || !this.ctx) return;
        const t = this.ctx.currentTime;
        const bufSize = this.ctx.sampleRate * 0.1;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 200;
        const g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(f);
        f.connect(g);
        g.connect(this.master);
        src.start(t);
        this.nodes.push(src);
    }

    // ── TIMPANI: Deep orchestral drum ──
    _timpani(vol = 0.05) {
        if (!this.initialized || !this.ctx) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(100, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.5);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.6);
        this.nodes.push(o);
        // Noise hit
        const bufSize = this.ctx.sampleRate * 0.05;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.08));
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 150; f.Q.value = 2;
        const g2 = this.ctx.createGain();
        g2.gain.value = vol * 0.5;
        src.connect(f); f.connect(g2); g2.connect(this.master);
        src.start(t); 
        this.nodes.push(o, src);
    }

    // ── HARP: Plucked string sound ──
    _harp(freq, vol = 0.03) {
        if (!this.initialized || !this.ctx) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol * 2, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 1.5);
        this.nodes.push(o);
    }

    _loop(fn, delay) {
        this.loopTimer = setTimeout(() => {
            if (this.initialized && !this.muted) {
                this._stop();
                this._variation++;
                fn();
            }
        }, delay);
    }

    // ═══════════════════════════════════════════════════════════
    // MUSIC TRACKS (enhanced with richer harmonics & variation)
    // ═══════════════════════════════════════════════════════════

    playMenu() {
        if (!this.initialized) this.init();
        this._stop();
        this.currentTrack = 'menu';
        // Regal, mysterious menu music — alternating melodies
        const v = this._variation % 3;
        this._warmPad(110, 0.04);
        this._warmPad(165, 0.03);
        this._pad(220, 0.05);
        if (v === 0) {
            this._melody([440, 523, 659, 784, 659, 523, 440, 392], 0.6, 0.025);
            this._harp(440, 0.02); this._harp(659, 0.015);
        } else if (v === 1) {
            this._melody([392, 440, 523, 659, 784, 659, 523, 440], 0.6, 0.025);
            this._harp(523, 0.02); this._harp(784, 0.015);
        } else {
            this._melody([330, 392, 440, 523, 659, 523, 440, 392], 0.6, 0.025);
            this._harp(330, 0.02); this._harp(523, 0.015);
        }
        this._loop(() => this.playMenu(), 8000);
    }

    playWorldMap() {
        if (!this.initialized) this.init();
        this._stop();
        this.currentTrack = 'worldmap';
        // Grand, strategic music — full orchestral feel
        const v = this._variation % 3;
        this._warmPad(98, 0.04);
        this._warmPad(131, 0.03);
        this._pad(196, 0.04);
        this._pad(262, 0.03);
        if (v === 0) {
            this._melody([392, 440, 523, 587, 523, 440, 392, 330, 349, 392, 440, 523], 0.5, 0.02);
            this._timpani(0.04);
            this._harp(392, 0.015); this._harp(523, 0.012);
        } else if (v === 1) {
            this._melody([330, 349, 392, 440, 523, 587, 523, 440, 392, 349, 330, 294], 0.5, 0.02);
            this._timpani(0.04);
            this._harp(349, 0.015); this._harp(440, 0.012);
        } else {
            this._melody([440, 523, 587, 659, 784, 659, 587, 523, 440, 392, 349, 392], 0.5, 0.02);
            this._timpani(0.04);
            this._harp(523, 0.015); this._harp(659, 0.012);
        }
        this._loop(() => this.playWorldMap(), 9000);
    }

    playBattle() {
        if (!this.initialized) this.init();
        this._stop();
        this.currentTrack = 'battle';
        // Intense battle drums with war horns
        const v = this._variation % 2;
        this._pad(110, 0.05);
        this._pad(165, 0.03);
        this._pad(220, 0.02);
        // Rhythmic drums
        for (let i = 0; i < 12; i++) {
            setTimeout(() => this._drum(i % 3 === 0 ? 0.08 : 0.05), i * 350);
            if (i % 4 === 0) setTimeout(() => this._timpani(0.06), i * 350 + 100);
        }
        if (v === 0) {
            this._arp([165, 196, 220, 247, 220, 196, 165, 147], 0.3, 0.025);
            // War horn
            this._melody([165, 0, 196, 0, 220, 0], 0.25, 0.03, 'sawtooth');
        } else {
            this._arp([147, 165, 196, 220, 247, 220, 196, 165], 0.3, 0.025);
            this._melody([196, 0, 220, 0, 247, 0], 0.25, 0.03, 'sawtooth');
        }
        this._loop(() => this.playBattle(), 7000);
    }

    playTerritory() {
        if (!this.initialized) this.init();
        this._stop();
        this.currentTrack = 'territory';
        // Peaceful, ambient exploration — gentle harps and pads
        const v = this._variation % 3;
        this._warmPad(131, 0.03);
        this._pad(262, 0.04);
        this._pad(330, 0.025);
        // Harp arpeggio
        if (v === 0) {
            this._harp(523, 0.02); setTimeout(() => this._harp(659, 0.018), 300);
            setTimeout(() => this._harp(784, 0.015), 600); setTimeout(() => this._harp(1047, 0.012), 900);
            this._melody([784, 0, 659, 784, 659, 523], 0.7, 0.018);
        } else if (v === 1) {
            this._harp(587, 0.02); setTimeout(() => this._harp(659, 0.018), 300);
            setTimeout(() => this._harp(784, 0.015), 600); setTimeout(() => this._harp(988, 0.012), 900);
            this._melody([659, 0, 587, 659, 587, 523], 0.7, 0.018);
        } else {
            this._harp(440, 0.02); setTimeout(() => this._harp(523, 0.018), 300);
            setTimeout(() => this._harp(659, 0.015), 600); setTimeout(() => this._harp(784, 0.012), 900);
            this._melody([523, 0, 440, 523, 440, 392], 0.7, 0.018);
        }
        this._loop(() => this.playTerritory(), 10000);
    }

    playVictory() {
        if (!this.initialized) this.init();
        this._stop();
        this.currentTrack = 'victory';
        // Triumphant fanfare — full orchestral
        const fanfare = [523, 659, 784, 1047, 784, 1047, 1319, 1047, 1568, 1319, 1568, 2093];
        // Timpani roll
        for (let i = 0; i < 6; i++) setTimeout(() => this._timpani(0.04), i * 200);
        fanfare.forEach((f, i) => {
            setTimeout(() => {
                this._pad(f, 0.05, 3);
                this._melody([f, f * 1.25, f * 1.5], 0.12, 0.025);
                this._harp(f, 0.015);
            }, i * 180);
        });
    }

    playDefeat() {
        if (!this.initialized) this.init();
        this._stop();
        this.currentTrack = 'defeat';
        // Somber defeat — minor key descending melody
        this._warmPad(110, 0.04);
        this._pad(220, 0.03);
        const notes = [392, 349, 330, 294, 262, 247, 220, 196];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this._pad(freq, 0.04, 2);
                this._harp(freq, 0.012);
            }, i * 350);
        });
    }

    // ── New: Shop ambient music ──
    playShop() {
        if (!this.initialized) this.init();
        this._stop();
        this.currentTrack = 'shop';
        this._warmPad(196, 0.03);
        this._pad(262, 0.03);
        // Gentle plucked melody
        const notes = [523, 587, 659, 784, 659, 587, 523, 494];
        notes.forEach((f, i) => setTimeout(() => this._harp(f, 0.025), i * 400));
        this._melody([784, 0, 659, 0, 523, 0, 587, 0], 0.5, 0.015);
        this._loop(() => this.playShop(), 8000);
    }
}

export const sound = new SoundSystem();
