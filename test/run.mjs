/* 헤드리스 테스트 — 실제 스톡피시를 띄워 앱과 똑같은 코드 경로를 돌린다.
 * 사용: node test/run.mjs [pgn경로]
 *
 * 안드로이드의 window.Native 를 노드 프로세스로 흉내 내므로,
 * engine.js / analyze.js / quizgen.js 가 앱에서와 같은 코드로 실행된다.
 */

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const ENGINES = [
  process.env.CHESS_ENGINE,
  '/data/data/com.termux/files/home/.stockfish/stockfish/stockfish-android-armv8',
  '/usr/games/stockfish',
];
const EXE = ENGINES.find((p) => p && existsSync(p));
if (!EXE) {
  console.error('스톡피시를 찾을 수 없습니다');
  process.exit(1);
}

/* ---------- window.Native 흉내 ---------- */
let proc = null;
const nativeShim = {
  engineStart() {
    if (proc) return 'ok';
    proc = spawn(EXE, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop();
      const clean = lines.map((l) => l.replace(/\r$/, '')).filter((l) => l.length);
      if (clean.length && global.window.__engineLines) global.window.__engineLines(clean);
    });
    proc.on('exit', () => {
      proc = null;
      if (global.window.__engineDead) global.window.__engineDead('exited');
    });
    return 'ok';
  },
  engineSend(cmd) { if (proc) proc.stdin.write(cmd + '\n'); },
  engineStop() { if (proc) { proc.kill(); proc = null; } },
  engineRunning: () => !!proc,
  enginePath: () => EXE,
  cpuCount: () => 2,
  haptic() {}, toast() {}, keepAwake() {},
};

global.window = { Native: nativeShim };
global.self = global.window;

/* ---------- 테스트 ---------- */

const { analyzeGame, wp, classify, findOpening, uciToSan } = await import('../www/js/analyze.js');
const { buildGame, moveFacts, hangingAfter, resultKo, qualityPct } = await import('../www/js/quizgen.js');
const { splitPgn, peek, fingerprint, gameId } = await import('../www/js/games.js').catch(() => ({}));
const engine = (await import('../www/js/engine.js')).default;

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
};

console.log(`엔진: ${EXE}\n`);

