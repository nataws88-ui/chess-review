/* 분석 결과(report) + PGN → 퀴즈 문제·복기 데이터.
 * 기존 make_quiz.py의 문제 생성/원인규명 로직을 그대로 옮겼다. */

import { Chess } from './lib/chess.js';

const PIECE_KO = { p: '폰', n: '나이트', b: '비숍', r: '룩', q: '퀸', k: '킹' };
const PVAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export function resultKo(res, term = '') {
  const m = { '1-0': '백 승', '0-1': '흑 승', '1/2-1/2': '무승부' }[res] || res || '진행중';
  return /스테일메이트|stalemate/i.test(term || '') ? m + '·스테일메이트' : m;
}

/** SAN 수순 → 화살표용 좌표 목록 */
export function lineMoves(fen, sans, limit = 3) {
  const c = new Chess(fen);
  const out = [];
  for (const s of (sans || []).slice(0, limit)) {
    let m;
    try { m = c.move(s); } catch (e) { break; }
    if (!m) break;
    out.push({ f: m.from, t: m.to, san: m.san });
  }
  return out;
}

/** 직접 움직여 답하기용: 현 국면의 모든 합법수 */
export function legalMovesData(fen) {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).map((m) => ({
    u: m.lan, f: m.from, t: m.to, x: m.isCapture(), san: m.san, fen: m.after,
  }));
}

/** 수 하나가 하는 일(캡처·체크·위협)을 한국어 사실 목록으로 */
export function moveFacts(fen, san) {
  const b = new Chess(fen);
  const mover = b.turn();
  let m;
  try { m = b.move(san); } catch (e) { return []; }
  if (!m) return [];
  const facts = [];
  if (m.isCastle && m.isCastle()) facts.push('캐슬링으로 킹 안전 확보');
  else if (m.isEnPassant && m.isEnPassant()) facts.push('앙파상으로 폰 획득');
  else if (m.captured) facts.push(`${PIECE_KO[m.captured] || '폰'} 획득`);
  if (m.promotion) facts.push(`${PIECE_KO[m.promotion] || '퀸'} 승격`);
  if (b.isCheckmate()) facts.push('체크메이트!');
  else if (b.isCheck()) facts.push('체크');

  const moved = b.get(m.to);
  const movedVal = moved ? PVAL[moved.type] : 9;
  const targets = [];
  for (const row of b.board()) {
    for (const cell of row || []) {
      if (!cell || cell.color === mover) continue;
      if (cell.type === 'p' || cell.type === 'k') continue;
      const v = PVAL[cell.type] || 0;
      if (v < 3) continue;
      const atkers = b.attackers(cell.square, mover);
      if (!atkers.includes(m.to)) continue;
      const dfd = b.attackers(cell.square, cell.color);
      if (!dfd.length || v > movedVal) targets.push(`${PIECE_KO[cell.type]}(${cell.square})`);
    }
  }
  if (targets.length >= 2) facts.push('양걸이! ' + targets.slice(0, 2).join('·') + ' 동시 위협');
  else if (targets.length) facts.push(targets[0] + ' 위협');
  return facts;
}

/** san을 둔 뒤 무방비/헐값에 잡히게 되는 내 기물(최고가치 1개) */
export function hangingAfter(fen, san) {
  const b = new Chess(fen);
  const me = b.turn();
  try { if (!b.move(san)) return null; } catch (e) { return null; }
  const enemy = me === 'w' ? 'b' : 'w';
  let worst = null;
  for (const row of b.board()) {
    for (const cell of row || []) {
      if (!cell || cell.color !== me || cell.type === 'k') continue;
      const v = PVAL[cell.type] || 0;
      if (v < 3) continue;
      const atk = b.attackers(cell.square, enemy);
      if (!atk.length) continue;
      const dfd = b.attackers(cell.square, me);
      const minAtk = Math.min(...atk.map((s) => PVAL[(b.get(s) || {}).type] || 0));
      if (atk.length > dfd.length || minAtk < v) {
        if (!worst || v > worst[0]) worst = [v, `${PIECE_KO[cell.type]}(${cell.square})`];
      }
    }
  }
  return worst ? worst[1] : null;
}

/** (최선을 뒀을 때 승률, 실전 수를 둔 뒤 승률) — 둔 쪽 관점 정수% */
export function winPcts(report, ply, side) {
  const arr = (report && report.wp) || [];
  const i = ply - 1;
  const before = i >= 1 ? arr[i - 1] : 50;
  const after = i < arr.length ? arr[i] : 50;
  return side === 'w'
    ? [Math.round(before), Math.round(after)]
    : [Math.round(100 - before), Math.round(100 - after)];
}

