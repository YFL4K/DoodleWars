/**
 * AudioEngine — 纯 Web Audio 程序合成（无采样文件）
 * 移植自 Doodle District：noise()/tone() 原语 + 全套战斗音效 + 电子摇滚 BGM sequencer。
 */

const clamp = (n, a, b) => (n < a ? a : n > b ? b : n);
const rnd = (a, b) => a + Math.random() * (b - a);
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ft(note,len,...) → {notes,lens}：每个音符占 len 步（起始为音高，其余为 0 休止）
function ft(...n) {
  const notes = [], lens = [];
  for (let s = 0; s < n.length; s += 2) {
    notes.push(n[s]); lens.push(n[s + 1]);
    for (let i = 1; i < n[s + 1]; i++) { notes.push(0); lens.push(0); }
  }
  return { notes, lens };
}

// ===== BGM 乐谱数据（移植参考 ar/Ft）=====
const CH = {
  C:  [60, 4], G: [55, 4], Am: [57, 3], F: [53, 4], Em: [52, 3],
};
const ko = [ft(76,2,79,2,84,3,0,1,79,2,76,2,0,4), ft(74,3,79,3,83,2,81,2,79,4,0,2), ft(81,2,84,2,88,4,86,2,84,2,81,4), ft(77,2,81,2,84,2,81,2,79,2,77,2,76,2,74,2)];
const _n = [ft(72,2,76,2,79,4,0,2,84,4,0,2), ft(83,2,81,2,79,2,74,4,0,2,79,2,81,2), ft(81,3,77,3,84,3,81,3,79,4), ft(79,4,77,2,76,2,74,4,0,4)];
const er = [ft(76,2,79,2,84,2,88,6,0,4), ft(86,2,83,2,79,4,0,2,81,2,83,4), ft(84,2,81,2,77,4,81,2,84,2,86,4), ft(83,3,0,1,79,3,0,1,74,4,0,4)];
const sr = [ft(69,2,69,2,72,2,76,4,0,2,69,4), ft(65,2,65,2,69,2,72,4,0,2,74,2,72,2), ft(76,2,76,2,74,2,72,4,0,2,67,4), ft(71,2,74,2,79,4,0,2,77,2,76,2,74,2), ft(69,2,69,2,72,2,76,4,0,2,81,4), ft(77,3,0,1,77,2,81,2,84,8), ft(83,2,81,2,79,4,74,4,79,4), ft(83,2,86,6,0,8)];
const ir = [ft(81,8,84,8), ft(83,8,86,8), ft(79,8,76,8), ft(81,12,0,4), ft(77,4,81,4,84,8), ft(79,4,83,4,86,8), ft(88,8,86,4,84,4), ft(79,4,0,12)];
const An = [ft(84,3,86,1,88,4,0,2,79,6), ft(83,3,79,1,76,4,0,2,83,6), ft(81,3,84,1,81,4,0,2,77,6), ft(79,2,81,2,83,4,86,4,0,4), ft(84,3,86,1,88,4,0,2,86,3,84,3), ft(83,3,79,1,76,4,0,2,83,3,84,3), ft(81,2,84,2,81,2,77,4,0,2,81,4), ft(79,4,83,2,86,2,79,4,0,4)];
const xo = [CH.C, CH.G, CH.Am, CH.F, CH.C, CH.G, CH.F, CH.G];
const or = [CH.Am, CH.F, CH.C, CH.G, CH.Am, CH.F, CH.G, CH.G];
const nr = [CH.F, CH.G, CH.Em, CH.Am, CH.F, CH.G, CH.C, CH.C];
const Ln = [CH.C, CH.Em, CH.F, CH.G, CH.C, CH.Em, CH.F, CH.G];
const SECTIONS = [
  { bars: [...ko, ..._n], chords: xo, bass: 'bounce',  drums: 'full',    arp: true },
  { bars: [...ko, ...er], chords: xo, bass: 'bounce',  drums: 'full',    arp: true, shadow: .02 },
  { bars: sr,  chords: or, bass: 'drive',  drums: 'driving' },
  { bars: ir,  chords: nr, bass: 'sparse', drums: 'sparse', echo: true },
  { bars: An,  chords: Ln, bass: 'pump',   drums: 'full',   counter: true, shadow: .02 },
  { bars: [...ko, ..._n], chords: xo, bass: 'bounce',  drums: 'full',    arp: true, shadow: .045 },
  { bars: An,  chords: Ln, bass: 'pump',   drums: 'driving', arp: true, counter: true, shadow: .03 },
];
// 展平成 Ft（每小节 16 步）
const FT = { lead: [], len: [], chord: [], section: [], firstBar: [], lastBar: [] };
for (const sec of SECTIONS) {
  sec.bars.forEach((bar, bi) => {
    FT.lead.push(...bar.notes); FT.len.push(...bar.lens);
    FT.chord.push(sec.chords[bi]); FT.section.push(sec);
    FT.firstBar.push(bi === 0); FT.lastBar.push(bi === sec.bars.length - 1);
  });
}
FT.bars = FT.chord.length;
FT.length = FT.bars * 16;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.9;
    this.enabled = false;
    this._intensity = 0.5;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.listenerRight = { x: 1, y: 0, z: 0 };
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.ratio.value = 5;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    const s = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, s, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < s; i++) d[i] = Math.random() * 2 - 1;
    this.enabled = true;
  }
  /** 标记收到过真实用户手势；此后即使动画循环中调用 resume 也符合自动播放策略 */
  markGesture() {
    this._gesture = true;
    this.autoResume();
  }
  autoResume() {
    if (this._gesture && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  resume() { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume(); }
  setListener(pos, right) { this.listenerPos = pos; this.listenerRight = right; }

  _out(pos, gain = 1) {
    const ctx = this.ctx, g = ctx.createGain(); let vol = gain;
    if (pos) {
      const a = pos.x - this.listenerPos.x, b = pos.y - this.listenerPos.y, c = pos.z - this.listenerPos.z;
      const dist = Math.sqrt(a * a + b * b + c * c);
      vol *= 1 / (1 + dist * 0.09);
      if (dist > 0.5 && ctx.createStereoPanner) {
        const pan = clamp((a * this.listenerRight.x + c * this.listenerRight.z) / dist, -1, 1) * 0.75;
        const p = ctx.createStereoPanner(); p.pan.value = pan;
        g.gain.value = vol; g.connect(p); p.connect(this.master); return g;
      }
    }
    g.gain.value = vol; g.connect(this.master); return g;
  }

  noise({ dur = 0.1, gain = 0.5, type = 'lowpass', freq = 1000, freqEnd = null, q = 1, pos = null, delay = 0, attack = 0.002, hp = 0, at } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = at !== undefined ? at : ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.loopEnd = 2;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(f);
    let last = f;
    if (hp > 0) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; f.connect(h); last = h; }
    last.connect(g); g.connect(this._out(pos));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, freqEnd = null, dur = 0.2, gain = 0.3, type = 'sine', attack = 0.005, pos = null, delay = 0, at, out } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = at !== undefined ? at : ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g); g.connect(out || this._out(pos));
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noiseAt(t, dur, gain, type, freq, out) {
    this.noise({ dur, gain, type, freq, at: t, out });
  }

  // ===== 战斗音效 =====
  shot() {
    this.noise({ dur: .17, gain: 1.4, type: 'bandpass', freq: 1200, freqEnd: 250, q: .7 });
    this.noise({ dur: .06, gain: .9, type: 'highpass', freq: 2800 });
    this.tone({ freq: 160, freqEnd: 40, dur: .15, gain: 1.2, type: 'triangle' });
  }
  pistolFire() {
    this.noise({ dur: .1, gain: 1.3, type: 'bandpass', freq: 1500, freqEnd: 400, q: .8 });
    this.noise({ dur: .05, gain: .9, type: 'highpass', freq: 2800 });
    this.tone({ freq: 190, freqEnd: 45, dur: .08, gain: 1.1, type: 'triangle' });
  }
  smgFire() {
    this.noise({ dur: .11, gain: 1.2, type: 'bandpass', freq: 1100, freqEnd: 300, q: .8 });
    this.noise({ dur: .05, gain: .85, type: 'highpass', freq: 2600 });
    this.tone({ freq: 170, freqEnd: 45, dur: .09, gain: 1, type: 'triangle' });
  }
  shotgunFire() {
    this.noise({ dur: .3, gain: 1.5, type: 'lowpass', freq: 1500, freqEnd: 150 });
    this.tone({ freq: 90, freqEnd: 30, dur: .25, gain: 1, type: 'triangle' });
  }
  sniperFire() {
    this.noise({ dur: .35, gain: 1.5, type: 'bandpass', freq: 700, freqEnd: 120, q: .5 });
    this.noise({ dur: .08, gain: .8, type: 'highpass', freq: 3200 });
    this.tone({ freq: 400, freqEnd: 50, dur: .3, gain: .8, type: 'sawtooth' });
  }
  revolver() {
    this.noise({ dur: .2, gain: .75, type: 'bandpass', freq: 1000, freqEnd: 200, q: .8 });
    this.tone({ freq: 130, freqEnd: 45, dur: .2, gain: .6, type: 'triangle' });
  }
  enemyShot(pos) {
    this.noise({ dur: .14, gain: .5, type: 'bandpass', freq: rnd(900, 1500), freqEnd: 200, q: .8, pos });
    this.tone({ freq: 220, freqEnd: 60, dur: .1, gain: .3, type: 'square', pos });
  }
  reload() {
    this.noise({ dur: .04, gain: .35, type: 'highpass', freq: 2500 });
    this.noise({ dur: .12, gain: .2, type: 'bandpass', freq: 600, q: 2, delay: .25 });
    this.noise({ dur: .05, gain: .4, type: 'highpass', freq: 2000, delay: .9 });
    this.tone({ freq: 900, freqEnd: 500, dur: .06, gain: .15, type: 'square', delay: 1.25 });
  }
  shell() {
    this.noise({ dur: .05, gain: .3, type: 'highpass', freq: 2200 });
    this.tone({ freq: 700, freqEnd: 400, dur: .05, gain: .12, type: 'square', delay: .1 });
  }
  empty() { this.noise({ dur: .03, gain: .3, type: 'highpass', freq: 3000 }); }
  katanaSwing() { this.noise({ dur: .2, gain: .35, type: 'bandpass', freq: 500, freqEnd: 3000, q: 1.5 }); }
  katanaHit() {
    this.noise({ dur: .14, gain: .6, type: 'lowpass', freq: 900, freqEnd: 200 });
    this.noise({ dur: .1, gain: .35, type: 'bandpass', freq: 2500, q: .6 });
    this.tone({ freq: 180, freqEnd: 70, dur: .12, gain: .4, type: 'triangle' });
  }
  explosion(pos) {
    this.noise({ dur: .7, gain: .9, type: 'lowpass', freq: 900, freqEnd: 60, pos });
    this.tone({ freq: 80, freqEnd: 25, dur: .6, gain: .7, type: 'triangle', pos });
    this.noise({ dur: .15, gain: .4, type: 'bandpass', freq: 3000, q: .7, pos });
  }
  hitEnemy(pos) {
    this.noise({ dur: .06, gain: .3, type: 'lowpass', freq: 900, pos });
    this.tone({ freq: rnd(200, 260), freqEnd: 120, dur: .1, gain: .15, type: 'square', pos });
  }
  headshot(pos) {
    this.tone({ freq: 1400, freqEnd: 900, dur: .12, gain: .25, type: 'square', pos });
    this.noise({ dur: .08, gain: .3, type: 'highpass', freq: 3500, pos });
  }
  hitmarker(crit) {
    this.tone({ freq: 880, dur: .07, gain: .22, type: 'square' });
    this.tone({ freq: 1320, dur: .16, gain: .2, type: 'square', delay: .07 });
    this.tone({ freq: 140, freqEnd: 50, dur: .16, gain: crit ? .6 : .35, type: 'sine' });
    if (crit) this.tone({ freq: 1760, dur: .22, gain: .12, type: 'triangle', delay: .14 });
  }
  enemyDie(pos) {
    this.tone({ freq: 220, freqEnd: 30, dur: 1.2, gain: .4, type: 'sawtooth', pos });
    this.noise({ dur: .8, gain: .35, type: 'lowpass', freq: 800, freqEnd: 80, pos });
  }
  hurt() {
    this.tone({ freq: 200, freqEnd: 90, dur: .2, gain: .35, type: 'sawtooth' });
    this.noise({ dur: .12, gain: .3, type: 'lowpass', freq: 500 });
  }
  pickup() {
    this.tone({ freq: 700, freqEnd: 1100, dur: .1, gain: .2, type: 'triangle' });
    this.tone({ freq: 1100, freqEnd: 1500, dur: .15, gain: .2, type: 'triangle', delay: .09 });
  }
  wave() { [440, 554, 659, 880].forEach((e, s) => this.tone({ freq: e, dur: .22, gain: .18, type: 'triangle', delay: s * .11 })); }
  waveClear() { [659, 880, 1108, 1318].forEach((e, s) => this.tone({ freq: e, dur: .3, gain: .16, type: 'triangle', delay: s * .13 })); }

  // ===== BGM（电子摇滚 sequencer）=====
  startMusic() {
    if (!this.ctx || this._mus) return;
    const ctx = this.ctx;
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.05;
    this.musicGain.connect(this.master);
    this._mus = { step: 0, next: ctx.currentTime + 0.1, timer: setInterval(() => this._musicTick(), 100) };
  }
  stopMusic() {
    if (!this.ctx || !this._mus) return;
    clearInterval(this._mus.timer); this._mus = null;
    this.musicGain && this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }
  setIntensity(t) { this._intensity = clamp(t, 0, 1); }

  _musicTick() {
    const ctx = this.ctx, e = this._mus; if (!e) return;
    const inten = this._intensity || 0, out = this.musicGain;
    const BPM = 156, stepDur = 60 / BPM / 4;
    while (e.next < ctx.currentTime + 0.7) {
      const t = e.next, c = e.step % FT.length;
      const bar = Math.floor(c / 16), d = c % 16;
      const sec = FT.section[bar], chord = FT.chord[bar], root = chord[0];
      const firstBar = FT.firstBar[bar], lastBar = FT.lastBar[bar];
      const lead = FT.lead[c];
      // lead
      if (lead > 0) {
        const dur = FT.len[c] * stepDur * 0.9, f = midi(lead);
        this.tone({ freq: f, dur, gain: .1, type: 'square', at: t, out });
        this.tone({ freq: f * 1.004, dur, gain: .04, type: 'square', at: t, out });
        if (sec.shadow) this.tone({ freq: f * 2, dur: dur * .7, gain: sec.shadow, type: 'square', at: t, out });
        if (sec.echo) {
          this.tone({ freq: f, dur: dur * .8, gain: .035, type: 'square', at: t + stepDur * 3, out });
          this.tone({ freq: f, dur: dur * .6, gain: .012, type: 'square', at: t + stepDur * 6, out });
        }
      }
      // bass
      const b = root - 12;
      let S = FT.chord[(bar + 1) % FT.bars][0] - 12;
      if (S - b > 6) S -= 12; else if (b - S > 6) S += 12;
      const L = S === b ? b + 7 : S + (S > b ? -1 : 1);
      const V = (note, len, g = .16) => this.tone({ freq: midi(note), dur: stepDur * len, gain: g, type: 'triangle', at: t, out });
      if (sec.bass === 'bounce') { if (d % 2 === 0) V(b + [0, 0, 12, 0, 0, 7, 0, 12][d / 2], 1.6); }
      else if (sec.bass === 'drive') { if (d % 2 === 0) V(d === 14 ? L : d === 6 ? b + 12 : d === 12 ? b + 7 : b, 1.4, .17); }
      else if (sec.bass === 'sparse') { if (d === 0) V(b, 6, .14); else if (d === 8) V(b + 7, 4, .12); }
      else if (sec.bass === 'pump') { if (d === 0 || d === 8) V(b, 2.5); else if (d === 4) V(b + 7, 2.5); else if (d === 12) V(b + 12, 1.6); else if (d === 14) V(L, 1.4); }
      // arp
      if (sec.arp) { const z = [root, root + chord[1], root + 7, root + 12]; this.tone({ freq: midi(z[d % 4] + 12), dur: stepDur * .8, gain: .03 + inten * .02, type: 'square', at: t, out }); }
      // counter
      if (sec.counter && d % 4 === 2) { const z = [root + 12, root + chord[1] + 12, root + 19, root + chord[1] + 12]; this.tone({ freq: midi(z[(d - 2) / 4]), dur: stepDur * 1.5, gain: .06, type: 'triangle', at: t, out }); }
      // drums
      const P = sec.drums;
      if (firstBar && d === 0) this._noiseAt(t, .4, .14, 'highpass', 5000, out);
      if (lastBar && d >= 12) this._noiseAt(t, .08, .12 + (d - 12) * .05, 'bandpass', 1800 + (d - 12) * 350, out);
      else if ((P === 'driving' ? d % 4 === 0 : P === 'sparse' ? d === 0 : d === 0 || d === 8 || inten > .5 && d === 10 || d === 14 && P === 'full' && bar % 2 === 1) && this.tone({ freq: 160, freqEnd: 45, dur: .12, gain: P === 'sparse' ? .3 : .45, type: 'sine', at: t, out })) { /* kick */ }
      if (P !== 'sparse' && (d === 4 || d === 12)) this._noiseAt(t, .11, P === 'light' ? .14 : .22, 'bandpass', 2200, out); // snare
      if (P === 'driving' ? true : P === 'full' ? d % 2 === 0 || inten > .4 : P === 'light' ? d % 4 === 2 : d === 8) { // hats
        const acc = d % 4 === 2;
        this._noiseAt(t, acc ? .05 : .025, (acc ? .1 : .06) * (d % 2 ? .5 : 1) * (P === 'sparse' ? .6 : 1), 'highpass', 8000, out);
      }
      e.next += stepDur; e.step++;
    }
  }
}

export const audio = new AudioEngine();
