// ═══════════════════════════════════════════════════════════════
// CINEMATIC SOUND EFFECTS ENGINE — Emperor's Conquest
// All procedural via Web Audio API — zero external files
// ═══════════════════════════════════════════════════════════════
export class SFX {
    constructor() {
        this.ctx = null;
        this.master = null;
        this._ready = false;
        this._pending = [];
        this._unlocked = false;
        // Auto-unlock AudioContext on first user gesture (click, touch, keydown)
        this._unlockHandler = () => {
            if (this._unlocked) return;
            this._unlocked = true;
            this._ensure();
            document.removeEventListener('click', this._unlockHandler);
            document.removeEventListener('touchstart', this._unlockHandler);
            document.removeEventListener('keydown', this._unlockHandler);
        };
        document.addEventListener('click', this._unlockHandler, { once: false });
        document.addEventListener('touchstart', this._unlockHandler, { once: false });
        document.addEventListener('keydown', this._unlockHandler, { once: false });
        // Try creating AudioContext immediately (may start suspended)
        this._tryCreate();
    }

    _tryCreate() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC || this.ctx) return;
            this.ctx = new AC({ latencyHint: 'interactive', sampleRate: 44100 });
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.7;
            this.master.connect(this.ctx.destination);
            // If already running (unlikely but possible on some browsers), mark ready
            if (this.ctx.state === 'running') {
                this._ready = true;
                this._flush();
                this._welcomeChime();
            }
        } catch(e) {}
    }

    _ensure() {
        if (this._ready) {
            if (this.ctx && this.ctx.state === 'suspended') try { this.ctx.resume(); } catch(e) {}
            return;
        }
        try {
            if (!this.ctx) this._tryCreate();
            if (!this.ctx) return;
            if (this.ctx.state === 'running') {
                this._ready = true;
                this._flush();
                if (!this._chimed) { this._chimed = true; this._welcomeChime(); }
            } else {
                const p = this.ctx.resume();
                if (p && p.then) p.then(() => { this._ready = true; this._flush(); if (!this._chimed) { this._chimed = true; this._welcomeChime(); } }).catch(() => {});
            }
        } catch(e) { console.error('SFX:', e); }
    }

    _queue(fn) {
        if (this._ready) { try { fn(); } catch(e) {} return; }
        this._pending.push(fn);
        this._ensure();
    }

    _flush() {
        while (this._pending.length) { try { this._pending.shift()(); } catch(e) {} }
    }

    _welcomeChime() {
        try {
            const t = this.ctx.currentTime;
            this._osc('sine', 523, 0.15, 0.1);
            this._osc('sine', 659, 0.15, 0.08);
            this._osc('sine', 784, 0.2, 0.06);
        } catch(e) {}
    }

    // ── HELPERS ──
    _noise(duration, type = 'white') {
        if (!this.ctx) return null;
        const len = this.ctx.sampleRate * duration;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        if (type === 'white') { for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
        else if (type === 'brown') { let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = (last + 0.02 * w) / 1.02; last = d[i]; } }
        else if (type === 'pink') { let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0; for (let i = 0; i < len; i++) { const w = Math.random()*2-1; b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856; b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980; d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926; } }
        return buf;
    }

    _playNoise(dur, type, vol, freq, filterQ) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noise(dur, type);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = filterQ;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t); src.stop(t + dur);
    }

    _osc(type, freq, dur, vol) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = type; o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + dur);
    }

    // ═══════════════════════════════════════════════════════════
    // 15 CINEMATIC SOUND EFFECTS
    // ═══════════════════════════════════════════════════════════

    // 1. CLICK — sharp percussive tap
    click() { this._queue(() => {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.setValueAtTime(800, t);
        o.frequency.exponentialRampToValueAtTime(400, t + 0.06);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.08);
        this._playNoise(0.04, 'white', 0.15, 3000, 2);
    }); }

    // 2. ERROR — low buzz
    error() { this._queue(() => {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t);
        o.frequency.linearRampToValueAtTime(100, t + 0.2);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 400;
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.25);
    }); }

    // 3. COIN — metallic coin clink cascade
    coin() { this._queue(() => {
        const t = this.ctx.currentTime;
        for (let i = 0; i < 4; i++) {
            const delay = i * 0.08;
            const freq = 2000 + Math.random() * 2000;
            const o = this.ctx.createOscillator();
            o.type = 'sine'; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.12, t + delay);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.12);
        }
        this._playNoise(0.08, 'white', 0.08, 5000, 1);
    }); }

    // 4. BUY — satisfying purchase ka-ching
    buy() { this._queue(() => {
        const t = this.ctx.currentTime;
        const o1 = this.ctx.createOscillator();
        o1.type = 'sine'; o1.frequency.value = 1200;
        const g1 = this.ctx.createGain();
        g1.gain.setValueAtTime(0.15, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o1.connect(g1); g1.connect(this.master);
        o1.start(t); o1.stop(t + 0.1);
        const o2 = this.ctx.createOscillator();
        o2.type = 'sine'; o2.frequency.value = 1800;
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.12, t + 0.08);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o2.connect(g2); g2.connect(this.master);
        o2.start(t + 0.08); o2.stop(t + 0.22);
    }); }

    // 5. RECRUIT — war horn blast
    recruit() { this._queue(() => {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t);
        o.frequency.linearRampToValueAtTime(180, t + 0.15);
        o.frequency.linearRampToValueAtTime(150, t + 0.4);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.05);
        g.gain.setValueAtTime(0.2, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.setValueAtTime(300, t);
        f.frequency.linearRampToValueAtTime(800, t + 0.15);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.5);
        this._playNoise(0.3, 'brown', 0.1, 200, 1);
    }); }

    // 6. MARCH — deep war drums
    march() { this._queue(() => {
        const t = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const delay = i * 0.25;
            const o = this.ctx.createOscillator();
            o.type = 'sine'; o.frequency.setValueAtTime(80, t + delay);
            o.frequency.exponentialRampToValueAtTime(40, t + delay + 0.15);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.3, t + delay);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.2);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.22);
        }
    }); }

    // 7. BATTLE — CINEMATIC EXPLOSION
    battle() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Deep explosion boom
        this._playNoise(0.8, 'brown', 0.5, 80, 0.5);
        // Mid-range crack
        this._playNoise(0.3, 'white', 0.3, 2000, 0.8);
        // Impact thud
        this._osc('sine', 60, 0.6, 0.4);
        this._osc('sine', 40, 0.8, 0.3);
        // Debris rain
        setTimeout(() => this._playNoise(0.4, 'white', 0.08, 6000, 2), 200);
        // Shockwave rumble
        setTimeout(() => this._playNoise(0.5, 'brown', 0.15, 120, 0.3), 100);
    }); }

    // 8. DICE — dramatic roll with tension
    dice() { this._queue(() => {
        const t = this.ctx.currentTime;
        for (let i = 0; i < 8; i++) {
            const delay = i * 0.06;
            const freq = 3000 + Math.random() * 4000;
            const o = this.ctx.createOscillator();
            o.type = 'square'; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.05, t + delay);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.04);
            const f = this.ctx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = 2000;
            o.connect(f); f.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.05);
        }
        // Final reveal thud
        this._osc('sine', 200, 0.1, 0.15);
    }); }

    // 9. CAPTURE — triumphant fanfare
    capture() { this._queue(() => {
        const t = this.ctx.currentTime;
        const notes = [523, 659, 784];
        notes.forEach((freq, i) => {
            const delay = i * 0.12;
            const o = this.ctx.createOscillator();
            o.type = 'square'; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.12, t + delay);
            g.gain.setValueAtTime(0.12, t + delay + 0.15);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.45);
        });
        this._playNoise(0.3, 'white', 0.05, 8000, 0.5);
    }); }

    // 10. DEFEAT — somber descending tone
    defeat() { this._queue(() => {
        const t = this.ctx.currentTime;
        const notes = [392, 349, 330];
        notes.forEach((freq, i) => {
            const delay = i * 0.2;
            const o = this.ctx.createOscillator();
            o.type = 'sine'; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.15, t + delay);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.5);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.55);
        });
    }); }

    // 11. ELIM — empire elimination cinematic boom + gong
    elim() { this._queue(() => {
        const t = this.ctx.currentTime;
        this.battle();
        setTimeout(() => {
            if (!this.ctx) return;
            const tt = this.ctx.currentTime;
            const o = this.ctx.createOscillator();
            o.type = 'sine'; o.frequency.value = 80;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.3, tt);
            g.gain.exponentialRampToValueAtTime(0.001, tt + 2);
            o.connect(g); g.connect(this.master);
            o.start(tt); o.stop(tt + 2.1);
        }, 300);
    }); }

    // 12. VICTORY — EPIC fanfare
    victory() { this._queue(() => {
        const t = this.ctx.currentTime;
        const chords = [
            [220, 262, 330], [175, 220, 262], [262, 330, 392], [196, 247, 294]
        ];
        chords.forEach((chord, ci) => {
            chord.forEach((freq, fi) => {
                const delay = ci * 0.5 + fi * 0.02;
                const o = this.ctx.createOscillator();
                o.type = 'square'; o.frequency.value = freq;
                const g = this.ctx.createGain();
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.08, t + delay);
                g.gain.setValueAtTime(0.08, t + delay + 0.3);
                g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.6);
                o.connect(g); g.connect(this.master);
                o.start(t + delay); o.stop(t + delay + 0.65);
            });
        });
    }); }

    // 13. TURN — subtle whoosh
    turn() { this._queue(() => {
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noise(0.2, 'white');
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(4000, t + 0.1);
        f.frequency.exponentialRampToValueAtTime(500, t + 0.2);
        f.Q.value = 2;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t); src.stop(t + 0.25);
    }); }

    // 14. AMBIENT — atmospheric map soundscape
    ambient() { this._queue(() => {
        this._playNoise(2.0, 'pink', 0.04, 500, 0.3);
        this._playNoise(3.0, 'brown', 0.06, 40, 0.3);
        this._osc('sine', 110, 2.0, 0.02);
        this._osc('sine', 165, 1.8, 0.01);
    }); }

    // 15. LEVEL UP — magical ascending arpeggio
    levelUp() { this._queue(() => {
        const t = this.ctx.currentTime;
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((freq, i) => {
            const delay = i * 0.08;
            const o = this.ctx.createOscillator();
            o.type = 'sine'; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.15, t + delay);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.5);
        });
        this._osc('triangle', 2093, 0.8, 0.05);
        this._osc('triangle', 2637, 0.6, 0.03);
    }); }

    // 16. GUN — sharp crack + echo
    gun() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Crack
        this._playNoise(0.08, 'white', 0.5, 4000, 1.5);
        // Bass thud
        this._osc('sine', 80, 0.12, 0.35);
        // Echo crack
        setTimeout(() => { try { this._playNoise(0.05, 'white', 0.15, 3000, 2); } catch(e) {} }, 80);
    }); }

    // 17. SWORD — metallic clash ring
    sword() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Metallic ring
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(3000, t);
        o.frequency.exponentialRampToValueAtTime(800, t + 0.15);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 3;
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.2);
        // Impact
        this._playNoise(0.04, 'white', 0.2, 5000, 1);
    }); }

    // 18. EXPLOSION — deep cinematic boom
    explosion() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Deep sub-bass
        this._osc('sine', 40, 0.8, 0.4);
        this._osc('sine', 60, 0.6, 0.3);
        // Crack
        this._playNoise(0.4, 'brown', 0.45, 100, 0.5);
        // Debris
        this._playNoise(0.3, 'white', 0.2, 3000, 0.8);
        // Shockwave
        setTimeout(() => { try { this._playNoise(0.5, 'brown', 0.2, 60, 0.3); } catch(e) {} }, 100);
    }); }

    // 19. SPY — whispered stealth sound
    spy() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Whispered breath
        this._playNoise(0.6, 'pink', 0.08, 1500, 2);
        // Subtle metallic whisper
        this._osc('sine', 800, 0.3, 0.04);
        this._osc('sine', 1200, 0.2, 0.02);
        // Quieter echo
        setTimeout(() => { try { this._playNoise(0.3, 'pink', 0.04, 2000, 2); } catch(e) {} }, 200);
    }); }

    // 20. DIPLOMAT — regal announcement
    diplomat() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Fanfare
        const notes = [392, 523, 659];
        notes.forEach((freq, i) => {
            const delay = i * 0.15;
            const o = this.ctx.createOscillator();
            o.type = 'triangle'; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.1, t + delay + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.5);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.55);
        });
        // Subtle drum roll
        for (let i = 0; i < 4; i++) setTimeout(() => this._drum(0.03), i * 100);
    }); }

    // 21. PLAGUE — ominous dark tone
    plague() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Dark drone
        this._osc('sawtooth', 55, 2.0, 0.08);
        this._osc('sine', 110, 1.8, 0.06);
        // Dissonant whisper
        this._playNoise(2.0, 'brown', 0.1, 300, 1);
        // Ominous sting
        setTimeout(() => {
            try {
                this._osc('sawtooth', 75, 0.5, 0.05);
                this._playNoise(0.5, 'white', 0.08, 2000, 2);
            } catch(e) {}
        }, 500);
    }); }

    // 22. THUNDER — distant rumble
    thunder() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Distant crack
        this._playNoise(0.1, 'white', 0.3, 2000, 0.5);
        // Rolling rumble
        setTimeout(() => { try { this._playNoise(2.0, 'brown', 0.25, 80, 0.3); } catch(e) {} }, 150);
        // Low sub
        this._osc('sine', 35, 2.5, 0.2);
        // Echo crack
        setTimeout(() => { try { this._playNoise(0.15, 'white', 0.1, 3000, 0.8); } catch(e) {} }, 800);
    }); }

    // 23. CONSTRUCTION — hammering build sound
    construction() { this._queue(() => {
        const t = this.ctx.currentTime;
        for (let i = 0; i < 5; i++) {
            const delay = i * 0.18;
            // Hammer strike
            const o = this.ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(200 + Math.random() * 100, t + delay);
            o.frequency.exponentialRampToValueAtTime(80, t + delay + 0.08);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.15, t + delay);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 0.15);
            // Metal ring
            this._playNoise(0.04, 'white', 0.08, 5000, 2);
        }
    }); }

    // 24. FORTIFY — stone wall rising
    fortify() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Deep rumble
        this._osc('sine', 50, 0.8, 0.15);
        this._playNoise(0.6, 'brown', 0.2, 100, 0.3);
        // Stone scraping
        setTimeout(() => { try { this._playNoise(0.3, 'white', 0.12, 4000, 1); } catch(e) {} }, 200);
        // Satisfying final thud
        setTimeout(() => { try { this._osc('sine', 60, 0.3, 0.2); } catch(e) {} }, 500);
    }); }

    // 25. GOLDEN AGE — magical shimmer
    goldenAge() { this._queue(() => {
        const t = this.ctx.currentTime;
        // Shimmering bells
        const notes = [1319, 1568, 1760, 2093, 2637];
        notes.forEach((freq, i) => {
            const delay = i * 0.1;
            const o = this.ctx.createOscillator();
            o.type = 'sine'; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.08, t + delay + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 1.0);
            o.connect(g); g.connect(this.master);
            o.start(t + delay); o.stop(t + delay + 1.1);
        });
        // Warm pad underneath
        this._osc('sine', 523, 1.5, 0.04);
        this._osc('sine', 659, 1.2, 0.03);
        // Sparkle noise
        this._playNoise(1.0, 'white', 0.04, 8000, 2);
    }); }

    // 26. FOOTSTEP - soft brown noise step
    footstep() { this._queue(() => {
        const t = this.ctx.currentTime;
        const dur = 0.08;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noise(dur, 'brown');
        if (!src.buffer) return;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.04, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 250; f.Q.value = 3;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t); src.stop(t + dur);
    }); }

    // 27. WARP - portal sound sweep
    warp() { this._queue(() => {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.setValueAtTime(300, t);
        o.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.01, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.55);
        this._playNoise(0.5, 'white', 0.15, 1000, 2);
    }); }

    // 28. CHEST OPEN - creak followed by gold coin cascade
    chestOpen() { this._queue(() => {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.setValueAtTime(200, t);
        o.frequency.linearRampToValueAtTime(80, t + 0.3);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.3);
        setTimeout(() => { this.coin(); }, 120);
    }); }

    // 29. TRAP - snap and poison splash
    trap() { this._queue(() => {
        const t = this.ctx.currentTime;
        const o1 = this.ctx.createOscillator();
        o1.type = 'triangle'; o1.frequency.setValueAtTime(1000, t);
        const g1 = this.ctx.createGain();
        g1.gain.setValueAtTime(0.2, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        o1.connect(g1); g1.connect(this.master);
        o1.start(t); o1.stop(t + 0.05);
        this._playNoise(0.4, 'white', 0.25, 400, 2);
    }); }
}


