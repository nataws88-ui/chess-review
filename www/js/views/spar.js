/* ⚔️ 엔진 대국 — 아무 국면에서나 스톡피시와 계속 둬 본다.
 *
 * Chessis 의 Play Chess 를 옮겼다:
 *   시계(증가 시간 포함) · 무르기(+10초 보상) · 힌트 · 기권/무승부 ·
 *   내 수 강도 실시간 · 블런더·실수에서 자동 정지 + 왜 나빴나 ·
 *   지난 대국 이어하기 · 사람처럼 두는 상대 · 무작위 배치(체스960)
 *   대국 중에도 국면 읽기·위협 겹쳐 보기 */

import { h, nav, screen, toast, clear, impact, moveKind, keepAwake, isApp, fitBoard } from '../ui.js';
import { renderBoard, addMark, boardOpts } from '../board.js';
import { settings, setSetting, store } from '../store.js';
import { Chess } from '../lib/chess.js';
import engine, { toScore } from '../engine.js';
import { wp as winPct, classify, uciToSan } from '../analyze.js';
import { analyzeAndSave, invalidate } from '../games.js';
import { readPosition, readThreats, DEFAULT_ELEMS } from '../insight.js';
import { QUALITY } from '../quizgen.js';

const LEVELS = [
  { n: '입문',   skill: 0,  mt: 200,  d: '엔진이 일부러 실수해 줍니다' },
  { n: '초급',   skill: 5,  mt: 300,  d: '쉬운 상대' },
  { n: '중급',   elo: 1400, mt: 400,  d: '동네 잘 두는 사람' },
  { n: '상급',   elo: 1800, mt: 600,  d: '클럽 수준' },
  { n: '고수',   elo: 2200, mt: 800,  d: '전문가 수준' },
  { n: '최강',   elo: null, mt: 1200, d: '제한 없음 — 이기기 어렵습니다' },
  // 사람처럼 — 엔진 강도를 낮추는 것에 더해, 가끔 2·3번째 수를 고른다.
  // Chessis 의 Maia(신경망 50MB 내려받기) 대신 스톡피시만으로 흉내 낸 것이다.
  { n: '사람처럼 1100', elo: 1400, mt: 300, human: 0.45, d: '초보자처럼 흔들립니다' },
  { n: '사람처럼 1600', elo: 1700, mt: 400, human: 0.3,  d: '중급자처럼 둡니다' },
  { n: '사람처럼 2000', elo: 2100, mt: 600, human: 0.18, d: '상급자처럼 둡니다' },
];

const SAVE = 'sparState';

