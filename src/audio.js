export class SFX {
    constructor() {
        try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { this.ac = null; }
    }
    _resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); }
    _p(type, f1, f2, dur, vol=0.12, delay=0) {
        if (!this.ac) return; this._resume();
        const t = this.ac.currentTime + delay;
        const o = this.ac.createOscillator(), g = this.ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f1, t);
        if (f1 !== f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(this.ac.destination); o.start(t); o.stop(t + dur);
    }
    click()  { this._p('sine',600,800,0.05,0.08); }
    error()  { this._p('square',200,150,0.15,0.1); }
    coin()   { this._p('square',800,1200,0.08,0.1); this._p('square',1000,1400,0.08,0.1,0.08); }
    recruit(){ this._p('triangle',200,400,0.15,0.12); }
    march()  { this._p('triangle',100,80,0.3,0.1); }
    battle() { this._p('triangle',80,60,0.3,0.2); this._p('sawtooth',150,80,0.4,0.12,0.05); }
    dice()   { for(let i=0;i<5;i++) this._p('square',200+Math.random()*400,300+Math.random()*300,0.04,0.06,i*0.05); }
    capture(){ this._p('square',400,800,0.2,0.12); this._p('square',600,1000,0.15,0.1,0.15); }
    defeat() { this._p('sawtooth',300,100,0.5,0.15); }
    victory(){ this._p('square',523,523,0.15,0.12); this._p('square',659,659,0.15,0.12,0.15); this._p('square',784,784,0.15,0.12,0.3); this._p('square',1047,1047,0.3,0.15,0.45); }
    buy()    { this._p('sine',400,600,0.1,0.1); this._p('sine',600,800,0.1,0.1,0.1); }
    turn()   { this._p('triangle',300,450,0.1,0.08); this._p('triangle',450,600,0.1,0.08,0.1); }
    elim()   { this._p('sawtooth',400,50,0.8,0.15); }
}