// ═══════════════════════════════════════════════════════════════
// AMBIENT MUSIC ENGINE — Procedural background music per location
// ═══════════════════════════════════════════════════════════════
export class AmbientMusic {
    constructor() {
        this.ctx = null;
        this.master = null;
        this._playing = false;
        this._region = null;
        this._interval = null;
        this._noteIdx = 0;
        this._chordIdx = 0;
        this._droneOscs = [];
        this._droneGain = null;
        this._ready = false;

        // Musical scales per region — different mood per continent
        this._scales = {
            menu:       [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3],  // C major — triumphant
            select:     [220.0, 246.9, 261.6, 329.6, 349.2, 440.0, 493.9, 523.3],  // Am — mysterious
            map:        [293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0],  // D major — adventurous
            africa:     [196.0, 233.1, 261.6, 293.7, 349.2, 392.0, 466.2, 523.3],  // Gm pentatonic-ish — tribal
            asia:       [261.6, 293.7, 311.1, 392.0, 415.3, 523.3, 587.3, 622.3],  // C pentatonic — Eastern
            europe:     [261.6, 311.1, 349.2, 392.0, 466.2, 523.3, 622.3, 698.5],  // Cm — classical
            americas:   [220.0, 261.6, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3],  // Am — wild west
            oceania:    [293.7, 349.2, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0],  // D mixolydian — oceanic
            battle:     [196.0, 220.0, 246.9, 261.6, 311.1, 329.6, 370.0, 415.3],  // G phrygian — intense
            territory:  [246.9, 293.7, 329.6, 370.0, 440.0, 493.9, 554.4, 659.3],  // Bm — contemplative
            victory:    [261.6, 329.6, 392.0, 523.3, 659.3, 784.0, 1047, 1319],      // C major octave — grand
        };

        // Drone (bass) frequencies per region
        this._drones = {
            menu: 65.4, select: 55.0, map: 73.4, africa: 49.0, asia: 65.4,
            europe: 61.7, americas: 55.0, oceania: 73.4, battle: 49.0,
            territory: 61.7, victory: 65.4,
        };
    }

