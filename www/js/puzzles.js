/* 퍼즐 — 리체스 training 과 같은 방식.
 *
 * 퍼즐 하나는 {fen, moves} 다. moves 의 첫 수는 상대가 둔 실수여서 자동으로 놓이고,
 * 그 다음부터 한 수 걸러 한 수가 내가 찾아야 할 수다.
 *
 * 퍼즐은 두 군데서 온다.
 *   1) 기본 꾸러미 (puzzledata.js — 스톡피시끼리 둔 판에서 캔 것)
 *   2) 내 경기 (분석 결과에 남은 실수 → 그 실수를 응징하는 수순)
 * 2번이 이 앱의 값어치다. 내가 진 이유가 그대로 문제가 된다.
 */

import { Chess } from './lib/chess.js';
import { store } from './store.js';
import { pinnedPieces } from './insight.js';
import { moveFacts } from './quizgen.js';

export const THEME_KO = {
  mate: '메이트', mateIn1: '한 수 메이트', mateIn2: '두 수 메이트', mateIn3: '세 수 메이트',
  mateLong: '긴 메이트', crushing: '결정타', advantage: '우세 잡기',
  fork: '양걸이', pin: '핀', skewer: '꼬치', discovered: '열린 공격',
  backRank: '백랭크 메이트', sacrifice: '희생', promotion: '승격', capture: '기물 따기',
  hanging: '무방비 기물', trapped: '가둔 기물',
  endgame: '엔드게임', middlegame: '미들게임', long: '긴 수순',
  mine: '내 경기',
};

/** 화면에 보여 줄 만한 굵직한 주제만 (필터 단추용) */
export const MAIN_THEMES = ['mate', 'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer',
  'discovered', 'backRank', 'sacrifice', 'promotion', 'crushing', 'endgame', 'mine'];

const PVAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function material(fen) {
  let t = 0;
  for (const ch of String(fen).split(' ')[0]) {
    const v = PVAL[ch.toLowerCase()];
    if (v) t += v;
  }
  return t;
}

/** from 에서 킹을 지나 계속 뻗는 줄에 상대 기물이 또 있나 (= 꼬치) */
function skewered(c, from, kingSquare, foe) {
  if (!kingSquare) return false;
  const F = 'abcdefgh';
  const fx = F.indexOf(from[0]), fy = +from[1] - 1;
  const kx = F.indexOf(kingSquare[0]), ky = +kingSquare[1] - 1;
  const dx = Math.sign(kx - fx), dy = Math.sign(ky - fy);
  // 같은 줄·칸·대각선이 아니면 미끄러지는 공격이 아니다
  if (!(dx === 0 || dy === 0 || Math.abs(kx - fx) === Math.abs(ky - fy))) return false;
  let x = kx + dx, y = ky + dy;
  while (x >= 0 && x < 8 && y >= 0 && y < 8) {
    const p = c.get(F[x] + (y + 1));
    if (p) return p.color === foe && p.type !== 'p';
    x += dx; y += dy;
  }
  return false;
}

function kingSq(c, color) {
  for (const row of c.board()) {
    for (const cell of row || []) {
      if (cell && cell.type === 'k' && cell.color === color) return cell.square;
    }
  }
  return null;
}

/**
 * 주제 딱지 붙이기.
 * @param fen    문제 국면(상대가 실수하기 직전)
 * @param ucis   [상대의 실수, 내 정답, 상대 응수, …]
 * @param mateIn 메이트까지 몇 수(아니면 null)
 * @param gain   센티폰 이득
 */
