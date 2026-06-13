// Audio3D — Procedural 3D spatial audio for Emperor's Conquest (no audio files)
export class Audio3D {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.currentMusic = null;
    this.currentMusicNodes = [];
    this.musicFadeGain = this.ctx.createGain();
    this.musicFadeGain.gain.value = 1;
    this.musicFadeGain.connect(this.master);
    this.cameraPos = new THREE.Vector3();
    this.maxDistance = 80;
  }

  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolume(v) { this.master.gain.value = Math.max(0, Math.min(1, v)); }

  _noise(dur, type = 'white') {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else {
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < len; i++) {
        const w = Math.random()*2-1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.969*b2+w*0.153852; b3=0.8665*b3+w*0.3104856;
        b4=0.55*b4+w*0.5329522; b5=-0.7616*b5-w*0.016898;
        d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
      }
    }
    return buf;
  }

  _osc(type, freq, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t);
    o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    return { osc: o, gain: g };
  }

  _applySpatial(node, pos) {
    if (!pos) return node;
    const dist = this.cameraPos.distanceTo(pos);
    const vol = Math.max(0, 1 - dist / this.maxDistance);
    const pan = this.ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.sin(Math.atan2(pos.x-this.cameraPos.x, pos.z-this.cameraPos.z)) * Math.min(1, vol), this.ctx.currentTime);
    const dg = this.ctx.createGain();
    dg.gain.setValueAtTime(vol * 0.8, this.ctx.currentTime);
    node.connect(dg); dg.connect(pan); pan.connect(this.master);
  }

  play(name, position) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime, C = this.ctx;
    let out;
    switch (name) {
      case 'battle': {
        const {osc,gain}=this._osc('sawtooth',80,t,0.4);
        gain.gain.linearRampToValueAtTime(0.3,t+0.05);
        gain.gain.exponentialRampToValueAtTime(0.001,t+0.4);
        const nb=C.createBufferSource(); nb.buffer=this._noise(0.15);
        const ng=C.createGain(); ng.gain.setValueAtTime(0.25,t);
        ng.gain.exponentialRampToValueAtTime(0.001,t+0.15);
        nb.connect(ng);ng.connect(gain);nb.start(t); out=gain; break;
      }
      case 'clash': {
        const {osc,gain}=this._osc('sine',800,t,0.25);
        osc.frequency.exponentialRampToValueAtTime(200,t+0.15);
        gain.gain.linearRampToValueAtTime(0.35,t+0.01);
        gain.gain.exponentialRampToValueAtTime(0.001,t+0.25);
        const o2=C.createOscillator();o2.type='triangle';o2.frequency.setValueAtTime(1200,t);
        o2.frequency.exponentialRampToValueAtTime(400,t+0.1);
        const g2=C.createGain();g2.gain.linearRampToValueAtTime(0.15,t+0.01);
        g2.gain.exponentialRampToValueAtTime(0.001,t+0.15);
        o2.connect(g2);g2.connect(gain);o2.start(t);o2.stop(t+0.2);out=gain;break;
      }
      case 'thunder': {
        const nb=C.createBufferSource();nb.buffer=this._noise(1.2,'pink');
        const lp=C.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(3000,t);
        lp.frequency.exponentialRampToValueAtTime(80,t+0.8);lp.Q.value=1;
        const g=C.createGain();g.gain.setValueAtTime(0.001,t);
        g.gain.linearRampToValueAtTime(0.5,t+0.05);
        g.gain.exponentialRampToValueAtTime(0.001,t+1.2);
        nb.connect(lp);lp.connect(g);nb.start(t);out=g;break;
      }
      case 'rain': {
        const nb=C.createBufferSource();nb.buffer=this._noise(3,'pink');nb.loop=true;
        const hp=C.createBiquadFilter();hp.type='highpass';hp.frequency.value=4000;
        const lp=C.createBiquadFilter();lp.type='lowpass';lp.frequency.value=9000;
        const g=C.createGain();g.gain.setValueAtTime(0.12,t);
        g.gain.linearRampToValueAtTime(0,t+3);
        nb.connect(hp);hp.connect(lp);lp.connect(g);nb.start(t);nb.stop(t+3);out=g;break;
      }
      case 'wind': {
        const nb=C.createBufferSource();nb.buffer=this._noise(4,'pink');nb.loop=true;
        const bp=C.createBiquadFilter();bp.type='bandpass';
        bp.frequency.setValueAtTime(600,t);bp.frequency.linearRampToValueAtTime(1200,t+2);
        bp.frequency.linearRampToValueAtTime(400,t+4);bp.Q.value=2;
        const g=C.createGain();g.gain.setValueAtTime(0.08,t);
        g.gain.linearRampToValueAtTime(0,t+4);
        nb.connect(bp);bp.connect(g);nb.start(t);nb.stop(t+4);out=g;break;
      }
      case 'victory': {
        const g=C.createGain();
        [261.6,329.6,392.0,523.3].forEach((f,i)=>{
          const{gain:eg}=this._osc('sine',f,t+i*0.15,0.5);
          eg.gain.linearRampToValueAtTime(0.2,t+i*0.15+0.03);
          eg.gain.exponentialRampToValueAtTime(0.001,t+i*0.15+0.5);eg.connect(g);
        }); out=g; break;
      }
      case 'defeat': {
        const g=C.createGain();
        [293.7,261.6,220.0,196.0].forEach((f,i)=>{
          const{gain:eg}=this._osc('sawtooth',f,t+i*0.25,0.7);
          eg.gain.linearRampToValueAtTime(0.12,t+i*0.25+0.04);
          eg.gain.exponentialRampToValueAtTime(0.001,t+i*0.25+0.7);eg.connect(g);
        }); out=g; break;
      }
      case 'horn': {
        const {osc,gain}=this._osc('sawtooth',220,t,1.0);
        const vib=C.createOscillator();vib.frequency.setValueAtTime(5,t);
        const vg=C.createGain();vg.gain.setValueAtTime(8,t);
        vib.connect(vg);vg.connect(osc.frequency);vib.start(t);vib.stop(t+1);
        gain.gain.linearRampToValueAtTime(0.2,t+0.08);
        gain.gain.setValueAtTime(0.18,t+0.6);
        gain.gain.exponentialRampToValueAtTime(0.001,t+1.0);
        const lp=C.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1500;
        out=C.createGain();osc.connect(lp);lp.connect(gain);gain.connect(out);break;
      }
      case 'footsteps': {
        const g=C.createGain();
        for(let i=0;i<4;i++){
          const nb=C.createBufferSource();nb.buffer=this._noise(0.06);
          const fg=C.createGain();const st=t+i*0.3;
          fg.gain.setValueAtTime(0.15,st);
          fg.gain.exponentialRampToValueAtTime(0.001,st+0.06);
          nb.connect(fg);fg.connect(g);nb.start(st);
        } out=g; break;
      }
      case 'fire': {
        const nb=C.createBufferSource();nb.buffer=this._noise(2,'pink');nb.loop=true;
        const bp=C.createBiquadFilter();bp.type='bandpass';bp.frequency.value=3000;bp.Q.value=0.5;
        const g=C.createGain();g.gain.setValueAtTime(0.1,t);
        for(let i=0;i<10;i++)g.gain.linearRampToValueAtTime(0.05+Math.random()*0.1,t+i*0.2);
        g.gain.linearRampToValueAtTime(0,t+2);
        nb.connect(bp);bp.connect(g);nb.start(t);nb.stop(t+2);out=g;break;
      }
      case 'explosion': {
        const nb=C.createBufferSource();nb.buffer=this._noise(0.8);
        const lp=C.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(2000,t);
        lp.frequency.exponentialRampToValueAtTime(60,t+0.6);
        const ng=C.createGain();ng.gain.setValueAtTime(0.6,t);
        ng.gain.exponentialRampToValueAtTime(0.001,t+0.8);
        nb.connect(lp);lp.connect(ng);nb.start(t);
        const{gain:og}=this._osc('sine',50,t,0.6);
        og.gain.linearRampToValueAtTime(0.4,t+0.02);
        og.gain.exponentialRampToValueAtTime(0.001,t+0.6);
        out=C.createGain();ng.connect(out);og.connect(out);break;
      }
      case 'wave': {
        const nb=C.createBufferSource();nb.buffer=this._noise(3,'pink');nb.loop=true;
        const bp=C.createBiquadFilter();bp.type='bandpass';bp.Q.value=3;
        bp.frequency.setValueAtTime(300,t);bp.frequency.linearRampToValueAtTime(800,t+1.5);
        bp.frequency.linearRampToValueAtTime(300,t+3);
        const g=C.createGain();g.gain.setValueAtTime(0.001,t);
        g.gain.linearRampToValueAtTime(0.18,t+0.5);
        g.gain.linearRampToValueAtTime(0.001,t+3);
        nb.connect(bp);bp.connect(g);nb.start(t);nb.stop(t+3);out=g;break;
      }
      default: return;
    }
    if (position) this._applySpatial(out, position);
    else out.connect(this.master);
  }

  _buildDrone(freq, t, dur, dest) {
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0.06,t);g.gain.setValueAtTime(0.06,t+dur);
    g.gain.linearRampToValueAtTime(0,t+dur+1);
    o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur+1);
  }

  _buildArp(notes, iv, t, dur, dest, wave='sine') {
    const n=Math.floor(dur/iv);
    for(let i=0;i<n;i++){
      const{gain}=this._osc(wave,notes[i%notes.length],t+i*iv,iv*0.9);
      gain.gain.linearRampToValueAtTime(0.08,t+i*iv+0.05);
      gain.gain.linearRampToValueAtTime(0.001,t+i*iv+iv*0.8);
      gain.connect(dest);
    }
  }

  _buildPad(freqs, t, dur, dest) {
    freqs.forEach(f=>{
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.type='sine';o.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.04,t+2);
      g.gain.setValueAtTime(0.04,t+dur-2);g.gain.linearRampToValueAtTime(0,t+dur);
      o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur);
    });
  }

  playMusic(name) {
    if(this.ctx.state==='suspended')this.ctx.resume();
    if(this.currentMusic===name)return;
    this._stopMusic(); this.currentMusic=name;
    const t=this.ctx.currentTime,dur=16,C=this.ctx;
    const mg=C.createGain();
    mg.gain.setValueAtTime(0,t);mg.gain.linearRampToValueAtTime(1,t+1.5);
    mg.gain.setValueAtTime(1,t+dur-1.5);mg.gain.linearRampToValueAtTime(0,t+dur);
    mg.connect(this.musicFadeGain); this.currentMusicNodes.push(mg);
    switch(name){
      case 'menu':
        this._buildDrone(130.8,t,dur,mg);this._buildDrone(196,t,dur,mg);
        this._buildArp([261.6,329.6,392,523.3],0.8,t,dur,mg);break;
      case 'world':
        this._buildDrone(110,t,dur,mg);this._buildDrone(164.8,t,dur,mg);
        this._buildArp([220,277.2,329.6,440,329.6,277.2],1.2,t,dur,mg);
        this._buildPad([220,329.6,440],t,dur,mg);break;
      case 'battle':
        this._buildDrone(65.4,t,dur,mg);
        this._buildArp([196,233.1,261.6,349.2,311.1,261.6],0.35,t,dur,mg,'sawtooth');
        {const nb=C.createBufferSource();nb.buffer=this._noise(dur);nb.loop=true;
        const lp=C.createBiquadFilter();lp.type='lowpass';lp.frequency.value=300;
        const ng=C.createGain();ng.gain.setValueAtTime(0.03,t);
        nb.connect(lp);lp.connect(ng);ng.connect(mg);nb.start(t);nb.stop(t+dur);
        this.currentMusicNodes.push(nb);}break;
      case 'victory':
        this._buildDrone(261.6,t,dur,mg);this._buildDrone(329.6,t,dur,mg);
        this._buildArp([523.3,659.3,784,1047,784,659.3],0.5,t,dur,mg);
        this._buildPad([261.6,329.6,392,523.3],t,dur,mg);break;
      case 'defeat':
        this._buildDrone(110,t,dur,mg);
        this._buildArp([220,207.7,196,174.6,164.8,146.8],0.7,t,dur,mg,'triangle');
        this._buildPad([146.8,174.6,220],t,dur,mg);break;
    }
  }

  _stopMusic() {
    this.currentMusicNodes.forEach(n=>{
      try{n.stop();}catch(_){}
      try{n.disconnect();}catch(_){}
    });
    this.currentMusicNodes=[];this.currentMusic=null;
  }

  update(dt, cameraPosition) {
    if(cameraPosition)this.cameraPos.copy(cameraPosition);
  }

  stopAll() {
    this._stopMusic();
    if(this.master){
      this.master.gain.setValueAtTime(this.master.gain.value,this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0,this.ctx.currentTime+0.1);
      const v=0.7;
      setTimeout(()=>{if(this.master)this.master.gain.value=v;},150);
    }
  }
}
