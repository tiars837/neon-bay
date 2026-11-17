// Neon Bay — all sound is synthesized live with WebAudio: no audio files.
// Engine hum, police sirens, gunshots, impacts, pickup chimes and a small
// bass-driven music loop. Nothing here loads over the network.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this._noiseBuf = null;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this._startEngineLoop();
      this._startSirenLoop();
      this._startMusic();
      return true;
    } catch {
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  _noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  _startEngineLoop() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speedKmh 0..200, driving true when the player is in a car.
  setEngine(speedKmh, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + (speedKmh / 200) * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.12);
    this.engineOsc.frequency.setTargetAtTime(42 + speedKmh * 0.9, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + speedKmh * 6, t, 0.1);
  }

  _startSirenLoop() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    // Two-tone wail: 700 Hz <-> 950 Hz every 0.45 s while wanted.
    let high = false;
    setInterval(() => {
      if (!this.ctx || !this.sirenOsc) return;
      if (this.sirenGain.gain.value < 0.005) return;
      high = !high;
      this.sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, this.ctx.currentTime, 0.08);
    }, 450);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noiseBurst(dur, vol, filterFreq, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  gunshot() {
    this._noiseBurst(0.16, 0.5, 2400);
    this._blip(140, 0.1, 'square', 0.18);
  }

  punch() {
    this._noiseBurst(0.09, 0.35, 500);
    this._blip(90, 0.09, 'sine', 0.3);
  }

  crash(strength = 1) {
    this._noiseBurst(0.25, 0.3 * strength, 900);
    this._blip(70, 0.22, 'sine', 0.3 * strength);
  }

  pickup() {
    this._blip(880, 0.12, 'sine', 0.25);
    this._blip(1318, 0.18, 'sine', 0.22, 0.09);
  }

  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => this._blip(f, 0.22, 'triangle', 0.25, i * 0.11));
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => this._blip(f, 0.3, 'sawtooth', 0.14, i * 0.16));
  }

  click() {
    this._blip(660, 0.06, 'square', 0.12);
  }

  reload() {
    this._blip(300, 0.05, 'square', 0.12);
    this._blip(420, 0.05, 'square', 0.12, 0.18);
  }

  busted() {
    [440, 415, 392, 370].forEach((f, i) => this._blip(f, 0.35, 'sawtooth', 0.16, i * 0.2));
  }

  // A tiny 16-step loop: deep bass line, kick on the beat, hats off it.
  // Runs on a lookahead timer so it keeps time without drift.
  _startMusic() {
    if (!this.musicOn) return;
    // A-minor-ish bass riff, one bar of 16 sixteenth notes.
    const bass = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 73.42, 0];
    const stepDur = 60 / 112 / 4; // 112 BPM sixteenths
    const tick = () => {
      if (!this.ctx) return;
      const step = this.musicStep % 16;
      const t = this.ctx.currentTime;
      if (bass[step] > 0) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = bass[step];
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 420;
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.95);
        o.connect(f);
        f.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + stepDur);
      }
      if (step % 4 === 0) {
        // Kick: sine dropping 120 -> 45 Hz.
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + 0.16);
      }
      if (step % 2 === 1) this._noiseBurst(0.03, 0.05, 8000);
      this.musicStep++;
    };
    this.musicTimer = setInterval(tick, stepDur * 1000);
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on && !this.musicTimer) this._startMusic();
    if (!on && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