    init(sfxCtx) {
        if (this._ready) return;
        this.ctx = sfxCtx || (window.AudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null);
        if (!this.ctx) return;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.12;
        this.master.connect(this.ctx.destination);
        this._ready = true;
    }

    setRegion(region, continent) {
        // region: 'menu'|'select'|'map'|'territory'|'battle'|'victory'
        // continent: 'Africa'|'Asia'|'Europe'|'Americas'|'Oceania' (for territory/map)
        let key = region;
        if (region === 'territory' || region === 'map') {
            const contKey = continent || 'americas';
            if (['Africa', 'africa'].includes(contKey)) key = 'africa';
            else if (['Asia', 'asia'].includes(contKey)) key = 'asia';
            else if (['Europe', 'europe'].includes(contKey)) key = 'europe';
            else if (['Americas', 'americas'].includes(contKey)) key = 'americas';
            else if (['Oceania', 'oceania'].includes(contKey)) key = 'oceania';
        }
        if (key === this._region) return;
        this._stopLoop();
        this._region = key;
        this._noteIdx = 0;
        this._chordIdx = 0;
        this._startLoop();
    }

    _startLoop() {
        if (!this._ready || !this.ctx) return;
        try {
            if (this.ctx.state === 'suspended') this.ctx.resume();
        } catch(e) {}
        this._playing = true;
        this._startDrone();
        // Melody notes every 1.2-2.5 seconds
        this._scheduleNext();
        // Chord pads every 4-6 seconds
        this._scheduleChord();
    }

