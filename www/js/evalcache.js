/* 국면별 엔진 결과 보관함.
 *
 * Chessis 의 「이어서 분석 — 이미 분석한 국면은 건너뛰기」를 옮긴 것이다.
 * 국면(FEN)을 열쇠로 삼기 때문에, 같은 판을 다시 분석할 때뿐 아니라
 * **다른 판에서 같은 국면이 나와도**(오프닝은 늘 겹친다) 그대로 다시 쓴다.
 *
 * 저장은 kv 하나에 통째로 — 개수를 제한해 두어 용량이 새지 않는다. */

import { store } from './store.js';

const KEY = 'evalCache';
const MAX = 6000;              // 대략 2~3MB. 넘으면 오래된 것부터 버린다

let mem = null;
let dirty = false;

/** FEN 에서 수 세기(반수·전체수)는 평가에 영향이 없으므로 뗀다 */
export function key(fen) {
  return String(fen).trim().split(/\s+/).slice(0, 4).join(' ');
}

export async function load() {
  if (mem) return mem;
  // 저장소를 못 쓰는 환경(테스트·사파리 프라이빗 등)에서도 앱은 그냥 돌아가야 한다 —
  // 보관함만 비어 있는 상태로 동작한다.
  try { mem = (await store.get(KEY)) || {}; } catch (e) { mem = {}; }
  return mem;
}

/**
 * 쓸 수 있는 결과가 있으면 돌려준다.
 * @param {string} fen
 * @param {{movetime?:number, depth?:number}} need  이번에 들일 노력
 */
export function get(fen, need = {}) {
  if (!mem) return null;
  const e = mem[key(fen)];
  if (!e) return null;
  if (need.depth) { if (!(e.dp >= need.depth)) return null; }
  else if (need.movetime) { if (!(e.mt >= need.movetime)) return null; }
  e.t = Date.now();
  return { cp: e.cp, mate: e.mate, pv: e.pv || [], wdl: e.wdl || null, best: (e.pv || [])[0] || null, depth: e.dp || 0, cached: true };
}

/** 결과를 넣는다. 이미 더 깊게 본 게 있으면 덮어쓰지 않는다 */
export function put(fen, res, effort = {}) {
  if (!mem || !res) return;
  const k = key(fen);
  const old = mem[k];
  const mt = effort.movetime || 0;
  const dp = res.depth || effort.depth || 0;
  if (old && (old.dp || 0) >= dp && (old.mt || 0) >= mt) return;
  mem[k] = { cp: res.cp, mate: res.mate, pv: (res.pv || []).slice(0, 8), wdl: res.wdl || null, mt, dp, t: Date.now() };
  dirty = true;
}

/** 화면을 벗어날 때·분석이 끝날 때 한 번만 쓴다 (매 수마다 쓰면 느려진다) */
export async function save() {
  if (!mem || !dirty) return;
  const keys = Object.keys(mem);
  if (keys.length > MAX) {
    keys.sort((a, b) => (mem[a].t || 0) - (mem[b].t || 0));
    for (const k of keys.slice(0, keys.length - MAX)) delete mem[k];
  }
  try { await store.set(KEY, mem); } catch (e) { /* 저장 못 해도 분석은 끝났다 */ }
  dirty = false;
}

export async function clear() {
  mem = {};
  dirty = false;
  try { await store.set(KEY, mem); } catch (e) {}
}

export function size() {
  return mem ? Object.keys(mem).length : 0;
}
