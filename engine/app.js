/* 화면 · 상태 · 저장 · 기록 */
(function () {
  const h = window.ESCh;
  const Sfx = window.ESCSfx;
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = () => document.getElementById('app');

  /* ---------- 저장 ---------- */
  const store = {
    ok: true,
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { this.ok = false; return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { this.ok = false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  const prefs = Object.assign({ sound: true, name: '' }, store.get('esc:prefs', {}));
  Sfx.setEnabled(prefs.sound);
  const savePrefs = () => store.set('esc:prefs', prefs);
  const saveKey = id => `esc:save:${id}`;
  const records = () => store.get('esc:records', []);

  const MOOD = { mystery: '미스터리', horror: '호러', warm: '따뜻함', deep: '심해 · 긴장', tutorial: '연습', secret: '???', sad: '쓸쓸함' };
  const HINT_LABEL = ['살짝', '조금 더', '정답 직전'];
  const WRONG_LINES = ['아무 일도 일어나지 않는다.', '꿈쩍도 하지 않는다.', '틀린 것 같다…', '다시 생각해 보자.'];

  const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  function rankOf(ms, hints) {
    const m = ms / 60000;
    if (hints === 0 && m <= 7) return 'S';
    if (hints <= 2 && m <= 10) return 'A';
    if (m <= 15) return 'B';
    return 'C';
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- 공통 UI ---------- */
  function toast(msg) {
    const t = h('div', { class: 'toast' }, msg);
    $('#toast-root').append(t);
    setTimeout(() => t.classList.add('out'), 1900);
    setTimeout(() => t.remove(), 2300);
  }

  function sheet(content, opts = {}) {
    const root = $('#sheet-root');
    const back = h('div', { class: 'sheet-back' });
    const panel = h('div', { class: 'sheet' + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog' },
      h('div', { class: 'sheet-grip' }), h('button', { class: 'sheet-x', 'aria-label': '닫기', onclick: () => close() }, '✕'), content);
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      back.classList.remove('in'); panel.classList.remove('in');
      setTimeout(() => { back.remove(); panel.remove(); opts.onClose && opts.onClose(); }, 260);
    }
    back.onclick = close;
    root.append(back, panel);
    requestAnimationFrame(() => { back.classList.add('in'); panel.classList.add('in'); });
    Sfx.play('open');
    return close;
  }

  function ask(title, body, yes = '확인', no = '취소') {
    return new Promise(res => {
      let answered = false;
      const close = sheet(h('div', { class: 'ask' },
        h('h3', null, title), body ? h('p', { class: 'sub' }, body) : null,
        h('div', { class: 'dev-row' },
          h('button', { class: 'btn ghost', onclick: () => { answered = true; close(); res(false); } }, no),
          h('button', { class: 'btn primary', onclick: () => { answered = true; close(); res(true); } }, yes))),
      { onClose: () => { if (!answered) res(false); } });
    });
  }

  function applyTheme(t) {
    const r = document.documentElement.style;
    const keys = ['bg', 'panel', 'panel2', 'ink', 'sub', 'accent', 'line', 'glow'];
    keys.forEach(k => (t && t[k] ? r.setProperty('--' + k, t[k]) : r.removeProperty('--' + k)));
    document.body.dataset.font = (t && t.font) || 'sans';
    const meta = $('meta[name=theme-color]');
    if (meta) meta.content = (t && t.bg) || '#0d0c0b';
  }

  function soundBtn() {
    const b = h('button', {
      class: 'icon-btn', 'aria-label': '소리',
      onclick: () => { prefs.sound = !prefs.sound; Sfx.setEnabled(prefs.sound); savePrefs(); b.textContent = prefs.sound ? '🔊' : '🔇'; },
    }, prefs.sound ? '🔊' : '🔇');
    return b;
  }

  /* ---------- 라우터 ---------- */
  function route() {
    stopGame();
    window.scrollTo(0, 0);
    const hs = location.hash || '#/';
    if (hs.startsWith('#/play/')) playRoute(decodeURIComponent(hs.slice(7)));
    else if (hs === '#/records') renderRecords();
    else if (hs === '#gallery') { applyTheme(null); window.ESCGallery.render(app()); }
    else renderHome();
  }
  const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

  /* ---------- 홈 ---------- */
  function renderHome() {
    applyTheme(null);
    const built = ESC.list.slice();
    const soon = ESC.lineup.filter(l => !built.some(b => b.id === l.id));
    const all = [...built, ...soon.map(s => ({ ...s, soon: true }))].sort((a, b) => a.order - b.order);
    const recs = records();

    const cards = all.map((d, i) => {
      if (d.soon) {
        return h('div', { class: 'card soon', style: { '--d': i } },
          h('div', { class: 'card-cover soon-cover' }, h('span', { class: 'soon-lock' }, '🔒')),
          h('div', { class: 'card-body' },
            h('div', { class: 'card-tags' }, h('span', { class: 'chip' }, '준비 중')),
            h('h2', null, d.title), h('p', { class: 'card-tag' }, d.tagline || '')));
      }
      const sv = store.get(saveKey(d.id));
      const best = recs.filter(r => r.id === d.id).sort((a, b) => a.ms - b.ms)[0];
      let state;
      if (sv && !sv.done && sv.build === d.build) state = h('div', { class: 'card-state go' }, `▶ 이어하기 · ${fmt(sv.elapsed)} · 방 ${sv.idx + 1}/${d.count}`);
      else if (best) state = h('div', { class: 'card-state done' }, `✓ 클리어 · 최고 ${fmt(best.ms)} · ${best.rank}`);
      else state = h('div', { class: 'card-state' }, '새로운 방');
      return h('button', {
        class: 'card', style: { '--d': i, '--c-accent': d.theme.accent, '--c-bg': d.theme.bg },
        onclick: () => { Sfx.play('tap'); go('#/play/' + encodeURIComponent(d.id)); },
      },
      h('div', { class: 'card-cover', html: d.cover || '' }),
      h('div', { class: 'card-body' },
        h('div', { class: 'card-tags' },
          h('span', { class: 'chip' }, MOOD[d.mood] || d.mood),
          h('span', { class: 'chip' }, `⏱ ${d.minutes}분`),
          h('span', { class: 'chip diff', 'aria-label': `난이도 ${d.difficulty}` }, '●'.repeat(d.difficulty) + '○'.repeat(3 - d.difficulty))),
        h('h2', null, d.title), h('p', { class: 'card-tag' }, d.tagline), state));
    });

    app().replaceChildren(h('div', { class: 'home' },
      h('header', { class: 'home-head' },
        h('div', { class: 'home-tools' },
          h('button', { class: 'btn ghost sm', onclick: () => go('#/records') }, '🏆 기록'), soundBtn()),
        h('div', { class: 'eyebrow' }, 'ONLINE ESCAPE ROOM'),
        h('h1', { class: 'home-title' }, '방탈출'),
        h('p', { class: 'sub' }, '정답을 찾아야 다음 문이 열립니다. 답은 어디에도 적혀 있지 않아요.')),
      h('div', { class: 'cards' }, cards),
      !store.ok ? h('p', { class: 'warn' }, '이 브라우저에서는 저장이 안 돼요. 끄면 처음부터 시작해요.') : null,
      h('footer', { class: 'home-foot' }, '진행과 기록은 이 기기에만 저장돼요')));
  }

  /* ---------- 기록 모음 ---------- */
  function renderRecords() {
    applyTheme(null);
    const recs = records().slice().sort((a, b) => b.date - a.date);
    app().replaceChildren(h('div', { class: 'page' },
      h('div', { class: 'page-bar' }, h('button', { class: 'icon-btn', onclick: () => go('#/') }, '←'), h('span', null, '기록')),
      h('h1', { class: 'page-title' }, '클리어 기록'),
      recs.length ? h('div', { class: 'rec-list' }, recs.map(r => h('div', { class: 'rec' },
        h('span', { class: 'rec-rank r-' + r.rank }, r.rank),
        h('div', { class: 'rec-main' }, h('b', null, r.title), h('span', { class: 'sub' }, `${new Date(r.date).toLocaleDateString('ko-KR')} · 힌트 ${r.hints} · 오답 ${r.wrong}${r.name ? ' · ' + r.name : ''}`)),
        h('span', { class: 'rec-time' }, fmt(r.ms)))))
        : h('p', { class: 'sub center' }, '아직 클리어한 방이 없어요.')));
  }

  /* ---------- 게임 ---------- */
  let G = null;

  function stopGame() {
    if (!G) return;
    clearInterval(G.timer);
    persist();
    Sfx.stopAmbient();
    document.removeEventListener('visibilitychange', G.onVis);
    window.removeEventListener('devicemotion', G.onMotion);
    G = null;
  }

  function persist() {
    if (G && G.save) store.set(saveKey(G.data.id), G.save);
  }

  function newSave(d) {
    return { v: 1, build: d.build, idx: 0, keys: [d.k0], elapsed: 0, splits: [], hints: {}, wrong: {}, inv: [], found: {}, pstate: {}, done: false, started: Date.now() };
  }

  async function payloadAt(i) {
    if (!G.cache[i]) G.cache[i] = await ESCCrypto.openPayload(G.save.keys[i], G.data.payloads[i]);
    return G.cache[i];
  }

  async function playRoute(id) {
    const d = ESC.list.find(x => x.id === id);
    if (!d) return go('#/');
    applyTheme(d.theme);
    if (!window.crypto || !crypto.subtle) {
      app().replaceChildren(h('div', { class: 'page center' }, h('h2', null, '여기서는 열 수 없어요'), h('p', { class: 'sub' }, 'https 주소(GitHub Pages)로 열어 주세요.')));
      return;
    }
    let save = store.get(saveKey(id));
    if (save && save.build !== d.build) {
      store.del(saveKey(id));
      save = null;
      toast('방이 새로 고쳐져서 처음부터 시작해요');
    }
    G = { data: d, save, cache: {}, selected: new Set(), invListeners: [], running: false, last: performance.now(), lastSaved: 0 };
    G.onVis = () => { if (document.hidden) persist(); G && (G.last = performance.now()); };
    document.addEventListener('visibilitychange', G.onVis);
    G.timer = setInterval(tick, 250);

    if (save && save.done) {
      const last = records().filter(r => r.id === id).sort((a, b) => b.date - a.date)[0];
      return renderResult(d, last || null);
    }
    if (!save) return renderIntro();
    try {
      await payloadAt(save.idx);
    } catch (e) {
      store.del(saveKey(id));
      G.save = null;
      toast('저장된 진행을 열 수 없어서 처음부터 시작해요');
      return renderIntro();
    }
    startRunning();
    renderPuzzle();
  }

  function tick() {
    if (!G) return;
    const now = performance.now();
    if (G.running && !document.hidden && G.save) G.save.elapsed += now - G.last;
    G.last = now;
    const c = $('.clock');
    if (c && G.save) c.textContent = fmt(G.save.elapsed);
    if (now - G.lastSaved > 3000) { G.lastSaved = now; persist(); }
  }

  function startRunning() {
    G.running = true;
    G.last = performance.now();
    if (G.data.ambient) Sfx.startAmbient(G.data.ambient);
  }

  async function renderIntro() {
    const d = G.data;
    G.save = null;
    const tmp = newSave(d);
    const p0 = await ESCCrypto.openPayload(d.k0, d.payloads[0]);
    if (!G) return;
    G.cache[0] = p0;
    showStory({
      kicker: MOOD[d.mood] || '', title: d.title, html: (p0.intro && p0.intro.html) || '', cover: d.cover,
      button: '시작하기', back: true,
      onNext: () => { G.save = tmp; persist(); startRunning(); Sfx.play('unlock'); renderPuzzle(); },
    });
  }

  function showStory({ kicker, title, html, button, onNext, cover, back, cls }) {
    const btn = h('button', { class: 'btn primary big', onclick: () => { btn.disabled = true; onNext(); } }, button);
    app().replaceChildren(h('div', { class: 'story ' + (cls || '') },
      back ? h('button', { class: 'icon-btn story-back', onclick: () => go('#/') }, '←') : null,
      cover ? h('div', { class: 'story-cover', html: cover }) : null,
      h('div', { class: 'story-inner' },
        kicker ? h('div', { class: 'eyebrow' }, kicker) : null,
        h('h1', { class: 'story-title' }, title),
        h('div', { class: 'story-html', html }),
        btn)));
    window.scrollTo(0, 0);
  }

  /* ---------- 퍼즐 화면 ---------- */
  function hasItem(id) { return G.save.inv.some(it => it.id === id); }

  function giveItem(def, p) {
    const it = typeof def === 'string' ? { id: def, ...(p.items && p.items[def]) } : def;
    if (!it.id || hasItem(it.id)) return null;
    G.save.inv.push(it);
    persist();
    Sfx.play('item');
    drawInv(it.id);
    return it;
  }

  function removeItem(id) {
    G.save.inv = G.save.inv.filter(it => it.id !== id);
    G.selected.delete(id);
  }

  function invChanged() { G.invListeners.forEach(fn => fn()); }

  function drawInv(popId) {
    const bar = $('.inv-items');
    if (!bar) return;
    const inv = G.save.inv;
    bar.replaceChildren(...(inv.length ? inv.map(it => h('button', {
      class: 'inv-slot' + (G.selected.has(it.id) ? ' sel' : '') + (it.id === popId ? ' pop' : ''),
      'aria-label': it.name, onclick: () => inspect(it),
    }, h('span', { class: 'inv-ic', html: it.icon || '❔' }))) : [h('span', { class: 'inv-empty' }, '가방이 비어 있어요')]));
  }

  function inspect(it) {
    const p = G.cache[G.save.idx].puzzle;
    const isUse = p.device && p.device.type === 'use';
    const others = G.save.inv.filter(x => x.id !== it.id);
    let close;
    const combineList = h('div', { class: 'combine-list hidden' }, others.map(o => h('button', {
      class: 'combine-opt', onclick: () => {
        const r = (it.combine && it.combine.with === o.id && it.combine.result) || (o.combine && o.combine.with === it.id && o.combine.result);
        close();
        if (!r) { Sfx.play('wrong'); toast('합쳐지지 않는다.'); return; }
        removeItem(it.id); removeItem(o.id);
        G.save.inv.push(r); persist(); Sfx.play('item'); drawInv(r.id); invChanged();
        setTimeout(() => inspect(r), 300);
        toast(`「${r.name}」 완성!`);
      },
    }, h('span', { class: 'inv-ic', html: o.icon || '' }), o.name)));
    const sel = G.selected.has(it.id);
    close = sheet(h('div', { class: 'inspect' },
      h('div', { class: 'inspect-ic', html: it.icon || '' }),
      h('h3', null, it.name),
      it.desc ? h('p', { class: 'sub' }, it.desc) : null,
      it.html ? h('div', { class: 'inspect-html', html: it.html }) : null,
      h('div', { class: 'dev-row wrap' },
        isUse ? h('button', { class: 'btn primary', onclick: () => {
          if (sel) G.selected.delete(it.id); else G.selected.add(it.id);
          close(); drawInv(); invChanged();
        } }, sel ? '고르기 취소' : '고르기') : null,
        others.length ? h('button', { class: 'btn ghost', onclick: () => combineList.classList.toggle('hidden') }, '🔗 다른 것과 합치기') : null),
      combineList), { cls: 'tall' });
  }

  function openHints() {
    const idx = G.save.idx;
    const hints = G.cache[idx].puzzle.hints || [];
    const body = h('div', { class: 'hints' });
    const draw = () => {
      const seen = G.save.hints[idx] || 0;
      body.replaceChildren(
        h('h3', null, '💡 힌트'),
        h('p', { class: 'sub' }, '한 단계씩 열려요. 본 힌트 수는 클리어 기록에 남아요.'),
        ...hints.map((t, i) => {
          if (i < seen) return h('div', { class: 'hint open' }, h('span', { class: 'hint-k' }, `${i + 1} · ${HINT_LABEL[i] || ''}`), h('p', { html: t }));
          if (i === seen) return h('button', { class: 'hint next', onclick: () => {
            G.save.hints[idx] = i + 1; persist(); Sfx.play('hint'); draw(); updateHintBadge();
          } }, `힌트 ${i + 1} 보기 · ${HINT_LABEL[i] || ''}`);
          return h('div', { class: 'hint locked' }, `힌트 ${i + 1} · 앞 힌트를 먼저 봐요`);
        }));
    };
    draw();
    sheet(body, { cls: 'tall' });
  }

  function updateHintBadge() {
    const b = $('.hint-badge');
    if (b) { const n = sum(G.save.hints); b.textContent = n; b.hidden = !n; }
  }

  function syncFound(scene, idx) {
    scene.querySelectorAll('[data-hide-when]').forEach(el => { el.style.display = G.save.found[`${idx}:${el.dataset.hideWhen}`] ? 'none' : ''; });
    scene.querySelectorAll('[data-show-when]').forEach(el => { el.style.display = G.save.found[`${idx}:${el.dataset.showWhen}`] ? '' : 'none'; });
  }

  async function renderPuzzle() {
    const d = G.data;
    const idx = G.save.idx;
    let pl;
    try { pl = await payloadAt(idx); } catch (e) { toast('방을 열지 못했어요'); return go('#/'); }
    if (!G) return;
    if (idx >= d.count) return finish();
    const p = pl.puzzle;
    G.selected.clear();
    G.invListeners = [];
    G.pstate = G.save.pstate[idx] || (G.save.pstate[idx] = {});
    if (p.startItems) p.startItems.forEach(id => { if (!hasItem(id)) G.save.inv.push({ id, ...p.items[id] }); });

    // 위 바
    const dots = h('div', { class: 'prog' }, Array.from({ length: d.count }, (_, i) => h('span', { class: 'prog-d' + (i < idx ? ' done' : i === idx ? ' now' : '') })));
    const top = h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': '나가기', onclick: () => { persist(); go('#/'); } }, '←'),
      h('div', { class: 'top-mid' }, h('span', { class: 'top-title' }, d.title), dots),
      h('span', { class: 'clock' }, fmt(G.save.elapsed)),
      h('button', { class: 'icon-btn hint-btn', 'aria-label': '힌트', onclick: openHints }, '💡', h('span', { class: 'hint-badge', hidden: true }, '')),
      soundBtn());

    // 장면
    const scene = h('div', { class: 'scene', html: p.scene || '' });
    syncFound(scene, idx);
    scene.addEventListener('click', e => {
      const hot = e.target.closest('[data-hot]');
      if (!hot || !scene.contains(hot)) return;
      ripple(scene, e);
      onHot(hot.dataset.hot, p, scene);
    });
    const extras = [];
    if (p.effect === 'flashlight') {
      const fl = h('div', { class: 'flash' });
      scene.append(fl);
      scene.classList.add('dark');
      const move = e => { const r = scene.getBoundingClientRect(); fl.style.setProperty('--x', (e.clientX - r.left) + 'px'); fl.style.setProperty('--y', (e.clientY - r.top) + 'px'); };
      scene.addEventListener('pointermove', move);
      scene.addEventListener('pointerdown', move);
      extras.push(h('p', { class: 'effect-tip' }, '🔦 손가락으로 어둠을 비춰 보세요'));
    }
    if (p.effect === 'shake') {
      const reveal = () => {
        if (scene.classList.contains('shaken')) return;
        scene.classList.add('shaken', 'shaking'); G.pstate.shaken = true; persist(); Sfx.play('reveal');
        setTimeout(() => scene.classList.remove('shaking'), 700);
      };
      if (G.pstate.shaken) scene.classList.add('shaken');
      let lastShake = 0;
      G.onMotion = e => {
        const a = e.accelerationIncludingGravity || e.acceleration;
        if (!a) return;
        const m = Math.abs(a.x || 0) + Math.abs(a.y || 0) + Math.abs(a.z || 0);
        if (m > 34) { const now = Date.now(); if (now - lastShake < 900) reveal(); lastShake = now; }
      };
      window.addEventListener('devicemotion', G.onMotion);
      extras.push(h('button', { class: 'btn ghost sm effect-btn', onclick: async () => {
        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission && !G.askedMotion) {
          G.askedMotion = true;
          try { if ((await DeviceMotionEvent.requestPermission()) === 'granted') { toast('폰을 흔들어 보세요!'); return; } } catch (e) { /* 버튼으로 대신 */ }
        }
        reveal();
      } }, '📳 흔들기'));
    }

    // 장치
    const dev = h('section', { class: 'device' });
    const ctx = {
      busy: false,
      toast,
      inv: { selected: () => G.save.inv.filter(it => G.selected.has(it.id)), onChange: fn => G.invListeners.push(fn) },
      submit: async str => {
        if (ctx.busy) return false;
        ctx.busy = true;
        dev.classList.add('busy');
        const t0 = Date.now();
        let key = null;
        try { key = await ESCCrypto.tryGate(str, d.gates[idx]); } catch (e) { key = null; }
        const left = 450 - (Date.now() - t0);
        if (left > 0) await wait(left);
        if (!G) return false;
        dev.classList.remove('busy');
        ctx.busy = false;
        if (key) { onSolved(key, p); return true; }
        G.save.wrong[idx] = (G.save.wrong[idx] || 0) + 1;
        persist();
        Sfx.play('wrong');
        dev.classList.remove('wrong'); void dev.offsetWidth; dev.classList.add('wrong');
        toast(WRONG_LINES[Math.floor(Math.random() * WRONG_LINES.length)]);
        return false;
      },
    };
    if (/[?&]test\b/.test(location.search)) window.__esc = { submit: ctx.submit, idx }; // tools/playtest.mjs 용
    const type = (p.device && p.device.type) || 'text';
    window.ESCDevices[type](dev, (p.device && p.device.config) || {}, ctx);

    const inv = h('footer', { class: 'inv' }, h('span', { class: 'inv-k', 'aria-hidden': 'true' }, '🎒', h('small', null, '가방')), h('div', { class: 'inv-items' }));

    app().replaceChildren(h('div', { class: 'play' }, top,
      h('main', { class: 'play-main' },
        h('div', { class: 'room-head' }, h('span', { class: 'eyebrow' }, `ROOM ${idx + 1} / ${d.count}`), h('h2', { class: 'room-title' }, p.title)),
        scene, ...extras,
        p.prompt ? h('p', { class: 'prompt', html: p.prompt }) : null,
        dev),
      inv));
    drawInv();
    updateHintBadge();
    window.scrollTo(0, 0);

    if (p.script) {
      try {
        const fn = new Function('return (' + p.script + ')')();
        fn({
          root: dev, scene, submit: ctx.submit, toast, sfx: n => Sfx.play(n), tone: (f, du) => Sfx.tone(f, du),
          give: def => giveItem(def, p), has: hasItem, state: G.pstate, save: persist,
          reveal: sel => scene.querySelectorAll(sel).forEach(el => el.classList.add('revealed')),
          h, s: window.ESCs,
        });
      } catch (e) { console.error('script', e); }
    }
  }

  function ripple(scene, e) {
    const r = scene.getBoundingClientRect();
    const dot = h('span', { class: 'ripple', style: { left: (e.clientX - r.left) + 'px', top: (e.clientY - r.top) + 'px' } });
    scene.append(dot);
    setTimeout(() => dot.remove(), 600);
  }

  function onHot(id, p, scene) {
    const hs = p.hotspots && p.hotspots[id];
    if (!hs) { Sfx.play('tap'); return; }
    const idx = G.save.idx;
    const fk = `${idx}:${id}`;
    if (hs.requires && !G.save.found[fk] && !hasItem(hs.requires)) {
      Sfx.play('tap');
      toast(hs.locked || '잠겨 있다. 무언가 필요해 보인다.');
      return;
    }
    const first = !G.save.found[fk];
    G.save.found[fk] = true;
    if (first && hs.requires && hs.consume) { removeItem(hs.requires); drawInv(); invChanged(); }
    const got = first && hs.give ? giveItem(hs.give, p) : null;
    persist();
    syncFound(scene, idx);
    if (hs.html || hs.title) {
      sheet(h('div', { class: 'inspect' },
        hs.title ? h('h3', null, hs.title) : null,
        hs.html ? h('div', { class: 'inspect-html', html: hs.html }) : null,
        got ? h('div', { class: 'got' }, h('span', { class: 'inv-ic', html: got.icon || '' }), `「${got.name}」을(를) 가방에 넣었다`) : null), { cls: hs.tall ? 'tall' : '' });
    } else if (got) toast(`「${got.name}」을(를) 얻었다`);
    else Sfx.play('tap');
  }

  async function onSolved(key, p) {
    const idx = G.save.idx;
    G.save.keys[idx + 1] = key;
    G.save.splits[idx] = Math.round(G.save.elapsed);
    (p.consume || []).forEach(removeItem);
    G.save.idx = idx + 1;
    persist();
    Sfx.play('unlock');
    const dev = $('.device');
    if (dev) dev.classList.add('solved');
    await wait(800);
    if (!G) return;
    const last = G.save.idx >= G.data.count;
    showStory({
      kicker: 'UNLOCKED', title: p.title, html: (p.solved && p.solved.html) || '<p>철컥. 무언가 열렸다.</p>',
      button: last ? '마지막 문을 연다' : '다음 방으로', cls: 'solved-story',
      onNext: () => (last ? finish() : renderPuzzle()),
    });
  }

  async function finish() {
    const d = G.data;
    G.running = false;
    let end = { ending: { html: '<p>탈출 성공!</p>' } };
    try { end = await payloadAt(d.count); } catch (e) { /* 기본 엔딩 */ }
    if (!G) return;
    const s = G.save;
    s.done = true;
    const rec = {
      id: d.id, title: d.title, ms: Math.round(s.elapsed), hints: sum(s.hints), wrong: sum(s.wrong),
      splits: s.splits, date: Date.now(), name: prefs.name || '',
    };
    rec.rank = rankOf(rec.ms, rec.hints);
    const all = records(); all.push(rec); store.set('esc:records', all);
    persist();
    Sfx.stopAmbient();
    Sfx.play('clear');
    showStory({
      kicker: 'ESCAPED', title: (end.ending && end.ending.title) || '탈출 성공', html: (end.ending && end.ending.html) || '',
      button: '기록 보기', cls: 'ending-story', onNext: () => renderResult(d, rec),
    });
  }

  /* ---------- 클리어 기록 ---------- */
  function renderResult(d, rec) {
    const shareText = r => [
      `🔓 방탈출 「${d.title}」 클리어!`,
      `⏱ ${fmt(r.ms)} · 등급 ${r.rank}`,
      `💡 힌트 ${r.hints} · ❌ 오답 ${r.wrong}`,
      r.name ? `— ${r.name}` : null,
      location.href.split('#')[0],
    ].filter(Boolean).join('\n');

    const name = h('input', { class: 'dev-text', placeholder: '이름 (공유할 때 표시)', value: prefs.name, maxlength: 16 });
    name.addEventListener('change', () => {
      prefs.name = name.value.trim(); savePrefs();
      if (rec) { rec.name = prefs.name; const all = records(); const m = all.find(x => x.date === rec.date && x.id === rec.id); if (m) { m.name = prefs.name; store.set('esc:records', all); } }
    });
    const share = async () => {
      name.dispatchEvent(new Event('change'));
      const text = shareText({ ...rec, name: prefs.name });
      try {
        if (navigator.share) { await navigator.share({ text }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(text); toast('기록을 복사했어요'); } catch (e) { sheet(h('pre', { class: 'share-pre' }, text)); }
    };
    const replay = async () => {
      if (!(await ask('처음부터 다시 할까요?', '기록은 그대로 남아요.', '다시 하기'))) return;
      store.del(saveKey(d.id));
      if (G) G.save = null;
      route();
    };
    const best = records().filter(r => r.id === d.id).sort((a, b) => a.ms - b.ms)[0];

    app().replaceChildren(h('div', { class: 'result' },
      h('div', { class: 'page-bar' }, h('button', { class: 'icon-btn', onclick: () => go('#/') }, '←')),
      h('div', { class: 'eyebrow' }, 'CLEAR RECORD'),
      h('h1', { class: 'result-title' }, d.title),
      rec ? [
        h('div', { class: 'rank r-' + rec.rank }, rec.rank),
        h('div', { class: 'result-time' }, fmt(rec.ms)),
        h('div', { class: 'result-stats' },
          h('div', null, h('b', null, rec.hints), h('span', null, '힌트')),
          h('div', null, h('b', null, rec.wrong), h('span', null, '오답')),
          h('div', null, h('b', null, best ? fmt(best.ms) : '-'), h('span', null, '최고 기록'))),
        rec.splits && rec.splits.length ? h('div', { class: 'splits' }, rec.splits.map((t, i) =>
          h('div', { class: 'split' }, h('span', null, `ROOM ${i + 1}`), h('span', { class: 'split-bar', style: { '--w': Math.max(4, ((t - (rec.splits[i - 1] || 0)) / rec.ms) * 100) + '%' } }), h('b', null, fmt(t - (rec.splits[i - 1] || 0)))))) : null,
        h('div', { class: 'result-share' }, name, h('button', { class: 'btn primary', onclick: share }, '📤 기록 공유')),
      ] : h('p', { class: 'sub' }, '클리어한 방이에요.'),
      h('div', { class: 'dev-row' },
        h('button', { class: 'btn ghost', onclick: replay }, '↺ 다시 하기'),
        h('button', { class: 'btn ghost', onclick: () => go('#/') }, '다른 방 고르기'))));
    window.scrollTo(0, 0);
  }

  /* ---------- 시작 ---------- */
  function boot() {
    window.addEventListener('hashchange', route);
    route();
  }

  window.ESC = {
    list: [], lineup: [],
    register(d) { this.list.push(d); },
    setLineup(l) { this.lineup = l; },
    boot, toast, sheet,
  };
})();