    _stopLoop() {
        this._playing = false;
        if (this._interval) { clearTimeout(this._interval); this._interval = null; }
        if (this._chordTimeout) { clearTimeout(this._chordTimeout); this._chordTimeout = null; }
        this._stopDrone();
    }

    stop() { this._stopLoop(); this._region = null; }

    _startDrone() {
        if (!this.ctx || !this._region) return;
        const freq = this._drones[this._region] || 65.4;
        this._droneGain = this.ctx.createGain();
        this._droneGain.gain.value = 0;
        this._droneGain.connect(this.master);

        // Main drone
        const o1 = this.ctx.createOscillator();
        o1.type = 'sine'; o1.frequency.value = freq;
        o1.connect(this._droneGain); o1.start();
        this._droneOscs.push(o1);

        // Fifth above
        const o2 = this.ctx.createOscillator();
        o2.type = 'sine'; o2.frequency.value = freq * 1.498;
        const g2 = this.ctx.createGain();
        g2.gain.value = 0.4;
        o2.connect(g2); g2.connect(this._droneGain); o2.start();
        this._droneOscs.push(o2);

        // Sub octave for depth
        const o3 = this.ctx.createOscillator();
        o3.type = 'triangle'; o3.frequency.value = freq * 0.5;
        const g3 = this.ctx.createGain();
        g3.gain.value = 0.25;
        o3.connect(g3); g3.connect(this._droneGain); o3.start();
        this._droneOscs.push(o3);

        // Fade in over 3 seconds
        const t = this.ctx.currentTime;
        this._droneGain.gain.setValueAtTime(0, t);
        this._droneGain.gain.linearRampToValueAtTime(0.5, t + 3);
    }

