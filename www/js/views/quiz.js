/* 문제 풀이 컴포넌트 — 판에서 직접 기물을 움직여 답한다.
 * 게임별 퀴즈와 훈련(SRS) 양쪽에서 같은 것을 쓴다. */

import { h, toast, play, haptic } from '../ui.js';
import { renderBoard, addMark, lineArrows } from '../board.js';
import { settings } from '../store.js';
import engine, { toScore } from '../engine.js';
import { wp as winPct } from '../analyze.js';

const KIND_LABEL = {
  mistake: '⚠️ 실수가 나온 장면',
  good: '💎 최선을 찾았던 장면',
  bonus: '🏆 보너스',
};

/**
 * @param host  DOM
 * @param card  문제 데이터
 * @param opts  {header, onDone(ok), nextLabel, onNext, showGame}
 */
export function mountQuiz(host, card, opts = {}) {
  let st = { boardTheme: 'green', sound: true, haptic: true, animate: true, showCoords: true };
  settings().then((s) => { st = s; });

  let answered = false, sel = null, gaveUp = false;
  let mode = 'best';
  let myLine = null, myWp = null, myMove = null;

  const boardHost = h('div.board-wrap');
  const promo = h('div.promo.hidden');
  const hint = h('p.sub', { style: 'text-align:center;margin-top:10px' },
    `👆 ${card.side === 'w' ? '백(흰색)' : '흑(검은색)'} 기물을 움직여 답하세요`);
  const giveUp = h('button.btn.wide.ghost.mt', { onclick: () => answer(null) }, '🤔 모르겠어요 (정답 보기)');
  const fb = h('div.hidden');
  const chips = h('div.chips.hidden', { style: 'margin-top:10px;justify-content:center' });
  const lineInfo = h('p.dim', { style: 'text-align:center;margin-top:6px;min-height:18px' });

  const root = h('div',
    opts.header || null,
    h('div.card',
      h('div.row.mb',
        h('span.badge.' + (card.kind === 'good' ? 'good' : card.kind === 'bonus' ? 'bonus' : 'mistake'),
          KIND_LABEL[card.kind] || KIND_LABEL.mistake),
        h('div.spacer'),
        card.gemGain ? h('span.dim', `다른 수였다면 -${Math.round(card.gemGain)}%p`) : null),
      h('h3', card.question || `${card.moveLabel} — 최선의 수는?`),
      card.ctx ? h('p.dim', { style: 'overflow-x:auto;white-space:nowrap;margin-bottom:10px' }, '직전 수순: ' + card.ctx) : null,
      boardHost, promo, hint, chips, lineInfo, giveUp, fb),
  );
  host.appendChild(root);

  draw(baseMarks(), true);

  /* ---------------- 판 ---------------- */

  function baseMarks() {
    const m = {};
    if (card.prevF) { addMark(m, card.prevF, 'hl'); addMark(m, card.prevT, 'hl'); }
    return m;
  }

  function draw(marks, live, arrows) {
    renderBoard(boardHost, card.fen, {
      orient: card.side, marks, theme: st.boardTheme, coords: st.showCoords,
      arrows: arrows || null,
      onSquare: live ? onSquare : null,
    });
  }

  function onSquare(name) {
    if (answered) return;
    promo.classList.add('hidden');
    if (sel) {
      const cand = card.legals.filter((m) => m.f === sel && m.t === name);
      if (cand.length === 1) return answer(cand[0]);
      if (cand.length > 1) return openPromo(cand);
    }
    sel = (sel !== name && card.legals.some((m) => m.f === name)) ? name : null;
    const marks = baseMarks();
    if (sel) {
      addMark(marks, sel, 'sel');
      card.legals.filter((m) => m.f === sel).forEach((m) => addMark(marks, m.t, m.x ? 'cap' : 'dot'));
    }
    draw(marks, true);
  }

  function openPromo(cand) {
    promo.classList.remove('hidden');
    promo.innerHTML = '';
    for (const t of ['q', 'r', 'n', 'b']) {
      const m = cand.find((x) => x.u.slice(4) === t);
      if (!m) continue;
      const svg = `<svg viewBox="0 0 45 45"><use href="#p${card.side}${t}"/></svg>`;
      promo.appendChild(h('button', { onclick: () => { promo.classList.add('hidden'); answer(m); }, html: svg }));
    }
  }

  /* ---------------- 채점 ---------------- */

  async function answer(move) {
    if (answered) return;
    answered = true;
    gaveUp = !move;
    const ok = !!move && card.accept.includes(move.u);
    myMove = move;
    giveUp.classList.add('hidden');
    hint.classList.add('hidden');
    haptic(st.haptic);
    play(ok ? 'ok' : 'bad', st.sound);

    // 판 표시: 정답 칸 초록, 내가 둔 틀린 칸 빨강
    const marks = baseMarks();
    addMark(marks, card.bf, 'good');
    addMark(marks, card.bt, 'good');
    if (move && !ok) { addMark(marks, move.f, 'bad'); addMark(marks, move.t, 'bad'); }
    draw(marks, false);

    buildFeedback(ok);
    buildChips(ok, move);
    showLines('best');

    if (opts.onDone) opts.onDone(ok, gaveUp);
  }

  function buildFeedback(ok) {
    fb.classList.remove('hidden');
    fb.innerHTML = '';
    const title = ok ? '✅ 정답!' : (gaveUp ? '👀 정답은 이 수였습니다' : '❌ 아쉽습니다');
    const box = h('div.fb.' + (ok ? 'ok' : 'no'),
      h('div.ttl', title),
      h('div.row', { style: 'gap:8px;flex-wrap:wrap' },
        h('span.badge.good', `최선 ${card.best}`),
        card.kind !== 'good' ? h('span.badge.mistake', `실전 ${card.played}${card.playedGlyph || ''}`) : null,
        card.verify
          ? h('span.badge.info', card.verify.deep
            ? (card.verify.agree ? '🔬 정밀 재검증 통과' : '🔬 재검증: 근소한 차이')
            : (card.verify.agree ? '🔎 2엔진 교차검증 통과' : '🔎 2엔진 이견 있음'))
          : null),
      h('div.why', h('b', '🎯 왜 최선인가: '), card.bestWhy || ''),
      card.playedWhy ? h('div.why', h('b', '🎮 실전 수의 문제: '), card.playedWhy) : null,
      card.explain ? h('div.why', h('b', '📝 해설: '), card.explain) : null,
    );
    fb.appendChild(box);

    // 승률 비교 막대
    if (card.wpB != null) {
      const bar = (label, v, color) => h('div', { style: 'margin-top:8px' },
        h('div.row', h('span.dim', label), h('div.spacer'),
          h('span', { style: `font-weight:800;color:${color}` }, v + '%')),
        h('div.pbar-track', h('div', { style: `height:100%;width:${Math.max(2, v)}%;background:${color};border-radius:99px` })));
      const wrap = h('div', { style: 'margin-top:10px' },
        h('div.dim', `${card.side === 'w' ? '백' : '흑'} 기준 승률`),
        bar('🟢 최선을 뒀다면', card.wpB, '#4ADE80'),
        card.kind !== 'good' ? bar('🔴 실전에서 둔 수', card.wpP, '#F26D6D') : null);
      box.appendChild(wrap);
      box.dataset.hasBars = '1';
    }
    if (opts.onNext) {
      fb.appendChild(h('button.btn.primary.wide.mt', { onclick: opts.onNext }, opts.nextLabel || '다음 문제 →'));
    }
  }

  /* ---------------- 화살표(수순) ---------------- */

  function buildChips(ok, move) {
    chips.classList.remove('hidden');
    chips.innerHTML = '';
    const mk = (key, label, cls) => {
      const c = h('button.chip.' + cls, { onclick: () => showLines(key) }, label);
      c.dataset.key = key;
      chips.appendChild(c);
      return c;
    };
    mk('best', '🟢 최선 수순', 'best');
    if (card.punishLine && card.punishLine.length) mk('punish', '🔴 실전 응징', 'punish');
    if (move && !ok) {
      mk('my', '🟠 내 수의 결과', 'my');
      computeMyLine(move);
    }
  }

  async function showLines(key) {
    mode = key;
    for (const c of chips.children) c.classList.toggle('on', c.dataset.key === key);
    const marks = baseMarks();
    let arrows = [], info = '';
    if (key === 'best') {
      arrows = lineArrows(card.bestLine, 'best');
      info = `🟢 ${(card.bestLine || []).map((m) => m.san).join(' ')}`
        + (card.wpB != null ? ` · 승률 ${card.wpB}%` : '');
    } else if (key === 'punish') {
      arrows = lineArrows(card.punishLine, 'punish');
      info = `🔴 ${(card.punishLine || []).map((m) => m.san).join(' ')}`
        + (card.wpP != null ? ` · 승률 ${card.wpP}%` : '');
    } else if (key === 'my') {
      if (!myLine) { lineInfo.innerHTML = '<span class="spin"></span> 엔진이 응징 수순을 계산하는 중…'; return; }
      arrows = lineArrows(myLine, 'my');
      info = `🟠 ${myLine.map((m) => m.san).join(' ')}` + (myWp != null ? ` · 승률 ${myWp}%` : '');
    }
    draw(marks, false, arrows);
    lineInfo.textContent = info;
  }

  /** 내가 둔 틀린 수 이후, 상대가 어떻게 응징하는지 엔진으로 즉석 계산 */
  async function computeMyLine(move) {
    try {
      const { Chess } = await import('../lib/chess.js');
      const r = await engine.analyse(move.fen, { movetime: 700 });
      const c = new Chess(move.fen);
      const line = [{ f: move.f, t: move.t, san: move.san }];
      for (const u of (r.pv || []).slice(0, 3)) {
        const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined });
        if (!mv) break;
        line.push({ f: mv.from, t: mv.to, san: mv.san });
      }
      myLine = line;
      // UCI 점수는 '둘 차례'(상대) 관점 → 내 관점으로 뒤집는다
      const sc = toScore(r);
      const whiteToMove = move.fen.split(' ')[1] === 'w';
      const cpWhite = whiteToMove ? sc : -sc;
      const w = card.side === 'w' ? winPct(cpWhite) : 100 - winPct(cpWhite);
      myWp = Math.round(w);
      if (mode === 'my') showLines('my');
    } catch (e) {
      myLine = [{ f: move.f, t: move.t, san: move.san }];
      if (mode === 'my') showLines('my');
    }
  }

  return {
    root,
    isAnswered: () => answered,
    reveal: () => answer(null),
  };
}