export async function view(app) {
  const st = await settings();
  const s = screen('⚔️ 엔진 대국', { back: false });
  app.appendChild(s.root);
  const b = s.body;

  if (!isApp) {
    b.appendChild(h('div.card.err', h('b', '앱에서만 가능합니다'), h('p.sub', '엔진이 필요합니다.')));
    return;
  }

  // 퀴즈·분석판에서 넘어온 국면
  const startFen = await store.get('sparFen', null);
  await store.set('sparFen', null);
  const saved = startFen ? null : await store.get(SAVE, null);

  let lvIdx = Math.max(0, Math.min(LEVELS.length - 1, st.sparLevel ?? 2));
  let chess = new Chess(startFen || undefined);
  let rootFen = chess.fen();
  let myColor = startFen ? chess.turn() : 'w';
  let sel = null, thinking = false, over = false, paused = false;
  let evalPct = 50, myWinBefore = null;
  const undoStack = [];

  // 시계 — 0분이면 아예 재지 않는다
  let clock = null, tickTimer = null, tickAt = 0;

  // 국면 읽기·위협 (대국 중)
  let showElems = !!st.elemsInPlay;
  let showThreats = !!st.threatsInPlay;
  const elems = { ...DEFAULT_ELEMS, ...(st.keyElems || {}) };
  const threatMode = { material: true, mate: true, undef: true, ...(st.threatMode || {}) };

  const boardHost = h('div.board-wrap');
  const promo = h('div.promo.hidden');
  const evalBar = h('div.wpbar', { style: 'margin-top:10px' });
  const clockRow = h('div.row.clocks.hidden');
  const clockTop = h('div.clock'), clockBot = h('div.clock');
  clockRow.appendChild(clockTop); clockRow.appendChild(h('div.spacer')); clockRow.appendChild(clockBot);
  const statusEl = h('p.sub', { style: 'text-align:center;margin-top:8px;min-height:20px' });
  const strengthEl = h('div.strength.hidden');
  const whyBox = h('div.card.hidden', { style: 'margin-top:10px' });
  const keNotes = h('div.ke-notes');
  const movesEl = h('div.movelist', { style: 'max-height:96px;margin-top:10px' });

  const levelChips = h('div.chips.mb');
  LEVELS.forEach((lv, i) => levelChips.appendChild(h('button.chip.sm' + (i === lvIdx ? '.on' : ''), {
    onclick: async () => {
      lvIdx = i;
      await setSetting('sparLevel', i);
      Array.from(levelChips.children).forEach((c, k) => c.classList.toggle('on', k === i));
      statusEl.textContent = `${LEVELS[i].n} — ${LEVELS[i].d}`;
    },
  }, lv.n)));

  const controls = h('div.row', { style: 'gap:6px;margin-top:10px;flex-wrap:wrap' },
    h('button.btn.sm', { onclick: undo }, '↩ 무르기'),
    h('button.btn.sm', { onclick: hint }, '💡 힌트'),
    h('button.btn.sm', { onclick: offerDraw }, '🤝 무승부'),
    h('button.btn.sm', { onclick: resign }, '🏳 기권'),
    h('button.btn.sm', { onclick: () => { myColor = myColor === 'w' ? 'b' : 'w'; draw(); maybeEngine(); } }, '🔄 색'),
    h('div.spacer'),
    h('button.btn.sm', { onclick: newGame }, '새 대국'));

  const overlays = h('div.row', { style: 'gap:6px;margin-top:6px;flex-wrap:wrap' },
    h('button.btn.sm' + (showElems ? '.on' : ''), {
      onclick: async (e) => {
        showElems = !showElems;
        e.currentTarget.classList.toggle('on', showElems);
        await setSetting('elemsInPlay', showElems);
        draw();
      },
    }, '🔍 국면 읽기'),
    h('button.btn.sm' + (showThreats ? '.on' : ''), {
      onclick: async (e) => {
        showThreats = !showThreats;
        e.currentTarget.classList.toggle('on', showThreats);
        await setSetting('threatsInPlay', showThreats);
        draw();
      },
    }, '⚠️ 위협'),
    h('button.btn.sm', {
      onclick: async () => { await store.set('boardFen', chess.fen()); nav('/board'); },
    }, '🔬 분석판'));

  b.appendChild(h('div.card',
    h('div.row.mb', h('h3', { style: 'flex:1' }, '난이도'), h('span.dim', LEVELS[lvIdx].d)),
    levelChips,
    clockRow,
    boardHost, promo, evalBar, strengthEl, statusEl, keNotes, controls, overlays, whyBox, movesEl,
    h('div.btn-row.mt',
      h('button.btn', { onclick: saveGame }, '💾 이 대국 저장·분석'),
      h('button.btn.ghost', { onclick: () => nav('/') }, '나가기'))));

  const unfit = fitBoard(boardHost, [promo, evalBar, strengthEl, statusEl, controls]);

  keepAwake(true);

  if (saved && saved.sans && saved.sans.length) {
    restore(saved);
    statusEl.textContent = '지난 대국을 이어서 둡니다';
  } else {
    setupClock();
    draw();
    statusEl.textContent = startFen ? '이 국면부터 이어서 둡니다' : `${LEVELS[lvIdx].n} — ${LEVELS[lvIdx].d}`;
  }
  maybeEngine();

  /* ---------------- 이어하기 ---------------- */

  function restore(sv) {
    try {
      rootFen = sv.rootFen || new Chess().fen();
      chess = new Chess(rootFen, { skipValidation: true });
      for (const san of sv.sans) chess.move(san);
      myColor = sv.myColor || 'w';
      lvIdx = sv.lvIdx ?? lvIdx;
      clock = sv.clock || null;
      Array.from(levelChips.children).forEach((c, k) => c.classList.toggle('on', k === lvIdx));
      paintClock();
    } catch (e) { setupClock(); }
    draw();
  }

  async function persist() {
    if (over) { await store.set(SAVE, null); return; }
    await store.set(SAVE, {
      rootFen, sans: chess.history(), myColor, lvIdx, clock,
    });
  }

  /* ---------------- 시계 ---------------- */

  function setupClock() {
    const min = +st.clockMin || 0;
    if (!min) { clock = null; clockRow.classList.add('hidden'); return; }
    clock = { w: min * 60000, b: min * 60000, inc: (+st.clockInc || 0) * 1000 };
    paintClock();
  }

  function startTick() {
    stopTick();
    if (!clock || over || paused) return;
    tickAt = Date.now();
    const soon = Math.min(clock.w, clock.b) < 20000;
    tickTimer = setInterval(onTick, soon ? 100 : 1000);
  }
  function stopTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }
  function onTick() {
    if (!clock || over || paused) return stopTick();
    const now = Date.now();
    const dt = now - tickAt;
    tickAt = now;
    const side = chess.turn();
    clock[side] = Math.max(0, clock[side] - dt);
    paintClock();
    if (clock[side] <= 0) {
      stopTick();
      over = true;
      statusEl.textContent = side === myColor ? '⏰ 시간이 다 됐습니다 — 졌습니다' : '⏰ 엔진의 시간이 다 됐습니다 — 이겼습니다!';
      impact(side === myColor ? 'lose' : 'win', st);
      persist();
      draw();
      return;
    }
    // 20초 아래로 내려가면 더 촘촘히 (그 전까지는 1초마다 — 배터리)
    if (Math.min(clock.w, clock.b) < 20000 && tickTimer && tickTimer._fast !== true) startTick();
  }
  function paintClock() {
    if (!clock) { clockRow.classList.add('hidden'); return; }
    clockRow.classList.remove('hidden');
    const foe = myColor === 'w' ? 'b' : 'w';
    clockTop.textContent = fmtClock(clock[foe]);
    clockBot.textContent = fmtClock(clock[myColor]);
    clockTop.classList.toggle('on', chess.turn() === foe && !over);
    clockBot.classList.toggle('on', chess.turn() === myColor && !over);
  }
  function addInc(side) {
    if (clock && clock.inc) clock[side] += clock.inc;
  }

  /* ---------------- 판 ---------------- */

  function draw(anim) {
    const marks = {};
    let arrows = [];
    let numbers = {};
    const notes = [];
    const last = chess.history({ verbose: true }).slice(-1)[0];
    if (last) {
      const style = st.lastMoveStyle === 'dot' ? 'lm-dot' : st.lastMoveStyle === 'frame' ? 'lm-frame' : 'hl';
      addMark(marks, last.from, style); addMark(marks, last.to, style);
    }
    if (sel) {
      addMark(marks, sel, 'sel');
      if (st.legalDots !== false) {
        chess.moves({ square: sel, verbose: true }).forEach((m) => addMark(marks, m.to, m.captured ? 'cap' : 'dot'));
      }
    }
    if (chess.isCheck()) {
      const king = findKing(chess, chess.turn());
      if (king) addMark(marks, king, 'check');
    }
    const fen = chess.fen();
    if (showElems) {
      const r = readPosition(fen, elems, myColor);
      for (const [sq, v] of Object.entries(r.marks)) (marks[sq] = marks[sq] || []).push(...v);
      arrows = arrows.concat(r.arrows); numbers = r.numbers; notes.push(...r.notes);
    }
    if (showThreats) {
      const r = readThreats(fen, myColor === 'w' ? 'b' : 'w', threatMode);
      for (const [sq, v] of Object.entries(r.marks)) (marks[sq] = marks[sq] || []).push(...v);
      arrows = arrows.concat(r.arrows); notes.push(...r.notes);
    }
    clear(keNotes);
    for (const n of notes) keNotes.appendChild(h('span.ke-note', n));

    renderBoard(boardHost, fen, {
      orient: myColor, marks, numbers,
      arrows: arrows.length ? arrows : null,
      ...boardOpts(st),
      anim: st.animate ? anim : null,
      onSquare: over || thinking || paused ? null : onSquare,
    });
    paintEval();
    paintClock();
    paintMoves();
    startTick();
  }

  function paintEval() {
    clear(evalBar);
    const w = Math.round(evalPct);
    evalBar.appendChild(h('div.w', { style: `width:${w}%` }, w >= 18 ? `백 ${w}%` : ''));
    evalBar.appendChild(h('div.b', { style: `width:${100 - w}%` }, 100 - w >= 18 ? `흑 ${100 - w}%` : ''));
  }

  function paintMoves() {
    clear(movesEl);
    const hist = chess.history();
    hist.forEach((san, i) => {
      if (i % 2 === 0) movesEl.appendChild(h('span.mvno', `${i / 2 + 1}.`));
      movesEl.appendChild(h('span.mv', san));
      movesEl.appendChild(document.createTextNode(' '));
    });
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  function onSquare(name) {
    if (chess.turn() !== myColor || thinking || over || paused) return;
    promo.classList.add('hidden');
    if (sel) {
      const cand = chess.moves({ square: sel, verbose: true }).filter((m) => m.to === name);
      if (cand.length === 1) return doMove(cand[0]);
      if (cand.length > 1) return openPromo(cand);
    }
    const has = chess.moves({ square: name, verbose: true }).length;
    sel = (sel !== name && has) ? name : null;
    draw();
  }

  function openPromo(cand) {
    promo.classList.remove('hidden');
    promo.innerHTML = '';
    for (const t of ['q', 'r', 'n', 'b']) {
      const m = cand.find((x) => x.promotion === t);
      if (!m) continue;
      promo.appendChild(h('button', {
        onclick: () => { promo.classList.add('hidden'); doMove(m); },
        html: `<svg viewBox="0 0 45 45"><use href="#p${myColor}${t}"/></svg>`,
      }));
    }
  }

  async function doMove(m) {
    const before = chess.fen();
    undoStack.push({ fen: before, clock: clock ? { ...clock } : null });
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    addInc(myColor);
    sel = null;
    const kind = moveKind(chess.history({ verbose: true }).slice(-1)[0], chess);
    impact(kind, st);
    draw({ from: m.from, to: m.to, kind });
    persist();
    if (checkOver()) return;
    // 내 수 강도 — 켜져 있으면 방금 둔 수가 어땠는지 바로 알려 준다
    if (st.showMoveStrength !== false) {
      const ok = await judgeMove(before, m);
      if (!ok) return;                 // 블런더에서 멈췄다
    }
    maybeEngine();
  }

  /* ---------------- 내 수 강도 · 블런더에서 정지 ---------------- */

  /** @returns {boolean} 계속 둬도 되는가 (false = 멈춤) */
  async function judgeMove(fenBefore, m) {
    try {
      const r0 = await engine.analyseMulti(fenBefore, { movetime: 260, multipv: 1 });
      const bestUci = (r0[0] && r0[0].pv && r0[0].pv[0]) || null;
      const wBefore = winPct(toScore(r0[0] || {}));           // 둘 차례(=나) 관점
      const r1 = await engine.analyse(chess.fen(), { movetime: 260 });
      const wAfterFoe = winPct(toScore(r1));                  // 상대 관점
      const wAfter = 100 - wAfterFoe;
      const drop = Math.max(0, wBefore - wAfter);
      const bestSan = bestUci ? uciToSan(fenBefore, [bestUci], 1)[0] : null;
      const cls = classify(m.san, bestSan, drop);

      evalPct = myColor === 'w' ? wAfter : 100 - wAfter;
      paintEval();
      showStrength(cls, drop);

      const bad = cls === 'blunder' || (cls === 'mistake' && st.pauseOnMistake);
      const missed = wBefore >= 80 && wAfter < 55;
      if (st.pauseOnBlunder !== false && (bad || missed)) {
        await showWhy(fenBefore, m, bestSan, drop, missed);
        return false;
      }
      return true;
    } catch (e) {
      return true;                     // 판정이 안 되면 그냥 계속 둔다
    }
  }

  function showStrength(cls, drop) {
    const q = QUALITY[cls];
    strengthEl.classList.remove('hidden');
    clear(strengthEl);
    strengthEl.appendChild(h('span.qi', {
      style: `background:${q ? q.c : '#888'};width:20px;height:20px;font-size:10px`,
    }, q ? q.g : '·'));
    strengthEl.appendChild(h('span', { style: `color:${q ? q.c : 'var(--sub)'};font-weight:800;margin-left:6px` },
      q ? q.ko : cls));
    if (drop >= 2) strengthEl.appendChild(h('span.dim', `  승률 -${drop.toFixed(1)}%p`));
  }

  /** 블런더·실수에서 멈추고 "왜 나빴나" 를 보여 준다 (Chessis 의 Why Blunder) */
  async function showWhy(fenBefore, m, bestSan, drop, missed) {
    paused = true;
    stopTick();
    whyBox.classList.remove('hidden');
    clear(whyBox);
    whyBox.appendChild(h('h3', missed ? '😮 이길 수 있었는데요' : '😱 여기서 크게 나빠졌습니다'));
    whyBox.appendChild(h('p.sub', `${m.san} — 승률이 ${drop.toFixed(1)}%p 떨어졌습니다.`));
    if (bestSan) whyBox.appendChild(h('p.sub', '💡 최선은 ', h('b', bestSan), ' 였습니다.'));

    // 상대가 어떻게 응징하는지 (지금 국면의 최선 수순)
    try {
      const r = await engine.analyse(chess.fen(), { movetime: 600 });
      const line = uciToSan(chess.fen(), r.pv || [], 4);
      if (line.length) whyBox.appendChild(h('p.sub', '⚔️ 상대의 응징: ', h('b', line.join(' '))));
    } catch (e) {}

    whyBox.appendChild(h('div.btn-row.mt',
      h('button.btn', {
        onclick: () => { whyBox.classList.add('hidden'); paused = false; undo(true); },
      }, '↩ 무르고 다시'),
      h('button.btn.ghost', {
        onclick: () => { whyBox.classList.add('hidden'); paused = false; draw(); maybeEngine(); },
      }, '그대로 두기')));
    impact('bad', st);
    draw();
  }

  /* ---------------- 엔진 ---------------- */

  async function maybeEngine() {
    if (over || paused || chess.turn() === myColor) return;
    thinking = true;
    statusEl.innerHTML = '<span class="spin"></span> 엔진이 생각하는 중…';
    draw();
    try {
      const lv = LEVELS[lvIdx];
      let bestUci = null, sc = 0;

      if (lv.human) {
        /* 사람처럼 — 후보 3개 중에서 고른다. 강할수록 1번을 자주 고른다.
         * Maia 가중치(50MB)를 받지 않고도 "가끔 어이없는 수를 두는" 느낌이 난다. */
        const rs = await engine.analyseMulti(chess.fen(), { movetime: lv.mt, multipv: 3 });
        const ok = rs.filter((r) => r && r.pv && r.pv.length);
        if (ok.length) {
          const roll = Math.random();
          const idx = roll < lv.human && ok.length > 1
            ? (roll < lv.human / 3 && ok.length > 2 ? 2 : 1)
            : 0;
          bestUci = ok[idx].pv[0];
          sc = toScore(ok[idx]);
        }
      } else {
        const r = await engine.play(chess.fen(), {
          movetime: lv.mt, elo: lv.elo ?? null, skill: lv.skill ?? null,
        });
        bestUci = r.best;
        sc = toScore(r);
      }

      if (!bestUci) { statusEl.textContent = '엔진이 둘 수가 없습니다'; thinking = false; return; }
      const foe = chess.turn();
      const m = chess.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci.slice(4, 5) || undefined });
      addInc(foe);
      const mkind = moveKind(m, chess);
      impact(mkind, st);
      const whiteToMove = chess.turn() === 'w';
      evalPct = whiteToMove ? winPct(-sc) : winPct(sc);
      thinking = false;
      myWinBefore = myColor === 'w' ? evalPct : 100 - evalPct;
      draw(m ? { from: m.from, to: m.to, kind: mkind } : null);
      statusEl.textContent = `${LEVELS[lvIdx].n} · 당신 차례`;
      if (st.showOppStrength && m) statusEl.textContent += ` · 상대: ${m.san}`;
      persist();
      checkOver();
    } catch (e) {
      thinking = false;
      statusEl.textContent = '엔진 오류: ' + (e.message || e);
      draw();
    }
  }

  /* ---------------- 끝내기 ---------------- */

  function checkOver() {
    if (!chess.isGameOver()) return false;
    over = true;
    stopTick();
    let msg = '무승부';
    if (chess.isCheckmate()) msg = chess.turn() === myColor ? '😢 졌습니다 (체크메이트)' : '🎉 이겼습니다! (체크메이트)';
    else if (chess.isStalemate()) msg = '스테일메이트 — 무승부';
    else if (chess.isInsufficientMaterial()) msg = '기물 부족 — 무승부';
    else if (chess.isThreefoldRepetition && chess.isThreefoldRepetition()) msg = '3회 반복 — 무승부';
    else if (chess.isDraw()) msg = '50수 규칙 — 무승부';
    statusEl.textContent = msg;
    impact(chess.isCheckmate() && chess.turn() !== myColor ? 'win' : 'lose', st);
    persist();
    draw();
    return true;
  }

  function resign() {
    if (over) return;
    if (!confirm('기권할까요?')) return;
    over = true; stopTick();
    statusEl.textContent = '🏳 기권했습니다';
    persist();
    draw();
  }

  /** 무승부 제안 — 엔진이 자기가 불리하다고 보면 받아 준다 */
  async function offerDraw() {
    if (over || thinking) return;
    statusEl.innerHTML = '<span class="spin"></span> 상대가 생각 중…';
    try {
      const r = await engine.analyse(chess.fen(), { movetime: 400 });
      const foeScore = toScore(r);       // 지금 차례(=상대) 관점
      const accept = Math.abs(foeScore) < 60;
      if (accept) {
        over = true; stopTick();
        statusEl.textContent = '🤝 무승부를 받아들였습니다';
        impact('ok', st);
        persist();
      } else {
        statusEl.textContent = foeScore > 0 ? '상대가 거절했습니다 (자기가 낫다고 봅니다)' : '상대가 거절했습니다';
      }
      draw();
    } catch (e) { statusEl.textContent = '상대가 답하지 않았습니다'; }
  }

  function undo(fromWhy) {
    if (thinking) return;
    // 내 수 + 엔진 수를 함께 되돌린다
    chess.undo();
    if (chess.turn() !== myColor) chess.undo();
    const snap = undoStack.pop();
    if (snap && snap.clock && clock) {
      clock = { ...snap.clock };
      // 공정하게 — 무르면 상대에게 10초를 준다 (Chessis 와 같은 규칙)
      const foe = myColor === 'w' ? 'b' : 'w';
      clock[foe] += 10000;
    }
    over = false; paused = false; sel = null;
    strengthEl.classList.add('hidden');
    whyBox.classList.add('hidden');
    draw();
    persist();
    statusEl.textContent = fromWhy
      ? '되돌렸습니다 — 더 나은 수를 찾아보세요' + (clock ? ' (상대에게 +10초)' : '')
      : '되돌렸습니다';
  }

  async function hint() {
    if (thinking || over) return;
    statusEl.innerHTML = '<span class="spin"></span> 힌트 계산중…';
    try {
      const r = await engine.analyse(chess.fen(), { movetime: 500 });
      if (!r.best) return;
      const c = new Chess(chess.fen());
      const m = c.move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best.slice(4, 5) || undefined });
      renderBoard(boardHost, chess.fen(), {
        orient: myColor, ...boardOpts(st),
        arrows: [{ f: r.best.slice(0, 2), t: r.best.slice(2, 4), kind: 'hint' }],
        onSquare,
      });
      statusEl.textContent = `💡 추천: ${m ? m.san : r.best}`;
    } catch (e) {
      statusEl.textContent = '힌트 실패';
    }
  }

  async function newGame() {
    const fen = st.chess960 ? random960() : undefined;
    chess = new Chess(fen);
    rootFen = chess.fen();
    myColor = 'w';
    over = false; paused = false; sel = null; evalPct = 50;
    undoStack.length = 0;
    strengthEl.classList.add('hidden');
    whyBox.classList.add('hidden');
    setupClock();
    draw();
    await store.set(SAVE, null);
    statusEl.textContent = st.chess960
      ? '무작위 배치 — 캐슬링은 없습니다'
      : `${LEVELS[lvIdx].n} — ${LEVELS[lvIdx].d}`;
    maybeEngine();
  }

  async function saveGame() {
    if (chess.history().length < 2) return toast('둔 수가 너무 적습니다');
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const me = st.myName || '나';
    const eng = `Stockfish (${LEVELS[lvIdx].n})`;
    chess.setHeader('Event', '엔진 대국');
    chess.setHeader('Date', date.replace(/-/g, '.'));
    chess.setHeader('White', myColor === 'w' ? me : eng);
    chess.setHeader('Black', myColor === 'w' ? eng : me);
    chess.setHeader('Result', chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : (chess.isGameOver() ? '1/2-1/2' : '*'));
    const pgn = chess.pgn();
    toast('분석을 시작합니다…');
    try {
      const rec = await analyzeAndSave(pgn, { source: 'spar' });
      invalidate();
      await store.set(SAVE, null);
      toast('저장했습니다');
      nav('/game/' + encodeURIComponent(rec.id));
    } catch (e) {
      toast('분석 실패: ' + (e.message || e));
    }
  }

  return () => { keepAwake(false); stopTick(); unfit(); };
}

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (ms < 20000) return `${m}:${String(r).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function findKing(chess, color) {
  for (const row of chess.board()) {
    for (const cell of row || []) if (cell && cell.type === 'k' && cell.color === color) return cell.square;
  }
  return null;
}

/* 체스960 배치 — 규칙대로 뽑는다(비숍은 서로 다른 색 칸, 킹은 두 룩 사이).
 * chess.js 2.0 은 960 캐슬링을 모르므로 캐슬링 권한은 빼고 시작한다.
 * 시작 배치의 낯섦은 그대로 살아 있고, 캐슬링만 없다. */
export function random960() {
  const back = new Array(8).fill(null);
  const free = () => back.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const put = (piece, idx) => { back[idx] = piece; };
  const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // 비숍 둘 — 밝은 칸 하나, 어두운 칸 하나
  put('b', pickFrom([0, 2, 4, 6]));
  put('b', pickFrom([1, 3, 5, 7]));
  // 퀸
  put('q', pickFrom(free()));
  // 나이트 둘
  put('n', pickFrom(free()));
  put('n', pickFrom(free()));
  // 남은 세 칸: 룩·킹·룩
  const rest = free();
  put('r', rest[0]); put('k', rest[1]); put('r', rest[2]);

  const black = back.join('');
  const white = black.toUpperCase();
  return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white} w - - 0 1`;
}
