/* 🧩 퍼즐 — 리체스 training 과 같은 방식.
 * 상대가 실수를 두면 그 자리에서 응징하는 수를 찾는다.
 * 맞히면 레이팅이 오르고, 어려운 문제가 나온다. */

import { h, nav, screen, toast, clear, impact, moveKind } from '../ui.js';
import { renderBoard, addMark, boardOpts } from '../board.js';
import { settingsNow, store } from '../store.js';
import {
  allPuzzles, getState, setState, applyResult, pickPuzzle, runner,
  THEME_KO, MAIN_THEMES,
} from '../puzzles.js';

// 화면을 나갔다 와도 고른 주제는 남는다
let curTheme = null;

export async function view(app, params) {
  const mode = params && params.mode;
  if (mode === 'stats') return statsView(app);
  if (mode === 'rush') return rushView(app);
  return solveView(app);
}

/* ---------------- 한 문제씩 풀기 ---------------- */

async function solveView(app) {
  const st = settingsNow();
  const s = screen('🧩 퍼즐', {
    back: false,
    right: h('button.icon-btn', { onclick: () => nav('/puzzle/stats'), 'aria-label': '성적' }, '📊'),
  });
  app.appendChild(s.root);
  const b = s.body;

  const pool = await allPuzzles();
  let state = await getState();

  if (!pool.length) {
    b.appendChild(h('div.empty', h('div.big', '🧩'),
      h('p', h('b', '퍼즐이 아직 없습니다')),
      h('p.sub', '경기를 가져와 분석하면 그 경기의 실수가 퍼즐이 됩니다.'),
      h('div.mt', h('button.btn.primary', { onclick: () => nav('/import') }, '경기 가져오기'))));
    return;
  }

  // 폰 화면에서는 판이 제일 중요하다 — 머리글은 한 줄로 눌러 놓는다
  const deltaEl = h('span.delta');
  const ratingEl = h('b', String(state.rating));
  const streakEl = h('b', String(state.streak));
  const todayEl = h('b', String(state.today || 0));
  // 주제 고르개는 접어 둔다 — 폰에서는 판이 화면 밖으로 밀리면 안 된다
  const themeRow = h('div.chips.scroller.mb.hidden');
  const themeBtn = h('button.chip', {
    onclick: () => {
      themeRow.classList.toggle('hidden');
      themeBtn.classList.toggle('on', !themeRow.classList.contains('hidden'));
    },
  }, '🏷 주제');
  const head = h('div.puz-head',
    h('span', '🏅 ', ratingEl, h('span.dim', '점'), deltaEl),
    h('span', '🔥 ', streakEl, h('span.dim', '연속')),
    h('span', '📅 ', todayEl, h('span.dim', '오늘')),
    h('div.spacer'),
    themeBtn);
  const boardHost = h('div.board-wrap');
  const status = h('div.puz-status');
  const meta = h('p.dim', { style: 'text-align:center;margin-top:6px' });
  const promo = h('div.promo.hidden');
  const btnRow = h('div.btn-row.mt');
  const solBox = h('div.hidden');

  b.appendChild(head);
  b.appendChild(themeRow);
  b.appendChild(h('div.card', status, boardHost, promo, meta, btnRow, solBox));

  function paintThemes() {
    clear(themeRow);
    const counts = new Map();
    for (const p of pool) for (const t of p.themes || []) counts.set(t, (counts.get(t) || 0) + 1);
    themeRow.appendChild(h('button.chip' + (curTheme ? '' : '.on'), {
      onclick: () => { curTheme = null; paintThemes(); next(); },
    }, `전체 ${pool.length}`));
    for (const t of MAIN_THEMES) {
      const n = counts.get(t) || 0;
      if (!n) continue;
      themeRow.appendChild(h('button.chip' + (curTheme === t ? '.on' : ''), {
        onclick: () => { curTheme = t; paintThemes(); next(); },
      }, `${THEME_KO[t] || t} ${n}`));
    }
    themeBtn.textContent = curTheme ? `🏷 ${THEME_KO[curTheme] || curTheme}` : '🏷 주제';
  }
  paintThemes();

  /* ---- 한 문제 ---- */
  let puz = null, run = null, sel = null, over = false, failedOnce = false, hinted = false;
  let lastAnim = null;
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const stopTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function next() {
    stopTimers();
    puz = pickPuzzle(pool, state, { theme: curTheme });
    if (!puz) { status.textContent = '이 주제에는 낼 퍼즐이 없습니다'; return; }
    run = runner(puz);
    sel = null; over = false; failedOnce = false; hinted = false; lastAnim = null;
    solBox.classList.add('hidden');
    clear(solBox);
    status.className = 'puz-status';
    status.textContent = '상대가 두는 중…';
    meta.textContent = `난이도 ${puz.rating}` + (puz.src === 'mine' ? ` · 내 경기 (${puz.game || ''})` : '');
    paintButtons();
    draw();
    // 상대의 실수를 눈앞에서 둔다 — 무엇이 잘못됐는지 보게
    later(() => {
      const m = run.opponent();
      if (m) {
        const kind = moveKind(m, run.chess);
        impact(kind, st);
        lastAnim = { from: m.from, to: m.to, kind };
      }
      status.innerHTML = '';
      status.appendChild(h('b', `${run.side === 'w' ? '백' : '흑'} 차례 — 최선의 수를 찾으세요`));
      draw();
    }, 650);
  }

  function draw(extra) {
    const marks = {};
    const hist = run.chess.history({ verbose: true }).slice(-1)[0];
    if (hist) { addMark(marks, hist.from, 'hl'); addMark(marks, hist.to, 'hl'); }
    if (sel) {
      addMark(marks, sel, 'sel');
      for (const m of run.chess.moves({ square: sel, verbose: true })) {
        addMark(marks, m.to, m.captured ? 'cap' : 'dot');
      }
    }
    if (hinted && run.expect) addMark(marks, run.expect.slice(0, 2), 'good');
    if (extra) for (const [sq, t] of Object.entries(extra)) addMark(marks, sq, t);
    if (run.chess.isCheck()) {
      const k = run.chess.board().flat().find((c) => c && c.type === 'k' && c.color === run.chess.turn());
      if (k) addMark(marks, k.square, 'check');
    }
    renderBoard(boardHost, run.fen, {
      orient: run.side, marks,
      ...boardOpts(st),
      anim: st.animate ? lastAnim : null,
      onSquare: over ? null : onSquare,
    });
    lastAnim = null;
  }

  function onSquare(sq) {
    if (over) return;
    promo.classList.add('hidden');
    const piece = run.chess.get(sq);
    if (sel) {
      const cand = run.chess.moves({ square: sel, verbose: true }).filter((m) => m.to === sq);
      if (cand.length === 1) return submit(cand[0]);
      if (cand.length > 1) return openPromo(cand);
    }
    sel = (piece && piece.color === run.chess.turn() && sq !== sel) ? sq : null;
    draw();
  }

  function openPromo(cand) {
    promo.classList.remove('hidden');
    promo.innerHTML = '';
    for (const t of ['q', 'r', 'n', 'b']) {
      const m = cand.find((x) => x.promotion === t);
      if (!m) continue;
      promo.appendChild(h('button', {
        onclick: () => { promo.classList.add('hidden'); submit(m); },
        html: `<svg viewBox="0 0 45 45"><use href="#p${run.chess.turn()}${t}"/></svg>`,
      }));
    }
  }

  function submit(m) {
    sel = null;
    const r = run.try(m.lan);
    if (r.ok) {
      impact(moveKind(r.move, run.chess), st);
      lastAnim = { from: m.from, to: m.to, kind: moveKind(r.move, run.chess) };
      if (r.end) return finish(true);
      status.innerHTML = '';
      status.appendChild(h('b.good-txt', '✅ 좋습니다!'));
      draw();
      later(() => {
        const om = run.opponent();
        if (om) {
          impact(moveKind(om, run.chess), st);
          lastAnim = { from: om.from, to: om.to, kind: moveKind(om, run.chess) };
        }
        if (run.done) return finish(true);
        status.innerHTML = '';
        status.appendChild(h('b', '계속 — 다음 수는?'));
        draw();
      }, 520);
      return;
    }
    // 틀렸다 — 둔 수를 잠깐 보여 주고 되돌린다
    impact('bad', st);
    if (!failedOnce) { failedOnce = true; record(false); }
    status.innerHTML = '';
    status.appendChild(h('b.bad-txt', '❌ 아쉽습니다 — 다시 해 보세요'));
    const bad = {};
    bad[m.from] = 'bad'; bad[m.to] = 'bad';
    draw(bad);
    later(() => { if (!over) draw(); }, 900);
    paintButtons();
  }

  function finish(win) {
    over = true;
    stopTimers();
    if (!failedOnce) record(true);
    impact(win && !failedOnce ? 'win' : 'ok', st);
    status.innerHTML = '';
    status.appendChild(h('b.' + (failedOnce ? 'dim' : 'good-txt'),
      failedOnce ? '수순은 이렇습니다' : '🎉 정답입니다!'));
    draw();
    paintButtons();
  }

  function record(win) {
    const r = applyResult(state, puz, win);
    state = r.state;
    setState(state);
    ratingEl.textContent = String(state.rating);
    clear(deltaEl);
    deltaEl.className = 'delta ' + (r.delta >= 0 ? 'up' : 'down');
    deltaEl.textContent = (r.delta >= 0 ? '+' : '') + r.delta;
    streakEl.textContent = String(state.streak);
    todayEl.textContent = String(state.today || 0);
  }

  function paintButtons() {
    clear(btnRow);
    if (over) {
      btnRow.appendChild(h('button.btn.primary.wide', { onclick: next }, '다음 퍼즐 →'));
      btnRow.appendChild(h('button.btn.ghost', {
        onclick: async () => {
          await store.set('boardFen', run.fen);
          nav('/board');
        },
      }, '🔬 분석판에서 보기'));
      return;
    }
    btnRow.appendChild(h('button.btn', {
      onclick: () => { hinted = true; draw(); paintButtons(); },
    }, hinted ? '💡 힌트 켬' : '💡 힌트 (움직일 기물)'));
    btnRow.appendChild(h('button.btn.ghost', {
      onclick: () => {
        if (!failedOnce) { failedOnce = true; record(false); }
        const sans = run.solutionSans();
        clear(solBox);
        solBox.classList.remove('hidden');
        solBox.appendChild(h('p.sub', { style: 'margin-top:8px' }, '정답 수순: ', h('b', sans.join(' '))));
        // 정답을 눈으로 보여 준다
        let k = 0;
        const step = () => {
          const m = run.opponent();
          if (!m) return finish(false);
          impact(moveKind(m, run.chess), st);
          lastAnim = { from: m.from, to: m.to, kind: moveKind(m, run.chess) };
          draw();
          k++;
          if (!run.done) later(step, 620);
          else later(() => finish(false), 400);
        };
        step();
      },
    }, '👀 정답 보기'));
  }

  next();
  return stopTimers;
}

