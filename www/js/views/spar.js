/* ⚔️ 엔진 대국 — 아무 국면에서나 스톡피시와 계속 둬 본다 */

import { h, nav, screen, toast, clear, play, haptic, keepAwake, isApp } from '../ui.js';
import { renderBoard, addMark } from '../board.js';
import { settings, setSetting, store } from '../store.js';
import { Chess } from '../lib/chess.js';
import engine, { toScore } from '../engine.js';
import { wp as winPct } from '../analyze.js';
import { analyzeAndSave, invalidate } from '../games.js';

const LEVELS = [
  { n: '입문',   skill: 0,  mt: 200,  d: '엔진이 일부러 실수해 줍니다' },
  { n: '초급',   skill: 5,  mt: 300,  d: '쉬운 상대' },
  { n: '중급',   elo: 1400, mt: 400,  d: '동네 잘 두는 사람' },
  { n: '상급',   elo: 1800, mt: 600,  d: '클럽 수준' },
  { n: '고수',   elo: 2200, mt: 800,  d: '전문가 수준' },
  { n: '최강',   elo: null, mt: 1200, d: '제한 없음 — 이기기 어렵습니다' },
];

export async function view(app) {
  const st = await settings();
  const s = screen('⚔️ 엔진 대국', { back: false });
  app.appendChild(s.root);
  const b = s.body;

  if (!isApp) {
    b.appendChild(h('div.card.err', h('b', '앱에서만 가능합니다'), h('p.sub', '엔진이 필요합니다.')));
    return;
  }

  // 이어하기: 퀴즈에서 넘어온 국면
  const startFen = await store.get('sparFen', null);
  await store.set('sparFen', null);

  let lvIdx = Math.max(0, Math.min(LEVELS.length - 1, st.sparLevel ?? 2));
  let chess = new Chess(startFen || undefined);
  let myColor = startFen ? chess.turn() : 'w';
  let sel = null, thinking = false, over = false;
  let evalPct = 50, showEval = true;
  const history = [];

  const boardHost = h('div.board-wrap');
  const promo = h('div.promo.hidden');
  const evalBar = h('div.wpbar', { style: 'margin-top:10px' });
  const statusEl = h('p.sub', { style: 'text-align:center;margin-top:8px;min-height:20px' });
  const movesEl = h('div.movelist', { style: 'max-height:96px;margin-top:10px' });

  const levelChips = h('div.chips.mb');
  LEVELS.forEach((lv, i) => levelChips.appendChild(h('button.chip' + (i === lvIdx ? '.on' : ''), {
    onclick: async () => {
      lvIdx = i;
      await setSetting('sparLevel', i);
      Array.from(levelChips.children).forEach((c, k) => c.classList.toggle('on', k === i));
      statusEl.textContent = `${LEVELS[i].n} — ${LEVELS[i].d}`;
    },
  }, lv.n)));

  const controls = h('div.row', { style: 'gap:6px;margin-top:10px' },
    h('button.btn.sm', { onclick: undo }, '↩ 무르기'),
    h('button.btn.sm', { onclick: hint }, '💡 힌트'),
    h('button.btn.sm', { onclick: () => { myColor = myColor === 'w' ? 'b' : 'w'; draw(); maybeEngine(); } }, '🔄 색 바꾸기'),
    h('div.spacer'),
    h('button.btn.sm', { onclick: newGame }, '새 대국'));

  b.appendChild(h('div.card',
    h('div.row.mb', h('h3', { style: 'flex:1' }, '난이도'), h('span.dim', LEVELS[lvIdx].d)),
    levelChips,
    boardHost, promo, evalBar, statusEl, controls, movesEl,
    h('div.btn-row.mt',
      h('button.btn', { onclick: saveGame }, '💾 이 대국 저장·분석'),
      h('button.btn.ghost', { onclick: () => nav('/') }, '나가기'))));

  keepAwake(true);
  draw();
  statusEl.textContent = startFen ? '이 국면부터 이어서 둡니다' : `${LEVELS[lvIdx].n} — ${LEVELS[lvIdx].d}`;
  maybeEngine();

  /* ---------------- 판 ---------------- */

  function draw(anim) {
    const marks = {};
    const last = chess.history({ verbose: true }).slice(-1)[0];
    if (last) { addMark(marks, last.from, 'hl'); addMark(marks, last.to, 'hl'); }
    if (sel) {
      addMark(marks, sel, 'sel');
      chess.moves({ square: sel, verbose: true }).forEach((m) => addMark(marks, m.to, m.isCapture() ? 'cap' : 'dot'));
    }
    if (chess.isCheck()) {
      const king = findKing(chess, chess.turn());
      if (king) addMark(marks, king, 'check');
    }
    renderBoard(boardHost, chess.fen(), {
      orient: myColor, marks, theme: st.boardTheme, coords: st.showCoords,
      anim: st.animate ? anim : null,
      onSquare: over || thinking ? null : onSquare,
    });
    paintEval();
    paintMoves();
  }

  function paintEval() {
    clear(evalBar);
    if (!showEval) return;
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
    if (chess.turn() !== myColor || thinking || over) return;
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

  function doMove(m) {
    history.push(chess.fen());
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    sel = null;
    play(m.captured ? 'capture' : 'move', st.sound);
    haptic(st.haptic);
    draw({ from: m.from, to: m.to });
    if (checkOver()) return;
    maybeEngine();
  }

  async function maybeEngine() {
    if (over || chess.turn() === myColor) return;
    thinking = true;
    statusEl.innerHTML = '<span class="spin"></span> 엔진이 생각하는 중…';
    draw();
    try {
      const lv = LEVELS[lvIdx];
      const r = await engine.play(chess.fen(), {
        movetime: lv.mt,
        elo: lv.elo ?? null,
        skill: lv.skill ?? null,
      });
      if (!r.best) { statusEl.textContent = '엔진이 둘 수가 없습니다'; thinking = false; return; }
      const m = chess.move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best.slice(4, 5) || undefined });
      play(m && m.captured ? 'capture' : 'move', st.sound);
      // 승률 갱신 (엔진 관점 → 백 관점)
      const sc = toScore(r);
      const whiteToMove = chess.turn() === 'w';   // 엔진이 둔 뒤 차례
      evalPct = whiteToMove ? winPct(-sc) : winPct(sc);
      thinking = false;
      draw(m ? { from: m.from, to: m.to } : null);
      statusEl.textContent = `${LEVELS[lvIdx].n} · 당신 차례`;
      checkOver();
    } catch (e) {
      thinking = false;
      statusEl.textContent = '엔진 오류: ' + (e.message || e);
      draw();
    }
  }

  function checkOver() {
    if (!chess.isGameOver()) return false;
    over = true;
    let msg = '무승부';
    if (chess.isCheckmate()) msg = chess.turn() === myColor ? '😢 졌습니다 (체크메이트)' : '🎉 이겼습니다! (체크메이트)';
    else if (chess.isStalemate()) msg = '스테일메이트 — 무승부';
    else if (chess.isInsufficientMaterial()) msg = '기물 부족 — 무승부';
    else if (chess.isDraw()) msg = '무승부';
    statusEl.textContent = msg;
    play(chess.isCheckmate() && chess.turn() !== myColor ? 'win' : 'bad', st.sound);
    draw();
    return true;
  }

  function undo() {
    if (thinking) return;
    // 내 수 + 엔진 수를 함께 되돌린다
    chess.undo();
    if (chess.turn() !== myColor) chess.undo();
    over = false;
    sel = null;
    draw();
    statusEl.textContent = '되돌렸습니다';
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
        orient: myColor, theme: st.boardTheme, coords: st.showCoords,
        arrows: [{ f: r.best.slice(0, 2), t: r.best.slice(2, 4), kind: 'hint' }],
        onSquare,
      });
      statusEl.textContent = `💡 추천: ${m ? m.san : r.best}`;
    } catch (e) {
      statusEl.textContent = '힌트 실패';
    }
  }

  function newGame() {
    chess = new Chess();
    myColor = 'w';
    over = false; sel = null; evalPct = 50;
    history.length = 0;
    draw();
    statusEl.textContent = `${LEVELS[lvIdx].n} — ${LEVELS[lvIdx].d}`;
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
      toast('저장했습니다');
      nav('/game/' + encodeURIComponent(rec.id));
    } catch (e) {
      toast('분석 실패: ' + (e.message || e));
    }
  }

  return () => keepAwake(false);
}

function findKing(chess, color) {
  for (const row of chess.board()) {
    for (const cell of row || []) if (cell && cell.type === 'k' && cell.color === color) return cell.square;
  }
  return null;
}
