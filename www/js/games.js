/* 게임 가져오기·분석·저장 파이프라인 */

import { Chess } from './lib/chess.js';
import { analyzeGame } from './analyze.js';
import { buildGame } from './quizgen.js';
import { store, settings } from './store.js';

/** 여러 판이 이어 붙은 PGN을 게임 단위로 자른다 */
export function splitPgn(text) {
  const t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return [];
  const idx = [];
  const rx = /^\[Event[ \t]/gm;
  let m;
  while ((m = rx.exec(t))) idx.push(m.index);
  if (!idx.length) return [t];              // 헤더 없는 수순만 있는 경우
  return idx.map((s, i) => t.slice(s, i + 1 < idx.length ? idx[i + 1] : undefined).trim())
            .filter(Boolean);
}

const clean = (s) => String(s || '?').replace(/[^\w가-힣.\-]+/g, '_').slice(0, 24) || '?';

export function gameId(meta, sans) {
  const d = (meta.date || '').replace(/\./g, '-') || 'no-date';
  return `${d}_${clean(meta.white)}_vs_${clean(meta.black)}`;
}

/** 같은 경기인지 판단하는 지문 */
export function fingerprint(sans) {
  const s = sans.join(' ');
  let hLow = 0, hHigh = 0;
  for (let i = 0; i < s.length; i++) {
    hLow = (hLow * 31 + s.charCodeAt(i)) >>> 0;
    if (i % 2) hHigh = (hHigh * 37 + s.charCodeAt(i)) >>> 0;
  }
  return hLow.toString(36) + '-' + hHigh.toString(36) + '-' + sans.length;
}

/** PGN 한 판 미리보기(분석 전) */
export function peek(pgn) {
  const c = new Chess();
  c.loadPgn(pgn, { strict: false });
  const hdr = c.getHeaders();
  const sans = c.history();
  if (!sans.length) throw new Error('수가 없는 PGN');
  return {
    sans,
    meta: {
      white: hdr.White || '?', black: hdr.Black || '?',
      welo: hdr.WhiteElo || '', belo: hdr.BlackElo || '',
      date: (hdr.Date || hdr.UTCDate || '').replace(/\./g, '-'),
      result: hdr.Result || '*', termination: hdr.Termination || '',
      timeControl: hdr.TimeControl || '', link: hdr.Link || '',
    },
  };
}

/** 이미 저장된 경기인지 */
export async function findDuplicate(fp) {
  const all = await store.allGames();
  return all.find((g) => g.fp === fp) || null;
}

/** 한 판 분석 후 저장 */
export async function analyzeAndSave(pgn, opts = {}) {
  const st = await settings();
  const { meta, report, sans } = await analyzeGame(pgn, {
    movetime: opts.movetime ?? st.movetime,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  let id = gameId(meta);
  const fp = fingerprint(sans);
  const existing = await store.getGame(id);
  if (existing && existing.fp !== fp) id = id + '_' + Date.now().toString(36).slice(-4);

  const rec = {
    id, pgn, meta, report, fp,
    addedAt: Date.now(),
    source: opts.source || 'manual',
    nply: sans.length,
  };
  const built = buildGame(rec, st.myName);
  rec.nprob = built.problems.length;
  rec.acc = report.acc;
  await store.putGame(rec);
  return rec;
}

/* 최근에 만든 게임 데이터를 잠깐 캐시해 화면 전환을 빠르게 */
const cache = new Map();

export async function loadBuilt(id) {
  const st = await settings();
  const key = id + '|' + st.myName;
  if (cache.has(key)) return cache.get(key);
  const rec = await store.getGame(id);
  if (!rec) throw new Error('경기를 찾을 수 없습니다');
  const built = buildGame(rec, st.myName);
  built.id = id;
  built.rec = rec;
  if (cache.size > 4) cache.clear();
  cache.set(key, built);
  return built;
}

export function invalidate(id) {
  for (const k of Array.from(cache.keys())) if (!id || k.startsWith(id + '|')) cache.delete(k);
  cardsCache = null;
}

let cardsCache = null;

/** 전체 훈련 카드 (모든 경기).
 *  홈·훈련·통계에서 자주 부르므로 결과를 캐시한다.
 *  합법수(legals)는 무거워서 빼두고, 실제로 문제를 띄울 때 채운다. */
export async function allCards() {
  const st = await settings();
  if (cardsCache && cardsCache.name === st.myName) return cardsCache.cards;
  const games = await store.allGames();
  const cards = [];
  for (const g of games) {
    try {
      cards.push(...buildGame(g, st.myName, { withLegals: false }).cards);
    } catch (e) { /* 손상된 기록은 건너뛴다 */ }
  }
  cards.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  cardsCache = { name: st.myName, cards };
  return cards;
}

/** Chess.com 공개 API에서 특정 달의 경기 목록 */
export function chessComUrl(user, y, m) {
  return `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/${y}/${String(m).padStart(2, '0')}`;
}
