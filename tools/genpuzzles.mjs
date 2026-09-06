/* 퍼즐 씨앗 만들기 — 스톡피시끼리 두게 하고, 거기서 나온 실수를 퍼즐로 캔다.
 *
 *   node tools/genpuzzles.mjs [경기수] [출력파일]
 *
 * 리체스 퍼즐이 실제 사람 경기의 블런더에서 나오듯, 여기서는 낮은 실력으로
 * 맞춘 엔진이 서로 두게 해 자연스러운 국면과 진짜 실수를 만든다.
 * 그런 다음 「단 하나의 수만 결정적으로 이긴다」는 조건으로 걸러 낸다.
 * (사람 기보가 폰에 없으므로 이게 유일하게 정직한 길이다 — 손으로 지어낸
 *  국면은 아무리 그럴듯해도 검증되지 않은 채로 남는다.)
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const ENGINES = [
  process.env.CHESS_ENGINE,
  '/root/vendor/stockfish18/stockfish/stockfish-android-armv8',
  '/data/data/com.termux/files/home/.stockfish/stockfish/stockfish-android-armv8',
  '/usr/games/stockfish',
];
const EXE = ENGINES.find((p) => p && existsSync(p));
if (!EXE) { console.error('스톡피시를 찾을 수 없습니다'); process.exit(1); }

const { Chess } = await import('../www/js/lib/chess.js');
const { tagThemes, guessRating } = await import('../www/js/puzzles.js');

const NGAMES = parseInt(process.argv[2] || '30', 10);
const OUT = process.argv[3] || 'www/js/puzzledata.js';

/* ---------------- UCI 다루기 ---------------- */

function uci() {
  const p = spawn(EXE, [], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = '';
  const waiters = [];
  p.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      if (!line) continue;
      for (const w of waiters.slice()) {
        w.lines.push(line);
        if (w.test(line)) { waiters.splice(waiters.indexOf(w), 1); w.done(w.lines); }
      }
    }
  });
  const send = (c) => p.stdin.write(c + '\n');
  const until = (test) => new Promise((done) => waiters.push({ test, lines: [], done }));
  return {
    send, until,
    async ready() { send('isready'); await until((l) => l === 'readyok'); },
    quit() { try { p.kill(); } catch (e) {} },
  };
}

const e = uci();
e.send('uci');
await e.until((l) => l === 'uciok');
e.send('setoption name Threads value 2');
e.send('setoption name Hash value 64');
await e.ready();

/** go 한 번 → {best, lines:[{mate,cp,pv,multipv}]} */
async function go(fen, cmd, multipv = 1) {
  e.send('setoption name MultiPV value ' + multipv);
  e.send('position fen ' + fen);
  e.send('go ' + cmd);
  const out = await e.until((l) => l.startsWith('bestmove'));
  const best = (out.find((l) => l.startsWith('bestmove')) || '').split(' ')[1];
  const lines = new Map();
  for (const l of out) {
    if (!l.startsWith('info ') || !l.includes(' pv ')) continue;
    const mv = /multipv (\d+)/.exec(l);
    const idx = mv ? +mv[1] : 1;
    const mate = /score mate (-?\d+)/.exec(l);
    const cp = /score cp (-?\d+)/.exec(l);
    const pv = l.split(' pv ')[1].trim().split(/\s+/);
    lines.set(idx, { mate: mate ? +mate[1] : null, cp: cp ? +cp[1] : null, pv, i: idx });
  }
  return { best, lines: [...lines.values()].sort((a, b) => a.i - b.i) };
}

/** 점수를 「둘 차례 관점 센티폰」 하나로 (메이트는 크게) */
function score(l) {
  if (!l) return 0;
  if (l.mate != null) return l.mate > 0 ? 100000 - l.mate * 100 : -100000 - l.mate * 100;
  return l.cp || 0;
}

/* ---------------- 1) 엔진끼리 두기 ---------------- */

