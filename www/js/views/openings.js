/* 📖 오프닝 탐색기 — 내 경기를 오프닝별로 묶어 승률을 본다.
 * Chessis 의 Openings 화면 이식. 다만 남의 통계가 아니라 **내 판**만 센다. */

import { h, nav, screen, clear } from '../ui.js';
import { store, settings } from '../store.js';
import { openingStats } from '../library.js';
import { OPENINGS } from '../openings.js';

export async function view(app) {
  const st = await settings();
  const games = await store.allGames();
  const me = (st.myName || '').toLowerCase();

  const s = screen('📖 오프닝');
  app.appendChild(s.root);
  const b = s.body;

  if (!me) {
    b.appendChild(h('div.card',
      h('b', '내 아이디를 먼저 알려 주세요'),
      h('p.sub.mb', '어느 쪽이 나인지 알아야 오프닝별 승률을 낼 수 있습니다.'),
      h('button.btn.wide', { onclick: () => nav('/settings') }, '설정으로 가기')));
    return;
  }

  let color = null;   // null=전체 · 'w' · 'b'
  const body = h('div');

  const seg = h('div.seg.mb');
  [[null, '전체'], ['w', '⚪ 백으로'], ['b', '⚫ 흑으로']].forEach(([v, label], i) => {
    seg.appendChild(h('button' + (color === v ? '.on' : ''), {
      onclick: () => {
        color = v;
        Array.from(seg.children).forEach((el, k) => el.classList.toggle('on', k === i));
        paint();
      },
    }, label));
  });

  b.appendChild(h('div.card', seg,
    h('p.sub', '내가 둔 판만 셉니다. 승률은 무승부를 0.5승으로 친 기대득점입니다.')));
  b.appendChild(body);
  paint();

  function paint() {
    clear(body);
    const rows = openingStats(games, me, color);
    if (!rows.length) {
      body.appendChild(h('div.empty', h('p.sub', '아직 셀 판이 없습니다')));
      return;
    }
    const total = rows.reduce((a, r) => a + r.n, 0);
    body.appendChild(h('p.dim.mb', `${rows.length}개 오프닝 · ${total}판`));

    for (const r of rows) {
      const info = OPENINGS.find((o) => o[1] === r.name);
      body.appendChild(h('div.card',
        h('div.row',
          h('div', { style: 'flex:1;min-width:0' },
            h('b', r.name),
            h('div.sub', `${r.n}판 · ${r.win}승 ${r.draw}무 ${r.loss}패`
              + (r.acc != null ? ` · 평균 정확도 ${r.acc}%` : ''))),
          h('div', { style: 'text-align:right' },
            h('div.dim', '기대득점'),
            h('div', { style: `font-weight:900;font-size:1.1rem;color:${scoreColor(r.score)}` }, r.score + '%'))),
        bar(r),
        info ? h('p.dim.mt', `${info[0]} · ${info[2]}`) : null,
        h('div.chips.mt', ...r.games.slice(0, 6).map((g) => h('button.chip.sm', {
          onclick: () => nav('/game/' + encodeURIComponent(g.id)),
        }, `${g.meta.date || ''} ${oppName(g, me)}`)))));
    }
  }

  function bar(r) {
    const w = (x) => (r.n ? (x / r.n) * 100 : 0);
    return h('div.wpbar.mt', { style: 'height:8px' },
      h('div', { style: `width:${w(r.win)}%;background:#3fd07a` }),
      h('div', { style: `width:${w(r.draw)}%;background:#8b8f99` }),
      h('div', { style: `width:${w(r.loss)}%;background:#e0645a` }));
  }
}

function oppName(g, me) {
  const w = (g.meta.white || '').toLowerCase();
  return w === me ? g.meta.black : g.meta.white;
}

function scoreColor(s) {
  if (s >= 60) return '#7ee2a8';
  if (s >= 50) return '#b8e086';
  if (s >= 40) return '#f0d46a';
  return '#f08080';
}