/** 원인 규명: [최선 이유, 실전 수 문제점] */
export function buildWhys(fen, played, best, report, ply, kind) {
  const facts = moveFacts(fen, best);
  let bestWhy = facts.length ? facts.join(' · ') : '국면을 가장 유리하게 이끄는 수';
  let playedWhy = '';
  if (report) {
    const pvs = report.pvs || [], wpArr = report.wp || [];
    const i = ply - 1;
    const pv = pvs[i] || [];
    if (pv.length > 1 && pv[0] === best) bestWhy += ` · 예상 수순: ${pv.join(' ')}`;
    const whiteToMove = fen.split(' ')[1] === 'w';
    const wpbW = i >= 1 ? wpArr[i - 1] : 50;
    const wpaW = i < wpArr.length ? wpArr[i] : 50;
    const wpb = whiteToMove ? wpbW : 100 - wpbW;
    const wpa = whiteToMove ? wpaW : 100 - wpaW;
    if (kind !== 'good') {
      const parts = [];
      const hang = hangingAfter(fen, played);
      if (hang) parts.push(`이 수 뒤 ${hang}이(가) 잡힐 위기`);
      const ref = pvs[i + 1] || [];
      if (ref.length) parts.push(`상대의 응징 수순: ${ref.join(' ')}`);
      parts.push(`승률 ${Math.round(wpb)}%→${Math.round(wpa)}% (${wpa - wpb >= 0 ? '+' : ''}${Math.round(wpa - wpb)}%p)`);
      playedWhy = parts.join(' · ');
    } else {
      bestWhy += ` · 승률 ${Math.round(wpb)}% 유지`;
    }
  }
  return [bestWhy, playedWhy];
}

const GLYPH = { blunder: '??', mistake: '?', inaccuracy: '?!', best: '', excellent: '', good: '', book: '' };

/* ---------------- 수 품질 10단계 (체스닷컴식) ----------------
 * 엔진 분류(report.cls)는 7단계지만, 여기에
 *   💎 gems(희생 여부) → 탁월/매우 좋아요,  mw(놓친 승리) → 놓친 수
 * 를 얹어 화면에는 10단계로 보여준다. 로직(문제 생성)은 원래 7단계를 그대로 쓴다. */
export const QUALITY = {
  brilliant: { g: '!!', ko: '탁월합니다', c: '#2BD3B0', tip: '기물을 내주고도 최선인 수' },
  great: { g: '!', ko: '매우 좋아요', c: '#7FB0E0', tip: '이것 말고는 크게 나빠지는, 사실상 유일한 수' },
  best: { g: '★', ko: '최고', c: '#A8D45C', tip: '엔진의 1순위와 같은 수' },
  excellent: { g: '👍', ko: '우수합니다', c: '#9CC96A', tip: '최선과 거의 차이 없는 수' },
  good: { g: '✓', ko: '좋습니다', c: '#A9BE9C', tip: '무난한 수' },
  book: { g: '📖', ko: '이론', c: '#C79E76', tip: '정석(오프닝 이론)에 있는 수' },
  inaccuracy: { g: '?!', ko: '부정확함', c: '#F7C631', tip: '승률을 조금 놓친 수' },
  mistake: { g: '?', ko: '실수', c: '#F0912E', tip: '승률을 크게 놓친 수' },
  miss: { g: '✗', ko: '놓친 수', c: '#FF8A7A', tip: '이겼어야 할 국면을 놓친 수' },
  blunder: { g: '??', ko: '블런더', c: '#FF5945', tip: '승부를 뒤집을 만큼 나쁜 수' },
};
export const QUALITY_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book',
  'inaccuracy', 'mistake', 'miss', 'blunder'];

/** report(7단계 cls) → 화면 표시용 10단계 배열 */
export function displayCls(report) {
  const out = ((report && report.cls) || []).slice();
  for (const g of (report && report.gems) || []) {
    if (g && out[g.i]) out[g.i] = g.sac ? 'brilliant' : 'great';
  }
  for (const i of (report && report.mw) || []) {
    if (out[i]) out[i] = 'miss';       // 놓친 승리는 실수/블런더보다 우선해 보여준다
  }
  return out;
}

/**
 * 저장된 게임 레코드 → 화면에서 쓰는 전체 데이터
 * @param rec {id, pgn, meta, report}
 * @param myName 내 아이디(카드의 '내 수' 판별용)
 */