    _stopDrone() {
        if (this._droneGain) {
            try {
                const t = this.ctx.currentTime;
                this._droneGain.gain.linearRampToValueAtTime(0, t + 1.5);
                const oscs = this._droneOscs;
                setTimeout(() => { oscs.forEach(o => { try { o.stop(); } catch(e) {} }); }, 2000);
            } catch(e) { this._droneOscs.forEach(o => { try { o.stop(); } catch(e) {} }); }
        }
        this._droneOscs = [];
        this._droneGain = null;
    }

    _scheduleNext() {
        if (!this._playing || !this._ready) return;
        const scale = this._scales[this._region] || this._scales.map;
        const t = this.ctx.currentTime;

        // Pick note from scale — occasional rests and octave jumps
        const r = Math.random();
        if (r < 0.15) {
            // Rest — no note this beat
        } else {
            const octaveShift = Math.random() > 0.85 ? 2 : (Math.random() > 0.6 ? 1 : 0);
            const noteIdx = Math.floor(Math.random() * scale.length);
            const freq = scale[noteIdx] * (octaveShift === 2 ? 0.5 : 1) * (octaveShift === 0 ? 2 : 1);
            const dur = 0.8 + Math.random() * 1.8;
            const vol = 0.03 + Math.random() * 0.06;

            // Lead oscillator
            const waveType = this._region === 'battle' ? 'sawtooth' :
                             this._region === 'africa' ? 'triangle' :
                             this._region === 'asia' ? 'sine' :
                             Math.random() > 0.5 ? 'sine' : 'triangle';
            const o = this.ctx.createOscillator();
            o.type = waveType; o.frequency.value = freq;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.setValueAtTime(vol, t + dur * 0.3);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            // Slight vibrato for organic feel
            const vibrato = this.ctx.createOscillator();
            vibrato.type = 'sine'; vibrato.frequency.value = 4 + Math.random() * 3;
            const vibGain = this.ctx.createGain();
            vibGain.gain.value = freq * 0.005;
            vibrato.connect(vibGain); vibGain.connect(o.frequency);
            vibrato.start(t); vibrato.stop(t + dur);

            o.connect(g); g.connect(this.master);
            o.start(t); o.stop(t + dur + 0.1);

            // Occasional harmony note (third above)
            if (Math.random() > 0.6) {
                const hFreq = freq * 1.25;
                const ho = this.ctx.createOscillator();
                ho.type = 'sine'; ho.frequency.value = hFreq;
                const hg = this.ctx.createGain();
                hg.gain.setValueAtTime(vol * 0.4, t + 0.1);
                hg.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
                ho.connect(hg); hg.connect(this.master);
                ho.start(t + 0.1); ho.stop(t + dur);
            }
        }

        // Next note timing varies by mood
        const baseInterval = this._region === 'battle' ? 800 :
                             this._region === 'menu' ? 2500 :
                             this._region === 'victory' ? 1500 :
                             1200 + Math.random() * 1000;
        this._interval = setTimeout(() => this._scheduleNext(), baseInterval);
    }

    _scheduleChord() {
        if (!this._playing || !this._ready) return;
        const scale = this._scales[this._region] || this._scales.map;
        const t = this.ctx.currentTime;

        // Play a 3-note chord from the scale
        const rootIdx = Math.floor(Math.random() * (scale.length - 2));
        const chordDur = 3 + Math.random() * 3;
        const vol = 0.015 + Math.random() * 0.02;
        for (let i = 0; i < 3; i++) {
            const freq = scale[rootIdx + i * 2] || scale[rootIdx] * (1 + i * 0.5);
            const o = this.ctx.createOscillator();
            o.type = 'sine'; o.frequency.value = freq * 0.5;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 1);
            g.gain.setValueAtTime(vol, t + chordDur - 1);
            g.gain.exponentialRampToValueAtTime(0.001, t + chordDur);
            o.connect(g); g.connect(this.master);
            o.start(t); o.stop(t + chordDur + 0.1);
        }

        this._chordTimeout = setTimeout(() => this._scheduleChord(), 5000 + Math.random() * 4000);
    }

    setVolume(v) {
        if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
    }
}
