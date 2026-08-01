/* PGN 엔진 분석 — 기존 analyze.py를 그대로 옮긴 것(승률 공식·분류 기준 동일).
 * 다른 점: 2차 엔진(GNU Chess) 대신 "깊은 재탐색"으로 실수를 재검증한다. */

import { Chess } from './lib/chess.js';
import engine, { toScore } from './engine.js';

/* (이름, SAN 수순) — 긴 수순 우선 매치 */
const OPENINGS = [
  ['C57 프라이드 리버 어택', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['C50 세미 이탈리안', 'e4 e5 Nf3 Nc6 Bc4 d6'],
  ['C50 이탈리안 게임', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['C55 두 나이트 방어', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['C50 이탈리안 게임', 'e4 e5 Nf3 Nc6 Bc4'],
  ['C46 포 나이츠 게임', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['C60 루이 로페즈', 'e4 e5 Nf3 Nc6 Bb5'],
  ['C44 스카치 게임', 'e4 e5 Nf3 Nc6 d4'],
  ['C40 엘리펀트 갬빗', 'e4 e5 Nf3 d5'],
  ['C41 필리도어 방어', 'e4 e5 Nf3 d6'],
  ['C42 페트로프 방어', 'e4 e5 Nf3 Nf6'],
  ['C40 킹스 나이트 오프닝', 'e4 e5 Nf3'],
  ['C23 비숍 오프닝', 'e4 e5 Bc4'],
  ['C25 비엔나 게임', 'e4 e5 Nc3'],
  ['C30 킹스 갬빗', 'e4 e5 f4'],
  ['C20 웨이워드 퀸', 'e4 e5 Qh5'],
  ['B50 시실리안 방어', 'e4 c5 Nf3 d6'],
  ['B30 시실리안 방어', 'e4 c5 Nf3 Nc6'],
  ['B22 시실리안 알라핀', 'e4 c5 c3'],
  ['B20 시실리안 방어', 'e4 c5'],
  ['C00 프렌치 방어', 'e4 e6'],
  ['B10 카로-칸 방어', 'e4 c6'],
  ['B01 스칸디나비안 방어', 'e4 d5'],
  ['B07 피르츠 방어', 'e4 d6'],
  ['B06 모던 방어', 'e4 g6'],
  ['B02 알레킨 방어', 'e4 Nf6'],
  ['D10 슬라브 방어', 'd4 d5 c4 c6'],
  ['D30 퀸스 갬빗 거절', 'd4 d5 c4 e6'],
  ['D20 퀸스 갬빗 수락', 'd4 d5 c4 dxc4'],
  ['D06 퀸스 갬빗', 'd4 d5 c4'],
  ['D02 런던 시스템', 'd4 d5 Nf3 Nf6 Bf4'],
  ['D00 런던 시스템', 'd4 d5 Bf4'],
  ['E60 킹스 인디언 방어', 'd4 Nf6 c4 g6'],
  ['A80 더치 방어', 'd4 f5'],
  ['A45 인디언 게임', 'd4 Nf6'],
  ['D00 퀸스 폰 게임', 'd4 d5'],
  ['A10 잉글리시 오프닝', 'c4'],
  ['A04 레티 오프닝', 'Nf3'],
  ['B00 킹스 폰 게임', 'e4'],
  ['A40 퀸스 폰 게임', 'd4'],
];

/** centipawn → 승률%(백 관점, lichess 공식) */
export function wp(cp) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** 수 하나의 정확도(lichess 공식) */
export function moveAcc(drop) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669));
}

export function classify(played, best, drop) {
  if (best && played === best) return 'best';
  if (drop < 2) return 'excellent';
  if (drop < 5) return 'good';
  if (drop < 12) return 'inaccuracy';
  if (drop < 25) return 'mistake';
  return 'blunder';
}

export function findOpening(sans) {
  let best = ['오프닝 불명', 0];
  for (const [name, seq] of OPENINGS) {
    const toks = seq.split(' ');
    if (toks.length > sans.length) continue;
    if (toks.every((t, i) => sans[i] === t) && toks.length > best[1]) best = [name, toks.length];
  }
  return best;
}

/** UCI 수순 → SAN 배열 */
export function uciToSan(fen, uciList, limit = 99) {
  const c = new Chess(fen);
  const out = [];
  for (const u of (uciList || []).slice(0, limit)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined });
      if (!m) break;
      out.push(m.san);
    } catch (e) { break; }
  }
  return out;
}

const HEAVY = new Set(['n', 'b', 'r', 'q']);
function heavyCount(chess) {
  let n = 0;
  for (const row of chess.board()) for (const sq of row) if (sq && HEAVY.has(sq.type)) n++;
  return n;
}

const PVAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
/** 이 수를 두면 기물을 내주게 되는가(희생) — 💎탁월(!!) 과 ❗매우 좋아요(!) 를 가른다 */
export function isSacrifice(fenBefore, san) {
  const b = new Chess(fenBefore);
  const me = b.turn();
  let m;
  try { m = b.move(san); } catch (e) { return false; }
  if (!m) return false;
  const enemy = me === 'w' ? 'b' : 'w';
  const gained = m.captured ? (PVAL[m.captured] || 0) : 0;
  for (const row of b.board()) {
    for (const cell of row || []) {
      if (!cell || cell.color !== me || cell.type === 'k') continue;
      const v = PVAL[cell.type] || 0;
      if (v - gained < 2) continue;                     // 내주는 값이 2점 미만이면 희생이 아니다
      const atk = b.attackers(cell.square, enemy);
      if (!atk.length) continue;
      const dfd = b.attackers(cell.square, me);
      const minAtk = Math.min(...atk.map((s) => PVAL[(b.get(s) || {}).type] || 0));
      if (!dfd.length || minAtk < v) return true;       // 상대가 이득 보며 잡을 수 있는데 그냥 뒀다
    }
  }
  return false;
}

/**
 * 한 게임 전체 분석.
 * @param {string} pgn
 * @param {object} opts  {movetime, deepTime, onProgress, signal:{cancelled}}
 * @returns {{meta, report, sans}}
 */
