/* 🔬 분석판 — 아무 국면이나 놓고 들여다보는 화면.
 *
 * Chessis 의 Analysis Board + Board Editor + Key Elements + Threats + 엔진 라인을
 * 한 화면에 모았다. 엔진 없이도 국면 읽기·위협은 그대로 뜬다(판만 보고 내는 값이라). */

import { h, nav, screen, toast, clear, impact, moveKind, isApp, copyText, readClipboard, fullscreen, isFullscreen, fitBoard } from '../ui.js';
import { renderBoard, addMark, boardOpts } from '../board.js';
import { settings, setSetting, store } from '../store.js';
import { Chess } from '../lib/chess.js';
import engine, { toScore } from '../engine.js';
import { wp as winPct } from '../analyze.js';
import { readPosition, readThreats, KEY_ELEMENTS, DEFAULT_ELEMS } from '../insight.js';
import { figurine } from '../notation.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EDITOR_PIECES = ['wk', 'wq', 'wr', 'wb', 'wn', 'wp', 'bk', 'bq', 'br', 'bb', 'bn', 'bp'];
const PIECE_KO = { k: '킹', q: '퀸', r: '룩', b: '비숍', n: '나이트', p: '폰' };

export async function view(app, params) {
  const st = await settings();
  const s = screen('🔬 분석판', { back: false });
  s.root.classList.add('boardview');
  app.appendChild(s.root);
  const b = s.body;

  /* ---------------- 상태 ---------------- */
  /* 국면은 「뿌리 FEN + 둔 수 목록 + 현재 위치」로 들고 있는다.
   * FEN 만 쌓으면 앞뒤로 오갈 때 기보가 사라진다. */
  let startFen = START;
  let sans = [];
  let ply = 0;                   // 0 = 뿌리 국면
  let chess = new Chess();
  let orient = 'w';
  let sel = null;
  let mode = 'play';             // play | draw | edit
  let editPiece = 'wq';
  let userArrows = [];
  let lines = [];                // 엔진 라인 [{cp, mate, sans, uci}]
  let running = false, wantStop = false;
  let elems = { ...DEFAULT_ELEMS, ...(st.keyElems || {}) };
  let showElems = !!st.showElems;
  let showThreats = !!st.showThreats;
  let threatMode = { ...{ material: true, mate: true, undef: true }, ...(st.threatMode || {}) };
  let multipv = st.engineLines || 3;

  // 넘겨받은 국면(퀴즈·복기에서 "분석판으로")
  const handoff = await store.get('boardFen', null);
  await store.set('boardFen', null);
  if (handoff) {
    try { chess = new Chess(handoff); startFen = handoff; } catch (e) { chess = new Chess(); }
    orient = chess.turn();
  }

  /* ---------------- 화면 ---------------- */
  const boardHost = h('div.board-wrap');
  const notesEl = h('div.ke-notes');
  const statusEl = h('p.sub', { style: 'text-align:center;margin:6px 0 0;min-height:20px' });
  const linesEl = h('div.lines');
  const movesEl = h('div.movelist', { style: 'max-height:88px;margin-top:8px' });
  const editBar = h('div.editbar.hidden');
  const fenEl = h('div.fenbox');

  const modeBtns = h('div.seg.mb',
    segBtn('play', '♟️ 두기'),
    segBtn('draw', '✏️ 그리기'),
    segBtn('edit', '🛠 판 만들기'));

  function segBtn(id, label) {
    return h('button' + (mode === id ? '.on' : ''), {
      onclick: () => { setMode(id); },
    }, label);
  }

  const navRow = h('div.row', { style: 'gap:6px;margin-top:8px' },
    h('button.btn.sm', { onclick: () => go(0) }, '⏮'),
    h('button.btn.sm', { onclick: () => go(ply - 1) }, '◀'),
    h('button.btn.sm', { onclick: () => go(ply + 1) }, '▶'),
    h('button.btn.sm', { onclick: () => go(sans.length) }, '⏭'),
    h('div.spacer'),
    h('button.btn.sm', { onclick: () => { orient = orient === 'w' ? 'b' : 'w'; draw(); } }, '🔄 뒤집기'),
    h('button.btn.sm', {
      onclick: (e) => {
        const on = !isFullscreen();
        fullscreen(on);
        e.currentTarget.textContent = on ? '⛶ 원래대로' : '⛶ 크게';
      },
    }, '⛶ 크게'));

  b.appendChild(h('div.card',
    modeBtns,
    boardHost,
    notesEl,
    statusEl,
    editBar,
    navRow,
    movesEl));
  fitBoard(boardHost, [notesEl, statusEl, editBar, navRow]);

  b.appendChild(h('div.card',
    h('div.row.mb',
      h('h3', { style: 'flex:1' }, '🤖 엔진 라인'),
      h('button.chip.sm', { onclick: cycleLines }, `${multipv}줄`),
      h('button.chip.sm', { onclick: toggleEngine, id: 'engToggle' }, '▶ 켜기')),
    linesEl));

  b.appendChild(insightCard());
  b.appendChild(h('div.card',
    h('h3.mb', '📋 국면 주고받기'),
    fenEl,
    h('div.btn-row.mt',
      h('button.btn.sm', { onclick: () => copyText(chess.fen(), 'FEN을 복사했습니다') }, 'FEN 복사'),
      h('button.btn.sm', { onclick: pasteFen }, 'FEN·PGN 붙여넣기'),
      h('button.btn.sm', { onclick: () => copyText(chess.pgn(), 'PGN을 복사했습니다') }, 'PGN 복사')),
    h('div.btn-row.mt',
      h('button.btn.sm', { onclick: playFromHere }, '⚔️ 여기서부터 두기'),
      h('button.btn.sm.ghost', { onclick: reset }, '처음으로'))));

  setMode('play');
  draw();

  /* ---------------- 국면 읽기 카드 ---------------- */

  function insightCard() {
    const chips = h('div.chips');
    for (const [id, name] of KEY_ELEMENTS) {
      chips.appendChild(h('button.chip.sm' + (elems[id] ? '.on' : ''), {
        onclick: async (ev) => {
          elems[id] = !elems[id];
          ev.currentTarget.classList.toggle('on', elems[id]);
          await setSetting('keyElems', elems);
          draw();
        },
      }, name));
    }
    const tchips = h('div.chips',
      tchip('material', '재료 위협'), tchip('mate', '메이트 위협'), tchip('undef', '무방비 기물'));

    return h('div.card',
      h('div.row.mb',
        h('h3', { style: 'flex:1' }, '🔍 국면 읽기'),
        sw(showElems, async (v) => { showElems = v; await setSetting('showElems', v); draw(); })),
      chips,
      h('div.row.mb.mt',
        h('h3', { style: 'flex:1' }, '⚠️ 위협'),
        sw(showThreats, async (v) => { showThreats = v; await setSetting('showThreats', v); draw(); })),
      tchips,
      h('p.sub.mt', '「국면 읽기」는 엔진 없이 판만 보고 냅니다 — 즉시 뜹니다.'),
    h('button.btn.sm.wide.mt', { onclick: () => nav('/learn') }, '🎓 예제 국면으로 배우기'));
  }

  function tchip(id, label) {
    return h('button.chip.sm' + (threatMode[id] ? '.on' : ''), {
      onclick: async (ev) => {
        threatMode[id] = !threatMode[id];
        ev.currentTarget.classList.toggle('on', threatMode[id]);
        await setSetting('threatMode', threatMode);
        draw();
      },
    }, label);
  }

  function sw(on, cb) {
    const el = h('button.sw' + (on ? '.on' : ''), { onclick: () => { on = !on; el.classList.toggle('on', on); cb(on); } });
    return el;
  }

  /* ---------------- 모드 ---------------- */

  function setMode(m) {
    mode = m;
    Array.from(modeBtns.children).forEach((c, i) => c.classList.toggle('on', ['play', 'draw', 'edit'][i] === m));
    editBar.classList.toggle('hidden', m !== 'edit');
    if (m === 'edit') buildEditBar();
    sel = null;
    draw();
  }

  function buildEditBar() {
    clear(editBar);
    const row = h('div.chips');
    for (const code of EDITOR_PIECES) {
      row.appendChild(h('button.chip.pc-chip' + (editPiece === code ? '.on' : ''), {
        onclick: () => { editPiece = code; buildEditBar(); },
        title: (code[0] === 'w' ? '백 ' : '흑 ') + PIECE_KO[code[1]],
      }, pieceGlyph(code)));
    }
    row.appendChild(h('button.chip.sm' + (editPiece === 'x' ? '.on' : ''), {
      onclick: () => { editPiece = 'x'; buildEditBar(); },
    }, '🧽 지우개'));

    const turn = chess.turn();
    const rights = { w: castleStr('w'), b: castleStr('b') };
    editBar.appendChild(row);
    editBar.appendChild(h('div.row.mt', { style: 'gap:6px;flex-wrap:wrap' },
      h('span.dim', '둘 차례'),
      h('button.chip.sm' + (turn === 'w' ? '.on' : ''), { onclick: () => setTurn('w') }, '백'),
      h('button.chip.sm' + (turn === 'b' ? '.on' : ''), { onclick: () => setTurn('b') }, '흑'),
      h('div.spacer'),
      h('span.dim', '캐슬링'),
      cbtn('w', 'k', 'O-O'), cbtn('w', 'q', 'O-O-O'),
      cbtn('b', 'k', 'o-o'), cbtn('b', 'q', 'o-o-o')));
    editBar.appendChild(h('div.btn-row.mt',
      h('button.btn.sm', { onclick: () => loadFen('8/8/8/8/8/8/8/8 w - - 0 1') }, '판 비우기'),
      h('button.btn.sm', { onclick: () => loadFen(START) }, '처음 배치'),
      h('button.btn.sm', { onclick: applyEdit }, '✅ 이 국면으로')));

    function cbtn(color, side, label) {
      const on = (rights[color] || '').includes(side);
      return h('button.chip.sm' + (on ? '.on' : ''), {
        onclick: () => {
          const cur = castleObj(color);
          cur[side === 'k' ? 'k' : 'q'] = !on;
          try { chess.setCastlingRights(color, { k: cur.k, q: cur.q }); } catch (e) {}
          buildEditBar(); draw();
        },
      }, label);
    }
  }

  function castleObj(color) {
    try {
      const r = chess.getCastlingRights(color) || {};
      return { k: !!r.k, q: !!r.q };
    } catch (e) { return { k: false, q: false }; }
  }
  function castleStr(color) {
    const r = castleObj(color);
    return (r.k ? 'k' : '') + (r.q ? 'q' : '');
  }

  function setTurn(t) {
    const p = chess.fen().split(' ');
    p[1] = t; p[3] = '-';
    loadFen(p.join(' '), true);
    buildEditBar();
  }

  function applyEdit() {
    // 유효성 확인 — 킹이 둘, 둘 차례가 아닌 쪽이 체크면 안 된다
    const f = chess.fen();
    const wk = (f.split(' ')[0].match(/K/g) || []).length;
    const bk = (f.split(' ')[0].match(/k/g) || []).length;
    if (wk !== 1 || bk !== 1) return toast('킹은 양쪽에 하나씩 있어야 합니다');
    try {
      const t = new Chess(f);
      if (t.isCheck()) {
        // 둘 차례인 쪽이 체크인 건 괜찮다. 반대쪽이 체크면 성립하지 않는 국면
      }
    } catch (e) { return toast('성립하지 않는 국면입니다'); }
    startFen = f; sans = []; ply = 0;
    setMode('play');
    toast('이 국면으로 분석합니다');
    if (running) restartEngine();
  }

  function loadFen(fen, keepMode) {
    try {
      chess = new Chess(fen, { skipValidation: true });
    } catch (e) { return toast('FEN 을 읽지 못했습니다'); }
    startFen = chess.fen(); sans = []; ply = 0;
    userArrows = [];
    if (!keepMode) setMode(mode);
    draw();
    if (running) restartEngine();
  }

  /* ---------------- 판 ---------------- */

  function draw(anim) {
    const marks = {};
    let arrows = [];
    let numbers = {};
    const notes = [];

    if (mode !== 'edit') {
      const last = lastMove();
      if (last) {
        addMark(marks, last.from, st.lastMoveStyle === 'dot' ? 'lm-dot' : st.lastMoveStyle === 'frame' ? 'lm-frame' : 'hl');
        addMark(marks, last.to, st.lastMoveStyle === 'dot' ? 'lm-dot' : st.lastMoveStyle === 'frame' ? 'lm-frame' : 'hl');
      }
      if (sel) {
        addMark(marks, sel, 'sel');
        if (st.legalDots !== false) {
          chess.moves({ square: sel, verbose: true }).forEach((m) => addMark(marks, m.to, m.captured ? 'cap' : 'dot'));
        }
      }
      if (chess.isCheck()) {
        const k = kingSq(chess, chess.turn());
        if (k) addMark(marks, k, 'check');
      }
    }

    const fen = chess.fen();
    if (showElems) {
      const r = readPosition(fen, elems, chess.turn());
      merge(marks, r.marks);
      arrows = arrows.concat(r.arrows);
      numbers = r.numbers;
      notes.push(...r.notes);
    }
    if (showThreats) {
      const foe = chess.turn() === 'w' ? 'b' : 'w';
      const r = readThreats(fen, foe, threatMode);
      merge(marks, r.marks);
      arrows = arrows.concat(r.arrows);
      notes.push(...r.notes);
    }
    // 엔진 첫 라인 화살표
    if (lines.length && st.engineArrows !== false && mode === 'play') {
      lines.slice(0, Math.min(3, lines.length)).forEach((ln, i) => {
        if (!ln.uci || !ln.uci[0]) return;
        const u = ln.uci[0];
        arrows.push({ f: u.slice(0, 2), t: u.slice(2, 4), kind: 'line' + (i + 1), number: false, thin: i > 0 });
      });
    }

    renderBoard(boardHost, fen, {
      orient,
      marks, arrows, numbers,
      userArrows,
      ...boardOpts(st),
      anim: st.animate ? anim : null,
      onDraw: mode === 'draw' ? onDraw : null,
      onSquare: mode === 'draw' ? null : (mode === 'edit' ? onEditSquare : onSquare),
      // 판 만들기에서는 끌기를 끈다 — 누른 칸과 뗀 칸에 두 번 놓이기 때문
      drag: mode === 'play' && st.dragMove !== false,
    });

    clear(notesEl);
    for (const n of notes) notesEl.appendChild(h('span.ke-note', n));
    paintMoves();
    paintFen();
  }

  function merge(into, from) {
    for (const [k, v] of Object.entries(from)) (into[k] = into[k] || []).push(...v);
  }

  function paintFen() {
    clear(fenEl);
    fenEl.appendChild(h('code', chess.fen()));
  }

  function paintMoves() {
    clear(movesEl);
    const list = sans;
    if (!list.length) { movesEl.appendChild(h('span.dim', '아직 둔 수가 없습니다')); return; }
    list.forEach((san, i) => {
      if (i % 2 === 0) movesEl.appendChild(h('span.mvno', `${i / 2 + 1}.`));
      movesEl.appendChild(h('span.mv' + (i === ply - 1 ? '.on' : ''), {
        onclick: () => go(i + 1),
      }, st.figurine ? figurine(san) : san));
      movesEl.appendChild(document.createTextNode(' '));
    });
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  function onSquare(sq) {
    const piece = chess.get(sq);
    if (sel) {
      if (sq === sel) { sel = null; return draw(); }
      const legal = chess.moves({ square: sel, verbose: true }).find((m) => m.to === sq);
      if (legal) {
        const need = legal.promotion ? 'q' : undefined;
        try { chess.move({ from: sel, to: sq, promotion: need }); } catch (e) { sel = null; return draw(); }
        sel = null;
        // 새 수를 두면 앞으로 가 있던 기록은 잘라 낸다
        sans = sans.slice(0, ply);
        sans.push(legal.san);
        ply = sans.length;
        const kind = moveKind(chess.history({ verbose: true }).slice(-1)[0], chess);
        impact(kind, st);
        draw({ from: legal.from, to: legal.to, kind });
        if (running) restartEngine();
        return;
      }
    }
    if (piece && piece.color === chess.turn()) { sel = sq; return draw(); }
    sel = null;
    draw();
  }

  function onEditSquare(sq) {
    if (editPiece === 'x') chess.remove(sq);
    else chess.put({ type: editPiece[1], color: editPiece[0] }, sq);
    startFen = chess.fen(); sans = []; ply = 0;
    draw();
  }

  function onDraw(from, to) {
    const i = userArrows.findIndex((a) => a.f === from && a.t === to);
    if (i >= 0) userArrows.splice(i, 1);
    else userArrows.push({ f: from, t: to, kind: 'user', number: false });
    draw();
  }

  /** 뿌리 국면부터 n 수까지 다시 놓은 판 */
  function rebuild(n) {
    const c = new Chess(startFen, { skipValidation: true });
    for (let i = 0; i < n && i < sans.length; i++) {
      try { c.move(sans[i]); } catch (e) { sans = sans.slice(0, i); break; }
    }
    return c;
  }

  function lastMove() {
    if (!ply) return null;
    const c = rebuild(ply - 1);
    try { return c.move(sans[ply - 1]); } catch (e) { return null; }
  }

  function go(i) {
    if (i < 0 || i > sans.length) return;
    ply = i;
    chess = rebuild(i);
    sel = null;
    draw();
    if (running) restartEngine();
  }

  function reset() {
    chess = new Chess();
    startFen = START; sans = []; ply = 0;
    userArrows = []; lines = []; paintLines();
    draw();
    if (running) restartEngine();
  }

  async function pasteFen() {
    let txt = await readClipboard();
    if (!txt) txt = window.prompt ? window.prompt('FEN 이나 PGN 을 붙여넣으세요') : null;
    if (!txt || !txt.trim()) return toast('붙여넣을 내용이 없습니다');
    txt = txt.trim();
    // PGN 이면 마지막 국면으로
    if (/\[|\d+\./.test(txt) && !/^[rnbqkpRNBQKP1-8/]+\s[wb]\s/.test(txt)) {
      try {
        const c = new Chess();
        c.loadPgn(txt, { strict: false });
        sans = c.history();
        startFen = START;
        ply = sans.length;
        chess = c;
        userArrows = [];
        draw();
        toast(`PGN ${sans.length}수를 읽었습니다`);
        if (running) restartEngine();
        return;
      } catch (e) { /* FEN 으로 다시 시도 */ }
    }
    loadFen(txt);
    toast('국면을 읽었습니다');
  }

  async function playFromHere() {
    await store.set('sparFen', chess.fen());
    nav('/spar');
  }

  /* ---------------- 엔진 ---------------- */

  function cycleLines() {
    multipv = multipv >= 5 ? 1 : multipv + 1;
    setSetting('engineLines', multipv);
    const btn = document.querySelector('.card .chip.sm');
    if (btn) btn.textContent = `${multipv}줄`;
    b.querySelectorAll('.chip.sm').forEach((el) => { if (/^\d줄$/.test(el.textContent)) el.textContent = `${multipv}줄`; });
    if (running) restartEngine();
  }

  function toggleEngine() {
    if (running) { running = false; wantStop = true; engine.stopSearch(); paintToggle(); statusEl.textContent = '엔진을 멈췄습니다'; return; }
    if (!isApp) return toast('엔진은 앱에서만 동작합니다');
    running = true; wantStop = false; paintToggle();
    loop();
  }

  function paintToggle() {
    const el = document.getElementById('engToggle');
    if (el) el.textContent = running ? '⏸ 멈추기' : '▶ 켜기';
  }

  function restartEngine() { wantStop = true; engine.stopSearch(); }

  async function loop() {
    while (running) {
      const fen = chess.fen();
      wantStop = false;
      try {
        const res = await engine.analyseMulti(fen, { movetime: 1500, multipv });
        if (!running) break;
        if (chess.fen() !== fen) continue;            // 그 사이 국면이 바뀌었다
        lines = res.filter(Boolean).map((r) => {
          const sans = [];
          const c = new Chess(fen, { skipValidation: true });
          for (const u of (r.pv || []).slice(0, 8)) {
            try {
              const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined });
              if (!m) break;
              sans.push(m.san);
            } catch (e) { break; }
          }
          return { cp: r.cp, mate: r.mate, sans, uci: r.pv || [] };
        });
        paintLines();
        draw();
      } catch (e) {
        if (!running) break;
        statusEl.textContent = '엔진 오류: ' + e.message;
        running = false;
        paintToggle();
        break;
      }
    }
  }

  function paintLines() {
    clear(linesEl);
    if (!lines.length) {
      linesEl.appendChild(h('p.sub', running ? '생각 중…' : '▶ 켜기 를 누르면 후보 수를 보여 줍니다'));
      return;
    }
    const white = chess.turn() === 'w';
    lines.forEach((ln, i) => {
      const raw = toScore({ cp: ln.cp, mate: ln.mate });
      const cpW = white ? raw : -raw;
      const label = ln.mate != null
        ? `M${Math.abs(ln.mate)}`
        : (cpW >= 0 ? '+' : '') + (cpW / 100).toFixed(2);
      const w = Math.round(winPct(cpW));
      const sans = (st.figurine ? ln.sans.map(figurine) : ln.sans).join(' ');
      linesEl.appendChild(h('div.line' + (i === 0 ? '.top' : ''), {
        onclick: () => playLine(ln),
      },
        h('span.line-ev', label),
        h('span.line-pv', sans || '—'),
        h('span.line-wp', `백 ${w}%`)));
    });
  }

  /** 이 라인을 그대로 놔 본다 (Chessis 의 "Play Engine Lines") */
  function playLine(ln) {
    if (!ln.sans.length) return;
    let k = 0;
    const step = () => {
      if (k >= ln.sans.length) return;
      try { chess.move(ln.sans[k]); } catch (e) { return; }
      sans = sans.slice(0, ply);
      sans.push(ln.sans[k]);
      ply = sans.length;
      const mv = chess.history({ verbose: true }).slice(-1)[0];
      impact(moveKind(mv, chess), st);
      draw(mv ? { from: mv.from, to: mv.to, kind: moveKind(mv, chess) } : null);
      k++;
      if (k < ln.sans.length) setTimeout(step, st.autoplayMs || 700);
      else if (running) restartEngine();
    };
    sans = sans.slice(0, ply);
    step();
  }
}

function kingSq(chess, color) {
  for (const row of chess.board()) for (const c of row || []) if (c && c.type === 'k' && c.color === color) return c.square;
  return null;
}

const GLYPHS = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
function pieceGlyph(code) { return GLYPHS[code] || '?'; }
