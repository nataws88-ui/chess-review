/* PGN 엔진 분석.
 *
 * 뿌리는 기존 analyze.py 지만 아래 세 가지가 달라졌다.
 *  - 2차 엔진(GNU Chess) 대신 "깊은 재탐색"으로 실수를 재검증한다.
 *  - 승률은 스톡피시가 직접 내놓는 WDL(승/무/패 확률)을 쓴다. 못 쓰면 시그모이드로 되돌아간다.
 *  - 정확도는 단순 평균이 아니라 변동성 가중평균과 반반으로 섞은 값이다. */

import { Chess } from './lib/chess.js';
import engine, { toScore, wdlPct } from './engine.js';
import { findOpening } from './openings.js';

export { findOpening };

/** centipawn → 승률%(백 관점, lichess 공식) */
export function wp(cp) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** 수 하나의 정확도(lichess 공식) */
export function moveAcc(drop) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669));
}

/* 등급 경계(승률 하락 %p). 시그모이드 시절에 맞춰 잡은 값을 WDL 로 바꾼 뒤에도 그대로 둔다.
 * 같은 3판 243수로 두 모델을 직접 비교해 보니 "실수+블런더" 총수가 26 vs 27 로 거의 같았다.
 * 대신 WDL 은 분포가 양 끝으로 몰린다 — 이미 결판난 국면의 수는 하락폭이 0 이고,
 * 승부가 걸린 수만 크게 튄다. 등급이 최고·우수와 블런더 쪽으로 갈리는 건 그래서다. */
export function classify(played, best, drop) {
  if (best && played === best) return 'best';
  if (drop < 2) return 'excellent';
  if (drop < 5) return 'good';
  if (drop < 12) return 'inaccuracy';
  if (drop < 25) return 'mistake';
  return 'blunder';
}

/* ---------------- 정확도 ----------------
 * 수마다 낸 정확도를 그냥 평균 내면, 이미 이기고 있어 아무 수나 둬도 되는 국면이
 * 실제 어려웠던 국면과 같은 무게를 갖는다. 그래서 국면이 요동치던 구간
 * (승률 표준편차)에 가중치를 준 평균을 함께 내고, 단순평균과 반반으로 섞는다.
 *
 * 이 비율은 짐작이 아니라 맞춰본 값이다 — 체스닷컴이 직접 매긴 정확도가 있는
 * 실제 경기 6판(12명분)과 대조했다(2026-08-12):
 *     단순평균만       편차 +3.8  평균오차 5.0
 *     가중평균만       편차 -3.5  평균오차 5.0
 *     반반(채택)       편차 +0.1  평균오차 3.3
 *     리체스식(조화평균 섞기)  편차 -14.3 → 우리 승률 모델(WDL)과 겹쳐 과하게 깎였다
 * 조화평균을 안 쓰는 이유가 이것이다. WDL 승률은 리체스의 시그모이드보다
 * 훨씬 가파르게 움직여서, 조화평균까지 얹으면 같은 실수를 두 번 벌준다. */

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}

/**
 * @param {number[]} winsWhite 국면별 백 관점 기대득점% — [시작국면, 1수 뒤, 2수 뒤, …]
 * @returns {{w:number, b:number}} 색깔별 정확도%
 */
export function gameAccuracy(winsWhite) {
  const N = winsWhite.length;
  if (N < 2) return { w: 0, b: 0 };
  const win = Math.max(2, Math.min(8, Math.floor(N / 10)));

  // 앞쪽 수들도 창을 가지도록 첫 창을 (win-1)번 채워 넣는다
  const windows = [];
  const head = winsWhite.slice(0, win);
  for (let k = 0; k < win - 1; k++) windows.push(head);
  for (let i = 0; i + win <= N; i++) windows.push(winsWhite.slice(i, i + win));
  const weights = windows.map((xs) => Math.max(0.5, Math.min(12, stdev(xs))));

  const acc = { w: [], b: [] };
  const wt = { w: [], b: [] };
  for (let i = 0; i + 1 < N; i++) {
    const side = i % 2 === 0 ? 'w' : 'b';
    const prev = side === 'w' ? winsWhite[i] : 100 - winsWhite[i];
    const next = side === 'w' ? winsWhite[i + 1] : 100 - winsWhite[i + 1];
    acc[side].push(moveAcc(prev - next));
    wt[side].push(weights[i] == null ? 0.5 : weights[i]);
  }

  const out = {};
  for (const s of ['w', 'b']) {
    const a = acc[s], g = wt[s];
    if (!a.length) { out[s] = 0; continue; }
    const sum = g.reduce((x, y) => x + y, 0) || 1;
    const weighted = a.reduce((x, v, i) => x + v * g[i], 0) / sum;
    const mean = a.reduce((x, v) => x + v, 0) / a.length;
    out[s] = Math.round(((weighted + mean) / 2) * 10) / 10;
  }
  return out;
}