/* ---------------- 연속 도전 (퍼즐 러시) ---------------- */

async function rushView(app) {
  const st = settingsNow();
  const s = screen('🔥 연속 도전');
  app.appendChild(s.root);
  const b = s.body;
  const pool = await allPuzzles();
  let state = await getState();

  const scoreEl = h('div.v', '0');
  const lifeEl = h('div.v', '❤❤❤');
  const bestEl = h('div.v', String((state.rush && state.rush.best) || 0));
  b.appendChild(h('div.grid3.mb',
    h('div.stat', h('div.k', '맞힌 수'), scoreEl),
    h('div.stat', h('div.k', '남은 목숨'), lifeEl),
    h('div.stat', h('div.k', '최고 기록'), bestEl)));

  const boardHost = h('div.board-wrap');
  const status = h('div.puz-status', '준비되면 시작하세요');
  const btnRow = h('div.btn-row.mt');
  b.appendChild(h('div.card', status, boardHost, btnRow));

  let score = 0, lives = 3, puz = null, run = null, sel = null, running = false;
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const stop = () => { timers.forEach(clearTimeout); timers = []; };

  function paintBtns() {
    clear(btnRow);
    if (!running) btnRow.appendChild(h('button.btn.primary.wide', { onclick: start }, '시작'));
    else btnRow.appendChild(h('button.btn.ghost.wide', { onclick: end }, '그만하기'));
  }

  function start() {
    score = 0; lives = 3; running = true;
    scoreEl.textContent = '0'; lifeEl.textContent = '❤❤❤';
    paintBtns();
    nextPuz();
  }

  function nextPuz() {
    // 맞힐수록 어려워진다
    puz = pickPuzzle(pool, state, { rating: 900 + score * 55 });
    if (!puz) return end();
    run = runner(puz); sel = null;
    status.textContent = '상대가 두는 중…';
    draw();
    later(() => {
      run.opponent();
      impact('move', st);
      status.textContent = `${run.side === 'w' ? '백' : '흑'} 차례 — 찾으세요`;
      draw();
    }, 450);
  }

  function draw(extra) {
    const marks = {};
    const hist = run && run.chess.history({ verbose: true }).slice(-1)[0];
    if (hist) { addMark(marks, hist.from, 'hl'); addMark(marks, hist.to, 'hl'); }
    if (sel) {
      addMark(marks, sel, 'sel');
      for (const m of run.chess.moves({ square: sel, verbose: true })) addMark(marks, m.to, m.captured ? 'cap' : 'dot');
    }
    if (extra) for (const [sq, t] of Object.entries(extra)) addMark(marks, sq, t);
    renderBoard(boardHost, run ? run.fen : 'start', {
      orient: run ? run.side : 'w', marks, ...boardOpts(st),
      onSquare: running ? onSquare : null,
    });
  }

  function onSquare(sq) {
    if (!running || !run) return;
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
      lives--;
      lifeEl.textContent = '❤'.repeat(Math.max(0, lives)) || '—';
      status.textContent = '❌ 틀렸습니다';
      draw();
      if (lives <= 0) return later(end, 700);
      return later(nextPuz, 800);
    }
    impact(moveKind(r.move, run.chess), st);
    if (r.end) {
      score++;
      scoreEl.textContent = String(score);
      impact('ok', st);
      status.textContent = '✅ 정답!';
      draw();
      return later(nextPuz, 550);
    }
    draw();
    later(() => { run.opponent(); impact('move', st); draw(); }, 420);
  }

  async function end() {
    running = false;
    stop();
    status.textContent = `끝 — ${score}개 맞혔습니다`;
    const s2 = await getState();
    const rush = s2.rush || { best: 0, plays: 0 };
    const wasBest = score > (rush.best || 0);
    rush.plays++;
    if (wasBest) { rush.best = score; toast('🏆 최고 기록!'); }
    s2.rush = rush;
    await setState(s2);
    state = s2;
    bestEl.textContent = String(rush.best);
    impact(wasBest ? 'win' : 'lose', st);
    paintBtns();
    draw();
  }

  paintBtns();
  return stop;
}