export function tagThemes(fen, ucis, mateIn, gain) {
  const th = new Set();
  const heroPlies = Math.ceil((ucis.length - 1) / 2);
  if (mateIn != null) {
    th.add(mateIn <= 1 ? 'mateIn1' : mateIn === 2 ? 'mateIn2' : mateIn === 3 ? 'mateIn3' : 'mateLong');
    th.add('mate');
  } else if (gain >= 500) th.add('crushing');
  else th.add('advantage');

  const c = new Chess(fen);
  const mv = (b, u) => {
    try { return b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined }); } catch (e) { return null; }
  };
  if (!mv(c, ucis[0])) return [...th];
  const heroFen = c.fen();                 // 여기서부터 내가 푼다
  const hero = c.turn();
  const key = ucis[1];
  if (!key) return [...th];

  const before = new Chess(heroFen);
  const km = mv(before, key);
  if (km) {
    if (km.promotion) th.add('promotion');
    if (km.captured) th.add('capture');
    if (moveFacts(heroFen, km.san).some((f) => f.includes('양걸이'))) th.add('fork');
    const foe = hero === 'w' ? 'b' : 'w';
    const movedVal = PVAL[km.piece] || 0;
    const gotVal = km.captured ? PVAL[km.captured] : 0;
    if (before.attackers(km.to, foe).length && movedVal > gotVal + 1) th.add('sacrifice');
    // 핀 — pinnedPieces 는 뒤가 더 값진 것만 돌려주므로 전부 진짜 핀이다
    if (pinnedPieces(before.fen()).some((p) => p.color === foe)) th.add('pin');
    // 꼬치 — 체크를 걸어 킹을 비키게 만들고 그 뒤의 기물을 딴다
    if (km.piece !== 'p' && km.piece !== 'n' && km.piece !== 'k'
      && before.isCheck() && skewered(before, km.to, kingSq(before, foe), foe)) th.add('skewer');
    if (before.isCheckmate() && /[18]/.test(km.to[1]) && /[rq]/.test(km.piece)) th.add('backRank');
    if (before.isCheck() && km.piece !== 'k') {
      const k = kingSq(before, foe);
      if (k && !before.attackers(k, hero).includes(km.to)) th.add('discovered');
    }
  }
  th.add(material(heroFen) <= 20 ? 'endgame' : 'middlegame');
  if (heroPlies >= 4) th.add('long');
  return [...th];
}

/** 짐작 난이도 — 메이트 길이·이득·수순 길이로. 정확한 값이 아니라 줄 세우기용이다. */
export function guessRating(mateIn, gain, heroPlies, themes) {
  let r;
  // 한 수 메이트는 초보가 처음 푸는 문제다 — 시작 점수(1200)보다 확실히 낮게 둔다
  if (mateIn != null) r = 380 + mateIn * 320;
  else r = 850 + Math.min(600, Math.max(0, gain - 200) * 0.55);
  r += (heroPlies - 1) * 110;
  if (themes.includes('sacrifice')) r += 170;
  if (themes.includes('discovered')) r += 60;
  if (themes.includes('endgame')) r -= 40;
  return Math.max(600, Math.min(2600, Math.round(r / 10) * 10));
}

/* ---------------- 내 경기에서 캐기 ---------------- */

/** SAN 수순 → uci 수순 (하나라도 못 두면 null) */
export function sansToUcis(fen, sans) {
  const c = new Chess(fen);
  const out = [];
  for (const s of sans || []) {
    let m;
    try { m = c.move(s); } catch (e) { return null; }
    if (!m) return null;
    out.push(m.lan);
  }
  return out;
}

/**
 * 분석이 끝난 경기 하나 → 퍼즐들.
 * 실수·블런더가 나온 자리마다 「그 실수를 어떻게 응징하나」를 문제로 만든다.
 * 상대의 실수든 내 실수든 다 낸다 — 내 실수는 상대 쪽에서 보는 눈을 길러 준다.
 */
