/* 경기 보관함 — 태그·즐겨찾기·거르개·국면 검색.
 *
 * Chessis 의 Games Archive 를 옮긴 것이다. 기존에 저장해 둔 경기 기록은 그대로 두고,
 * 필요한 항목(tags, fav)만 덧붙인다 — 없으면 없는 대로 동작한다. */

import { store } from './store.js';
import { Chess } from './lib/chess.js';

/* ---------------- 태그 ---------------- */

/** {id: {name, color}} */
export async function tags() {
  return (await store.get('tags')) || {};
}

export async function addTag(name, color = '#6f7f9a') {
  const all = await tags();
  const id = 't' + Date.now().toString(36);
  all[id] = { name: String(name || '태그').slice(0, 20), color };
  await store.set('tags', all);
  return id;
}

export async function renameTag(id, name) {
  const all = await tags();
  if (!all[id]) return;
  all[id].name = String(name || '').slice(0, 20) || all[id].name;
  await store.set('tags', all);
}

/**
 * 태그를 지운다. Chessis 는 태그를 지우면 그 안의 경기까지 지우는데,
 * 그건 사고가 나기 쉬워서 여기서는 **태그만** 뗀다(경기는 남는다).
 */
export async function deleteTag(id) {
  const all = await tags();
  delete all[id];
  await store.set('tags', all);
  for (const g of await store.allGames()) {
    if (g.tags && g.tags.includes(id)) {
      g.tags = g.tags.filter((t) => t !== id);
      await store.putGame(g);
    }
  }
}

export async function setGameTags(gameId, list) {
  const g = await store.getGame(gameId);
  if (!g) return;
  g.tags = Array.from(new Set(list || []));
  await store.putGame(g);
}

export async function toggleFav(gameId) {
  const g = await store.getGame(gameId);
  if (!g) return false;
  g.fav = !g.fav;
  await store.putGame(g);
  return !!g.fav;
}

/* ---------------- 거르개 ---------------- */

export const SORTS = [
  ['new', '최근 경기부터'],
  ['old', '오래된 경기부터'],
  ['added', '나중에 넣은 것부터'],
  ['acc', '내 정확도 높은 순'],
  ['accLow', '내 정확도 낮은 순'],
  ['prob', '문제 많은 순'],
];

/**
 * @param {object[]} games
 * @param {object} f {q, color, result, tag, fav, sort, opening}
 * @param {string} me 내 아이디(소문자)
 */
export function applyFilter(games, f = {}, me = '') {
  const low = (x) => String(x || '').toLowerCase();
  const sideOf = (g) => (low(g.meta.white) === me ? 'w' : 'b');
  const inGame = (g) => !!me && [g.meta.white, g.meta.black].some((n) => low(n) === me);
  const wonBy = (g) => (g.meta.result === '1-0' && sideOf(g) === 'w') || (g.meta.result === '0-1' && sideOf(g) === 'b');
  const myAcc = (g) => (inGame(g) ? (g.acc || {})[sideOf(g)] : null);

  let out = games.filter((g) => {
    if (f.q) {
      const hay = `${g.meta.white} ${g.meta.black} ${g.meta.event || ''} ${(g.report && g.report.opening) || ''}`.toLowerCase();
      if (!hay.includes(low(f.q))) return false;
    }
    if (f.fav && !g.fav) return false;
    if (f.tag && !(g.tags || []).includes(f.tag)) return false;
    if (f.opening && (!g.report || g.report.opening !== f.opening)) return false;
    if (f.result && f.result !== 'all') {
      if (f.result === 'win') { if (!inGame(g) || !wonBy(g)) return false; }
      else if (f.result === 'loss') { if (!inGame(g) || wonBy(g) || g.meta.result === '1/2-1/2') return false; }
      else if (f.result === 'draw') { if (g.meta.result !== '1/2-1/2') return false; }
      else if (f.result !== g.meta.result) return false;
    }
    if (f.color && f.color !== 'all') {
      if (!inGame(g)) return false;
      if (sideOf(g) !== f.color) return false;
    }
    return true;
  });

  const byDate = (a, c) => (a.meta.date < c.meta.date ? -1 : a.meta.date > c.meta.date ? 1 : (a.addedAt || 0) - (c.addedAt || 0));
  switch (f.sort) {
    case 'old': out.sort(byDate); break;
    case 'added': out.sort((a, c) => (c.addedAt || 0) - (a.addedAt || 0)); break;
    case 'acc': out.sort((a, c) => (myAcc(c) ?? -1) - (myAcc(a) ?? -1)); break;
    case 'accLow': out.sort((a, c) => (myAcc(a) ?? 999) - (myAcc(c) ?? 999)); break;
    case 'prob': out.sort((a, c) => (c.nprob || 0) - (a.nprob || 0)); break;
    default: out.sort((a, c) => -byDate(a, c));
  }
  return out;
}