/* ---------------- 시간 (PGN 의 %clk 주석) ---------------- */

/** PGN → 수마다 "그 수를 두고 난 뒤 남은 시간(초)" */
export function parseClocks(pgn) {
  const out = [];
  const rx = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/g;
  let m;
  while ((m = rx.exec(String(pgn || '')))) out.push(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
  return out;
}

/** "600+5" → {base:600, inc:5} */
export function parseTimeControl(tc) {
  const m = /^(\d+)(?:\+(\d+))?/.exec(String(tc || ''));
  if (!m) return null;
  return { base: +m[1], inc: m[2] ? +m[2] : 0 };
}

/** 남은 시간 배열 → 수마다 실제로 쓴 시간(초). 못 구하면 null */
export function thinkTimes(clocks, tc) {
  if (!clocks || clocks.length < 2) return null;
  const t = parseTimeControl(tc);
  const inc = t ? t.inc : 0;
  const base = t ? t.base : clocks[0] + clocks[1] > 0 ? Math.max(clocks[0], clocks[1]) : 0;
  const out = [];
  for (let i = 0; i < clocks.length; i++) {
    const before = i >= 2 ? clocks[i - 2] : base;
    const spent = before - clocks[i] + inc;
    // 시계가 없거나 튄 값은 버린다
    out.push(spent >= 0 && spent < 24 * 3600 ? Math.round(spent * 10) / 10 : null);
  }
  return out;
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

  /** 탐색 결과 → "둘 차례 쪽" 기대득점%. 엔진이 WDL을 주면 그걸 쓰고, 없으면 시그모이드 */
  const moverWin = (r) => {
    const p = wdlPct(r && r.wdl);
    return p == null ? wp(toScore(r)) : p;
  };

  /** 탐색 결과 → 백 관점 기대득점% */
  const whiteWin = (r, whiteToMove, cpWhite) => {
    const p = wdlPct(r && r.wdl);
    if (p == null) return wp(cpWhite);
    return whiteToMove ? p : 100 - p;
  };

  // ---- 1차: 전 국면 스캔 ----
  const evals = [];   // [{cp(백관점), w(백관점 기대득점%), best(SAN)}]
  const pvs = [];     // [[SAN x3]]
  const sans = moves.map((m) => m.san);
  let usedWdl = false;

  for (let i = 0; i < n; i++) {
    chk();
    const fen = moves[i].before;
    const r = await engine.analyse(fen, { movetime });
    const whiteToMove = fen.split(' ')[1] === 'w';
    const raw = toScore(r);
    const cp = whiteToMove ? raw : -raw;
    if (r.wdl) usedWdl = true;
    const line = uciToSan(fen, r.pv, 3);
    pvs.push(line);
    evals.push({ cp, w: whiteWin(r, whiteToMove, cp), best: line[0] || null });
    prog({ phase: 'scan', i: i + 1, n });
  }

  // 마지막 국면
  const last = new Chess(moves[n - 1].after);
  let finalCp, finalW;
  if (last.isGameOver()) {
    finalCp = last.isCheckmate() ? (last.turn() === 'w' ? -10000 : 10000) : 0;
    finalW = last.isCheckmate() ? (last.turn() === 'w' ? 0 : 100) : 50;
  } else {
    const r = await engine.analyse(moves[n - 1].after, { movetime });
    const whiteToMove = last.turn() === 'w';
    finalCp = whiteToMove ? toScore(r) : -toScore(r);
    finalW = whiteWin(r, whiteToMove, finalCp);
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
  const accsPh = { w: [[], [], []], b: [[], [], []] };
  const cpls = { w: [], b: [] };
  const flagged = [];

  for (let i = 0; i < n; i++) {
    const whiteMoved = moves[i].color === 'w';
    const side = whiteMoved ? 'w' : 'b';
    const { cp: cpBefore, w: wwBefore, best } = evals[i];
    const cpAfter = i + 1 < n ? evals[i + 1].cp : finalCp;
    const wwAfter = i + 1 < n ? evals[i + 1].w : finalW;
    const wB = whiteMoved ? wwBefore : 100 - wwBefore;
    const wA = whiteMoved ? wwAfter : 100 - wwAfter;
    const drop = wB - wA;
    wps.push(Math.round(wwAfter * 10) / 10);

    const c = i < book ? 'book' : classify(sans[i], best, drop);
    cls.push(c);
    const missedWin = wB >= 80 && wA < 55;
    if (missedWin) { mw.push(i); counts[side].mw = (counts[side].mw || 0) + 1; }
    counts[side][c] = (counts[side][c] || 0) + 1;

    const a = moveAcc(drop);
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
    try {
      // 후보수 3개를 한 번에 — 최선 말고 어떤 선택지가 있었는지 보여준다
      const rs = await engine.analyseMulti(fl.fen, { movetime: deepTime, multipv: 3 });
      const r1 = rs[0];
      if (!r1) { prog({ phase: 'deep', i: k + 1, n: flagged.length }); continue; }
      const bestLine = uciToSan(fl.fen, r1.pv, 4);

      const alts = [];
      for (const r of rs) {
        if (!r || !r.pv || !r.pv.length) continue;
        const line = uciToSan(fl.fen, r.pv, 3);
        if (!line.length) continue;
        alts.push({
          san: line[0],
          cp: toScore(r),                                  // 둔 쪽 관점
          w: Math.round(moverWin(r) * 10) / 10,
          line,
          played: line[0] === fl.san,
        });
      }

      const after = new Chess(fl.fen);
      after.move(fl.san);
      const fenAfter = after.fen();
      const r2 = await engine.analyse(fenAfter, { movetime: deepTime });
      const punishLine = uciToSan(fenAfter, r2.pv, 3);

      deep[fl.i] = { best: bestLine, punish: punishLine, alts };

      // 깊은 탐색 기준으로 손해를 다시 계산 — 얕은 판정의 오탐을 걸러낸다
      const w1 = moverWin(r1);              // 최선을 뒀을 때 (둔 쪽 관점)
      const w2 = 100 - moverWin(r2);        // 실전 수를 둔 뒤, 상대 차례에서 뒤집어 본 값
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
      try {
        const res = await engine.analyseMulti(fen, { movetime: deepTime, multipv: 2 });
        if (!res[0] || !res[1]) continue;
        const gain = Math.round((moverWin(res[0]) - moverWin(res[1])) * 10) / 10;
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
  const wp0 = Math.round(evals[0].w * 10) / 10;
  const acc = gameAccuracy([wp0, ...wps]);

  // 시간 (체스닷컴·리체스 PGN 에 %clk 가 있을 때만)
  const clocks = parseClocks(pgn);
  const think = clocks.length === n ? thinkTimes(clocks, headers.TimeControl) : null;

  const report = {
    opening, book,
    phase: { open_end: openEnd, end_start: endStart },
    wp: wps, wp0, cls, mw,
    pvs, bests: pvs.map((l) => l[0] || null),
    counts, acc,
    accv: 3,                       // 정확도 계산 방식 번호 (1=단순평균, 3=단순+변동성가중 반반)
    wsrc: usedWdl ? 'wdl' : 'cp',  // 승률을 무엇으로 냈는가
    acc_ph: { w: accsPh.w.map(avg), b: accsPh.b.map(avg) },
    cpl: {
      w: cpls.w.length ? Math.round(cpls.w.reduce((a, b) => a + b, 0) / cpls.w.length) : 0,
      b: cpls.b.length ? Math.round(cpls.b.reduce((a, b) => a + b, 0) / cpls.b.length) : 0,
    },
    est: {
      w: Math.max(400, Math.min(2800, Math.round((acc.w * 25 - 480) / 10) * 10)),
      b: Math.max(400, Math.min(2800, Math.round((acc.b * 25 - 480) / 10) * 10)),
    },
    clk: clocks.length === n ? clocks : null,
    think,
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
    time: headers.UTCTime || headers.StartTime || '',
    result: headers.Result || '*',
    termination: headers.Termination || '',
    event: headers.Event || '',
    timeControl: headers.TimeControl || '',
    link: headers.Link || '',
  };

  return { meta, report, sans, pgn };
}
