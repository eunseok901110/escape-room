/* 장치 13종 — 모두 입력을 문자열 하나로 만들어 ctx.submit 에 넘긴다
 * ESCDevices[type](el, config, ctx)
 * ctx = { submit(str): Promise<bool>, toast(msg), inv: { all() } }
 */
(function () {
  const S = () => window.ESCSfx;

  // 작은 DOM 도우미 (app.js 도 쓴다)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    kids.flat().forEach(k => k != null && el.append(k.nodeType ? k : document.createTextNode(String(k))));
    return el;
  }

  function goBtn(ctx, get, label = '확인') {
    return h('button', {
      class: 'btn primary dev-go',
      onclick: async () => {
        const v = get();
        if (!v) { ctx.toast('먼저 입력해 주세요'); return; }
        await ctx.submit(v);
      },
    }, label);
  }

  const D = {};

  /* text: { placeholder, maxlength } */
  D.text = (el, c, ctx) => {
    const input = h('input', {
      class: 'dev-text', type: 'text', placeholder: c.placeholder || '답을 입력',
      maxlength: c.maxlength || 40, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      onkeydown: e => { if (e.key === 'Enter') go.click(); },
    });
    const go = goBtn(ctx, () => input.value.trim());
    el.append(h('div', { class: 'dev-row' }, input, go));
  };

  /* keypad: { length } */
  D.keypad = (el, c, ctx) => {
    const len = c.length || 4;
    let val = '';
    const slots = h('div', { class: 'kp-slots' });
    const draw = () => {
      slots.replaceChildren(...Array.from({ length: len }, (_, i) =>
        h('span', { class: 'kp-slot' + (i < val.length ? ' on' : '') }, val[i] || '')));
    };
    const press = async k => {
      S().play('tick');
      if (k === '⌫') val = val.slice(0, -1);
      else if (k === '✓') {
        if (val.length < len) { ctx.toast(`${len}자리를 모두 눌러 주세요`); return; }
        const ok = await ctx.submit(val);
        if (!ok) val = '';
      } else if (val.length < len) val += k;
      draw();
    };
    const keys = h('div', { class: 'kp-keys' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map(k =>
        h('button', { class: 'kp-key' + (k === '✓' ? ' ok' : k === '⌫' ? ' del' : ''), onclick: () => press(k) }, k)));
    draw();
    el.append(slots, keys);
  };

  /* dial: { wheels: 4, symbols: '0123456789' | [..], sets: [[..],[..]], start: [..] } */
  D.dial = (el, c, ctx) => {
    const sets = c.sets || Array.from({ length: c.wheels || 4 }, () =>
      Array.isArray(c.symbols) ? c.symbols : [...(c.symbols || '0123456789')]);
    const pos = sets.map((_, i) => (c.start && c.start[i]) || 0);
    const wrap = h('div', { class: 'dial' });
    const wheels = sets.map((set, i) => {
      const win = h('div', { class: 'dial-win' });
      const draw = () => {
        const n = set.length;
        const at = k => set[((pos[i] + k) % n + n) % n];
        win.replaceChildren(h('span', { class: 'dial-ghost' }, at(-1)), h('span', { class: 'dial-cur' }, at(0)), h('span', { class: 'dial-ghost' }, at(1)));
      };
      const step = d => { pos[i] += d; S().play('tick'); draw(); win.classList.remove('spin-up', 'spin-down'); void win.offsetWidth; win.classList.add(d > 0 ? 'spin-up' : 'spin-down'); };
      // 위아래로 밀어 돌리기
      let y0 = null;
      win.addEventListener('pointerdown', e => { y0 = e.clientY; win.setPointerCapture(e.pointerId); });
      win.addEventListener('pointermove', e => {
        if (y0 == null) return;
        const dy = e.clientY - y0;
        if (Math.abs(dy) > 26) { step(dy < 0 ? 1 : -1); y0 = e.clientY; }
      });
      win.addEventListener('pointerup', () => { y0 = null; });
      draw();
      return h('div', { class: 'dial-wheel' },
        h('button', { class: 'dial-btn', 'aria-label': '위로', onclick: () => step(-1) }, '▲'),
        win,
        h('button', { class: 'dial-btn', 'aria-label': '아래로', onclick: () => step(1) }, '▼'));
    });
    wrap.append(...wheels);
    const get = () => sets.map((set, i) => set[((pos[i]) % set.length + set.length) % set.length]).join('');
    el.append(wrap, goBtn(ctx, get, c.label || '돌려서 열기'));
  };

  /* direction: { max: 10 } */
  D.direction = (el, c, ctx) => {
    const max = c.max || 10;
    let seq = [];
    const ARROW = { U: '↑', D: '↓', L: '←', R: '→' };
    const track = h('div', { class: 'seq-track' });
    const draw = () => track.replaceChildren(...(seq.length ? seq.map(d => h('span', { class: 'seq-chip' }, ARROW[d])) : [h('span', { class: 'seq-empty' }, '방향을 눌러 입력')]));
    const push = d => { if (seq.length >= max) return; seq.push(d); S().play('tick'); draw(); };
    const pad = h('div', { class: 'dpad' },
      h('button', { class: 'dpad-b up', onclick: () => push('U') }, '↑'),
      h('button', { class: 'dpad-b left', onclick: () => push('L') }, '←'),
      h('span', { class: 'dpad-c' }),
      h('button', { class: 'dpad-b right', onclick: () => push('R') }, '→'),
      h('button', { class: 'dpad-b down', onclick: () => push('D') }, '↓'));
    const del = h('button', { class: 'btn ghost', onclick: () => { seq.pop(); draw(); } }, '⌫ 지우기');
    const go = h('button', { class: 'btn primary', onclick: async () => {
      if (!seq.length) return ctx.toast('방향을 먼저 입력해 주세요');
      if (!(await ctx.submit(seq.join('')))) { seq = []; draw(); }
    } }, '확인');
    draw();
    el.append(track, pad, h('div', { class: 'dev-row' }, del, go));
  };

  /* pattern: { size: 3, min: 3 } — 3×3 은 1~9, 4×4 는 a~p */
  D.pattern = (el, c, ctx) => {
    const n = c.size || 3;
    const name = i => n === 3 ? String(i + 1) : 'abcdefghijklmnop'[i];
    const W = 300, pad = 50, gap = (W - pad * 2) / (n - 1);
    const pts = Array.from({ length: n * n }, (_, i) => ({ x: pad + (i % n) * gap, y: pad + Math.floor(i / n) * gap }));
    const svg = s('svg', { viewBox: `0 0 ${W} ${W}`, class: 'pattern' });
    const lines = s('polyline', { class: 'pat-line', points: '' });
    const live = s('line', { class: 'pat-live' });
    const dots = pts.map(p => s('circle', { cx: p.x, cy: p.y, r: 13, class: 'pat-dot' }));
    svg.append(lines, live, ...dots);
    let path = [];
    let drawing = false;
    const toLocal = e => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * W / r.height }; };
    const hit = p => pts.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < gap * 0.32);
    const redraw = () => {
      lines.setAttribute('points', path.map(i => `${pts[i].x},${pts[i].y}`).join(' '));
      dots.forEach((d, i) => d.classList.toggle('on', path.includes(i)));
    };
    const add = i => { if (i >= 0 && !path.includes(i)) { path.push(i); S().play('tick'); redraw(); } };
    svg.addEventListener('pointerdown', e => { e.preventDefault(); svg.setPointerCapture(e.pointerId); drawing = true; path = []; svg.classList.remove('bad'); add(hit(toLocal(e))); });
    svg.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = toLocal(e); add(hit(p));
      const last = pts[path[path.length - 1]];
      if (last) { live.setAttribute('x1', last.x); live.setAttribute('y1', last.y); live.setAttribute('x2', p.x); live.setAttribute('y2', p.y); }
    });
    const end = async () => {
      if (!drawing) return;
      drawing = false;
      live.setAttribute('x2', live.getAttribute('x1') || 0); live.setAttribute('y2', live.getAttribute('y1') || 0);
      if (path.length < (c.min || 3)) { const some = path.length > 1; path = []; redraw(); if (some) ctx.toast('점을 더 이어 주세요'); return; }
      const ok = await ctx.submit(path.map(name).join(''));
      if (!ok) { svg.classList.add('bad'); setTimeout(() => { path = []; redraw(); svg.classList.remove('bad'); }, 600); }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    el.append(h('div', { class: 'pattern-wrap' }, svg), h('p', { class: 'dev-note' }, '손을 떼면 확인해요'));
  };

  /* colors: { colors: [{id, color, name}], max: 6 } */
  D.colors = (el, c, ctx) => {
    const cols = c.colors || [
      { id: 'r', color: '#d6453d', name: '빨강' }, { id: 'y', color: '#e9b931', name: '노랑' },
      { id: 'g', color: '#3fa56b', name: '초록' }, { id: 'b', color: '#3a73d1', name: '파랑' }];
    const max = c.max || 8;
    let seq = [];
    const track = h('div', { class: 'seq-track' });
    const draw = () => track.replaceChildren(...(seq.length
      ? seq.map(id => h('span', { class: 'seq-dot', style: { background: cols.find(x => x.id === id).color } }))
      : [h('span', { class: 'seq-empty' }, '색을 순서대로 눌러요')]));
    const freqs = [261.63, 329.63, 392, 523.25, 587.33, 659.25, 783.99];
    const btns = h('div', { class: 'color-btns' }, cols.map((col, i) =>
      h('button', {
        class: 'color-b', style: { '--c': col.color }, 'aria-label': col.name,
        onclick: () => { if (seq.length >= max) return; seq.push(col.id); S().tone(freqs[i % freqs.length], 0.35, 'sine'); draw(); },
      }, h('span', null, col.name))));
    const go = h('button', { class: 'btn primary', onclick: async () => {
      if (!seq.length) return ctx.toast('색을 먼저 눌러 주세요');
      if (!(await ctx.submit(seq.join('')))) { seq = []; draw(); }
    } }, '확인');
    draw();
    el.append(track, btns, h('div', { class: 'dev-row' }, h('button', { class: 'btn ghost', onclick: () => { seq.pop(); draw(); } }, '⌫ 지우기'), go));
  };

  /* switches: { count: 5, labels: ['A',..] } */
  D.switches = (el, c, ctx) => {
    const n = c.count || 5;
    const on = Array(n).fill(false);
    const row = h('div', { class: 'switches' }, Array.from({ length: n }, (_, i) => {
      const b = h('button', {
        class: 'sw', 'aria-pressed': 'false',
        onclick: () => { on[i] = !on[i]; b.classList.toggle('on', on[i]); b.setAttribute('aria-pressed', on[i]); S().play('tick'); },
      }, h('span', { class: 'sw-track' }, h('span', { class: 'sw-knob' })), h('span', { class: 'sw-label' }, (c.labels && c.labels[i]) || i + 1));
      return b;
    }));
    el.append(row, goBtn(ctx, () => on.map(x => (x ? 1 : 0)).join(''), c.label || '레버 당기기'));
  };

  /* rings: { rings: [['☀','☾',..], [..]] } 바깥 → 안쪽 · 고리를 누르면 한 칸씩 돈다 */
  D.rings = (el, c, ctx) => {
    const rings = c.rings;
    const W = 320, C = W / 2;
    const band = (C - 30) / rings.length;
    const steps = rings.map(() => 0);
    const svg = s('svg', { viewBox: `0 0 ${W} ${W}`, class: 'rings' });
    svg.append(s('circle', { cx: C, cy: C, r: C - 6, class: 'ring-base' }));
    const groups = rings.map((syms, ri) => {
      const rOut = C - 10 - ri * band, rMid = rOut - band / 2;
      const g = s('g', { class: 'ring', style: `transform-origin:${C}px ${C}px` });
      g.append(s('circle', { cx: C, cy: C, r: rMid, class: 'ring-band', 'stroke-width': band - 4 }));
      syms.forEach((sym, j) => {
        const a = (j / syms.length) * Math.PI * 2 - Math.PI / 2;
        g.append(s('text', { x: C + Math.cos(a) * rMid, y: C + Math.sin(a) * rMid, class: 'ring-sym', 'font-size': Math.min(band * 0.5, 22), transform: `rotate(${(j / syms.length) * 360} ${C + Math.cos(a) * rMid} ${C + Math.sin(a) * rMid})` }, sym));
      });
      svg.append(g);
      return g;
    });
    svg.append(s('circle', { cx: C, cy: C, r: Math.max(12, C - 14 - rings.length * band), class: 'ring-hub' }));
    svg.append(s('path', { d: `M${C - 9} 2 L${C + 9} 2 L${C} 16 Z`, class: 'ring-mark' }));
    svg.addEventListener('click', e => {
      const r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) * W / r.width - C, y = (e.clientY - r.top) * W / r.height - C;
      const d = Math.hypot(x, y);
      const ri = Math.floor((C - 10 - d) / band);
      if (ri < 0 || ri >= rings.length) return;
      steps[ri]++;
      groups[ri].style.transform = `rotate(${(steps[ri] * 360) / rings[ri].length}deg)`;
      S().play('tick');
    });
    const get = () => rings.map((syms, ri) => { const n = syms.length; return syms[((-steps[ri]) % n + n) % n]; }).join('');
    el.append(h('div', { class: 'rings-wrap' }, svg), h('p', { class: 'dev-note' }, '고리를 누르면 한 칸씩 돌아요 · ▼ 자리가 기준'), goBtn(ctx, get));
  };

  /* order: { pieces: [{ id, html }] } — 두 개를 차례로 누르면 자리 바꿈 */
  D.order = (el, c, ctx) => {
    let list = c.pieces.slice();
    let pick = -1;
    const box = h('div', { class: 'order' + (c.columns ? ' grid' : ''), style: c.columns ? { '--cols': c.columns } : null });
    const draw = () => box.replaceChildren(...list.map((p, i) => h('button', {
      class: 'order-p' + (i === pick ? ' pick' : ''), html: p.html,
      onclick: () => {
        S().play('tick');
        if (pick < 0) pick = i;
        else if (pick === i) pick = -1;
        else { [list[pick], list[i]] = [list[i], list[pick]]; pick = -1; }
        draw();
      },
    })));
    draw();
    el.append(box, h('p', { class: 'dev-note' }, '두 개를 차례로 누르면 자리가 바뀌어요'), goBtn(ctx, () => list.map(p => p.id).join('')));
  };

  /* piano: { keys: [{ id, label, freq }], max: 8 } */
  D.piano = (el, c, ctx) => {
    const keys = c.keys || [
      { id: 'c', label: '도', freq: 261.63 }, { id: 'd', label: '레', freq: 293.66 }, { id: 'e', label: '미', freq: 329.63 },
      { id: 'f', label: '파', freq: 349.23 }, { id: 'g', label: '솔', freq: 392 }, { id: 'a', label: '라', freq: 440 }, { id: 'b', label: '시', freq: 493.88 }];
    const max = c.max || 8;
    let seq = [];
    const track = h('div', { class: 'seq-track' });
    const draw = () => track.replaceChildren(...(seq.length ? seq.map(id => h('span', { class: 'seq-chip' }, keys.find(k => k.id === id).label)) : [h('span', { class: 'seq-empty' }, '건반을 눌러 연주')]));
    const kb = h('div', { class: 'piano' }, keys.map(k => h('button', {
      class: 'pkey',
      onpointerdown: e => { e.currentTarget.classList.add('down'); S().tone(k.freq, 0.9); if (seq.length < max) { seq.push(k.id); draw(); } },
      onpointerup: e => e.currentTarget.classList.remove('down'),
      onpointerleave: e => e.currentTarget.classList.remove('down'),
    }, h('span', null, k.label))));
    const go = h('button', { class: 'btn primary', onclick: async () => {
      if (!seq.length) return ctx.toast('먼저 연주해 주세요');
      if (!(await ctx.submit(seq.join('')))) { seq = []; draw(); }
    } }, '확인');
    draw();
    el.append(track, kb, h('div', { class: 'dev-row' }, h('button', { class: 'btn ghost', onclick: () => { seq = []; draw(); } }, '처음부터'), go));
  };

  /* sliders: { count: 4, max: 9, labels } — 위로 올릴수록 큰 값 */
  D.sliders = (el, c, ctx) => {
    const n = c.count || 4, max = c.max || 9;
    const vals = Array(n).fill(0);
    const row = h('div', { class: 'sliders' }, Array.from({ length: n }, (_, i) => {
      const thumb = h('span', { class: 'sl-thumb' });
      const fill = h('span', { class: 'sl-fill' });
      const num = h('span', { class: 'sl-num' }, '0');
      const track = h('div', { class: 'sl-track' }, fill, thumb);
      const set = v => {
        v = Math.max(0, Math.min(max, v));
        if (v !== vals[i]) S().play('tick');
        vals[i] = v;
        const pct = (v / max) * 100;
        thumb.style.bottom = `calc(${pct}% - 14px)`; fill.style.height = pct + '%'; num.textContent = v;
      };
      const fromEvent = e => { const r = track.getBoundingClientRect(); return Math.round(((r.bottom - e.clientY) / r.height) * max); };
      track.addEventListener('pointerdown', e => { e.preventDefault(); track.setPointerCapture(e.pointerId); set(fromEvent(e)); track.dataset.drag = 1; });
      track.addEventListener('pointermove', e => { if (track.dataset.drag) set(fromEvent(e)); });
      track.addEventListener('pointerup', () => delete track.dataset.drag);
      set(0);
      return h('div', { class: 'sl' }, num, track, h('span', { class: 'sl-label' }, (c.labels && c.labels[i]) || ''));
    }));
    el.append(row, goBtn(ctx, () => vals.join('')));
  };

  /* use: { label, pick: 1 } — 자물쇠 시트 안에 가방 아이템을 늘어놓고 골라 쓴다 */
  D.use = (el, c, ctx) => {
    const sel = new Set();
    const list = h('div', { class: 'use-list' });
    const draw = () => {
      const all = ctx.inv.all();
      list.replaceChildren(...(all.length ? all.map(it => h('button', {
        class: 'use-item' + (sel.has(it.id) ? ' sel' : ''),
        onclick: () => {
          S().play('tick');
          if (sel.has(it.id)) sel.delete(it.id);
          else { if ((c.pick || 1) === 1) sel.clear(); sel.add(it.id); }
          draw();
        },
      }, h('span', { class: 'use-ic', html: it.icon || '' }), h('span', { class: 'use-name' }, it.name))) : [h('span', { class: 'seq-empty' }, '가방이 비어 있어요')]));
    };
    draw();
    el.append(list, h('button', { class: 'btn primary dev-go', onclick: async () => {
      if (!sel.size) return ctx.toast('쓸 아이템을 먼저 골라 주세요');
      await ctx.submit([...sel].sort().join('+'));
    } }, c.label || '사용하기'));
  };

  /* custom: puzzle.script 가 api.root 에 직접 그린다 */
  D.custom = () => { };

  window.ESCDevices = D;
  window.ESCh = h;
  window.ESCs = s;
})();
