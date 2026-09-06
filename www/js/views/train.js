/* 🎯 훈련 — 갈래가 넷이다.
 *   1) 내 실수 복습(SRS)  — 내 경기에서 나온 실수를 안키식 간격 반복으로
 *   2) 퍼즐               — 리체스 training 방식, 레이팅이 붙는다
 *   3) 연습 코스          — 리체스 practice 방식, 한 가지씩 배우고 두어 본다
 *   4) 배우기             — 국면 읽는 법 아홉 가지
 * 이 파일은 그 입구(hub)와 1번을 담는다. */

import { h, nav, screen, toast, clear, play, adBreak } from '../ui.js';
import { settings, setSetting, getSrs, setSrs, schedule, today, store } from '../store.js';
import { allCards } from '../games.js';
import { legalMovesData } from '../quizgen.js';
import { mountQuiz } from './quiz.js';
import { allPuzzles, getState as puzState } from '../puzzles.js';
import { CHAPTERS, chapterSize } from '../practicedata.js';

const SESS = 'trainSession';

/* ---------------- 입구 ---------------- */

export async function hub(app) {
  const s = screen('🎯 훈련', { back: false });
  app.appendChild(s.root);
  const b = s.body;

  const [cards, srs, pz, ps, done] = await Promise.all([
    allCards(), getSrs(), allPuzzles(), puzState(), store.get('practiceDone', null),
  ]);
  const day = today();
  const due = cards.filter((c) => srs[c.id] && srs[c.id].due <= day).length;
  const fresh = cards.filter((c) => !srs[c.id]).length;
  const pdone = Object.keys(done || {}).length;
  const ptotal = CHAPTERS.reduce((a, c) => a + (c.kind === 'lesson' ? chapterSize(c) : 1), 0);

  const tile = (path, ic, title, sub, badge, cls) =>
    h('button.card.row.tap' + (cls || ''), { onclick: () => nav(path) },
      h('div.ic-big', ic),
      h('div', { style: 'flex:1;min-width:0;text-align:left' }, h('b', title), h('p.sub', sub)),
      badge ? h('span.badge.info', badge) : null);

  b.appendChild(tile('/train/srs', '🔁', '내 실수 복습',
    cards.length ? '내 경기에서 나온 실수를 간격 반복으로' : '경기를 분석하면 문제가 쌓입니다',
    cards.length ? `오늘 ${due + Math.min(fresh, 10)}장` : null));
  b.appendChild(tile('/puzzle', '🧩', '퍼즐',
    '상대의 실수를 응징하는 수 찾기 — 맞힐수록 어려워집니다',
    `${ps.rating}점`));
  b.appendChild(tile('/puzzle/rush', '🔥', '연속 도전',
    '목숨 3개. 틀리기 전까지 몇 개나 맞힐 수 있나',
    `최고 ${(ps.rush && ps.rush.best) || 0}`));
  b.appendChild(tile('/practice', '🎓', '연습 코스',
    '기본 메이트·엔딩·전술을 하나씩 배우고 두어 봅니다',
    `${pdone}/${ptotal}`));
  b.appendChild(tile('/learn', '📖', '국면 읽는 법',
    '핀·양걸이·통과한 폰… 판이 무엇을 말하는지 아홉 가지'));

  b.appendChild(h('div.grid3.mt',
    h('div.stat', h('div.k', '가진 퍼즐'), h('div.v', String(pz.length))),
    h('div.stat', h('div.k', '복습 카드'), h('div.v', String(cards.length))),
    h('div.stat', h('div.k', '연속 정답'), h('div.v', String(ps.streak || 0)))));
}

/* ---------------- 내 실수 복습 ---------------- */

export async function view(app) {
  const st = await settings();
  const s = screen('🔁 내 실수 복습');
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
    // 오늘 훈련을 실제로 끝낸 경우에만. 복습할 카드가 없어 그냥 들른 화면에서는 띄우지 않는다.
    if (!nothing) adBreak('train');
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