const OPENINGS = [
  ['e4', 'e5'], ['e4', 'c5'], ['e4', 'e6'], ['e4', 'c6'], ['d4', 'd5'], ['d4', 'Nf6'],
  ['c4', 'e5'], ['Nf3', 'd5'], ['e4', 'd5'], ['d4', 'f5'], ['e4', 'Nf6'], ['g3', 'd5'],
];

async function playGame(skillW, skillB) {
  const c = new Chess();
  // 서두는 정석 몇 수로 열어 국면을 다양하게
  const ob = OPENINGS[Math.floor(Math.random() * OPENINGS.length)];
  for (const san of ob) { try { c.move(san); } catch (err) { break; } }
  const positions = [c.fen()];
  const sans = [];
  for (let i = 0; i < 110 && !c.isGameOver(); i++) {
    const skill = c.turn() === 'w' ? skillW : skillB;
    e.send('setoption name Skill Level value ' + skill);
    const r = await go(c.fen(), 'movetime 30');
    if (!r.best || r.best === '(none)') break;
    let m;
    try {
      m = c.move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best.slice(4, 5) || undefined });
    } catch (err) { break; }
    if (!m) break;
    sans.push(m.san);
    positions.push(c.fen());
  }
  return { positions, sans };
}

/* ---------------- 2) 실수 찾기 ---------------- */

/** 해답 수순(uci) → 사람이 볼 SAN, 그리고 몇 수짜리인지 */
function toSans(fen, ucis) {
  const c = new Chess(fen);
  const out = [];
  for (const u of ucis) {
    let m;
    try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined }); } catch (err) { return null; }
    if (!m) return null;
    out.push(m.san);
  }
  return out;
}

/* ---------------- 3) 한 경기 캐기 ---------------- */

const seen = new Set();
const puzzles = [];

async function mine(game) {
  const pos = game.positions;
  // 1차: 얕게 훑어 승부가 크게 흔들린 곳만 표시
  const evals = [];
  for (let i = 0; i < pos.length; i++) {
    const r = await go(pos[i], 'depth 8');
    evals.push(score(r.lines[0]));
  }
  for (let i = 1; i < pos.length; i++) {
    // i-1 에서 둔 쪽이 실수해서, i 에서 둘 쪽이 크게 좋아졌나?
    const foeBefore = evals[i - 1];        // i-1 차례(=실수한 쪽) 관점
    const heroNow = evals[i];              // i 차례(=푸는 쪽) 관점
    /* 이미 지고 있던 국면은 퍼즐이 아니다 — 다만 「메이트를 허용한 수」는 예외다.
     * 지고 있어도 메이트로 끝내는 법을 찾는 것은 그 자체로 좋은 문제이고,
     * 이 조건을 걸어 두면 한 수·두 수 메이트가 거의 안 나온다(1차 130판에서 3개뿐이었다). */
    const mateChance = heroNow > 90000;
    if (!mateChance && foeBefore < -300) continue;
    if (mateChance && foeBefore < -9000) continue;   // 이미 메이트 나던 자리는 뺀다
    if (heroNow < 220) continue;           // 실수 뒤에도 별 것 없으면 버린다
    if (!mateChance && -foeBefore > heroNow - 170) continue;  // 실수로 실제로 나빠졌어야 한다

    const fen = pos[i - 1];
    const keyFen = pos[i];
    if (seen.has(keyFen.split(' ').slice(0, 4).join(' '))) continue;

    // 2차: 깊게 + 후보 2개 — 「이 수 하나뿐」인지 본다
    const deep = await go(keyFen, 'depth 16', 2);
    const b1 = deep.lines[0], b2 = deep.lines[1];
    if (!b1) continue;
    const s1 = score(b1), s2 = b2 ? score(b2) : -100000;
    if (s1 < 260 && b1.mate == null) continue;
    // 유일해야 퍼즐이다 — 두 번째 수도 비슷하게 좋으면 답이 흐릿해진다
    if (b1.mate != null) { if (b2 && b2.mate != null && b2.mate <= b1.mate) continue; }
    else if (s2 > s1 - 180) continue;

    // 상대가 둔 실수 수 + 정답 수순
    const foeMove = uciBetween(fen, keyFen);
    if (!foeMove) continue;
    let pv = b1.pv.slice(0, 7);
    // 마지막은 반드시 푸는 쪽의 수로 끝난다 (짝수 길이 = 내 수로 끝)
    if (pv.length % 2 === 0) pv = pv.slice(0, pv.length - 1);
    if (pv.length < 1) continue;
    const ucis = [foeMove, ...pv];
    const sans = toSans(fen, ucis);
    if (!sans) continue;

    const mateIn = b1.mate != null && b1.mate > 0 ? b1.mate : null;
    const heroPlies = Math.ceil(pv.length / 2);
    if (mateIn == null && heroPlies < 2 && s1 < 400) continue;   // 한 방에 끝나는 시시한 것 제외
    const themes = tagThemes(fen, ucis, mateIn, s1);
    seen.add(keyFen.split(' ').slice(0, 4).join(' '));
    puzzles.push({
      id: 'p' + (puzzles.length + 1).toString().padStart(4, '0'),
      fen, moves: ucis, sans,
      rating: guessRating(mateIn, s1, heroPlies, themes),
      themes,
    });
    process.stdout.write(`  · ${puzzles.length}개째 (${themes.join(',')}, ${guessRating(mateIn, s1, heroPlies, themes)})\n`);
  }
}