export async function analyzeGame(pgn, opts = {}) {
  const movetime = opts.movetime ?? 250;
  const deepTime = opts.deepTime ?? Math.max(1200, movetime * 5);
  const prog = opts.onProgress || (() => {});
  const sig = opts.signal || {};
  const chk = () => { if (sig.cancelled) throw new Error('취소됨'); };

  const game = new Chess();
  game.loadPgn(pgn, { strict: false });
  const moves = game.history({ verbose: true });
  if (!moves.length) throw new Error('수가 없는 PGN입니다');
  const headers = game.getHeaders();
  const n = moves.length;

  await engine.start();

  // ---- 1차: 전 국면 스캔 ----
  const evals = [];   // [{cp(백관점), best(SAN)}]
  const pvs = [];     // [[SAN x3]]
  const sans = moves.map((m) => m.san);

  for (let i = 0; i < n; i++) {
    chk();
    const fen = moves[i].before;
    const r = await engine.analyse(fen, { movetime });
    const whiteToMove = fen.split(' ')[1] === 'w';
    const raw = toScore(r);
    const cp = whiteToMove ? raw : -raw;
    const line = uciToSan(fen, r.pv, 3);
    pvs.push(line);
    evals.push({ cp, best: line[0] || null });
    prog({ phase: 'scan', i: i + 1, n });
  }

  // 마지막 국면
  const last = new Chess(moves[n - 1].after);
  let finalCp;
  if (last.isGameOver()) {
    finalCp = last.isCheckmate() ? (last.turn() === 'w' ? -10000 : 10000) : 0;
  } else {
    const r = await engine.analyse(moves[n - 1].after, { movetime });
    const whiteToMove = last.turn() === 'w';
    finalCp = whiteToMove ? toScore(r) : -toScore(r);
  }

  const [opening, book] = findOpening(sans);

  // ---- 구간(오프닝/미들/엔드) ----
  const openEnd = Math.min(n, Math.max(book + 2, 16));
  let endStart = n;
  {
    const b = new Chess();
    for (let i = 0; i < n; i++) {
      b.move(moves[i].san);
      if (heavyCount(b) <= 6) { endStart = Math.max(i + 1, openEnd); break; }
    }
  }

  // ---- 수별 분류·통계 ----
  const wps = [], cls = [], mw = [];
  const counts = { w: {}, b: {} };
  const accs = { w: [], b: [] };
  const accsPh = { w: [[], [], []], b: [[], [], []] };
  const cpls = { w: [], b: [] };
  const flagged = [];

  for (let i = 0; i < n; i++) {
    const whiteMoved = moves[i].color === 'w';
    const side = whiteMoved ? 'w' : 'b';
    const { cp: cpBefore, best } = evals[i];
    const cpAfter = i + 1 < n ? evals[i + 1].cp : finalCp;
    const wB = whiteMoved ? wp(cpBefore) : 100 - wp(cpBefore);
    const wA = whiteMoved ? wp(cpAfter) : 100 - wp(cpAfter);
    const drop = wB - wA;
    wps.push(Math.round(wp(cpAfter) * 10) / 10);

    const c = i < book ? 'book' : classify(sans[i], best, drop);
    cls.push(c);
    const missedWin = wB >= 80 && wA < 55;
    if (missedWin) { mw.push(i); counts[side].mw = (counts[side].mw || 0) + 1; }
    counts[side][c] = (counts[side][c] || 0) + 1;

    const a = moveAcc(drop);
    accs[side].push(a);
    const ph = i < openEnd ? 0 : (i >= endStart ? 2 : 1);
    accsPh[side][ph].push(a);
    cpls[side].push(Math.min(1000, Math.max(0, whiteMoved ? cpBefore - cpAfter : cpAfter - cpBefore)));

    if (best && best !== sans[i] && drop >= 12) {
      flagged.push({ i, fen: moves[i].before, san: sans[i], best, drop: Math.round(drop * 10) / 10 });
    }
  }

  // ---- 2차: 지적된 수만 깊게 재탐색 (수순 확보 + 재검증) ----
  const deep = {}, verify = {};
  for (let k = 0; k < flagged.length; k++) {
    chk();
    const fl = flagged[k];
    const whiteToMove = fl.fen.split(' ')[1] === 'w';
    try {
      const r1 = await engine.analyse(fl.fen, { movetime: deepTime });
      const bestLine = uciToSan(fl.fen, r1.pv, 4);

      const after = new Chess(fl.fen);
      after.move(fl.san);
      const fenAfter = after.fen();
      const r2 = await engine.analyse(fenAfter, { movetime: deepTime });
      const punishLine = uciToSan(fenAfter, r2.pv, 3);

      deep[fl.i] = { best: bestLine, punish: punishLine };

      // 깊은 탐색 기준으로 손해를 다시 계산 — 얕은 판정의 오탐을 걸러낸다
      const cp1 = whiteToMove ? toScore(r1) : -toScore(r1);
      const cp2 = whiteToMove ? toScore(r2) : -toScore(r2);
      const w1 = whiteToMove ? wp(cp1) : 100 - wp(cp1);
      const w2 = whiteToMove ? wp(cp2) : 100 - wp(cp2);
      const d2 = w1 - w2;
      verify[fl.i] = {
        best2: bestLine[0] || null,
        drop2: Math.round(d2 * 10) / 10,
        agree: d2 >= 8,
        same: (bestLine[0] || null) === fl.best,
        deep: true,
      };
    } catch (e) {
      if (sig.cancelled) throw e;
    }
    prog({ phase: 'deep', i: k + 1, n: flagged.length });
  }

  // ---- 3차: 💎 명수 판정 (다른 수를 뒀으면 크게 나빠졌을 국면에서 최선을 찾은 경우) ----
  const gems = [];
  if (opts.gems !== false) {
    const cand = [];
    for (let i = book; i < n; i++) {
      if (cls[i] !== 'best') continue;
      const m = moves[i];
      const tactical = !!m.captured || !!m.promotion || /[+#]/.test(m.san);
      if (!tactical) continue;
      const w = moves[i].color === 'w' ? wps[i] : 100 - wps[i];
      if (w < 5 || w > 97) continue;          // 이미 끝난 국면은 제외
      cand.push(i);
    }
    // 너무 오래 걸리지 않게 최대 6개만, 게임 전체에 고르게
    const pick = [];
    const step = Math.max(1, Math.ceil(cand.length / 6));
    for (let k = 0; k < cand.length && pick.length < 6; k += step) pick.push(cand[k]);

    for (let k = 0; k < pick.length; k++) {
      chk();
      const i = pick[k];
      const fen = moves[i].before;
      const whiteToMove = fen.split(' ')[1] === 'w';
      try {
        const res = await engine.analyseMulti(fen, { movetime: deepTime, multipv: 2 });
        if (!res[0] || !res[1]) continue;
        const s1 = toScore(res[0]), s2 = toScore(res[1]);
        const w1 = whiteToMove ? wp(s1) : wp(-s1);
        const w2 = whiteToMove ? wp(s2) : wp(-s2);
        const gain = Math.round((w1 - w2) * 10) / 10;
        const bestSan = uciToSan(fen, res[0].pv, 1)[0];
        if (gain >= 12 && bestSan === sans[i]) {
          gems.push({
            i, gain, alt: uciToSan(fen, res[1].pv, 1)[0] || null,
            sac: isSacrifice(fen, sans[i]),
          });
        }
      } catch (e) {
        if (sig.cancelled) throw e;
      }
      prog({ phase: 'gem', i: k + 1, n: pick.length });
    }
  }

  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const acc = { w: avg(accs.w) || 0, b: avg(accs.b) || 0 };

  const report = {
    opening, book,
    phase: { open_end: openEnd, end_start: endStart },
    wp: wps, cls, mw,
    pvs, bests: pvs.map((l) => l[0] || null),
    counts, acc,
    acc_ph: { w: accsPh.w.map(avg), b: accsPh.b.map(avg) },
    cpl: {
      w: cpls.w.length ? Math.round(cpls.w.reduce((a, b) => a + b, 0) / cpls.w.length) : 0,
      b: cpls.b.length ? Math.round(cpls.b.reduce((a, b) => a + b, 0) / cpls.b.length) : 0,
    },
    est: {
      w: Math.max(400, Math.min(2800, Math.round((acc.w * 25 - 480) / 10) * 10)),
      b: Math.max(400, Math.min(2800, Math.round((acc.b * 25 - 480) / 10) * 10)),
    },
    movetime: movetime / 1000,
    engine: engine.id.name || 'Stockfish',
    engine2: null,
    verify, deep, gems,
  };

  const meta = {
    white: headers.White || '?',
    black: headers.Black || '?',
    welo: headers.WhiteElo || '',
    belo: headers.BlackElo || '',
    date: (headers.Date || headers.UTCDate || '').replace(/\./g, '-'),
    result: headers.Result || '*',
    termination: headers.Termination || '',
    event: headers.Event || '',
    timeControl: headers.TimeControl || '',
    link: headers.Link || '',
  };

  return { meta, report, sans, pgn };
}