export function minePuzzles(rec) {
  const report = rec && rec.report;
  if (!report || !report.cls) return [];
  const game = new Chess();
  try { game.loadPgn(rec.pgn, { strict: false }); } catch (e) { return []; }
  const moves = game.history({ verbose: true });
  const cls = report.cls || [];
  const wp = report.wp || [];
  const deep = report.deep || {};
  const pvs = report.pvs || [];
  const out = [];

  for (let i = 0; i < moves.length; i++) {
    if (cls[i] !== 'blunder' && cls[i] !== 'mistake') continue;
    const m = moves[i];
    const fen = m.before;                       // 실수를 두기 직전
    // 응징 수순 — 깊게 본 게 있으면 그걸, 없으면 다음 수의 후보 수순
    const punish = (deep[i] && deep[i].punish) || pvs[i + 1] || [];
    if (!punish.length) continue;
    const heroFen = m.after;
    let sans = punish.slice(0, 5);
    if (sans.length % 2 === 0) sans = sans.slice(0, sans.length - 1);   // 내 수로 끝나게
    const rest = sansToUcis(heroFen, sans);
    if (!rest || !rest.length) continue;
    const ucis = [m.lan, ...rest];

    // 승률이 실제로 크게 흔들렸어야 문제로 값어치가 있다
    const before = i >= 1 ? wp[i - 1] : 50;
    const after = wp[i] == null ? 50 : wp[i];
    const heroIsWhite = m.color === 'b';
    const swing = heroIsWhite ? after - before : before - after;
    if (!(swing >= 12)) continue;

    // 메이트로 끝나나?
    const c = new Chess(heroFen);
    let mateIn = null;
    let ok = true;
    for (let k = 0; k < rest.length; k++) {
      const u = rest[k];
      try { if (!c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined })) { ok = false; break; } } catch (e) { ok = false; break; }
    }
    if (!ok) continue;
    if (c.isCheckmate()) mateIn = Math.ceil(rest.length / 2);

    const gain = Math.round(swing * 24);        // 승률 %p → 대충 센티폰
    const themes = tagThemes(fen, ucis, mateIn, gain);
    themes.push('mine');
    out.push({
      id: `${rec.id}#${i}`,
      fen, moves: ucis,
      rating: guessRating(mateIn, gain, Math.ceil(rest.length / 2), themes),
      themes,
      src: 'mine',
      game: `${rec.meta.white} vs ${rec.meta.black}`,
      date: rec.meta.date,
      gameId: rec.id,
      ply: i + 1,
    });
  }
  return out;
}

/* ---------------- 내 성적 ---------------- */

const KEY = 'puzzleState';

export function emptyState() {
  return {
    rating: 1200,
    solved: {},        // id → {ok, ts, tries}
    streak: 0, best: 0,
    byTheme: {},       // theme → {n, ok}
    day: null, today: 0, todayOk: 0,
    rush: { best: 0, plays: 0 },
    hist: [],          // 최근 레이팅 변화 (그래프용)
  };
}

export async function getState() {
  const s = await store.get(KEY, null);
  return { ...emptyState(), ...(s || {}) };
}

export async function setState(s) { return store.set(KEY, s); }

/** 오늘 날짜(현지) — 하루 통계 초기화용 */
function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 한 판 결과 반영. 레이팅은 Elo — 퍼즐 난이도를 상대 레이팅으로 본다.
 * @returns {state, delta}
 */
export function applyResult(state, puzzle, win) {
  const s = { ...state, solved: { ...state.solved }, byTheme: { ...state.byTheme } };
  const n = Object.keys(s.solved).length;
  const K = n < 20 ? 40 : n < 60 ? 28 : 20;
  const exp = 1 / (1 + Math.pow(10, (puzzle.rating - s.rating) / 400));
  const delta = Math.round(K * ((win ? 1 : 0) - exp));
  s.rating = Math.max(400, s.rating + delta);

  const prev = s.solved[puzzle.id] || { tries: 0 };
  s.solved[puzzle.id] = { ok: !!win, ts: Date.now(), tries: (prev.tries || 0) + 1 };
  s.streak = win ? s.streak + 1 : 0;
  s.best = Math.max(s.best || 0, s.streak);
  for (const t of puzzle.themes || []) {
    const b = s.byTheme[t] || { n: 0, ok: 0 };
    s.byTheme[t] = { n: b.n + 1, ok: b.ok + (win ? 1 : 0) };
  }
  const dk = dayKey();
  if (s.day !== dk) { s.day = dk; s.today = 0; s.todayOk = 0; }
  s.today++; if (win) s.todayOk++;
  s.hist = [...(s.hist || []), s.rating].slice(-60);
  return { state: s, delta };
}

/**
 * 다음에 낼 퍼즐 고르기.
 * 안 푼 것 · 내 레이팅에 가까운 것 우선. 없으면 범위를 넓히고,
 * 그래도 없으면 제일 오래전에 푼 것을 다시 낸다(복습).
 */
