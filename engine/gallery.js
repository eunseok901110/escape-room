/* #gallery — 장치 시안 확인용. 정답 확인 없이 입력 문자열만 보여 준다 */
(function () {
  const h = window.ESCh;
  const SAMPLES = [
    ['text', '글자 입력', {}],
    ['keypad', '키패드', { length: 4 }],
    ['dial', '다이얼 (숫자)', { wheels: 4 }],
    ['dial', '다이얼 (글자 · 칸마다 다름)', { sets: [[...'ㄱㄴㄷㄹㅁㅂㅅ'], [...'ㅏㅓㅗㅜㅡㅣ'], ['☀', '☾', '★', '☁']] }],
    ['direction', '방향 자물쇠', { max: 8 }],
    ['pattern', '패턴 잠금', {}],
    ['colors', '색 순서', {}],
    ['switches', '스위치', { count: 5, labels: ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'] }],
    ['rings', '동심원 고리', { rings: [['☀', '☾', '★', '☁', '⚡', '❄'], ['A', 'B', 'C', 'D', 'E'], ['1', '2', '3', '4']] }],
    ['order', '조각 순서', { pieces: [{ id: 'c', html: '🌕 보름달' }, { id: 'a', html: '🌑 그믐' }, { id: 'b', html: '🌓 반달' }] }],
    ['order', '조각 순서 (격자)', { columns: 3, pieces: ['🐭', '🐮', '🐯', '🐰', '🐲', '🐍'].map((e, i) => ({ id: String(i), html: `<span style="font-size:30px">${e}</span>` })) }],
    ['piano', '피아노', {}],
    ['sliders', '슬라이더', { count: 4, max: 9, labels: ['북', '동', '남', '서'] }],
    ['use', '아이템 쓰기', { pick: 2 }],
  ];

  function render(root) {
    const fake = {
      toast: window.ESC.toast,
      inv: { all: () => [{ id: 'key', name: '작은 열쇠', icon: '🗝️' }, { id: 'map', name: '지도 조각', icon: '🗺️' }] },
      submit: async s => { window.ESC.toast(`입력값: ${s}`); return false; },
    };
    const flashScene = h('div', { class: 'scene dark', html: `<svg viewBox="0 0 400 240"><rect width="400" height="240" fill="#2a2418"/><text x="300" y="190" fill="#e3a64c" font-size="28" font-family="serif">여기 숨은 글자</text><text x="60" y="70" fill="#c9bfa8" font-size="18">벽의 낙서</text></svg>` });
    const fl = h('div', { class: 'flash' });
    flashScene.append(fl);
    flashScene.addEventListener('pointermove', e => { const r = flashScene.getBoundingClientRect(); fl.style.setProperty('--x', (e.clientX - r.left) + 'px'); fl.style.setProperty('--y', (e.clientY - r.top) + 'px'); });

    root.replaceChildren(h('div', { class: 'gallery' },
      h('div', { class: 'page-bar' }, h('button', { class: 'icon-btn', onclick: () => { location.hash = '#/'; } }, '←'), h('span', null, '장치 갤러리')),
      h('p', { class: 'sub' }, '확인을 누르면 장치가 만든 입력값만 보여 줘요.'),
      ...SAMPLES.map(([type, title, cfg]) => {
        const dev = h('section', { class: 'device' });
        window.ESCDevices[type](dev, cfg, fake);
        return [h('h2', null, `${type} · ${title}`), dev];
      }).flat(),
      h('h2', null, 'effect · 손전등'), flashScene));
  }

  window.ESCGallery = { render };
})();
