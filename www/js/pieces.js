/* 기물 세트 — 내장 세트 + 사용자가 넣은 ZIP.
 *
 * Chessis 는 13종을 앱에 넣어 두고 ZIP 으로 더 넣을 수 있게 했다. 우리는 라이선스가
 * 확실한 것만 내장하고(Cburnett, CC BY-SA 3.0), **ZIP 으로 무엇이든 넣는 기능**을 그대로 옮긴다.
 * 리체스·체스닷컴에서 쓰는 세트는 대부분 zip 하나로 받을 수 있다.
 *
 * ZIP 안에는 wp.svg / bp.svg … 12개가 있으면 된다(대문자 wP.svg 도 받는다).
 * 판은 스프라이트의 <symbol id="pwp"> 를 그대로 쓰므로, 세트를 바꾸면 심볼 내용만 갈아 끼운다. */

import { store } from './store.js';

export const CODES = ['wk', 'wq', 'wr', 'wb', 'wn', 'wp', 'bk', 'bq', 'br', 'bb', 'bn', 'bp'];

/** 내장 세트 — id → [이름, 설명] */
export const BUILTIN = {
  cburnett: ['클래식 (Cburnett)', '리체스 기본 기물 · CC BY-SA 3.0'],
};

const HOLDER_ID = '__pieceSprite';

function holder() {
  let el = document.getElementById(HOLDER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = HOLDER_ID;
    el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.appendChild(el);
  }
  return el;
}

let builtinSvg = null;

/** 내장 스프라이트를 받아 둔다(한 번만) */
export async function loadBuiltin() {
  if (builtinSvg != null) return builtinSvg;
  try {
    const r = await fetch('assets/pieces.svg');
    builtinSvg = await r.text();
  } catch (e) { builtinSvg = ''; }
  return builtinSvg;
}

/** 저장된 사용자 세트 전부 {id: {name, svgs:{code: '<svg…>'}}} */
export async function customSets() {
  return (await store.get('pieceSets')) || {};
}

/** 세트 하나를 화면에 적용 */
export async function applySet(id) {
  const h = holder();
  if (!id || id === 'cburnett' || BUILTIN[id]) {
    h.innerHTML = await loadBuiltin();
    return 'cburnett';
  }
  const sets = await customSets();
  const set = sets[id];
  if (!set) { h.innerHTML = await loadBuiltin(); return 'cburnett'; }

  // 사용자 세트 → 같은 id 의 symbol 로 다시 묶는다
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'];
  for (const code of CODES) {
    const raw = set.svgs[code];
    if (!raw) continue;
    const vb = (/viewBox="([^"]+)"/.exec(raw) || [, '0 0 45 45'])[1];
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    parts.push(`<symbol id="p${code}" viewBox="${vb}">${inner}</symbol>`);
  }
  parts.push('</svg>');
  h.innerHTML = parts.join('');
  return id;
}

/* ------------------------------------------------------------------ ZIP */

/* 아주 작은 ZIP 리더 — 라이브러리 없이 중앙 디렉터리만 읽는다.
 * 압축은 store(0)와 deflate(8) 둘만 쓰이는데, deflate 는 브라우저의
 * DecompressionStream 이 풀어 준다(안드로이드 웹뷰 Chrome 103+). */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 기기의 웹뷰가 압축 해제를 지원하지 않습니다');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ZIP(ArrayBuffer) → {파일이름: Uint8Array} */
export async function unzip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // 중앙 디렉터리 끝(EOCD) 찾기 — 뒤에서부터
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP 파일이 아닙니다');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const out = {};
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;

    // 로컬 헤더에서 실제 자료 시작 위치를 다시 잰다(가변 길이가 다를 수 있다)
    if (dv.getUint32(lho, true) !== 0x04034b50) continue;
    const lnlen = dv.getUint16(lho + 26, true);
    const lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    if (name.endsWith('/')) continue;
    try {
      out[name] = method === 0 ? raw : await inflateRaw(raw);
    } catch (e) { /* 이 파일만 건너뛴다 */ }
  }
  return out;
}

/** 파일 이름에서 기물 코드 뽑기 — wp.svg · wP.svg · white/pawn.svg 까지 받아 준다 */
function codeOf(path) {
  const base = path.split('/').pop().replace(/\.svg$/i, '');
  const m = /^([wb])([kqrbnp])$/i.exec(base);
  if (m) return m[1].toLowerCase() + m[2].toLowerCase();
  const m2 = /^([kqrbnp])([wb])$/i.exec(base);
  if (m2) return m2[2].toLowerCase() + m2[1].toLowerCase();
  return null;
}

/**
 * ZIP 을 세트로 등록.
 * @param {string} name 사용자에게 보일 이름
 * @param {ArrayBuffer} buf
 * @returns {{id, name, found:number}}
 */
export async function importZip(name, buf) {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const svgs = {};
  for (const [path, bytes] of Object.entries(files)) {
    if (!/\.svg$/i.test(path)) continue;
    const code = codeOf(path);
    if (!code || !CODES.includes(code)) continue;
    const txt = dec.decode(bytes);
    if (!/<svg/i.test(txt)) continue;
    svgs[code] = txt;
  }
  const found = Object.keys(svgs).length;
  if (found < 12) {
    throw new Error(`기물 ${found}/12개만 찾았습니다. wp.svg·bk.svg 처럼 12개가 들어 있는 ZIP 이어야 합니다`);
  }
  const id = 'u_' + Date.now().toString(36);
  const sets = await customSets();
  sets[id] = { name: name || '내 기물', svgs };
  await store.set('pieceSets', sets);
  return { id, name: sets[id].name, found };
}

export async function deleteSet(id) {
  const sets = await customSets();
  delete sets[id];
  await store.set('pieceSets', sets);
}

/** 설정 화면용 목록 [{id, name, note, builtin}] */
export async function listSets() {
  const out = Object.entries(BUILTIN).map(([id, [name, note]]) => ({ id, name, note, builtin: true }));
  const sets = await customSets();
  for (const [id, s] of Object.entries(sets)) out.push({ id, name: s.name, note: '내가 넣은 세트', builtin: false });
  return out;
}