export function pickPuzzle(pool, state, opts = {}) {
  const theme = opts.theme || null;
  const list = theme ? pool.filter((p) => (p.themes || []).includes(theme)) : pool;
  if (!list.length) return null;
  const mine = state.rating || 1200;
  const fresh = list.filter((p) => !state.solved[p.id]);
  const target = opts.rating || mine;
  for (const band of [140, 260, 420, 700, 1e9]) {
    const near = (fresh.length ? fresh : []).filter((p) => Math.abs(p.rating - target) <= band);
    if (near.length) return near[Math.floor(Math.random() * near.length)];
  }
  if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  // 전부 풀었으면 틀렸던 것부터, 그다음 오래된 것부터
  const sorted = list.slice().sort((a, b) => {
    const A = state.solved[a.id] || {}, B = state.solved[b.id] || {};
    if (!A.ok !== !B.ok) return A.ok ? 1 : -1;
    return (A.ts || 0) - (B.ts || 0);
  });
  return sorted[0] || null;
}

/* ---------------- 한 판 진행 ---------------- */

/**
 * 퍼즐 하나를 진행하는 작은 상태 기계.
 * 화면은 이걸 두드리기만 하면 된다 — 규칙은 전부 여기 있다.
 */
export function runner(puzzle) {
  const chess = new Chess(puzzle.fen);
  const ucis = puzzle.moves;
  let idx = 0;                    // 다음에 놓일 수의 자리
  let failed = false;

  // 내가 둘 색 — 상대의 실수 한 수를 놓고 난 뒤의 차례. 한 번만 계산한다.
  let mySide = 'w';
  {
    const c = new Chess(puzzle.fen);
    const m = ucis[0];
    if (m) {
      try { c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.slice(4, 5) || undefined }); } catch (e) { /* 무시 */ }
    }
    mySide = c.turn();
  }

  const uciMove = (u) => {
    try {
      return chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined });
    } catch (e) { return null; }
  };

  return {
    chess,
    get fen() { return chess.fen(); },
    get done() { return idx >= ucis.length; },
    get failed() { return failed; },
    /** 내가 둘 색 */
    get side() { return mySide; },
    /** 상대 수 하나 놓기 (첫 수와 내 정답 뒤의 응수) */
    opponent() {
      if (idx >= ucis.length) return null;
      const m = uciMove(ucis[idx]);
      if (m) idx++;
      return m;
    },
    /** 지금 기다리는 정답 */
    get expect() { return ucis[idx] || null; },
    /** 내 수 채점. 정답이면 놓고 true */
    try(uci) {
      const want = ucis[idx];
      if (!want) return { ok: false, end: true };
      // 승격 글자까지 같아야 하지만, 요구가 없으면 앞 네 글자만 본다
      const same = want.length > 4 ? uci === want : uci.slice(0, 4) === want.slice(0, 4);
      if (!same) {
        // 메이트를 놓는 다른 수도 정답으로 친다 (마지막 수에서만)
        const c = new Chess(chess.fen());
        let m = null;
        try { m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined }); } catch (e) {}
        if (m && c.isCheckmate()) {
          uciMove(uci); idx = ucis.length;
          return { ok: true, end: true, alt: true, move: m };
        }
        failed = true;
        return { ok: false, end: false, move: m };
      }
      const m = uciMove(want);
      idx++;
      return { ok: true, end: idx >= ucis.length, move: m };
    },
    /** 남은 정답 수순 (SAN) — 정답 보기 */
    solutionSans() {
      const c = new Chess(chess.fen());
      const out = [];
      for (let k = idx; k < ucis.length; k++) {
        const u = ucis[k];
        let m;
        try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined }); } catch (e) { break; }
        if (!m) break;
        out.push(m.san);
      }
      return out;
    },
  };
}

/* ---------------- 꾸러미 모으기 ---------------- */

let _cache = null;

/** 기본 꾸러미 + 내 경기에서 캔 것 전부 */
export async function allPuzzles(force = false) {
  if (_cache && !force) return _cache;
  let pack = [];
  try {
    const mod = await import('./puzzledata.js');
    pack = mod.PACK_PUZZLES || [];
  } catch (e) { pack = []; }
  let mine = [];
  try {
    const games = await store.allGames();
    for (const g of games) mine = mine.concat(minePuzzles(g));
  } catch (e) { mine = []; }
  _cache = pack.concat(mine);
  return _cache;
}

export function invalidate() { _cache = null; }
