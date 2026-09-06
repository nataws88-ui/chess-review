/* 판 렌더러 미리보기 — 브라우저 없이 board.js 를 그대로 실행해 SVG/PNG 로 뽑는다.
 * 사용: node test/preview.mjs  → test/preview/*.png
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(HERE, 'preview');
mkdirSync(OUT, { recursive: true });

/* ---------- 최소 SVG DOM ---------- */
const ESC = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

class Node {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.kids = []; this.text = ''; this.style = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.kids.push(c); return c; }
  addEventListener() {}
  set textContent(v) { this.text = v; }
  get textContent() { return this.text; }
  get classList() {
    return { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
  }
  toString() {
    const a = Object.entries(this.attrs).map(([k, v]) => ` ${k}="${ESC(v)}"`).join('');
    const inner = this.kids.map(String).join('') + ESC(this.text);
    return `<${this.tag}${a}>${inner}</${this.tag}>`;
  }
}

global.document = { createElementNS: (ns, tag) => new Node(tag) };
global.requestAnimationFrame = () => {};
global.window = { devicePixelRatio: 1 };

const { renderBoard, addMark } = await import('../www/js/board.js');
const { readPosition, readThreats } = await import('../www/js/insight.js');

const SPRITE = readFileSync(join(ROOT, 'www/assets/pieces.svg'), 'utf8')
  .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

function render(name, fen, opts) {
  const host = { innerHTML: '', appendChild(c) { this.node = c; } };
  renderBoard(host, fen, opts);
  // 기물 스프라이트를 같은 문서 안에 넣어야 <use href="#p.."> 가 그려진다
  const svg = String(host.node).replace('>', `><defs>${SPRITE}</defs>`);
  const svgPath = join(OUT, name + '.svg');
  writeFileSync(svgPath, svg);
  execFileSync('rsvg-convert', ['-w', '520', '-h', '520', svgPath, '-o', join(OUT, name + '.png')]);
  console.log('✅ ' + name + '.png');
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// 1) 시작 국면 (기본 테마)
render('01-start', START, { orient: 'w', theme: 'green' });

// 판 밝기 3단계 — 눈으로 비교해 고를 수 있게 같은 국면을 세 장 뽑는다
for (const lv of [0, 1, 2]) {
  render(`00-shade-${lv}`, START, { orient: 'w', theme: 'green', shade: lv, coords: true });
}

// 2) 문제 화면: 직전 수 표시 + 기물 선택 + 갈 수 있는 칸
const m2 = {};
addMark(m2, 'e7', 'hl'); addMark(m2, 'e5', 'hl');
addMark(m2, 'f3', 'sel');
['e5', 'g5', 'd4', 'h4', 'd2', 'g1'].forEach((s) => addMark(m2, s, 'dot'));
addMark(m2, 'e5', 'cap');
render('02-quiz', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  { orient: 'w', theme: 'green', marks: m2 });

// 3) 정답 후: 최선(초록)/실전(빨강) + 번호 화살표
const m3 = {};
addMark(m3, 'c4', 'good'); addMark(m3, 'f7', 'good');
addMark(m3, 'd1', 'bad'); addMark(m3, 'h5', 'bad');
render('03-answer', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', {
  orient: 'w', theme: 'wood', marks: m3,
  arrows: [
    { f: 'f3', t: 'g5', kind: 'best' },
    { f: 'd8', t: 'f6', kind: 'punish' },
    { f: 'g5', t: 'f7', kind: 'best' },
  ],
});

// 4) 흑 시점 + 체크 표시 + 나이트 테마
const m4 = {};
addMark(m4, 'e8', 'check');
addMark(m4, 'h5', 'hl'); addMark(m4, 'e8', 'hl');
render('04-check-black', 'rnbqkbnr/pppp1ppp/8/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  { orient: 'b', theme: 'slate', marks: m4, coords: true });

// 5) 오션 테마 · 좌표 없음
render('05-ocean', 'r2q1rk1/pp2ppbp/2np1np1/2p5/4P3/2NP1N1P/PPP1BPP1/R1BQ1RK1 w - - 0 9',
  { orient: 'w', theme: 'ocean', coords: false });

/* 6) 국면 읽기 — 핀·지켜지지 않는 기물·통과 폰·체크 가능 칸을 한 번에 */
{
  const fen = 'rnbqkb1r/pppp1ppp/5n2/4p1B1/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const r = readPosition(fen, { pin: true, undef: true, king: true, passed: true }, 'b');
  render('06-key-elements', fen, {
    orient: 'w', theme: 'green', marks: r.marks, arrows: r.arrows, coords: true,
  });
}

/* 7) 기물 활동성 — 칸마다 갈 수 있는 칸 수 */
{
  const fen = 'r2q1rk1/pp2ppbp/2np1np1/2p5/4P3/2NP1N1P/PPP1BPP1/R1BQ1RK1 w - - 0 9';
  const r = readPosition(fen, { mobility: true }, 'w');
  render('07-mobility', fen, { orient: 'w', theme: 'wood', numbers: r.numbers, coords: false });
}

/* 8) 위협 — 상대가 지금 두면 무엇이 오는가 */
{
  const fen = '4k3/8/8/7b/8/5N2/8/4K3 w - - 0 1';
  const r = readThreats(fen, 'b', { material: true, mate: true, undef: true });
  render('08-threats', fen, { orient: 'w', theme: 'ocean', marks: r.marks, arrows: r.arrows, coords: true });
}

/* 9) 사용자 지정 판 색 + 마지막 수 테두리 표시 */
{
  const m = {};
  addMark(m, 'e2', 'lm-frame'); addMark(m, 'e4', 'lm-frame');
  render('09-custom-color', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    { orient: 'w', theme: { l: '#F2E8DC', d: '#8A6BA8' }, marks: m, coords: true });
}

/* 10~12) 화살표 굵기 세 단계 — 고르는 값이 실제로 얼마나 달라지는지 눈으로 */
{
  const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5';
  const arrows = [
    { f: 'f3', t: 'g5', kind: 'best' },
    { f: 'c4', t: 'f7', kind: 'punish' },
  ];
  for (const size of ['normal', 'big', 'huge']) {
    render(`1${['normal', 'big', 'huge'].indexOf(size)}-arrow-${size}`, fen,
      { orient: 'w', theme: 'green', arrows, arrowSize: size, coords: true });
  }
}

/* 13) 타격감 — 잡는 수가 놓인 칸의 파장 */
{
  const m = {};
  addMark(m, 'f3', 'hl'); addMark(m, 'e5', 'hl');
  render('13-impact', 'rnbqkbnr/pppp1ppp/8/4N3/8/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3',
    { orient: 'w', theme: 'wood', marks: m, anim: { from: 'f3', to: 'e5', kind: 'capture' }, coords: true });
}

console.log('\n판 렌더러 미리보기 13장 생성: test/preview/');
