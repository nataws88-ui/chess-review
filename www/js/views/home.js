/* 홈 — 경기 목록 + 오늘의 훈련 요약 */

import { h, nav, screen, toast, isApp } from '../ui.js';
import { store, settings, getSrs, today } from '../store.js';
import { allCards } from '../games.js';
import { resultKo } from '../quizgen.js';

const RESULT_TONE = { '1-0': '#e8e6df', '0-1': '#8fa3c0', '1/2-1/2': '#c9c9c9' };

export async function view(app) {
  const st = await settings();
  const games = (await store.allGames()).sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : b.addedAt - a.addedAt));

  const s = screen('♟️ 체스 복기왕', { back: false, right: h('button.icon-btn', { onclick: () => nav('/import'), 'aria-label': '가져오기' }, '＋') });
  app.appendChild(s.root);
  const b = s.body;

  // ---- 오늘의 훈련 ----
  const srs = await getSrs();
  const cards = await allCards();
  const day = today();
  const pool = cards.filter((c) => !st.myName || !st.mineOnly || c.mine);
  const due = pool.filter((c) => srs[c.id] && srs[c.id].due <= day).length;
  const fresh = pool.filter((c) => !srs[c.id]).length;
  const learned = pool.filter((c) => srs[c.id]).length;

  b.appendChild(h('button.hero.card.tap', { onclick: () => nav('/train') },
    h('div.k', '오늘의 훈련'),
    h('div.v', due + fresh > 0 ? `${Math.min(due + Math.min(fresh, st.newPerDay), 999)}문제 대기중` : '오늘 몫 완료 🎉'),
    h('div.sub', due + fresh > 0
      ? `복습 ${due} · 새 문제 ${Math.min(fresh, st.newPerDay)}${fresh > st.newPerDay ? ` (전체 ${fresh})` : ''}`
      : `익힌 문제 ${learned}개 · 내일 또 만나요`),
  ));

  // ---- 빠른 실행 ----
  b.appendChild(h('div.btn-row.mb',
    h('button.btn.primary', { onclick: () => nav('/import') }, '＋ 경기 추가'),
    h('button.btn', { onclick: () => nav('/spar') }, '⚔️ 엔진 대국'),
  ));

  if (!isApp) {
    b.appendChild(h('div.card.err',
      h('b', '⚠️ 브라우저에서 열렸습니다'),
      h('p.sub', '엔진 분석·대국은 설치된 앱에서만 동작합니다. 저장된 경기 보기는 됩니다.')));
  }

  // ---- 경기 목록 ----
  b.appendChild(h('div.row.mb', h('h3', `경기 ${games.length}판`), h('div.spacer'),
    games.length ? h('button.btn.sm.ghost', { onclick: () => nav('/stats') }, '통계 보기') : null));

  if (!games.length) {
    b.appendChild(h('div.empty',
      h('div.big', '♟️'),
      h('p', h('b', '아직 경기가 없습니다')),
      h('p.sub', '체스닷컴 아이디로 자동으로 가져오거나,'),
      h('p.sub', 'PGN을 붙여넣어 첫 복기를 시작해 보세요.'),
      h('div.mt', h('button.btn.primary', { onclick: () => nav('/import') }, '경기 가져오기'))));
    return;
  }

  for (const g of games) {
    const mine = st.myName && [g.meta.white, g.meta.black].some((n) => n.toLowerCase() === st.myName.toLowerCase());
    const myAcc = !mine ? null
      : (g.meta.white.toLowerCase() === st.myName.toLowerCase() ? (g.acc || {}).w : (g.acc || {}).b);
    b.appendChild(h('button.card.tap', { onclick: () => nav('/game/' + encodeURIComponent(g.id)) },
      h('div.row',
        h('div', { style: 'min-width:0;flex:1' },
          h('div', { style: 'font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
            h('span', { style: `color:${RESULT_TONE[g.meta.result] || '#fff'}` }, g.meta.white),
            h('span.dim', ' vs '), g.meta.black),
          h('div.sub', `${g.meta.date || ''} · ${resultKo(g.meta.result, g.meta.termination)}`
            + (g.meta.welo ? ` (${g.meta.welo} vs ${g.meta.belo})` : '')),
        ),
        myAcc != null ? h('div', { style: 'text-align:right' },
          h('div.dim', '내 정확도'),
          h('div', { style: `font-weight:800;font-size:1.05rem;color:${accColor(myAcc)}` }, myAcc + '%')) : null,
      ),
      h('div.row.mt', { style: 'gap:6px' },
        h('span.badge.mistake', `🧩 문제 ${g.nprob || 0}`),
        h('span.badge.info', `${g.nply || 0}수`),
        g.report && g.report.opening ? h('span.dim', { style: 'margin-left:2px' }, g.report.opening) : null),
    ));
  }
}

export function accColor(a) {
  if (a >= 90) return '#7ee2a8';
  if (a >= 80) return '#b8e086';
  if (a >= 70) return '#f0d46a';
  if (a >= 55) return '#f0a860';
  return '#f08080';
}