/* ---------------- 국면(FEN) 검색 ---------------- */

/** FEN 에서 "배치 + 둘 차례"만 — 수순이 달라도 같은 국면이면 잡히게 */
export function posKey(fen, withTurn = true) {
  const p = String(fen).trim().split(/\s+/);
  return withTurn ? `${p[0]} ${p[1] || 'w'}` : p[0];
}

/**
 * 그 국면이 나왔던 경기를 찾는다.
 * @param {object[]} games
 * @param {string} fen
 * @param {{turn:boolean, onProgress:function}} opts
 * @returns [{game, ply}]  ply = 몇 수째에 나왔는지
 */
export function searchPosition(games, fen, opts = {}) {
  const want = posKey(fen, opts.turn !== false);
  const out = [];
  let n = 0;
  for (const g of games) {
    n++;
    if (opts.onProgress) opts.onProgress(n, games.length);
    try {
      const c = new Chess();
      c.loadPgn(g.pgn, { strict: false });
      const moves = c.history({ verbose: true });
      // 시작 국면부터 훑는다
      let cur = new Chess(moves.length ? moves[0].before : c.fen(), { skipValidation: true });
      if (posKey(cur.fen(), opts.turn !== false) === want) { out.push({ game: g, ply: 0 }); continue; }
      let hit = -1;
      for (let i = 0; i < moves.length; i++) {
        if (posKey(moves[i].after, opts.turn !== false) === want) { hit = i + 1; break; }
      }
      if (hit >= 0) out.push({ game: g, ply: hit });
    } catch (e) { /* 못 읽는 판은 건너뛴다 */ }
  }
  return out;
}

/* ---------------- 오프닝 탐색기 ---------------- */

/**
 * 내 경기를 오프닝별로 묶어 승률을 낸다 (Chessis 의 Openings 화면).
 * @returns [{name, n, win, draw, loss, score, acc, games:[]}]
 */
export function openingStats(games, me, color = null) {
  const low = (x) => String(x || '').toLowerCase();
  const sideOf = (g) => (low(g.meta.white) === me ? 'w' : 'b');
  const inGame = (g) => !!me && [g.meta.white, g.meta.black].some((n) => low(n) === me);

  const by = new Map();
  for (const g of games) {
    if (!inGame(g)) continue;
    const sd = sideOf(g);
    if (color && sd !== color) continue;
    const name = (g.report && g.report.opening) || '(오프닝 미상)';
    if (!by.has(name)) by.set(name, { name, n: 0, win: 0, draw: 0, loss: 0, accs: [], games: [] });
    const e = by.get(name);
    e.n++;
    e.games.push(g);
    const r = g.meta.result;
    if (r === '1/2-1/2') e.draw++;
    else if ((r === '1-0' && sd === 'w') || (r === '0-1' && sd === 'b')) e.win++;
    else if (r === '1-0' || r === '0-1') e.loss++;
    const a = (g.acc || {})[sd];
    if (a != null) e.accs.push(a);
  }
  const out = [...by.values()].map((e) => ({
    ...e,
    score: e.n ? Math.round(((e.win + e.draw / 2) / e.n) * 1000) / 10 : 0,
    acc: e.accs.length ? Math.round((e.accs.reduce((a, b) => a + b, 0) / e.accs.length) * 10) / 10 : null,
  }));
  out.sort((a, b) => b.n - a.n || b.score - a.score);
  return out;
}
