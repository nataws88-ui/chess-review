/* 🎓 연습 — 리체스 practice 처럼 「배우고 바로 두어 보는」 코스.
 *
 * 정해진 국면에서 엔진을 상대로 목표를 달성해야 통과다.
 * 목표를 놓치는 수를 두면 그 자리에서 물러 주고 왜 안 되는지 알려 준다 —
 * 지고 나서 알려 주면 배우는 게 없기 때문이다. */

import { h, nav, screen, toast, clear, impact, moveKind, keepAwake, fitBoard } from '../ui.js';
import { renderBoard, addMark, boardOpts } from '../board.js';
import { settingsNow, store } from '../store.js';
import { Chess } from '../lib/chess.js';
import engine, { toScore } from '../engine.js';
import { CHAPTERS, findChapter, chapterSize, GOAL_KO } from '../practicedata.js';
import { allPuzzles, pickPuzzle, runner, getState } from '../puzzles.js';

const KEY = 'practiceDone';

async function getDone() { return (await store.get(KEY, null)) || {}; }
async function markDone(id) {
  const d = await getDone();
  d[id] = { ok: true, ts: Date.now() };
  await store.set(KEY, d);
  return d;
}

export async function view(app, params) {
  const cid = params && params.cid;
  const idx = params && params.idx;
  if (!cid) return listView(app);
  const ch = findChapter(cid);
  if (!ch) { nav('/practice', true); return; }
  if (idx == null) return chapterView(app, ch);
  return ch.kind === 'theme' ? themeView(app, ch) : lessonView(app, ch, parseInt(idx, 10) || 0);
}

/* ---------------- 코스 목록 ---------------- */

async function listView(app) {
  const s = screen('🎓 연습', { back: false });
  app.appendChild(s.root);
  const b = s.body;
  const done = await getDone();

  b.appendChild(h('p.sub.mb',
    '한 가지씩 배우고 그 자리에서 엔진을 상대로 두어 봅니다. 목표를 놓치는 수는 물러 줍니다.'));

  for (const ch of CHAPTERS) {
    const size = chapterSize(ch);
    // 주제 코스는 한 바퀴를 70% 이상 맞히면 통과로 본다(중간 진도는 세지 않는다)
    const got = ch.kind === 'lesson'
      ? ch.items.filter((it) => done[`${ch.id}/${it.id}`]).length
      : (done[`${ch.id}/theme`] ? size : 0);
    b.appendChild(h('button.card.row.tap', { onclick: () => nav(`/practice/${ch.id}`) },
      h('div.ic-big', ch.ic),
      h('div', { style: 'flex:1;min-width:0;text-align:left' },
        h('b', ch.name),
        h('p.sub', ch.desc)),
      h('span.badge.' + (got >= size ? 'good' : 'info'), `${got}/${size}`)));
  }
}

/* ---------------- 한 코스 ---------------- */

async function chapterView(app, ch) {
  const s = screen(`${ch.ic} ${ch.name}`);
  app.appendChild(s.root);
  const b = s.body;
  const done = await getDone();

  b.appendChild(h('div.card', h('p', ch.desc), ch.tip ? h('p.sub.mt', '💡 ', ch.tip) : null));

  if (ch.kind === 'theme') {
    const pool = await allPuzzles();
    const n = pool.filter((p) => (p.themes || []).includes(ch.theme)).length;
    const take = Math.min(ch.n || 5, n);
    b.appendChild(h('p.sub.mb', n
      ? `이 주제의 문제 ${n}개 중 ${take}개를 연달아 풉니다. 경기를 더 분석하면 문제도 늘어납니다.`
      : '경기를 분석하면 이 주제의 문제가 생깁니다.'));
    b.appendChild(h('button.btn.primary.wide', {
      onclick: () => nav(`/practice/${ch.id}/0`),
      disabled: !n,
    }, n ? '시작하기' : '아직 이 주제의 문제가 없습니다'));
    return;
  }

  ch.items.forEach((it, i) => {
    const ok = !!done[`${ch.id}/${it.id}`];
    b.appendChild(h('button.card.row.tap', { onclick: () => nav(`/practice/${ch.id}/${i}`) },
      h('div.ic-big', ok ? '✅' : '▶'),
      h('div', { style: 'flex:1;min-width:0;text-align:left' },
        h('b', it.title),
        h('p.sub', GOAL_KO[it.goal] || '')),
    ));
  });
}

