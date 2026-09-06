/* 🎓 국면 읽기 배우기 — 요소 아홉 가지를 예제 국면으로 하나씩.
 * Chessis 의 Key Elements 튜토리얼(슬라이드)을 옮긴 것이다.
 * 예제 국면은 우리가 직접 만든 것이라 앱과 함께 자유롭게 쓸 수 있다. */

import { h, nav, screen, clear } from '../ui.js';
import { renderBoard, boardOpts } from '../board.js';
import { settings } from '../store.js';
import { readPosition } from '../insight.js';

/* [열쇠, 제목, 예제 FEN, 무엇을 보라는 설명, 물음] */
const LESSONS = [
  ['pin', '핀 걸린 기물',
    'rnbqkb1r/pppp1ppp/5n2/4p1B1/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    'f6 나이트는 g5 비숍에게 핀이 걸려 있습니다. 움직이면 뒤의 d8 퀸이 그대로 잡힙니다.',
    '핀 걸린 기물은 「지키는 일」을 제대로 못 합니다. 그 기물이 지키던 곳을 노려 보세요.'],
  ['undef', '지켜지지 않는 기물',
    '4k3/8/8/3n4/1N6/8/8/4K3 w - - 0 1',
    'b4 나이트와 d5 나이트는 둘 다 아군이 받쳐 주지 않습니다. (폰도 대개 받쳐지지 않아 함께 표시됩니다)',
    '받쳐지지 않은 기물이 둘이면 대개 포크·양걸이가 숨어 있습니다.'],
  ['mobility', '기물 활동성',
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    '칸마다 붙은 숫자는 그 기물이 갈 수 있는 칸 수입니다. 숫자가 큰 쪽이 활발한 국면입니다.',
    '답답할 때는 활동성이 0~1인 기물부터 풀어 주세요.'],
  ['passed', '통과한 폰',
    '8/5ppp/8/P7/8/8/5PPP/8 w - - 0 1',
    'a5 폰 앞에는 막을 상대 폰이 없습니다 — 통과한 폰입니다.',
    '엔드게임에서는 통과한 폰 하나가 그대로 승부입니다.'],
  ['isolated', '고립 폰',
    '8/pp3ppp/8/3P4/8/8/PP3PPP/8 w - - 0 1',
    'd5 폰은 양 옆 c·e 줄에 아군 폰이 없습니다 — 고립 폰입니다.',
    '폰으로 지킬 수 없으니 기물을 묶어 두게 됩니다. 대개 약점입니다.'],
  ['backward', '뒤처진 폰',
    '8/8/8/8/p1p5/P1P5/1P6/8 w - - 0 1',
    'b2 폰은 옆의 a3·c3 보다 뒤에 남았고, b3 로 나가면 a4·c4 폰에게 잡힙니다.',
    '뒤처진 폰 앞 칸(b3)은 상대 기물의 좋은 자리가 됩니다.'],
  ['king', '잡히기 쉬운 킹',
    'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
    '내 킹(e1)과, 지금 상대가 체크를 걸 수 있는 칸이 표시됩니다 — …Bxf2+ 가 보이시나요?',
    '거의 모든 전술은 체크에서 시작합니다. 내 차례에 두기 전에 「상대가 나에게 걸 수 있는 체크」를 먼저 세어 보세요.'],
  ['discover', '발견 공격',
    '4q3/8/8/8/4N3/8/8/4R1K1 w - - 0 1',
    'e4 나이트가 비켜 주면 e1 룩이 곧장 e8 퀸을 때립니다.',
    '비켜 주는 기물이 동시에 무언가를 위협하면 상대는 둘 다 막을 수 없습니다.'],
  ['fork', '포크 가능 칸',
    'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
    'd5 나이트가 c7 로 가면 a8 룩과 e8 킹을 동시에 찌릅니다.',
    '포크 칸이 안전한지(상대가 그냥 잡을 수 있는지) 꼭 같이 보세요.'],
];

export async function view(app) {
  const st = await settings();
  const s = screen('🎓 국면 읽기 배우기');
  app.appendChild(s.root);
  const b = s.body;

  let i = 0;
  const boardHost = h('div.board-wrap');
  const titleEl = h('h3');
  const descEl = h('p.sub');
  const askEl = h('p.dim.mt');
  const notesEl = h('div.ke-notes');
  const dots = h('div.dots');

  const nav2 = h('div.row', { style: 'gap:6px;margin-top:10px' },
    h('button.btn.sm', { onclick: () => go(i - 1) }, '◀ 이전'),
    h('div.spacer'),
    h('span.dim', ''),
    h('div.spacer'),
    h('button.btn.sm', { onclick: () => go(i + 1) }, '다음 ▶'));

  b.appendChild(h('div.card', titleEl, descEl, boardHost, notesEl, askEl, nav2, dots));
  b.appendChild(h('div.card',
    h('p.sub', '여기서 본 표시는 복기·대국·분석판 어디서나 켤 수 있습니다.'),
    h('div.btn-row.mt',
      h('button.btn', { onclick: () => nav('/board') }, '🔬 분석판에서 해 보기'),
      h('button.btn.ghost', { onclick: () => nav('/settings') }, '⚙️ 어떤 걸 켤지 고르기'))));

  go(0);

  function go(n) {
    i = (n + LESSONS.length) % LESSONS.length;
    const [key, title, fen, desc, ask] = LESSONS[i];
    titleEl.textContent = `${i + 1}. ${title}`;
    descEl.textContent = desc;
    askEl.textContent = '💡 ' + ask;
    nav2.children[2].textContent = `${i + 1} / ${LESSONS.length}`;

    const on = {};
    on[key] = true;
    const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const r = readPosition(fen, on, turn);
    clear(notesEl);
    for (const nte of r.notes) notesEl.appendChild(h('span.ke-note', nte));

    renderBoard(boardHost, fen, {
      orient: 'w',
      marks: r.marks, arrows: r.arrows, numbers: r.numbers,
      ...boardOpts(st),
    });

    clear(dots);
    LESSONS.forEach((_, k) => dots.appendChild(h('button.dot' + (k === i ? '.on' : ''), { onclick: () => go(k) })));
  }
}
