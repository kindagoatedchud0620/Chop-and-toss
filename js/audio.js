// Every sound is synthesised with WebAudio. Sound is OFF until the player presses M.
// No AudioContext is created before that, so automated tests never make noise.
export class Sfx {
  constructor() { this.on = false; this.ctx = null; this.loops = {}; }

  toggle() {
    this.on = !this.on;
    if (this.on && !this.ctx) this.init();
    if (this.ctx) {
      if (this.on) this.ctx.resume();
      // forget the bed levels so they are applied afresh the next time the kitchen state is read
      for (const l of Object.values(this.loops)) { l.level = -1; l.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); }
      this.master.gain.setTargetAtTime(this.on ? 0.55 : 0, this.ctx.currentTime, 0.03);
    }
    return this.on;
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // continuous beds: pan sizzle, pot boil, extinguisher hiss, fire crackle
    this.makeLoop('sizzle', 'highpass', 5200, 0.9);
    this.makeLoop('boil', 'lowpass', 420, 1.1, true);
    this.makeLoop('hiss', 'bandpass', 3000, 0.5);
    this.makeLoop('fire', 'lowpass', 900, 0.8, true);
  }

  makeLoop(name, type, freq, q, wobble = false) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    if (wobble) {
      const lfo = c.createOscillator(); lfo.frequency.value = name === 'boil' ? 11 : 17;
      const lg = c.createGain(); lg.gain.value = freq * 0.5;
      lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    }
    src.start();
    this.loops[name] = { g, level: 0 };
  }
  setLoop(name, level) {
    const l = this.loops[name];
    if (!l || l.level === level) return;
    l.level = level;
    l.g.gain.setTargetAtTime(this.on ? level : 0, this.ctx.currentTime, 0.08);
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, attack = 0.004, delay = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { type = 'bandpass', freq = 1200, q = 1, vol = 0.3, slide = 0, attack = 0.003, delay = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  // ---- the sound set ------------------------------------------------------
  chop() { this.tone(150, 0.07, { type: 'triangle', vol: 0.4, slide: -80 }); this.noise(0.05, { freq: 2600, q: 0.8, vol: 0.22 }); }
  chopDone() { this.tone(660, 0.09, { type: 'triangle', vol: 0.2 }); this.tone(990, 0.12, { type: 'triangle', vol: 0.18, delay: 0.07 }); }
  whoosh() { this.noise(0.26, { freq: 500, q: 1.4, vol: 0.32, slide: 2400, attack: 0.03 }); }
  catchPop() { this.tone(420, 0.09, { type: 'sine', vol: 0.4, slide: 500 }); this.noise(0.04, { freq: 1800, vol: 0.15 }); }
  land() { this.tone(210, 0.08, { type: 'sine', vol: 0.3, slide: -90 }); }
  pickup() { this.tone(520, 0.05, { type: 'triangle', vol: 0.14, slide: 200 }); }
  place() { this.tone(260, 0.06, { type: 'triangle', vol: 0.2, slide: -80 }); }
  nope() { this.tone(140, 0.09, { type: 'square', vol: 0.08 }); }
  sizzleHit() { this.noise(0.35, { type: 'highpass', freq: 4500, vol: 0.2, attack: 0.01 }); }
  scrub() { this.noise(0.11, { freq: 1500 + Math.random() * 900, q: 2.5, vol: 0.2, slide: 700 }); }
  washDone() { this.tone(880, 0.1, { vol: 0.2 }); this.tone(1320, 0.16, { vol: 0.18, delay: 0.08 }); }
  cooked() { this.tone(1046, 0.12, { type: 'triangle', vol: 0.22 }); this.tone(1568, 0.2, { type: 'triangle', vol: 0.2, delay: 0.1 }); }
  bell() { for (const [f, d] of [[1760, 0], [2217, 0.0], [2637, 0.09]]) this.tone(f, 0.9, { type: 'sine', vol: 0.26, delay: d, attack: 0.002 }); this.tone(880, 0.5, { vol: 0.12 }); }
  coin() { this.tone(1318, 0.07, { type: 'square', vol: 0.07, delay: 0.18 }); this.tone(1760, 0.16, { type: 'square', vol: 0.07, delay: 0.25 }); }
  alarm() { this.tone(980, 0.11, { type: 'square', vol: 0.12 }); this.tone(740, 0.11, { type: 'square', vol: 0.12, delay: 0.14 }); }
  tick(hi = false) { this.tone(hi ? 1320 : 880, 0.09, { type: 'square', vol: 0.12 }); }
  go() { this.tone(660, 0.1, { type: 'square', vol: 0.12 }); this.tone(1320, 0.4, { type: 'square', vol: 0.14, delay: 0.08 }); }
  buzzer() { this.tone(196, 0.9, { type: 'sawtooth', vol: 0.25, slide: -30 }); this.tone(147, 0.9, { type: 'square', vol: 0.14, slide: -20 }); }
  ignite() { this.noise(0.6, { type: 'lowpass', freq: 300, vol: 0.5, slide: 1800, attack: 0.02 }); this.tone(90, 0.4, { type: 'sawtooth', vol: 0.2, slide: -40 }); }
  out() { this.noise(0.5, { type: 'highpass', freq: 2500, vol: 0.25, slide: -1500 }); }
  dash() { this.noise(0.14, { freq: 900, q: 0.7, vol: 0.18, slide: 1200 }); }
  bump() { this.tone(180, 0.1, { type: 'sine', vol: 0.3, slide: -70 }); }
  splash() { this.noise(0.4, { type: 'lowpass', freq: 1400, vol: 0.4, slide: -900 }); this.tone(300, 0.2, { vol: 0.15, slide: -180 }); }
  portal() { this.tone(300, 0.3, { type: 'sine', vol: 0.2, slide: 900 }); this.tone(600, 0.3, { type: 'triangle', vol: 0.1, slide: 1200, delay: 0.03 }); }
  ticket() { this.tone(740, 0.06, { type: 'triangle', vol: 0.14 }); this.tone(988, 0.1, { type: 'triangle', vol: 0.14, delay: 0.06 }); }
  missed() { this.tone(330, 0.18, { type: 'sawtooth', vol: 0.14, slide: -120 }); this.tone(220, 0.3, { type: 'sawtooth', vol: 0.14, slide: -90, delay: 0.16 }); }
  plate() { this.tone(1500, 0.05, { type: 'sine', vol: 0.14 }); this.tone(2100, 0.08, { type: 'sine', vol: 0.1, delay: 0.03 }); }
  rumble() { this.noise(0.9, { type: 'lowpass', freq: 160, vol: 0.4, attack: 0.1 }); }
  star(i) { this.tone([784, 988, 1318][i] || 1318, 0.3, { type: 'triangle', vol: 0.22 }); }

  /** one-shot sounds for simulation events */
  handle(ev) {
    if (!this.on) return;
    switch (ev.type) {
      case 'chop': this.chop(); break;
      case 'chopDone': this.chopDone(); break;
      case 'throw': this.whoosh(); break;
      case 'catch': this.catchPop(); break;
      case 'land': this.land(); break;
      case 'pickup': this.pickup(); break;
      case 'place': case 'stack': case 'drop': this.place(); break;
      case 'plated': this.plate(); break;
      case 'nope': this.nope(); break;
      case 'sizzle': this.sizzleHit(); break;
      case 'scrub': this.scrub(); break;
      case 'washDone': this.washDone(); break;
      case 'cooked': this.cooked(); break;
      case 'serve': this.bell(); this.coin(); break;
      case 'serveWrong': this.missed(); break;
      case 'ignite': this.ignite(); break;
      case 'extinguished': this.out(); break;
      case 'dash': this.dash(); break;
      case 'bump': this.bump(); break;
      case 'splash': this.splash(); break;
      case 'teleport': this.portal(); break;
      case 'ticket': this.ticket(); break;
      case 'ticketMissed': this.missed(); break;
      case 'trash': this.land(); break;
      case 'islandMove': this.rumble(); break;
      case 'timeup': this.buzzer(); break;
      default: break;
    }
  }

  /** continuous beds follow the kitchen state */
  ambient(world, playing) {
    if (!this.ctx) return;
    let pans = 0, pots = 0, fires = 0, spray = 0;
    if (playing) {
      for (const t of world.tiles) {
        if (t.fire > 0) fires++;
        const v = t.vessel;
        if (v && (v.state === 'cooking' || v.state === 'done')) { if (v.type === 'pan') pans++; else pots++; }
      }
      for (const c of world.chefs) if (c.spraying) spray++;
    }
    this.setLoop('sizzle', pans ? 0.05 + pans * 0.02 : 0);
    this.setLoop('boil', pots ? 0.2 + pots * 0.05 : 0);
    this.setLoop('hiss', spray ? 0.28 : 0);
    this.setLoop('fire', fires ? Math.min(0.5, 0.2 + fires * 0.08) : 0);
  }
}