/* 1. 순수 함수 — 파이썬판과 같은 값이 나오는가 */
console.log('1) 승률·분류 공식');
ok(Math.abs(wp(0) - 50) < 1e-9, 'wp(0) = 50%');
ok(Math.abs(wp(100) - 59.09) < 0.02, 'wp(100) ≈ 59.09%', wp(100).toFixed(3));
ok(wp(99999) === wp(1000), '±1000cp 에서 포화');
ok(classify('e4', 'e4', 0) === 'best', 'best 판정');
ok(classify('e4', 'd4', 30) === 'blunder', '30%p 하락 = 블런더');
ok(classify('e4', 'd4', 13) === 'mistake', '13%p 하락 = 실수');
ok(classify('e4', 'd4', 6) === 'inaccuracy', '6%p 하락 = 부정확');
ok(findOpening('e4 e5 Nf3 Nc6 Bc4 Bc5'.split(' '))[0] === 'C50 이탈리안 게임', '오프닝 인식');
ok(uciToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5', 'g1f3']).join(' ') === 'e4 e5 Nf3', 'UCI→SAN 변환');

/* 2. 전술 서술 */
console.log('\n2) 원인 규명(한국어 사실 추출)');
// Nb6 한 수로 a8·c8 두 룩을 동시에 공격(양걸이)
const forkFacts = moveFacts('r1r1k3/8/8/3N4/8/8/8/7K w - - 0 1', 'Nb6');
ok(forkFacts.some((f) => f.includes('양걸이')), '양걸이 인식', JSON.stringify(forkFacts));
// Nc7+ 는 킹에 체크 + 룩 위협
const checkFacts = moveFacts('r3k3/8/8/1N6/8/8/8/7K w - - 0 1', 'Nc7+');
ok(checkFacts.some((f) => f.includes('체크')), '체크 인식', JSON.stringify(checkFacts));
ok(checkFacts.some((f) => f.includes('룩(a8)')), '동시에 걸린 룩 인식', JSON.stringify(checkFacts));
const capFacts = moveFacts('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'exd5');
ok(capFacts.some((f) => f.includes('폰 획득')), '기물 획득 인식', JSON.stringify(capFacts));
const hang = hangingAfter('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Qh5');
ok(typeof hang === 'string' || hang === null, 'hangingAfter 동작', String(hang));
ok(resultKo('1-0') === '백 승' && resultKo('0-1') === '흑 승', '결과 한국어');
ok(qualityPct({ best: 5, inaccuracy: 3, blunder: 2 }).g === 50, '품질 비율 계산');

// 💎 탁월(!!) 판정 = 기물을 내주고도 최선인 수
{
  const { isSacrifice } = await import('../www/js/analyze.js');
  const sacs = [
    ['6k1/7p/8/7Q/8/8/8/6K1 w - - 0 1', 'Qxh7+', true, '퀸을 h7에 던짐(킹이 되잡음)'],
    ['r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', 'Bxf7+', true, '비숍 f7 희생'],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4', false, '평범한 e4는 희생 아님'],
    ['r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', 'O-O', false, '캐슬링은 희생 아님'],
  ];
  for (const [f, s, exp, label] of sacs) ok(isSacrifice(f, s) === exp, '희생 판정: ' + label);
}

/* 3. 엔진 왕복 */
console.log('\n3) 엔진 (UCI 왕복)');
await engine.start();
ok(!!engine.id.name, '엔진 식별: ' + engine.id.name);
const r1 = await engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { movetime: 300 });
ok(!!r1.best && r1.best.length >= 4, '시작 국면 최선수: ' + r1.best);
ok(r1.pv.length > 0, 'PV 수신 (' + r1.pv.slice(0, 3).join(' ') + ')');
const mateIn1 = await engine.analyse('6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1', { movetime: 400 });
ok(mateIn1.cp !== null || mateIn1.mate !== null, '점수 파싱 (cp=' + mateIn1.cp + ' mate=' + mateIn1.mate + ')');
const multi = await engine.analyseMulti('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { movetime: 400, multipv: 2 });
ok(multi[0] && multi[1], 'MultiPV 2개 수신');
const played = await engine.play('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { movetime: 200, elo: 1400 });
ok(!!played.best, '강도 제한 대국 수: ' + played.best);

/* 4. 게임 한 판 전체 (분석 → 문제 생성) */
const pgnPath = process.argv[2] || '/root/chess/games/2026-07-22_bicyail_vs_Vegter99.pgn';
if (existsSync(pgnPath)) {
  console.log(`\n4) 실제 경기 분석: ${pgnPath.split('/').pop()}`);
  const pgn = readFileSync(pgnPath, 'utf8');
  const t0 = Date.now();
  let last = '';
  const { meta, report, sans } = await analyzeGame(pgn, {
    movetime: 120,
    deepTime: 400,
    onProgress: ({ phase, i, n }) => { last = `${phase} ${i}/${n}`; },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  ok(report.wp.length === sans.length, `승률 곡선 길이 = 수 개수 (${report.wp.length})`);
  ok(report.cls.length === sans.length, '수 품질 분류 길이');
  ok(report.acc.w > 0 && report.acc.b > 0, `정확도 백 ${report.acc.w}% 흑 ${report.acc.b}%`);
  ok(report.est.w >= 400 && report.est.w <= 2800, `추정 레이팅 ${report.est.w}/${report.est.b}`);
  ok(typeof report.opening === 'string', '오프닝: ' + report.opening);

  const rec = { id: gameId(meta), pgn, meta, report };
  const built = buildGame(rec, 'bicyail');
  ok(built.plies.length === sans.length, '복기 수 목록');

  // 수 품질 10단계 — 표시용 분류가 수 개수와 맞고, 아는 등급만 나오는지
  {
    const { QUALITY, QUALITY_ORDER, displayCls } = await import('../www/js/quizgen.js');
    const dc = displayCls(report);
    ok(dc.length === sans.length, '표시용 등급(10단계) 길이');
    ok(dc.every((c) => !c || QUALITY[c]), '알 수 없는 등급 없음');
    ok(built.plies.every((p, i) => p.cls === dc[i]), '수 목록 등급 = 표시용 등급');
    const cnt = {};
    built.plies.forEach((p) => { cnt[p.cls] = (cnt[p.cls] || 0) + 1; });
    ok(Object.values(cnt).reduce((a, x) => a + x, 0) === sans.length, '등급 합계 = 수 개수');
    console.log('     🏅 ' + QUALITY_ORDER.filter((k) => cnt[k]).map((k) => `${QUALITY[k].g} ${QUALITY[k].ko} ${cnt[k]}`).join(' · '));
  }
  console.log(`     ⏱ ${secs}초 · 문제 ${built.problems.length}개 · 마지막 단계 ${last}`);

  for (const p of built.problems.slice(0, 4)) {
    console.log(`     🧩 ${p.moveLabel}: 실전 ${p.played}${p.playedGlyph} → 최선 ${p.best} (승률 ${p.wpP}% → ${p.wpB}%)`);
    console.log(`        최선: ${p.bestWhy}`);
    if (p.playedWhy) console.log(`        실전: ${p.playedWhy}`);
    ok(Array.isArray(p.legals) && p.legals.length > 0, `  합법수 ${p.legals.length}개 임베드`);
    ok(Array.isArray(p.bestLine) && p.bestLine.length > 0, '  최선 수순 화살표');
    ok(p.accept.includes(p.legals.find((m) => m.san === p.best)?.u), '  정답 UCI 일치');
  }

  // 기존 파이썬 분석 결과와 비교(있으면)
  const oldPath = pgnPath.replace(/\.pgn$/, '.analysis.json');
  if (existsSync(oldPath)) {
    const old = JSON.parse(readFileSync(oldPath, 'utf8'));
    console.log(`\n5) 기존 파이썬 분석과 비교 (파이썬 ${old.movetime}s vs 이번 0.12s)`);
    ok(old.opening === report.opening, `오프닝 일치: ${old.opening}`);
    const dw = Math.abs(old.acc.w - report.acc.w), db = Math.abs(old.acc.b - report.acc.b);
    ok(dw < 12 && db < 12, `정확도 근사 (백 ${old.acc.w}→${report.acc.w}, 흑 ${old.acc.b}→${report.acc.b})`);
    const oldBl = (old.cls || []).filter((c) => c === 'blunder' || c === 'mistake').length;
    const newBl = report.cls.filter((c) => c === 'blunder' || c === 'mistake').length;
    ok(Math.abs(oldBl - newBl) <= 3, `실수 개수 근사 (${oldBl} vs ${newBl})`);
  }
} else {
  console.log('\n4) 실제 경기 PGN이 없어 건너뜀');
}

/* 5. PGN 여러 판 자르기 */
if (splitPgn) {
  console.log('\n6) PGN 유틸');
  const two = '[Event "A"]\n[White "x"]\n[Black "y"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n\n[Event "B"]\n[White "p"]\n[Black "q"]\n[Result "0-1"]\n\n1. d4 d5 0-1\n';
  ok(splitPgn(two).length === 2, '여러 판 자르기');
  const pk = peek(two.split('[Event "B"]')[0]);
  ok(pk.meta.white === 'x' && pk.sans.length === 2, 'PGN 헤더·수 읽기');
  ok(fingerprint(['e4', 'e5']) === fingerprint(['e4', 'e5']), '지문 동일성');
  ok(fingerprint(['e4', 'e5']) !== fingerprint(['d4', 'd5']), '지문 구별');
}

/* 7. 기존 시스템(파이썬판) 데이터로 문제를 만들 수 있는가 — 이전 도구 검증 */
const legacyDir = '/root/chess/games';
if (existsSync(legacyDir)) {
  console.log('\n7) 기존 데이터 이전 (레거시 분석 JSON → 앱 문제)');
  const { readdirSync } = await import('node:fs');
  const stems = readdirSync(legacyDir).filter((f) => f.endsWith('.pgn')).map((f) => f.slice(0, -4));
  let built = 0, probs = 0, cards = 0, broken = 0;
  for (const stem of stems) {
    try {
      const pgn = readFileSync(`${legacyDir}/${stem}.pgn`, 'utf8');
      const anPath = `${legacyDir}/${stem}.analysis.json`;
      const report = existsSync(anPath) ? JSON.parse(readFileSync(anPath, 'utf8')) : null;
      const hdr = Object.fromEntries([...pgn.matchAll(/^\[(\w+)\s+"(.*)"\]$/gm)].map((m) => [m[1], m[2]]));
      const rec = {
        id: stem, pgn, report,
        meta: { white: hdr.White, black: hdr.Black, date: (hdr.Date || '').replace(/\./g, '-'), result: hdr.Result },
      };
      const g = buildGame(rec, 'bicyail');
      built++;
      probs += g.problems.length;
      cards += g.cards.filter((c) => c.mine).length;
      for (const p of g.problems) {
        if (!p.legals.length || !p.accept.length || !p.bestLine.length) broken++;
        // 훈련 카드 id 가 기존 SRS 키(stem#12b)와 같은 규칙인지
        if (!/^.+#\d+[wb]$/.test(`${stem}#${p.id}`)) broken++;
      }
    } catch (e) { broken++; }
  }
  ok(built === stems.length, `레거시 ${stems.length}판 모두 문제 생성 (${built})`);
  ok(broken === 0, `깨진 문제 없음 (문제 ${probs}개, 내 카드 ${cards}장)`);
}

/* 8. 실제 이전 파일을 앱의 가져오기 경로 그대로 태워 본다 */
const MIG = ['/sdcard/체스퀴즈/복기왕-이전.json', process.env.MIGRATION_FILE].filter(Boolean).find(existsSync);
if (MIG) {
  console.log(`\n8) 이전 파일 가져오기 시뮬레이션 (${MIG})`);
  const data = JSON.parse(readFileSync(MIG, 'utf8'));
  ok(data.app === 'chess-review' && Array.isArray(data.games), `형식 확인 (게임 ${data.games.length}판)`);
  let added = 0, probs = 0, noReport = 0;
  const fps = new Set();
  for (const g of data.games) {
    const info = peek(g.pgn);                       // settings.js 의 가져오기와 같은 순서
    const fp = fingerprint(info.sans);
    if (fps.has(fp)) continue;
    fps.add(fp);
    const rec = {
      id: g.id || gameId(g.meta || info.meta), pgn: g.pgn,
      meta: g.meta || info.meta, report: g.report || null, fp, nply: info.sans.length,
    };
    if (!rec.report) noReport++;
    const built = buildGame(rec, 'bicyail');
    probs += built.problems.length;
    added++;
  }
  ok(added === data.games.length, `중복 없이 ${added}판 전부 등록 가능`);
  ok(noReport === 0, `분석 데이터 누락 ${noReport}판`);
  ok(probs > 0, `문제 ${probs}개 생성`);
  // 훈련 진도(SRS) 키가 앱 카드 id 와 맞는지 — 이전의 핵심
  const sample = data.games[0];
  const b0 = buildGame({ id: sample.id, pgn: sample.pgn, meta: sample.meta, report: sample.report }, 'bicyail');
  const keys = b0.cards.map((c) => c.id);
  ok(keys.every((k) => k.startsWith(sample.id + '#')), `SRS 키 규칙 일치 (예: ${keys[0] || '카드없음'})`);
  const srsN = Object.keys(data.srs || {}).length;
  console.log(`     훈련 진도: ${srsN ? srsN + '장 포함됨' : '아직 없음 (앱이전.html 에서 보내면 합쳐짐)'}`);
}

engine.quit();
console.log(`\n${'='.repeat(46)}\n결과: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
