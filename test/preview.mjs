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

console.log('\n판 렌더러 미리보기 5장 생성: test/preview/');
