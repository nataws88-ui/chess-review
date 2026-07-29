/* 🎯 훈련 — 모든 경기의 실수를 모아 안키식 간격 반복으로 복습 */

import { h, nav, screen, toast, clear, play } from '../ui.js';
import { settings, setSetting, getSrs, setSrs, schedule, today, store } from '../store.js';
import { allCards } from '../games.js';
import { legalMovesData } from '../quizgen.js';
import { mountQuiz } from './quiz.js';

const SESS = 'trainSession';

export async function view(app) {
  const st = await settings();
  const s = screen('🎯 오늘의 훈련', { back: false });
  app.appendChild(s.root);
  const b = s.body;

  const cards = await allCards();
  if (!cards.length) {
    b.appendChild(h('div.empty', h('div.big', '🎯'),
      h('p', h('b', '아직 문제가 없습니다')),
      h('p.sub', '경기를 가져와 분석하면 실수가 자동으로 문제가 됩니다.'),
      h('div.mt', h('button.btn.primary', { onclick: () => nav('/import') }, '경기 가져오기'))));
    return;
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  const srs = await getSrs();
  let mineOnly = !!st.mineOnly && !!st.myName;
  let queue = [], qi = 0, okCnt = 0, tries = 0, fails = {};

  const statusLine = h('p.sub.mb');
  const filterRow = h('div.chips.mb');
  const holder = h('div');
  b.appendChild(filterRow);
  b.appendChild(statusLine);
  b.appendChild(holder);

  function paintFilter() {
    clear(filterRow);
    if (!st.myName) return;
    filterRow.appendChild(h('button.chip' + (mineOnly ? '.on' : ''), {
      onclick: async () => {
        mineOnly = !mineOnly;
        await setSetting('mineOnly', mineOnly);
        await store.set(SESS, null);
        build(true);
      },
    }, mineOnly ? `☑ ${st.myName} 의 수만` : `☐ ${st.myName} 의 수만`));
  }
  paintFilter();

  const pool = () => cards.filter((c) => !mineOnly || c.mine);

  async function build(fresh) {
    if (!fresh && await resume()) return;
    const day = today();
    const due = pool().filter((c) => srs[c.id] && srs[c.id].due <= day);
    const neu = pool().filter((c) => !srs[c.id]).slice(0, st.newPerDay);
    queue = shuffle(due).concat(shuffle(neu)).map((c) => c.id);
    qi = 0; okCnt = 0; tries = 0; fails = {};
    await store.set(SESS, null);
    statusLine.textContent = `복습 ${due.length} · 새 문제 ${neu.length} · 전체 ${pool().length}문제`;
    queue.length ? show() : end(true);
  }

  async function resume() {
    const sv = await store.get(SESS, null);
    if (!sv || sv.day !== today() || !!sv.mine !== !!mineOnly) return false;
    if (!sv.queue || !sv.queue.length || sv.qi <= 0 || sv.qi >= sv.queue.length) return false;
    if (!sv.queue.every((id) => byId.has(id))) return false;
    queue = sv.queue; qi = sv.qi; okCnt = sv.ok || 0; tries = sv.tries || 0; fails = sv.fails || {};
    statusLine.textContent = `📌 오늘 복습 이어서 — ${qi + 1}/${queue.length}장째 (정답 ${okCnt})`;
    show();
    return true;
  }

  function save() {
    store.set(SESS, { day: today(), mine: mineOnly, queue, qi, ok: okCnt, tries, fails });
  }

  function show() {
    clear(holder);
    const card = byId.get(queue[qi]);
    if (!card) return next();
    if (!card.legals) card.legals = legalMovesData(card.fen);   // 필요할 때만 계산
    save();
    const rec = srs[card.id];
    const header = h('div.row.mb',
      h('span.dim', `카드 ${qi + 1} / ${queue.length}`),
      h('div.spacer'),
      h('span.badge.info', rec ? `${rec.reps + 1}회째` : '새 카드'),
      h('span.dim', { style: 'margin-left:8px' }, `✅ ${okCnt}`));
    const meta = h('p.dim', { style: 'margin-bottom:8px' }, `📅 ${card.d} · ${card.g}`);

    mountQuiz(holder, card, {
      header: h('div', header, meta),
      nextLabel: qi + 1 < queue.length ? '다음 카드 →' : '훈련 마치기',
      onDone: (ok) => {
        tries++;
        if (ok) okCnt++;
        const lapsed = !!fails[card.id];
        const [newRec, msg] = schedule(srs[card.id], ok, lapsed);
        srs[card.id] = newRec;
        setSrs(srs);
        if (!ok) {
          fails[card.id] = 1;
          queue.splice(Math.min(qi + 4, queue.length), 0, card.id);
        }
        holder.appendChild(h('p.dim', { style: 'text-align:center;margin-top:10px' }, msg));
        save();
      },
      onNext: next,
    });
    window.scrollTo(0, 0);
  }

  function next() {
    qi++;
    if (qi >= queue.length) { store.set(SESS, null); end(false); return; }
    show();
  }

  function end(nothing) {
    clear(holder);
    const day = today();
    const p = pool();
    const t1 = p.filter((c) => srs[c.id] && srs[c.id].due === day + 1).length;
    const t7 = p.filter((c) => srs[c.id] && srs[c.id].due > day && srs[c.id].due <= day + 7).length;
    const learned = p.filter((c) => srs[c.id]).length;
    play('win', st.sound);
    statusLine.textContent = '';
    holder.appendChild(h('div.card',
      h('div.empty',
        h('div.big', nothing ? '🌙' : '🎉'),
        h('p', h('b', nothing ? '오늘 복습할 카드가 없습니다' : '오늘 훈련 완료!')),
        nothing ? h('p.sub', '내일 다시 오면 복습 카드가 준비됩니다.')
          : h('p.sub', `${tries}문제 중 ${okCnt}개 정답 (${Math.round(okCnt / Math.max(1, tries) * 100)}%)`)),
      h('div.grid3.mt',
        h('div.stat', h('div.k', '익힌 문제'), h('div.v', learned)),
        h('div.stat', h('div.k', '내일'), h('div.v', t1)),
        h('div.stat', h('div.k', '7일 내'), h('div.v', t7))),
      h('div.btn-row.mt',
        h('button.btn', { onclick: () => build(true) }, '한 번 더 (전체에서)'),
        h('button.btn.primary', { onclick: () => nav('/') }, '경기 목록'))));
  }

  build(false);
}

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
