/* 화면 · 상태 · 저장 · 기록 — v2: 공간을 오가며 자물쇠를 순서 자유로 푼다 (SPEC 4 · 8 · 9장) */
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
  const testMode = /[?&]test\b/.test(location.search);

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
      setTimeout(() => { back.remove(); panel.remove(); }, 260);
      opts.onClose && opts.onClose();
    }
    back.onclick = close;
    root.append(back, panel);
    requestAnimationFrame(() => { back.classList.add('in'); panel.classList.add('in'); });
    Sfx.play('open');
    return close;
  }
  function closeAllSheets() { $('#sheet-root').replaceChildren(); }

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
    ['bg', 'panel', 'panel2', 'ink', 'sub', 'accent', 'line', 'glow'].forEach(k => (t && t[k] ? r.setProperty('--' + k, t[k]) : r.removeProperty('--' + k)));
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
    closeAllSheets();
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
      if (sv && sv.v === 2 && !sv.done && sv.build === d.build) state = h('div', { class: 'card-state go' }, `▶ 이어하기 · ${fmt(sv.elapsed)} · 🔓 ${sv.solved.length}/${d.total}`);
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

  /* ---------- 게임 상태 ---------- */
  let G = null;

  function stopGame() {
    if (!G) return;
    clearInterval(G.timer);
    persist();
    Sfx.stopAmbient();
    document.removeEventListener('visibilitychange', G.onVis);
    if (G.onMotion) window.removeEventListener('devicemotion', G.onMotion);
    G = null;
  }

  function persist() { if (G && G.save) store.set(saveKey(G.data.id), G.save); }

  function newSave(d) {
    return { v: 2, build: d.build, keys: {}, solved: [], solvedAt: {}, names: {}, space: null, elapsed: 0, hints: {}, wrong: {}, seen: {}, inv: [], found: {}, pstate: {}, done: false, started: Date.now() };
  }

  // 풀린 자물쇠로 열 수 있는 노드를 모두 연다 → 새로 열린 노드 번호들
  async function openNodes() {
    const fresh = [];
    const d = G.data;
    for (let i = 0; i < d.nodes.length; i++) {
      if (G.nodes[i]) continue;
      const n = d.nodes[i];
      if (!n.req.every(g => G.save.keys[g])) continue;
      const key = n.req.length ? await ESCCrypto.nodeKey(n.req.map(g => G.save.keys[g])) : d.k0;
      G.nodes[i] = await ESCCrypto.openPayload(key, n.box);
      fresh.push(i);
    }
    buildWorld();
    return fresh;
  }

  // 열린 노드를 작성 순서대로 합친다 (SPEC 4장 「세계 합치기」)
  function buildWorld() {
    const W = { spaces: {}, order: [], locks: {}, items: {}, explore: null, ending: null };
    G.nodes.forEach((n, i) => {
      if (!n) return;
      for (const [sid, sp] of Object.entries(n.spaces || {})) {
        if (!W.spaces[sid]) { W.spaces[sid] = { id: sid, hotspots: {}, layers: [] }; W.order.push(sid); }
        const { hotspots, ...rest } = sp;
        Object.assign(W.spaces[sid], rest);
        Object.assign(W.spaces[sid].hotspots, hotspots || {});
      }
      for (const [sid, map] of Object.entries(n.hotspots || {})) if (W.spaces[sid]) Object.assign(W.spaces[sid].hotspots, map);
      for (const [sid, svg] of Object.entries(n.layers || {})) if (W.spaces[sid]) W.spaces[sid].layers.push(svg);
      Object.assign(W.locks, n.locks || {});
      Object.assign(W.items, n.items || {});
      if (n.explore) W.explore = { id: n.id || String(i), hints: n.explore };
      if (n.ending) W.ending = n.ending;
    });
    G.world = W;
  }

  const isSolved = lockId => { const l = G.world.locks[lockId]; return !!(l && G.save.keys[l.gate]); };

  async function playRoute(id) {
    const d = ESC.list.find(x => x.id === id);
    if (!d) return go('#/');
    applyTheme(d.theme);
    if (!window.crypto || !crypto.subtle) {
      app().replaceChildren(h('div', { class: 'page center' }, h('h2', null, '여기서는 열 수 없어요'), h('p', { class: 'sub' }, 'https 주소(GitHub Pages)로 열어 주세요.')));
      return;
    }
    let save = store.get(saveKey(id));
    if (save && (save.v !== 2 || save.build !== d.build)) {
      store.del(saveKey(id));
      save = null;
      toast('방이 새로 고쳐져서 처음부터 시작해요');
    }
    G = { data: d, save, nodes: [], world: null, running: false, last: performance.now(), lastSaved: 0 };
    G.onVis = () => { if (document.hidden) persist(); if (G) G.last = performance.now(); };
    document.addEventListener('visibilitychange', G.onVis);
    G.timer = setInterval(tick, 250);

    if (save && save.done) {
      const last = records().filter(r => r.id === id).sort((a, b) => b.date - a.date)[0];
      return renderResult(d, last || null);
    }
    const tmp = save || newSave(d);
    G.save = tmp;
    try {
      await openNodes();
    } catch (e) {
      store.del(saveKey(id));
      G.save = newSave(d); G.nodes = [];
      toast('저장된 진행을 열 수 없어서 처음부터 시작해요');
      await openNodes();
      save = null;
    }
    if (!G) return;
    if (!save) { G.save = null; return renderIntro(); }
    if (G.world.ending) return finish();
    startRunning();
    renderSpace();
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

  function renderIntro() {
    const d = G.data;
    const start = G.nodes[0];
    showStory({
      kicker: MOOD[d.mood] || '', title: d.title, html: (start.intro && start.intro.html) || '', cover: d.cover,
      button: '시작하기', back: true,
      onNext: () => {
        G.save = newSave(d);
        G.save.space = start.start;
        persist(); startRunning(); Sfx.play('unlock'); renderSpace();
      },
    });
  }

  function showStory({ kicker, title, html, button, onNext, cover, back, cls }) {
    const btn = h('button', { class: 'btn primary big', onclick: () => { btn.disabled = true; onNext(); } }, button);
    app().replaceChildren(h('div', { class: 'story ' + (cls || '') },
      back ? h('button', { class: 'icon-btn story-back', onclick: () => go('#/') }, '←') : null,
      cover ? h('div', { class: 'story-cover', html: cover }) : null,
      h('div', { class: 'story-inner' },
        kicker ? h('div', { class: 'eyebrow' }, kicker) : null,
        title ? h('h1', { class: 'story-title' }, title) : null,
        h('div', { class: 'story-html', html }),
        btn)));
    window.scrollTo(0, 0);
  }

  /* ---------- 가방 ---------- */
  const hasItem = id => G.save.inv.some(it => it.id === id);

  function giveItem(def) {
    const it = typeof def === 'string' ? { id: def, ...G.world.items[def] } : def;
    if (!it.id || hasItem(it.id)) return null;
    G.save.inv.push(it);
    persist();
    Sfx.play('item');
    drawInv(it.id);
    return it;
  }
  function removeItem(id) { G.save.inv = G.save.inv.filter(it => it.id !== id); }

  function drawInv(popId) {
    const bar = $('.inv-items');
    if (!bar) return;
    const inv = G.save.inv;
    bar.replaceChildren(...(inv.length ? inv.map(it => h('button', {
      class: 'inv-slot' + (it.id === popId ? ' pop' : ''), 'aria-label': it.name, onclick: () => inspect(it),
    }, h('span', { class: 'inv-ic', html: it.icon || '❔' }))) : [h('span', { class: 'inv-empty' }, '가방이 비어 있어요')]));
  }

  function inspect(it) {
    const others = G.save.inv.filter(x => x.id !== it.id);
    let close;
    const combineList = h('div', { class: 'combine-list hidden' }, others.map(o => h('button', {
      class: 'combine-opt', onclick: () => {
        const r = (it.combine && it.combine.with === o.id && it.combine.result) || (o.combine && o.combine.with === it.id && o.combine.result);
        close();
        if (!r) { Sfx.play('wrong'); toast('합쳐지지 않는다.'); return; }
        removeItem(it.id); removeItem(o.id);
        G.save.inv.push(r); persist(); Sfx.play('item'); drawInv(r.id);
        setTimeout(() => inspect(r), 300);
        toast(`「${r.name}」 완성!`);
      },
    }, h('span', { class: 'inv-ic', html: o.icon || '' }), o.name)));
    close = sheet(h('div', { class: 'inspect' },
      h('div', { class: 'inspect-ic', html: it.icon || '' }),
      h('h3', null, it.name),
      it.desc ? h('p', { class: 'sub' }, it.desc) : null,
      it.html ? h('div', { class: 'inspect-html', html: it.html }) : null,
      others.length ? h('div', { class: 'dev-row' }, h('button', { class: 'btn ghost', onclick: () => combineList.classList.toggle('hidden') }, '🔗 다른 것과 합치기')) : null,
      combineList), { cls: 'tall' });
  }

  /* ---------- 힌트 ---------- */
  function hintLevels(key, hints, title, redraw) {
    const seen = G.save.hints[key] || 0;
    return h('div', { class: 'hint-group' },
      h('div', { class: 'hint-title' }, title),
      ...hints.map((t, i) => {
        if (i < seen) return h('div', { class: 'hint open' }, h('span', { class: 'hint-k' }, `${i + 1} · ${HINT_LABEL[i] || ''}`), h('p', { html: t }));
        if (i === seen) return h('button', { class: 'hint next', onclick: () => {
          G.save.hints[key] = i + 1; persist(); Sfx.play('hint'); redraw(); updateTop();
        } }, `힌트 ${i + 1} 보기 · ${HINT_LABEL[i] || ''}`);
        return null;
      }));
  }

  function openHints(onlyLock) {
    const body = h('div', { class: 'hints' });
    const draw = () => {
      const W = G.world;
      const open = Object.entries(W.locks).filter(([id]) => (G.save.seen[id] || id === onlyLock) && !isSolved(id));
      const groups = [];
      if (!onlyLock && W.explore) groups.push(hintLevels('x:' + W.explore.id, W.explore.hints, '🧭 어디를 봐야 할지 모르겠어요', draw));
      open.filter(([id]) => !onlyLock || id === onlyLock).forEach(([id, l]) => groups.push(hintLevels(id, l.hints || [], `🔒 ${l.name}`, draw)));
      body.replaceChildren(
        h('h3', null, '💡 힌트'),
        h('p', { class: 'sub' }, '한 단계씩 열려요. 본 힌트 수는 클리어 기록에 남아요.'),
        ...(groups.length ? groups : [h('p', { class: 'sub' }, '지금은 볼 힌트가 없어요. 장면 속 물건을 눌러 보세요.')]));
    };
    draw();
    sheet(body, { cls: 'tall' });
  }

  /* ---------- 공간 ---------- */
  function updateTop() {
    const b = $('.hint-badge');
    if (b) { const n = sum(G.save.hints); b.textContent = n; b.hidden = !n; }
    const p = $('.top-prog');
    if (p) p.textContent = `🔓 ${G.save.solved.length}/${G.data.total}`;
  }

  function syncScene(scene, sid) {
    scene.querySelectorAll('[data-hide-when]').forEach(el => { el.style.display = G.save.found[`${sid}:${el.dataset.hideWhen}`] ? 'none' : ''; });
    scene.querySelectorAll('[data-show-when]').forEach(el => { el.style.display = G.save.found[`${sid}:${el.dataset.showWhen}`] ? '' : 'none'; });
    scene.querySelectorAll('[data-hide-solved]').forEach(el => { el.style.display = isSolved(el.dataset.hideSolved) ? 'none' : ''; });
    scene.querySelectorAll('[data-hot]').forEach(el => {
      const hs = G.world.spaces[sid].hotspots[el.dataset.hot];
      el.classList.toggle('is-solved', !!(hs && hs.lock && isSolved(hs.lock)));
    });
  }

  function moveTo(sid) {
    if (!G.world.spaces[sid] || sid === G.save.space) return;
    G.save.space = sid;
    persist();
    Sfx.play('open');
    renderSpace('enter');
  }

  function renderSpace(anim) {
    const d = G.data;
    const W = G.world;
    if (!W.spaces[G.save.space]) G.save.space = W.order[0];
    const sid = G.save.space;
    const sp = W.spaces[sid];
    if (G.onMotion) { window.removeEventListener('devicemotion', G.onMotion); G.onMotion = null; }

    const top = h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': '나가기', onclick: () => { persist(); go('#/'); } }, '←'),
      h('div', { class: 'top-mid' }, h('span', { class: 'top-title' }, d.title), h('span', { class: 'top-prog' }, '')),
      h('span', { class: 'clock' }, fmt(G.save.elapsed)),
      h('button', { class: 'icon-btn hint-btn', 'aria-label': '힌트', onclick: () => openHints() }, '💡', h('span', { class: 'hint-badge', hidden: true }, '')),
      soundBtn());

    // 장면 = 공간 scene + 노드 layers
    const svg = (sp.scene || '').replace(/<\/svg>\s*$/, (sp.layers || []).join('') + '</svg>');
    const scene = h('div', { class: 'scene' + (anim ? ' enter' : ''), html: svg });
    syncScene(scene, sid);
    scene.addEventListener('click', e => {
      const hot = e.target.closest('[data-hot]');
      if (!hot || !scene.contains(hot)) return;
      ripple(scene, e);
      onHot(sid, hot.dataset.hot, scene);
    });

    const extras = [];
    const pst = G.save.pstate['s:' + sid] || (G.save.pstate['s:' + sid] = {});
    if (sp.effect === 'flashlight') {
      const fl = h('div', { class: 'flash' });
      scene.append(fl);
      const move = e => { const r = scene.getBoundingClientRect(); fl.style.setProperty('--x', (e.clientX - r.left) + 'px'); fl.style.setProperty('--y', (e.clientY - r.top) + 'px'); };
      scene.addEventListener('pointermove', move);
      scene.addEventListener('pointerdown', move);
      extras.push(h('p', { class: 'effect-tip' }, '🔦 손가락으로 어둠을 비춰 보세요'));
    }
    if (sp.effect === 'shake') {
      const reveal = () => {
        if (scene.classList.contains('shaken')) return;
        scene.classList.add('shaken', 'shaking'); pst.shaken = true; persist(); Sfx.play('reveal');
        setTimeout(() => scene.classList.remove('shaking'), 700);
      };
      if (pst.shaken) scene.classList.add('shaken');
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

    // 이동 바
    const nav = W.order.length > 1 ? h('nav', { class: 'spaces' }, W.order.map(s => h('button', {
      class: 'space-b' + (s === sid ? ' now' : ''), 'data-space': s, onclick: () => moveTo(s),
    }, W.spaces[s].name || s))) : null;

    const inv = h('footer', { class: 'inv' }, h('span', { class: 'inv-k', 'aria-hidden': 'true' }, '🎒', h('small', null, '가방')), h('div', { class: 'inv-items' }));

    app().replaceChildren(h('div', { class: 'play' }, top,
      h('main', { class: 'play-main' },
        h('div', { class: 'room-head' }, h('span', { class: 'eyebrow' }, `📍 ${W.order.indexOf(sid) + 1} / ${W.order.length}`), h('h2', { class: 'room-title' }, sp.name || sid)),
        scene, ...extras,
        sp.desc ? h('p', { class: 'prompt', html: sp.desc }) : null,
        nav),
      inv));
    drawInv();
    updateTop();
    if (anim !== 'keep') window.scrollTo(0, 0);

    if (sp.script) runScript(sp.script, {
      scene, toast, sfx: n => Sfx.play(n), tone: (f, du) => Sfx.tone(f, du), give: giveItem, has: hasItem,
      solved: isSolved, state: pst, save: persist, h, s: window.ESCs,
    });
  }

  function runScript(src, api) {
    try { new Function('return (' + src + ')')()(api); } catch (e) { console.error('script', e); }
  }

  function ripple(scene, e) {
    const r = scene.getBoundingClientRect();
    const dot = h('span', { class: 'ripple', style: { left: (e.clientX - r.left) + 'px', top: (e.clientY - r.top) + 'px' } });
    scene.append(dot);
    setTimeout(() => dot.remove(), 600);
  }

  function onHot(sid, hid, scene) {
    const hs = G.world.spaces[sid].hotspots[hid];
    if (!hs) { Sfx.play('tap'); return; }
    if (hs.go) { moveTo(hs.go); return; }
    if (hs.lock) { openLock(hs.lock, hs); return; }
    const fk = `${sid}:${hid}`;
    if (hs.requires && !G.save.found[fk] && !hasItem(hs.requires)) {
      Sfx.play('tap');
      toast(hs.locked || '잠겨 있다. 무언가 필요해 보인다.');
      return;
    }
    const first = !G.save.found[fk];
    G.save.found[fk] = true;
    if (first && hs.requires && hs.consume) { removeItem(hs.requires); drawInv(); }
    const got = first && hs.give ? giveItem(hs.give) : null;
    persist();
    syncScene(scene, sid);
    if (hs.html || hs.title) {
      sheet(h('div', { class: 'inspect' },
        hs.title ? h('h3', null, hs.title) : null,
        hs.html ? h('div', { class: 'inspect-html', html: hs.html }) : null,
        got ? h('div', { class: 'got' }, h('span', { class: 'inv-ic', html: got.icon || '' }), `「${got.name}」을(를) 가방에 넣었다`) : null), { cls: hs.tall ? 'tall' : '' });
    } else if (got) toast(`「${got.name}」을(를) 얻었다`);
    else Sfx.play('tap');
  }

  /* ---------- 자물쇠 ---------- */
  function openLock(lockId, hs) {
    const l = G.world.locks[lockId];
    if (!l) return;
    if (isSolved(lockId)) {
      sheet(h('div', { class: 'inspect' }, h('h3', null, l.name), h('div', { class: 'inspect-html', html: l.after || '<p>이미 열었다.</p>' })));
      return;
    }
    if (!G.save.seen[lockId]) { G.save.seen[lockId] = true; persist(); }
    const dev = h('section', { class: 'device in-sheet' });
    let close;
    const ctx = {
      busy: false,
      toast,
      inv: { all: () => G.save.inv.slice() },
      submit: async str => {
        if (ctx.busy) return false;
        ctx.busy = true;
        dev.classList.add('busy');
        const t0 = Date.now();
        let key = null;
        try { key = await ESCCrypto.tryGate(str, G.data.gates[l.gate]); } catch (e) { key = null; }
        const left = 450 - (Date.now() - t0);
        if (left > 0) await wait(left);
        if (!G) return false;
        dev.classList.remove('busy');
        ctx.busy = false;
        if (key) { dev.classList.add('solved'); await wait(650); close(); onSolved(lockId, l, key); return true; }
        G.save.wrong[lockId] = (G.save.wrong[lockId] || 0) + 1;
        persist();
        Sfx.play('wrong');
        dev.classList.remove('wrong'); void dev.offsetWidth; dev.classList.add('wrong');
        toast(WRONG_LINES[Math.floor(Math.random() * WRONG_LINES.length)]);
        return false;
      },
    };
    if (testMode) window.__esc = { submit: ctx.submit, lock: lockId };
    const type = (l.device && l.device.type) || 'text';
    window.ESCDevices[type](dev, (l.device && l.device.config) || {}, ctx);
    close = sheet(h('div', { class: 'lock' },
      h('div', { class: 'lock-head' }, h('span', { class: 'eyebrow' }, '🔒 LOCK'),
        h('button', { class: 'btn ghost sm', onclick: () => openHints(lockId) }, '💡 힌트')),
      h('h3', null, l.name),
      l.prompt ? h('p', { class: 'prompt', html: l.prompt }) : null,
      dev), { cls: 'lock-sheet', onClose: () => { if (testMode && window.__esc && window.__esc.lock === lockId) window.__esc = null; } });
    if (l.script) {
      const pst = G.save.pstate['l:' + lockId] || (G.save.pstate['l:' + lockId] = {});
      runScript(l.script, { root: dev, submit: ctx.submit, toast, sfx: n => Sfx.play(n), tone: (f, du) => Sfx.tone(f, du), give: giveItem, has: hasItem, state: pst, save: persist, h, s: window.ESCs });
    }
  }

  async function onSolved(lockId, l, key) {
    const s = G.save;
    s.keys[l.gate] = key;
    s.solved.push(l.gate);
    s.solvedAt[l.gate] = Math.round(s.elapsed);
    s.names[l.gate] = l.name;
    (l.consume || []).forEach(removeItem);
    persist();
    Sfx.play('unlock');
    let fresh = [];
    try { fresh = await openNodes(); } catch (e) { console.error(e); }
    if (!G) return;
    const nodes = fresh.map(i => G.nodes[i]);
    if (G.world.ending) return finish();
    const goTo = nodes.map(n => n.go).filter(Boolean).pop();
    if (goTo) s.space = goTo;
    persist();
    const story = nodes.find(n => n.story);
    if (story) {
      showStory({
        kicker: 'UNLOCKED', title: story.story.title || l.name, html: story.story.html || '', button: '계속', cls: 'solved-story',
        onNext: () => renderSpace('enter'),
      });
    } else {
      renderSpace(goTo ? 'enter' : 'keep');
      toast(nodes.map(n => n.toast).filter(Boolean)[0] || `🔓 ${l.name} — 열렸다!`);
    }
  }

  async function finish() {
    const d = G.data;
    G.running = false;
    const end = G.world.ending || { title: '탈출 성공', html: '' };
    const s = G.save;
    const first = !s.done;
    s.done = true;
    let rec = null;
    if (first) {
      rec = {
        id: d.id, title: d.title, ms: Math.round(s.elapsed), hints: sum(s.hints), wrong: sum(s.wrong), date: Date.now(), name: prefs.name || '',
        splits: s.solved.map(g => ({ name: s.names[g] || '', at: s.solvedAt[g] || 0 })),
      };
      rec.rank = rankOf(rec.ms, rec.hints);
      const all = records(); all.push(rec); store.set('esc:records', all);
    }
    persist();
    Sfx.stopAmbient();
    Sfx.play('clear');
    showStory({
      kicker: 'ESCAPED', title: end.title || '탈출 성공', html: end.html || '',
      button: '기록 보기', cls: 'ending-story', onNext: () => renderResult(d, rec || records().filter(r => r.id === d.id).pop()),
    });
  }

  /* ---------- 클리어 기록 ---------- */
  function renderResult(d, rec) {
    const shareText = r => [
      `🔓 방탈출 「${d.title}」 클리어!`,
      `⏱ ${fmt(r.ms)} · 등급 ${r.rank}`,
      `💡 힌트 ${r.hints} · ❌ 오답 ${r.wrong}`,
      r.name ? `— ${r.name}` : null,
      location.href.split('#')[0].replace(/\?.*$/, ''),
    ].filter(Boolean).join('\n');

    const name = h('input', { class: 'dev-text', placeholder: '이름 (공유할 때 표시)', value: prefs.name, maxlength: 16 });
    name.addEventListener('change', () => {
      prefs.name = name.value.trim(); savePrefs();
      if (rec) { rec.name = prefs.name; const all = records(); const m = all.find(x => x.date === rec.date && x.id === rec.id); if (m) { m.name = prefs.name; store.set('esc:records', all); } }
    });
    const share = async () => {
      name.dispatchEvent(new Event('change'));
      const text = shareText({ ...rec, name: prefs.name });
      try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(text); toast('기록을 복사했어요'); } catch (e) { sheet(h('pre', { class: 'share-pre' }, text)); }
    };
    const replay = async () => {
      if (!(await ask('처음부터 다시 할까요?', '기록은 그대로 남아요.', '다시 하기'))) return;
      store.del(saveKey(d.id));
      if (G) G.save = null;
      route();
    };
    const best = records().filter(r => r.id === d.id).sort((a, b) => a.ms - b.ms)[0];
    const splits = (rec && rec.splits) || [];

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
        splits.length ? h('div', { class: 'splits' }, splits.map((sp, i) => {
          const dt = sp.at - (splits[i - 1] ? splits[i - 1].at : 0);
          return h('div', { class: 'split' }, h('span', { class: 'split-name' }, sp.name || `🔒 ${i + 1}`), h('span', { class: 'split-bar', style: { '--w': Math.max(4, (dt / Math.max(rec.ms, 1)) * 100) + '%' } }), h('b', null, fmt(dt)));
        })) : null,
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