export function buildGame(rec, myName = '', opts = {}) {
  const withLegals = opts.withLegals !== false;   // 목록·통계용으로 부를 땐 끄면 훨씬 빠르다
  const { report } = rec;
  const game = new Chess();
  game.loadPgn(rec.pgn, { strict: false });
  const moves = game.history({ verbose: true });
  const cls = (report && report.cls) || [];
  const dcls = displayCls(report);            // 표시용 10단계 (문제 생성 로직은 cls 그대로)
  const bests = (report && report.bests) || [];
  const pvs = (report && report.pvs) || [];
  const deep = (report && report.deep) || {};
  const verify = (report && report.verify) || {};
  const gems = new Map(((report && report.gems) || []).map((g) => [g.i, g]));

  const plies = [];
  const problems = [];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const side = m.color;
    const fenBefore = m.before;
    const c = cls[i] || '';
    const best = bests[i] || null;
    const glyph = GLYPH[c] || '';
    const mn = parseInt(fenBefore.split(' ')[5], 10);
    const prev = plies.length ? plies[plies.length - 1] : null;
    const key = `${mn}${side}`;
    const isMistake = (c === 'mistake' || c === 'blunder') && best && best !== m.san;
    const gem = gems.get(i);

    if (isMistake || gem) {
      const kind = isMistake ? 'mistake' : 'good';
      const bestSan = isMistake ? best : m.san;
      const item = { kind, best: bestSan };
      const bc = new Chess(fenBefore);
      let bmv = null;
      try { bmv = bc.move(bestSan); } catch (e) { bmv = null; }
      if (bmv) {
        item.accept = [bmv.lan];
        item.bf = bmv.from;
        item.bt = bmv.to;

        const [bw, pw] = buildWhys(fenBefore, m.san, bestSan, report, i + 1, kind);
        const dp = deep[i] || {};
        const bl = dp.best || pvs[i] || [bestSan];
        item.bestLine = lineMoves(fenBefore, bl, 4);
        if (kind !== 'good') {
          const pl = dp.punish || pvs[i + 1] || [];
          item.punishLine = [{ f: m.from, t: m.to, san: m.san }].concat(lineMoves(m.after, pl, 3));
        }
        const vf = verify[i];
        if (vf) {
          item.verify = { agree: vf.agree, same: vf.same, best2: vf.best2, deep: !!vf.deep };
          if (vf.best2 && vf.best2 !== bestSan && vf.best2 !== m.san) {
            try {
              const c2 = new Chess(fenBefore);
              const mv2 = c2.move(vf.best2);
              if (mv2) item.accept.push(mv2.lan);
            } catch (e) { /* 무시 */ }
          }
        }
        if (gem) { item.gemGain = gem.gain; item.gemAlt = gem.alt; }
        const [wpB, wpP] = winPcts(report, i + 1, side);
        Object.assign(item, {
          id: key, ply: i + 1, mn, side, fen: fenBefore,
          moveLabel: `${mn}수째 · ${side === 'w' ? '백' : '흑'} 차례`,
          played: m.san, playedGlyph: glyph,
          pf: m.from, pt: m.to,
          prevF: prev ? prev.frm : '', prevT: prev ? prev.to : '',
          legals: withLegals ? legalMovesData(fenBefore) : null,
          bestWhy: bw, playedWhy: pw,
          wpB, wpP,
        });
        problems.push(item);
      }
    }

    plies.push({
      san: m.san, glyph, frm: m.from, to: m.to, fen: m.after,
      hint: best || '', mn, side, cls: dcls[i] || c, raw: c,
      bestLine: lineMoves(fenBefore, pvs[i] || (best ? [best] : []), 3),
    });
  }

  // ---- 훈련(SRS) 카드 ----
  const cards = problems.map((p) => {
    const mover = p.side === 'w' ? rec.meta.white : rec.meta.black;
    const start = Math.max(0, p.ply - 9);
    let ctx = start > 0 ? '… ' : '';
    for (let i = start; i < p.ply - 1; i++) {
      const q = plies[i];
      if (q.side === 'w') ctx += `${q.mn}. `;
      ctx += `${q.san}${q.glyph} `;
    }
    return {
      ...p,
      id: `${rec.id}#${p.id}`,
      gameId: rec.id,
      g: `${rec.meta.white} vs ${rec.meta.black}`,
      d: rec.meta.date,
      mine: !!myName && mover.toLowerCase() === myName.toLowerCase(),
      ctx: ctx.trim(),
    };
  });

  return {
    meta: rec.meta, plies, problems, cards, report,
    startFen: moves.length ? moves[0].before : undefined,
  };
}

/** 리포트의 품질 카운트 → 좋음/부정확/실수 비율 */
export function qualityPct(counts) {
  const gd = ['book', 'best', 'excellent', 'good', 'brilliant', 'great']
    .reduce((a, k) => a + (counts[k] || 0), 0);
  const yl = counts.inaccuracy || 0;
  const rd = (counts.mistake || 0) + (counts.blunder || 0) + (counts.miss || 0);
  const tot = Math.max(1, gd + yl + rd);
  return { g: Math.round(gd * 1000 / tot) / 10, y: Math.round(yl * 1000 / tot) / 10, r: Math.round(rd * 1000 / tot) / 10 };
}