function uciBetween(a, b) {
  const c = new Chess(a);
  for (const m of c.moves({ verbose: true })) {
    const t = new Chess(a);
    t.move(m.san);
    if (t.fen() === b) return m.from + m.to + (m.promotion || '');
  }
  return null;
}

/* ---------------- 돌리기 ---------------- */

const t0 = Date.now();
for (let g = 0; g < NGAMES; g++) {
  const sw = Math.floor(Math.random() * 6);
  const sb = Math.floor(Math.random() * 6);
  process.stdout.write(`[${g + 1}/${NGAMES}] 대국 (실력 ${sw} vs ${sb}) … `);
  const game = await playGame(sw, sb);
  process.stdout.write(`${game.sans.length}수, 캐는 중\n`);
  await mine(game);
}
e.quit();

/* 마지막 검산 — 저장하기 전에 전부 다시 두어 본다 */
const good = puzzles.filter((p) => {
  const c = new Chess(p.fen);
  for (const u of p.moves) {
    try {
      if (!c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined })) return false;
    } catch (err) { return false; }
  }
  return true;
});
good.sort((a, b) => a.rating - b.rating);
good.forEach((p, i) => { p.id = 'p' + (i + 1).toString().padStart(4, '0'); });

const body = good.map((p) =>
  `  { id: '${p.id}', r: ${p.rating}, f: '${p.fen}', m: '${p.moves.join(' ')}', t: '${p.themes.join(' ')}' },`).join('\n');

writeFileSync(OUT, `/* 기본 퍼즐 꾸러미 — tools/genpuzzles.mjs 가 만든다. 손으로 고치지 말 것.
 * 스톡피시끼리 둔 ${NGAMES}판에서 캔 실수 ${good.length}개.
 * 하나하나 「그 수 하나만 결정적으로 이긴다」를 깊이 16 · 후보 2개로 확인했다.
 *   f=국면(상대가 실수하기 직전) · m=수순(첫 수는 상대의 실수, 그 다음부터 내가 푼다)
 *   r=짐작 난이도 · t=주제
 */

export const PACK = [
${body}
];

export function unpack(p) {
  return { id: p.id, fen: p.f, moves: p.m.split(' '), rating: p.r, themes: p.t.split(' '), src: 'pack' };
}

export const PACK_PUZZLES = PACK.map(unpack);
`, 'utf8');

console.log(`\n✅ 퍼즐 ${good.length}개 → ${OUT}  (${Math.round((Date.now() - t0) / 1000)}초)`);