/* ---------------- 정해진 국면 연습 ---------------- */

async function lessonView(app, ch, i) {
  const st = settingsNow();
  const item = ch.items[i];
  if (!item) { nav(`/practice/${ch.id}`, true); return; }

  const s = screen(item.title);
  app.appendChild(s.root);
  const b = s.body;

  const chess = new Chess(item.fen);
  const mySide = chess.turn();
  let sel = null, over = false, busy = false, lastAnim = null;
  let judged = false;            // 엔진이 떠서 채점할 수 있나
  const startFen = item.fen;

  const goalBar = h('div.goalbar',
    h('span.badge.info', GOAL_KO[item.goal]),
    h('span.dim', { style: 'margin-left:8px' }, `${mySide === 'w' ? '백' : '흑'}으로 둡니다`));
  const boardHost = h('div.board-wrap');
  const status = h('div.puz-status', '두어 보세요');
  const promo = h('div.promo.hidden');
  const tip = h('p.sub', { style: 'margin-top:8px' }, '💡 ', item.tip);
  const btnRow = h('div.btn-row.mt');

  b.appendChild(h('div.card', goalBar, status, boardHost, promo, btnRow, tip));
  const unfit = fitBoard(boardHost, [promo, btnRow]);

  const engineOn = engine.available;
  if (!engineOn) status.textContent = '엔진이 없어 채점 없이 자유롭게 둡니다 (앱에서 열면 채점됩니다)';

  async function boot() {
    if (!engineOn) return;
    try {
      await engine.start();
      keepAwake(true);
      const r = await engine.analyse(chess.fen(), { movetime: 600 });
      judged = !!r;
    } catch (e) {
      status.textContent = '엔진을 켜지 못했습니다 — 채점 없이 둡니다';
    }
  }

  function draw(extra) {
    const marks = {};
    const last = chess.history({ verbose: true }).slice(-1)[0];
    if (last) { addMark(marks, last.from, 'hl'); addMark(marks, last.to, 'hl'); }
    if (sel) {
      addMark(marks, sel, 'sel');
      for (const m of chess.moves({ square: sel, verbose: true })) addMark(marks, m.to, m.captured ? 'cap' : 'dot');
    }
    if (extra) for (const [sq, t] of Object.entries(extra)) addMark(marks, sq, t);
    renderBoard(boardHost, chess.fen(), {
      orient: mySide, marks, ...boardOpts(st),
      anim: st.animate ? lastAnim : null,
      onSquare: (over || busy || chess.turn() !== mySide) ? null : onSquare,
    });
    lastAnim = null;
  }

  function onSquare(sq) {
    if (over || busy) return;
    promo.classList.add('hidden');
    const piece = chess.get(sq);
    if (sel) {
      const cand = chess.moves({ square: sel, verbose: true }).filter((m) => m.to === sq);
      if (cand.length === 1) return tryMove(cand[0]);
      if (cand.length > 1) return openPromo(cand);
    }
    sel = (piece && piece.color === chess.turn() && sq !== sel) ? sq : null;
    draw();
  }

  function openPromo(cand) {
    promo.classList.remove('hidden');
    promo.innerHTML = '';
    for (const t of ['q', 'r', 'n', 'b']) {
      const m = cand.find((x) => x.promotion === t);
      if (!m) continue;
      promo.appendChild(h('button', {
        onclick: () => { promo.classList.add('hidden'); tryMove(m); },
        html: `<svg viewBox="0 0 45 45"><use href="#p${mySide}${t}"/></svg>`,
      }));
    }
  }

  /**
   * 목표를 아직 이룰 수 있나 — 승/무/패 확률(WDL)로 잰다.
   * 센티폰으로 재면 안 된다: 스톡피시 18 의 cp 는 정규화돼 있어서
   * 두 비숍으로 다 이긴 자리도 +2.8 로 나온다. 반면 WDL 은 1000/0/0 이다.
   * @param r  내 수를 둔 뒤의 분석 결과(=상대 차례 관점) — 여기서 뒤집는다
   */
  function keepsGoal(r) {
    const wdl = r && r.wdl;
    const myWin = wdl ? wdl[2] : null;      // 상대의 패배 = 나의 승리
    const myLoss = wdl ? wdl[0] : null;
    const myMate = r && r.mate != null ? -r.mate : null;
    if (item.goal === 'draw') return myLoss == null ? true : myLoss <= 200;
    if (myMate != null && myMate > 0) return true;
    if (myWin != null) return myWin >= 880;
    return -toScore(r) >= 250;              // WDL 이 없는 엔진용 최후 수단
  }

  async function tryMove(m) {
    sel = null;
    busy = true;
    const mv = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    lastAnim = { from: m.from, to: m.to, kind: moveKind(mv, chess) };
    impact(moveKind(mv, chess), st);
    draw();

    if (checkEnd()) { busy = false; return; }

    if (!engineOn || !judged) { busy = false; return reply(); }

    let res = null;
    try { res = await engine.analyse(chess.fen(), { movetime: 700 }); } catch (e) { res = null; }

    if (res && !keepsGoal(res)) {
      // 물러 준다 — 왜 안 되는지 알려 주고 다시 두게.
      // load(FEN) 이 아니라 undo 여야 한다 — load 는 기보를 지워 「무르기」가 못 쓰게 된다.
      chess.undo();
      lastAnim = null;
      status.innerHTML = '';
      status.appendChild(h('b.bad-txt', `❌ ${mv.san} 는 목표를 놓칩니다`));
      status.appendChild(h('span.dim', { style: 'margin-left:8px' },
        item.goal === 'mate' ? '메이트가 사라집니다'
          : item.goal === 'win' ? '이길 수 있는 자리가 아니게 됩니다'
            : '이 수 뒤에는 버티기 어려워집니다'));
      impact('bad', st);
      busy = false;
      draw({ [m.from]: 'bad', [m.to]: 'bad' });
      return;
    }
    status.innerHTML = '';
    status.appendChild(h('b.good-txt', '✅ 좋습니다'));
    busy = false;
    reply();
  }

  async function reply() {
    if (over || chess.turn() === mySide) return;
    busy = true;
    draw();
    if (!engineOn) { busy = false; return; }
    try {
      // 상대는 제일 끈질기게 버티는 수를 둔다
      const r = await engine.analyse(chess.fen(), { movetime: 500 });
      if (r.best) {
        const mv = chess.move({
          from: r.best.slice(0, 2), to: r.best.slice(2, 4),
          promotion: r.best.slice(4, 5) || undefined,
        });
        if (mv) {
          impact(moveKind(mv, chess), st);
          lastAnim = { from: mv.from, to: mv.to, kind: moveKind(mv, chess) };
        }
      }
    } catch (e) {}
    busy = false;
    draw();
    checkEnd();
  }

  function checkEnd() {
    let win = false, msg = null;
    if (chess.isCheckmate()) {
      win = chess.turn() !== mySide;
      msg = win ? '🎉 메이트! 통과입니다' : '😢 내가 메이트를 당했습니다';
    } else if (chess.isStalemate()) {
      win = item.goal === 'draw';
      msg = win ? '🤝 스테일메이트 — 비겼습니다. 통과!' : '⚠️ 스테일메이트 — 이길 수 있었는데 비겼습니다';
    } else if (chess.isInsufficientMaterial() || chess.isDraw()) {
      win = item.goal === 'draw';
      msg = win ? '🤝 무승부 — 통과입니다' : '⚠️ 무승부가 되었습니다';
    } else if (item.goal === 'win') {
      const last = chess.history({ verbose: true }).slice(-1)[0];
      if (last && last.promotion && last.color === mySide) { win = true; msg = '👑 승격 성공 — 통과입니다!'; }
      else if (strippedFoe()) { win = true; msg = '✅ 상대 기물을 다 걷어냈습니다 — 통과!'; }
    } else if (item.goal === 'draw' && chess.history().length >= 40) {
      win = true; msg = '🤝 끝까지 버텼습니다 — 통과!';
    }
    if (!msg) return false;
    over = true;
    keepAwake(false);
    status.innerHTML = '';
    status.appendChild(h('b.' + (win ? 'good-txt' : 'bad-txt'), msg));
    impact(win ? 'win' : 'lose', st);
    if (win) markDone(`${ch.id}/${item.id}`);
    paintButtons();
    draw();
    return true;
  }

  /** 상대는 킹만 남고 나는 퀸이나 룩을 들고 있나 (= 이긴 것과 같다) */
  function strippedFoe() {
    const foe = mySide === 'w' ? 'b' : 'w';
    let foeOther = 0, myHeavy = 0;
    for (const row of chess.board()) {
      for (const c of row || []) {
        if (!c || c.type === 'k') continue;
        if (c.color === foe) foeOther++;
        else if (c.type === 'q' || c.type === 'r') myHeavy++;
      }
    }
    return foeOther === 0 && myHeavy > 0;
  }

  function paintButtons() {
    clear(btnRow);
    if (over) {
      const nextI = i + 1;
      if (nextI < ch.items.length) {
        btnRow.appendChild(h('button.btn.primary', {
          onclick: () => nav(`/practice/${ch.id}/${nextI}`),
        }, '다음 과제 →'));
      }
      btnRow.appendChild(h('button.btn', { onclick: restart }, '다시 하기'));
      btnRow.appendChild(h('button.btn.ghost', { onclick: () => nav(`/practice/${ch.id}`) }, '목록'));
      return;
    }
    btnRow.appendChild(h('button.btn', { onclick: undo }, '↩ 무르기'));
    btnRow.appendChild(h('button.btn', { onclick: restart }, '처음부터'));
    btnRow.appendChild(h('button.btn.ghost', { onclick: showHint }, '💡 한 수 보기'));
  }

  function undo() {
    if (busy) return;
    // 내 차례로 돌아올 때까지 무른다 (상대 응수 + 내 수)
    if (!chess.undo()) return;
    while (chess.turn() !== mySide && chess.undo()) { /* 계속 */ }
    over = false; sel = null; lastAnim = null;
    status.textContent = '다시 두어 보세요';
    paintButtons();
    draw();
  }

  function restart() {
    chess.load(startFen);
    over = false; sel = null; busy = false; lastAnim = null;
    status.textContent = '두어 보세요';
    paintButtons();
    draw();
  }

  async function showHint() {
    if (!engineOn) return toast('앱에서만 됩니다');
    status.innerHTML = '<span class="spin"></span> 찾는 중…';
    try {
      const r = await engine.analyse(chess.fen(), { movetime: 900 });
      const c = new Chess(chess.fen());
      const m = c.move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best.slice(4, 5) || undefined });
      status.innerHTML = '';
      status.appendChild(h('b', `💡 ${m ? m.san : r.best}`));
      draw({ [r.best.slice(0, 2)]: 'good', [r.best.slice(2, 4)]: 'good' });
    } catch (e) { status.textContent = '엔진이 답하지 않습니다'; }
  }

  paintButtons();
  draw();
  boot();
  return () => { keepAwake(false); unfit(); };
}

