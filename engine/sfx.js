/* 효과음 · 배경음 — 파일 없이 Web Audio 로 합성
 * iOS 는 사용자 터치 뒤에만 소리가 난다 → 첫 터치에 AudioContext 를 깨운다.
 */
(function () {
  let ctx = null;
  let master = null;
  let enabled = true;
  let ambient = null;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.8 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev =>
    window.addEventListener(ev, () => ac(), { passive: true }));

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function osc(type, freq, t, dur, peak = 0.3, dest = master, attack = 0.005) {
    const c = ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  function noise(t, dur, peak, filterType, freq, q = 1) {
    const c = ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    env(g, t, 0.002, peak, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const sounds = {
    tap() { const t = ctx.currentTime; noise(t, 0.03, 0.25, 'bandpass', 2400, 3); },
    tick() { const t = ctx.currentTime; noise(t, 0.02, 0.35, 'highpass', 3000); osc('square', 1800, t, 0.015, 0.03); },
    open() { const t = ctx.currentTime; noise(t, 0.25, 0.12, 'bandpass', 900, 0.7); },
    item() {
      const t = ctx.currentTime;
      [880, 1318.5, 1760].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.35, 0.12));
    },
    wrong() {
      const t = ctx.currentTime;
      osc('sawtooth', 110, t, 0.28, 0.12);
      osc('sawtooth', 116, t, 0.28, 0.1);
      noise(t, 0.08, 0.2, 'lowpass', 500);
    },
    unlock() {
      const t = ctx.currentTime;
      noise(t, 0.05, 0.5, 'lowpass', 1200);              // 철컥
      noise(t + 0.09, 0.06, 0.4, 'bandpass', 3000, 2);
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc('sine', f, t + 0.15 + i * 0.09, 0.9, 0.16, master, 0.01));
    },
    hint() { const t = ctx.currentTime; osc('sine', 660, t, 0.4, 0.1); osc('sine', 990, t + 0.1, 0.5, 0.08); },
    reveal() {
      const t = ctx.currentTime;
      [392, 493.88, 587.33, 739.99].forEach((f, i) => osc('sine', f, t + i * 0.12, 1.4, 0.07, master, 0.15));
    },
    clear() {
      const t = ctx.currentTime;
      const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      seq.forEach((f, i) => osc('triangle', f, t + i * 0.13, i === seq.length - 1 ? 1.6 : 0.3, 0.14));
      [261.63, 329.63, 392].forEach(f => osc('sine', f, t + 0.9, 2, 0.08, master, 0.3));
    },
  };

  function play(name) {
    if (!enabled || !ac()) return;
    try { sounds[name] && sounds[name](); } catch (e) { /* 소리는 실패해도 그만 */ }
  }

  // 건반 · 색 버튼 소리
  function tone(freq, dur = 0.6, type = 'triangle') {
    if (!enabled || !ac()) return;
    const t = ctx.currentTime;
    osc(type, freq, t, dur, 0.18, master, 0.008);
    osc('sine', freq * 2, t, dur * 0.6, 0.04);
  }

  /* 배경음: { type:'drone', base:55, detune:7, noise:0.04, filter:800, lfo:0.08, wave:'sine' } */
  function startAmbient(cfg) {
    stopAmbient();
    if (!cfg || !ac()) return;
    const c = ctx;
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(master);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.filter || 700;
    filter.connect(out);
    const nodes = [];
    const base = cfg.base || 55;
    const ratios = cfg.ratios || [1, 1.5, 2];
    ratios.forEach((r, i) => {
      const o = c.createOscillator();
      o.type = cfg.wave || 'sine';
      o.frequency.value = base * r;
      o.detune.value = (i % 2 ? 1 : -1) * (cfg.detune || 6);
      const g = c.createGain();
      g.gain.value = 0.12 / (i + 1);
      o.connect(g).connect(filter);
      o.start();
      nodes.push(o);
    });
    if (cfg.noise) {
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = c.createGain();
      g.gain.value = cfg.noise;
      src.connect(g).connect(filter);
      src.start();
      nodes.push(src);
    }
    // 천천히 숨 쉬듯
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = cfg.lfo || 0.07;
    lfoG.gain.value = (cfg.filter || 700) * 0.4;
    lfo.connect(lfoG).connect(filter.frequency);
    lfo.start();
    nodes.push(lfo);
    out.gain.linearRampToValueAtTime(cfg.volume || 0.5, c.currentTime + 3);
    ambient = { out, nodes };
  }

  function stopAmbient() {
    if (!ambient || !ctx) { ambient = null; return; }
    const a = ambient;
    ambient = null;
    const t = ctx.currentTime;
    a.out.gain.cancelScheduledValues(t);
    a.out.gain.setValueAtTime(a.out.gain.value, t);
    a.out.gain.linearRampToValueAtTime(0, t + 1);
    setTimeout(() => a.nodes.forEach(n => { try { n.stop(); } catch (e) { } }), 1200);
  }

  function setEnabled(on) {
    enabled = on;
    if (master) master.gain.value = on ? 0.8 : 0;
  }

  window.ESCSfx = { play, tone, startAmbient, stopAmbient, setEnabled, get enabled() { return enabled; } };
})();