/* ---------------- 성적 ---------------- */

async function statsView(app) {
  const s = screen('📊 퍼즐 성적');
  app.appendChild(s.root);
  const b = s.body;
  const state = await getState();
  const pool = await allPuzzles();
  const done = Object.keys(state.solved).length;
  const ok = Object.values(state.solved).filter((x) => x.ok).length;

  b.appendChild(h('div.grid3.mb',
    h('div.stat', h('div.k', '퍼즐 점수'), h('div.v', String(state.rating))),
    h('div.stat', h('div.k', '푼 문제'), h('div.v', `${done}`)),
    h('div.stat', h('div.k', '정답률'), h('div.v', done ? `${Math.round(ok / done * 100)}%` : '—'))));
  b.appendChild(h('div.grid3.mb',
    h('div.stat', h('div.k', '최고 연속'), h('div.v', String(state.best || 0))),
    h('div.stat', h('div.k', '연속 도전 최고'), h('div.v', String((state.rush && state.rush.best) || 0))),
    h('div.stat', h('div.k', '가진 퍼즐'), h('div.v', String(pool.length)))));

  // 주제별 성적 — 뭐가 약한지 한눈에
  const rows = [];
  for (const [t, v] of Object.entries(state.byTheme || {})) {
    if (!v.n) continue;
    rows.push({ t, n: v.n, ok: v.ok, pct: v.ok / v.n });
  }
  rows.sort((a, b2) => a.pct - b2.pct);
  const card = h('div.card', h('h3', '주제별 성적'), h('p.sub.mb', '약한 것이 위에 옵니다'));
  if (!rows.length) card.appendChild(h('p.dim', '아직 푼 문제가 없습니다.'));
  for (const r of rows) {
    card.appendChild(h('div.trow',
      h('span', THEME_KO[r.t] || r.t),
      h('div.spacer'),
      h('span.dim', `${r.ok}/${r.n}`),
      h('span.badge.' + (r.pct >= 0.7 ? 'good' : r.pct >= 0.4 ? 'info' : 'mistake'),
        `${Math.round(r.pct * 100)}%`)));
  }
  b.appendChild(card);

  b.appendChild(h('div.btn-row.mt',
    h('button.btn.primary', { onclick: () => nav('/puzzle') }, '퍼즐 풀기'),
    h('button.btn', { onclick: () => nav('/puzzle/rush') }, '🔥 연속 도전')));
}