/* ---------------- 주제별 연달아 풀기 ---------------- */

async function themeView(app, ch) {
  const st = settingsNow();
  const s = screen(`${ch.ic} ${ch.name}`);
  app.appendChild(s.root);
  const b = s.body;

  const pool = (await allPuzzles()).filter((p) => (p.themes || []).includes(ch.theme));
  if (!pool.length) {
    b.appendChild(h('div.empty', h('div.big', '🧩'), h('p', '이 주제의 문제가 아직 없습니다')));
    return;
  }
  const pstate = await getState();
  const total = Math.min(ch.n || 5, pool.length);

  b.appendChild(h('div.card', h('p.sub', '💡 ', ch.tip)));
  const counter = h('p.sub.mb');
  const boardHost = h('div.board-wrap');
  const status = h('div.puz-status');
  const btnRow = h('div.btn-row.mt');
  b.appendChild(counter);
  b.appendChild(h('div.card', status, boardHost, btnRow));
  const unfit = fitBoard(boardHost, [btnRow]);

  let k = 0, okCnt = 0, run = null, sel = null, done = false;
  const used = new Set();
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const stop = () => { timers.forEach(clearTimeout); timers = []; };

  function nextOne() {
    stop();
    if (k >= total) return finish();
    const left = pool.filter((p) => !used.has(p.id));
    const p = pickPuzzle(left.length ? left : pool, pstate, {}) || left[0] || pool[0];
    used.add(p.id);
    run = runner(p); sel = null; done = false;
    counter.textContent = `${k + 1} / ${total} · 맞힌 수 ${okCnt}`;
    status.textContent = '상대가 두는 중…';
    clear(btnRow);
    draw();
    later(() => {
      run.opponent();
      impact('move', st);
      status.innerHTML = '';
      status.appendChild(h('b', `${run.side === 'w' ? '백' : '흑'} 차례 — 찾으세요`));
      draw();
    }, 520);
  }

  function draw(extra) {
    const marks = {};
    const last = run && run.chess.history({ verbose: true }).slice(-1)[0];
    if (last) { addMark(marks, last.from, 'hl'); addMark(marks, last.to, 'hl'); }
    if (sel) {
      addMark(marks, sel, 'sel');
      for (const m of run.chess.moves({ square: sel, verbose: true })) addMark(marks, m.to, m.captured ? 'cap' : 'dot');
    }
    if (extra) for (const [sq, t] of Object.entries(extra)) addMark(marks, sq, t);
    renderBoard(boardHost, run ? run.fen : 'start', {
      orient: run ? run.side : 'w', marks, ...boardOpts(st),
      onSquare: done ? null : onSquare,
    });
  }

  function onSquare(sq) {
    if (done || !run) return;
    const piece = run.chess.get(sq);
    if (sel) {
      const cand = run.chess.moves({ square: sel, verbose: true }).filter((m) => m.to === sq);
      if (cand.length) return submit(cand[0]);
    }
    sel = (piece && piece.color === run.chess.turn() && sq !== sel) ? sq : null;
    draw();
  }

  function submit(m) {
    sel = null;
    const r = run.try(m.lan);
    if (!r.ok) {
      impact('bad', st);
      status.innerHTML = '';
      status.appendChild(h('b.bad-txt', '❌ 다시 — 정답 수순: '));
      status.appendChild(h('span.dim', run.solutionSans().join(' ')));
      done = true;
      draw({ [m.from]: 'bad', [m.to]: 'bad' });
      clear(btnRow);
      btnRow.appendChild(h('button.btn.primary.wide', { onclick: () => { k++; nextOne(); } }, '다음 →'));
      return;
    }
    impact(moveKind(r.move, run.chess), st);
    if (r.end) {
      okCnt++; k++;
      impact('ok', st);
      status.innerHTML = '';
      status.appendChild(h('b.good-txt', '✅ 정답!'));
      draw();
      return later(nextOne, 620);
    }
    draw();
    later(() => { run.opponent(); impact('move', st); draw(); }, 450);
  }

  async function finish() {
    done = true;
    counter.textContent = `${total}문제 중 ${okCnt}개 정답`;
    status.innerHTML = '';
    status.appendChild(h('b', okCnt >= Math.ceil(total * 0.7) ? '🎉 통과입니다!' : '조금 더 해 보면 좋겠습니다'));
    impact(okCnt >= Math.ceil(total * 0.7) ? 'win' : 'ok', st);
    if (okCnt >= Math.ceil(total * 0.7)) await markDone(`${ch.id}/theme`);
    clear(btnRow);
    btnRow.appendChild(h('button.btn.primary', { onclick: () => { k = 0; okCnt = 0; used.clear(); nextOne(); } }, '한 번 더'));
    btnRow.appendChild(h('button.btn.ghost', { onclick: () => nav('/practice') }, '코스 목록'));
  }

  nextOne();
  return () => { stop(); unfit(); };
}
