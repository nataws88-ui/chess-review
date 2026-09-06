/* 국면 읽기 — 「지금 판에서 무엇이 걸려 있는가」를 겹쳐 그릴 자료로 뽑아낸다.
 *
 * Chessis 의 Key Elements / Threats 를 이식한 것이다. 다만 그쪽은 대부분 엔진 없이
 * 판만 보고 판정하는데, 우리는 전술·메이트 위협에 스톡피시를 쓸 수 있으므로
 * 엔진이 있으면 더 정확한 값을 쓰고 없으면 판만 보는 방식으로 되돌아간다.
 *
 * 모든 함수는 순수 함수다 — FEN 을 받아 목록을 돌려준다. 화면은 board.js 가 그린다. */

import { Chess } from './lib/chess.js';

export const PVAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const FILES = 'abcdefgh';

const fileIdx = (sq) => FILES.indexOf(sq[0]);
const rankIdx = (sq) => parseInt(sq[1], 10) - 1;
const sqAt = (f, r) => (f < 0 || f > 7 || r < 0 || r > 7 ? null : FILES[f] + (r + 1));
const other = (c) => (c === 'w' ? 'b' : 'w');

/** 판 위 기물 전부 [{square, type, color}] */
export function pieces(chess) {
  const out = [];
  for (const row of chess.board()) for (const cell of row || []) if (cell) out.push(cell);
  return out;
}

/** 왕이 있는 칸 */
export function kingSquare(chess, color) {
  const k = pieces(chess).find((p) => p.type === 'k' && p.color === color);
  return k ? k.square : null;
}

/* 차례를 억지로 바꾼 판.
 * 상대 킹이 이미 잡히는 상태면 그 국면은 성립하지 않는다 — 그대로 두면
 * chess.js 가 "왕을 잡는 수"까지 만들어 내서 위협이 엉뚱하게 뜬다. */
function flipped(fen, side) {
  const parts = String(fen).split(' ');
  parts[1] = side;
  parts[3] = '-';                       // 앙파상은 차례를 바꾸면 뜻이 없어진다
  let c;
  try { c = new Chess(parts.join(' '), { skipValidation: true }); } catch (e) { return null; }
  const foeKing = kingSquare(c, other(side));
  if (!foeKing || c.isAttacked(foeKing, side)) return null;
  return c;
}

/* ---------------------------------------------------------------- 핀 */

/**
 * 핀 걸린 기물 — 그 기물을 치우면 뒤에 있는 더 값진 기물(보통 킹)이 뚫린다.
 * 절대핀(뒤가 킹)과 상대핀(뒤가 더 값진 기물)을 나눠 준다.
 * @returns [{square, type, color, by, target, absolute}]
 */
