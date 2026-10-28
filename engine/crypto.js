/* 답 확인 · 잠긴 내용 열기
 * - 소스에는 답이 없다. 답에서 만든 키로 「다음 단계 열쇠」를 풀어 본다.
 * - 풀리면 정답, 안 풀리면 오답 (AES-GCM 인증 실패).
 */
(function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const b64 = {
    to(u8) {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    from(s) {
      const bin = atob(s);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    },
  };

  // 띄어쓰기 · 대소문자 · 기호 무시 (build.mjs 와 같아야 한다)
  function normalize(s) {
    return String(s).normalize('NFKC').toLowerCase().replace(/[\s\-_.,·'"`!?~:;()[\]{}\/\\|+*#]/g, '');
  }

  async function deriveKey(answer, saltB64, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(normalize(answer)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64.from(saltB64), iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }

  async function decrypt(key, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.from(box.iv) }, key, b64.from(box.ct));
    return new Uint8Array(pt);
  }

  // 정답이면 다음 단계 열쇠(base64), 아니면 null
  async function tryGate(answer, gate) {
    if (!normalize(answer)) return null;
    const k = await deriveKey(answer, gate.salt, gate.iter);
    for (const w of gate.wraps) {
      try { return b64.to(await decrypt(k, w)); } catch (e) { /* 다음 후보 */ }
    }
    return null;
  }

  async function openPayload(rawB64, box) {
    const k = await crypto.subtle.importKey('raw', b64.from(rawB64), 'AES-GCM', false, ['decrypt']);
    return JSON.parse(dec.decode(await decrypt(k, box)));
  }

  // 노드 열쇠 = SHA-256("esc-node" ‖ 자물쇠 열쇠들 (gate 번호 순)) — tools/build.mjs nodeKey 와 같아야 한다
  async function nodeKey(rawB64List) {
    const parts = [enc.encode('esc-node'), ...rawB64List.map(b64.from)];
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    return b64.to(new Uint8Array(await crypto.subtle.digest('SHA-256', all)));
  }

  window.ESCCrypto = { normalize, tryGate, openPayload, nodeKey };
})();