export function pinnedPieces(fen) {
  const c = new Chess(fen, { skipValidation: true });
  const out = [];
  const board = pieces(c);
  const sliders = board.filter((p) => p.type === 'b' || p.type === 'r' || p.type === 'q');

  const DIRS = {
    b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
  };

  for (const s of sliders) {
    const sf = fileIdx(s.square), sr = rankIdx(s.square);
    for (const [df, dr] of DIRS[s.type]) {
      let first = null;
      for (let k = 1; k <= 7; k++) {
        const sq = sqAt(sf + df * k, sr + dr * k);
        if (!sq) break;
        const p = c.get(sq);
        if (!p) continue;
        if (!first) {
          // 첫 기물이 상대 기물이어야 핀이 성립한다
          if (p.color === s.color) break;
          first = { ...p, square: sq };
          continue;
        }
        // 두 번째 기물이 같은 편(=핀 당하는 쪽)의 더 값진 기물이면 핀
        if (p.color === first.color && PVAL[p.type] > PVAL[first.type]) {
          out.push({
            square: first.square, type: first.type, color: first.color,
            by: s.square, target: sq, absolute: p.type === 'k',
          });
        }
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------- 무방비 기물 */

/**
 * 무방비 기물 — 상대가 노리고 있는데 아군이 지켜 주지 않거나, 지켜도 손해인 기물.
 * @param {string} fen
 * @param {'w'|'b'|null} side  null 이면 양쪽 다
 * @returns [{square, type, color, loss}]  loss = 최선으로 교환했을 때 잃을 점수
 */
export function undefendedPieces(fen, side = null) {
  const c = new Chess(fen, { skipValidation: true });
  const out = [];
  for (const p of pieces(c)) {
    if (p.type === 'k') continue;
    if (side && p.color !== side) continue;
    const atk = c.attackers(p.square, other(p.color));
    if (!atk.length) continue;
    const def = c.attackers(p.square, p.color);
    const v = PVAL[p.type];
    const minAtk = Math.min(...atk.map((s) => PVAL[(c.get(s) || {}).type] || 0));
    // 아무도 안 지키거나, 더 싼 기물이 잡을 수 있으면 손해
    if (!def.length) out.push({ ...p, loss: v });
    else if (minAtk < v) out.push({ ...p, loss: v - minAtk });
  }
  return out;
}

/** 아무도 지켜 주지 않는 기물(공격을 안 받아도) — Chessis 의 "Unsupported pieces" */
export function unsupportedPieces(fen, side = null) {
  const c = new Chess(fen, { skipValidation: true });
  const out = [];
  for (const p of pieces(c)) {
    if (p.type === 'k') continue;
    if (side && p.color !== side) continue;
    if (!c.attackers(p.square, p.color).length) out.push({ ...p });
  }
  return out;
}

/* ------------------------------------------------------------ 활동성 */

/**
 * 기물 활동성 — 기물마다 갈 수 있는 칸 수. 상대 차례 기물도 세려면 FEN 의
 * 차례를 바꿔 한 번 더 센다(합법수는 차례인 쪽만 나오므로).
 * @returns {{w:{square:count}, b:{...}, sum:{w,b}}}
 */
export function mobility(fen) {
  const out = { w: {}, b: {}, sum: { w: 0, b: 0 } };
  for (const side of ['w', 'b']) {
    const c = flipped(fen, side);
    if (!c) continue;
    let ms;
    try { ms = c.moves({ verbose: true }); } catch (e) { continue; }
    for (const m of ms) {
      out[side][m.from] = (out[side][m.from] || 0) + 1;
      out.sum[side]++;
    }
  }
  return out;
}

/* --------------------------------------------------------------- 폰 */

/** 폰 구조 — 고립·뒤처짐·통과·이중 */
export function pawnStructure(fen) {
  const c = new Chess(fen, { skipValidation: true });
  const all = pieces(c).filter((p) => p.type === 'p');
  const byFile = { w: {}, b: {} };
  for (const p of all) (byFile[p.color][fileIdx(p.square)] ||= []).push(rankIdx(p.square));

  const isolated = [], backward = [], passed = [], doubled = [];

  for (const p of all) {
    const f = fileIdx(p.square), r = rankIdx(p.square);
    const me = byFile[p.color], foe = byFile[other(p.color)];
    const fwd = p.color === 'w' ? 1 : -1;

    // 고립 — 양 옆 줄에 아군 폰이 없다
    if (!(me[f - 1] || []).length && !(me[f + 1] || []).length) isolated.push({ ...p });

    // 이중 — 같은 줄에 아군 폰이 둘 이상
    if ((me[f] || []).length > 1) doubled.push({ ...p });

    // 통과 — 앞쪽(같은 줄·양옆 줄)에 상대 폰이 하나도 없다
    let blocked = false;
    for (const ff of [f - 1, f, f + 1]) {
      for (const rr of foe[ff] || []) {
        if (fwd > 0 ? rr > r : rr < r) { blocked = true; break; }
      }
      if (blocked) break;
    }
    if (!blocked) passed.push({ ...p });

    // 뒤처짐 — 옆 줄 아군 폰이 전부 나보다 앞에 있고, 한 칸 전진하면 상대 폰에게 잡힌다
    const nb = [...(me[f - 1] || []), ...(me[f + 1] || [])];
    if (nb.length && nb.every((rr) => (fwd > 0 ? rr > r : rr < r))) {
      const front = sqAt(f, r + fwd);
      if (front && !c.get(front)) {
        const guarded = [f - 1, f + 1].some((ff) =>
          (foe[ff] || []).some((rr) => rr === r + fwd * 2));
        if (guarded) backward.push({ ...p });
      }
    }
  }
  return { isolated, backward, passed, doubled };
}

/* ------------------------------------------------------- 잡히기 쉬운 킹 */

/**
 * 잡히기 쉬운 킹 — 지금 상대가 걸 수 있는 체크가 있는가.
 * Chessis 의 설명대로 "대부분의 전술은 체크에서 시작"하므로, 체크 가능한 칸을 보여 준다.
 * @returns {{color, square, checks:[{from,to,san}]}|null} side 쪽 킹 기준
 */
export function checkableKing(fen, side) {
  const c = flipped(fen, other(side));
  if (!c) return null;
  let ms;
  try { ms = c.moves({ verbose: true }); } catch (e) { return null; }
  const checks = ms.filter((m) => /[+#]/.test(m.san))
    .map((m) => ({ from: m.from, to: m.to, san: m.san }));
  const king = pieces(c).find((p) => p.type === 'k' && p.color === side);
  if (!king) return null;
  return { color: side, square: king.square, checks };
}

/* --------------------------------------------------------- 발견 공격 */

/**
 * 발견 공격 — 앞에 선 아군 기물이 비켜 주면 뒤의 슬라이더가 상대 기물을 때린다.
 * @returns [{square, by, target, gain}]  square=비켜 줄 기물
 */
export function discoveredAttacks(fen, side) {
  const c = new Chess(fen, { skipValidation: true });
  const out = [];
  const DIRS = {
    b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
  };
  for (const s of pieces(c)) {
    if (s.color !== side || !DIRS[s.type]) continue;
    const sf = fileIdx(s.square), sr = rankIdx(s.square);
    for (const [df, dr] of DIRS[s.type]) {
      let blocker = null;
      for (let k = 1; k <= 7; k++) {
        const sq = sqAt(sf + df * k, sr + dr * k);
        if (!sq) break;
        const p = c.get(sq);
        if (!p) continue;
        if (!blocker) {
          if (p.color !== side) break;          // 상대 기물이 막고 있으면 발견 공격이 아니다
          blocker = { ...p, square: sq };
          continue;
        }
        // 막고 있던 아군이 비키면 이 상대 기물이 슬라이더에게 노출된다
        if (p.color !== side && PVAL[p.type] >= 3) {
          out.push({ square: blocker.square, by: s.square, target: sq, gain: PVAL[p.type] });
        }
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------- 포크 가능 칸 */

/**
 * 포크 가능 칸 — 내 기물을 그 칸에 두면 상대의 값진 기물 둘 이상을 동시에 찌른다.
 * 실제로 갈 수 있는 칸만 본다(합법수 기준).
 * @returns [{from, to, piece, targets:[square], safe}]
 */
export function forkSquares(fen, side) {
  const base = flipped(fen, side);
  if (!base) return [];
  const flat = base.fen();
  let ms;
  try { ms = base.moves({ verbose: true }); } catch (e) { return []; }

  const out = [];
  for (const m of ms) {
    const c = new Chess(flat, { skipValidation: true });
    try { c.move(m.san); } catch (e) { continue; }
    // 둔 뒤 그 기물이 때리는 상대 기물들
    const moved = c.get(m.to);
    if (!moved) continue;
    const hits = [];
    for (const p of pieces(c)) {
      if (p.color === side || p.type === 'p') continue;
      if (c.attackers(p.square, side).includes(m.to)) {
        if (PVAL[p.type] > PVAL[moved.type] || p.type === 'k') hits.push(p.square);
      }
    }
    if (hits.length < 2) continue;
    // 그 칸이 안전한가 (상대가 그냥 잡아 버리면 포크가 아니다)
    const atk = c.attackers(m.to, other(side));
    const def = c.attackers(m.to, side);
    const safe = !atk.length || def.length > 0;
    out.push({ from: m.from, to: m.to, piece: moved.type, targets: hits, safe });
  }
  // 안전한 것 · 노획 가치 큰 것 우선
  out.sort((a, b) => (b.safe - a.safe) || (b.targets.length - a.targets.length));
  return out.slice(0, 6);
}

/* ============================================================ 위협 */

/**
 * 위협 — "지금 상대 차례라면 무엇을 둘까".
 * 엔진 없이 판만 보고 낸다(대국 중에도 즉시 뜨게).
 *  - material : 재료를 딸 수 있는 수
 *  - mate     : 1~2수 강제 메이트
 * @param {string} fen
 * @param {'w'|'b'} by  위협하는 쪽 (보통 상대)
 * @returns [{from,to,san,kind,gain}]
 */
export function staticThreats(fen, by) {
  const c = flipped(fen, by);
  if (!c) return [];
  const flat = c.fen();
  let ms;
  try { ms = c.moves({ verbose: true }); } catch (e) { return []; }

  const out = [];
  for (const m of ms) {
    const t = new Chess(flat, { skipValidation: true });
    try { t.move(m.san); } catch (e) { continue; }

    if (t.isCheckmate()) { out.push({ from: m.from, to: m.to, san: m.san, kind: 'mate', gain: 100 }); continue; }

    // 잡는 수 — 교환해서 남는 이득
    if (m.captured) {
      const got = PVAL[m.captured] || 0;
      const risk = t.attackers(m.to, other(by)).length ? (PVAL[m.piece] || 0) : 0;
      const back = t.attackers(m.to, by).length ? 0 : risk;   // 되잡아 줄 아군이 있으면 위험 완화
      const gain = got - back;
      if (gain > 0) out.push({ from: m.from, to: m.to, san: m.san, kind: 'material', gain });
      continue;
    }

    // 안 잡는 수인데 다음 수에 크게 딸 수 있는 경우(포크·꼬치)
    const moved = t.get(m.to);
    if (!moved) continue;
    let hits = 0, best = 0;
    for (const p of pieces(t)) {
      if (p.color === by || p.type === 'k') continue;
      if (!t.attackers(p.square, by).includes(m.to)) continue;
      const guarded = t.attackers(p.square, other(by)).length;
      if (PVAL[p.type] > PVAL[moved.type] || !guarded) { hits++; best = Math.max(best, PVAL[p.type]); }
    }
    if (hits >= 2 && !t.attackers(m.to, other(by)).length) {
      out.push({ from: m.from, to: m.to, san: m.san, kind: 'material', gain: best });
    }
  }

  out.sort((a, b) => (a.kind === 'mate' ? -1 : b.kind === 'mate' ? 1 : b.gain - a.gain));
  // 같은 도착 칸 중복 제거
  const seen = new Set();
  return out.filter((x) => (seen.has(x.to) ? false : (seen.add(x.to), true))).slice(0, 4);
}

/* ============================================================ 묶음 */

export const KEY_ELEMENTS = [
  ['pin', '핀 걸린 기물', '움직이면 뒤에 있는 더 값진 기물이 뚫린다. 핀 걸린 기물은 지키는 일을 제대로 못 한다.'],
  ['undef', '지켜지지 않는 기물', '아군이 아무도 받쳐 주지 않는 기물. 대부분의 전술은 여기서 시작한다.'],
  ['mobility', '기물 활동성', '기물마다 갈 수 있는 칸 수. 숫자가 작은 쪽이 답답한 국면이다.'],
  ['passed', '통과한 폰', '앞을 막을 상대 폰이 없는 폰. 엔드게임에서 그대로 승부가 된다.'],
  ['isolated', '고립 폰', '옆 줄에 아군 폰이 없어 폰으로는 못 지키는 폰. 보통 약점이다.'],
  ['backward', '뒤처진 폰', '옆 폰들보다 뒤에 남아 전진이 막힌 폰. 앞 칸이 상대 진영의 거점이 된다.'],
  ['king', '잡히기 쉬운 킹', '지금 상대가 걸 수 있는 체크. 전술은 거의 체크에서 시작한다.'],
  ['discover', '발견 공격', '앞의 아군이 비켜 주면 뒤의 비숍·룩·퀸이 바로 때린다.'],
  ['fork', '포크 가능 칸', '그 칸에 두면 상대 기물 둘을 동시에 찌른다.'],
];

export const DEFAULT_ELEMS = { pin: true, undef: true, mobility: false, passed: true,
  isolated: false, backward: false, king: false, discover: false, fork: false };

/**
 * 켜 놓은 요소만 모아 화면이 바로 쓸 수 있는 모양으로.
 * @param {string} fen
 * @param {object} on   {pin:true, undef:true, ...}
 * @param {'w'|'b'} me  "내 쪽" (킹·발견공격·포크는 한쪽 관점이라 필요하다)
 * @returns {{marks:{sq:[type]}, arrows:[], numbers:{sq:n}, notes:[string]}}
 */
export function readPosition(fen, on = DEFAULT_ELEMS, me = null) {
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const side = me || turn;
  const marks = {}, arrows = [], numbers = {}, notes = [];
  const add = (sq, t) => { if (sq) (marks[sq] = marks[sq] || []).push(t); };

  if (on.pin) {
    const ps = pinnedPieces(fen);
    for (const p of ps) {
      add(p.square, 'ke-pin');
      arrows.push({ f: p.by, t: p.target, kind: 'pin', thin: true, number: false });
    }
    if (ps.length) notes.push(`📌 핀 ${ps.length}개`);
  }
  if (on.undef) {
    const us = unsupportedPieces(fen);
    for (const p of us) add(p.square, 'ke-undef');
    if (us.length) notes.push(`🛡 지켜지지 않는 기물 ${us.length}개`);
  }
  if (on.mobility) {
    const mb = mobility(fen);
    Object.assign(numbers, mb.w, mb.b);
    notes.push(`♻ 활동성 백 ${mb.sum.w} · 흑 ${mb.sum.b}`);
  }
  if (on.passed || on.isolated || on.backward) {
    const pw = pawnStructure(fen);
    if (on.passed) for (const p of pw.passed) add(p.square, 'ke-passed');
    if (on.isolated) for (const p of pw.isolated) add(p.square, 'ke-isolated');
    if (on.backward) for (const p of pw.backward) add(p.square, 'ke-backward');
    const bits = [];
    if (on.passed && pw.passed.length) bits.push(`통과 폰 ${pw.passed.length}`);
    if (on.isolated && pw.isolated.length) bits.push(`고립 폰 ${pw.isolated.length}`);
    if (on.backward && pw.backward.length) bits.push(`뒤처진 폰 ${pw.backward.length}`);
    if (bits.length) notes.push('♟ ' + bits.join(' · '));
  }
  if (on.king) {
    const k = checkableKing(fen, side);
    if (k && k.checks.length) {
      add(k.square, 'ke-king');
      for (const ch of k.checks.slice(0, 3)) add(ch.to, 'ke-checksq');
      notes.push(`♚ 걸 수 있는 체크 ${k.checks.length}개`);
    }
  }
  if (on.discover) {
    const ds = discoveredAttacks(fen, side);
    for (const d of ds.slice(0, 3)) {
      add(d.square, 'ke-discover');
      arrows.push({ f: d.by, t: d.target, kind: 'discover', thin: true, number: false });
    }
    if (ds.length) notes.push(`💥 발견 공격 ${ds.length}개`);
  }
  if (on.fork) {
    const fs = forkSquares(fen, side);
    for (const f of fs.slice(0, 2)) {
      add(f.to, f.safe ? 'ke-fork' : 'ke-forkrisky');
      for (const t of f.targets) add(t, 'ke-forktarget');
    }
    if (fs.length) notes.push(`🍴 포크 가능 ${fs.length}곳`);
  }
  return { marks, arrows, numbers, notes };
}

/**
 * 위협 → 화면용. mode 는 {material, mate, undef} 켬/끔.
 * @returns {{marks, arrows, notes}}
 */
export function readThreats(fen, by, mode = { material: true, mate: true, undef: true }) {
  const marks = {}, arrows = [], notes = [];
  const add = (sq, t) => { if (sq) (marks[sq] = marks[sq] || []).push(t); };

  const th = staticThreats(fen, by);
  for (const t of th) {
    if (t.kind === 'mate' && !mode.mate) continue;
    if (t.kind === 'material' && !mode.material) continue;
    arrows.push({ f: t.from, t: t.to, kind: t.kind === 'mate' ? 'mateThreat' : 'threat', san: t.san, number: false });
    add(t.to, 'th-square');
  }
  if (mode.undef) {
    for (const p of undefendedPieces(fen, by === 'w' ? 'b' : 'w')) add(p.square, 'th-hang');
  }
  const mate = th.find((t) => t.kind === 'mate');
  if (mate) notes.push(`⚠ 메이트 위협: ${mate.san}`);
  else if (th.length) notes.push(`⚠ 위협: ${th.map((t) => t.san).slice(0, 3).join(', ')}`);
  return { marks, arrows, notes };
}
