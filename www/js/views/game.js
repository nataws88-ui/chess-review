/* 한 경기 화면 — 🧩 문제 / 🎬 복기 / 📊 리포트 */

import { h, nav, screen, toast, clear, onSwipe, onTapSide, holdRepeat, cssVar, fmtSec, copyText, impact, fitBoard } from '../ui.js';
import { renderBoard, addMark, lineArrows, boardOpts } from '../board.js';
import { settings, setSetting, store } from '../store.js';
import { loadBuilt, invalidate } from '../games.js';
import { readPosition, readThreats, DEFAULT_ELEMS } from '../insight.js';
import { figurine } from '../notation.js';
import { tags, setGameTags, toggleFav } from '../library.js';
import { resultKo, qualityPct, QUALITY, QUALITY_ORDER } from '../quizgen.js';
import { mountQuiz } from './quiz.js';
import { accColor } from './home.js';

/** 등급 색을 "글자"에 쓸 때 — 밝은 테마에서는 원색이 배경에 묻히므로 테마별 값을 쓴다.
 *  (동그라미 아이콘의 배경색은 두 테마 모두 원색 그대로가 맞다) */
export function qColor(k) {
  return cssVar('--qt-' + k, (QUALITY[k] || {}).c || 'currentColor');
}

/** 등급 아이콘(색 동그라미) */
export function qIcon(k, size = 26) {
  const q = QUALITY[k];
  if (!q) return h('span');
  return h('span.qi', {
    style: `background:${q.c};width:${size}px;height:${size}px;font-size:${size * 0.46}px`,
    title: q.ko,
  }, q.g);
}

export async function view(app, params) {
  const st = await settings();
  let built;
  try {
    built = await loadBuilt(params.id);
  } catch (e) {
    app.appendChild(h('div.card.err', h('b', '경기를 찾을 수 없습니다'),
      h('button.btn.wide.mt', { onclick: () => nav('/') }, '목록으로')));
    return;
  }
  const { meta, plies, problems, report } = built;
  const myWhite = st.myName && meta.white.toLowerCase() === st.myName.toLowerCase();
  const myBlack = st.myName && meta.black.toLowerCase() === st.myName.toLowerCase();
  const orient = myBlack ? 'b' : 'w';

  const s = screen(`${meta.white} vs ${meta.black}`, {
    right: h('button.icon-btn', { onclick: () => menu(), 'aria-label': '더보기' }, '⋯'),
  });
  app.appendChild(s.root);
  s.root.classList.add('boardview');
  const b = s.body;

  b.appendChild(h('p.sub', { style: 'margin:-4px 0 12px' },
    `${meta.date || ''} · ${resultKo(meta.result, meta.termination)}`
    + (meta.welo ? ` · ${meta.welo} vs ${meta.belo}` : '')
    + (report && report.opening ? ` · ${report.opening}` : '')));

  const tabs = h('div.tabs');
  const pane = h('div');
  b.appendChild(tabs);
  b.appendChild(pane);

  const TABS = [
    ['quiz', `🧩 문제 ${problems.length}`],
    ['review', '🎬 복기'],
    ['report', '📊 리포트'],
  ];
  let cur = params.tab || 'quiz';
  if (!TABS.some((t) => t[0] === cur)) cur = 'quiz';

  for (const [key, label] of TABS) {
    tabs.appendChild(h('button.tab' + (key === cur ? '.on' : ''), {
      onclick: () => { history.replaceState(null, '', `#/game/${encodeURIComponent(params.id)}/${key}`); cur = key; paint(); },
    }, label));
  }

  // 국면 검색에서 "그 수로 가기"로 넘어오면 #/game/…/review?ply=12 형태로 온다
  let reviewStart = (() => {
    const m = /[?&]ply=(\d+)/.exec(location.hash || '');
    return m ? parseInt(m[1], 10) : 0;
  })();
  let reviewCleanup = null; // 복기 탭을 떠날 때 자동재생 타이머를 끄는 함수
  const qCycle = {};        // 등급별로 몇 번째 수까지 봤는지 (누를 때마다 다음 수)

  /** 리포트에서 등급 숫자를 눌렀을 때 — 그 등급의 수로 복기 화면 이동 */
  function jumpQ(side, k) {
    const list = [];
    plies.forEach((p, i) => { if (p.side === side && p.cls === k) list.push(i + 1); });
    if (!list.length) return;
    const key = side + k;
    const n = (qCycle[key] || 0) % list.length;
    qCycle[key] = n + 1;
    reviewStart = list[n];
    cur = 'review';
    paint();
    window.scrollTo(0, 0);
    if (list.length > 1) toast(`${QUALITY[k].ko} ${list.length}개 중 ${n + 1}번째`);
  }

  function paint() {
    Array.from(tabs.children).forEach((t, i) => t.classList.toggle('on', TABS[i][0] === cur));
    if (reviewCleanup) { reviewCleanup(); reviewCleanup = null; }
    clear(pane);
    if (cur === 'quiz') quizTab(pane);
    else if (cur === 'review') { reviewTab(pane, reviewStart); reviewStart = 0; }
    else reportTab(pane);
  }
  paint();

  async function menu() {
    const rec = await store.getGame(params.id);
    const tagMap = await tags();
    const mine = new Set((rec && rec.tags) || []);

    const tagBar = h('div.tagbar');
    for (const [id, t] of Object.entries(tagMap)) {
      tagBar.appendChild(h('button.tag' + (mine.has(id) ? '.on' : ''), {
        onclick: async (e) => {
          if (mine.has(id)) mine.delete(id); else mine.add(id);
          e.currentTarget.classList.toggle('on', mine.has(id));
          await setGameTags(params.id, [...mine]);
        },
      }, t.name));
    }
    if (!Object.keys(tagMap).length) tagBar.appendChild(h('span.dim', '태그는 경기 목록 화면에서 만듭니다'));

    const box = h('div.card',
      h('h3', '이 경기'),
      h('button.btn.wide.mb', {
        onclick: async () => {
          const on = await toggleFav(params.id);
          toast(on ? '즐겨찾기에 넣었습니다' : '즐겨찾기에서 뺐습니다');
        },
      }, (rec && rec.fav) ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'),
      h('p.dim.mb', '태그'),
      tagBar,
      h('div.btn-row.mt.mb',
        h('button.btn.sm', { onclick: () => copyText(built.rec.pgn, 'PGN을 복사했습니다') }, '📋 PGN 복사'),
        h('button.btn.sm', {
          onclick: async () => {
            await store.set('boardFen', (built.plies.length ? built.plies[built.plies.length - 1].fen : (built.startFen || START)));
            nav('/board');
          },
        }, '🔬 분석판으로')),
      h('button.btn.wide.mb', { onclick: editPgn }, '✏️ PGN 고치기'),
      h('button.btn.wide.mb', { onclick: () => nav('/import?again=' + encodeURIComponent(params.id)) }, '🔄 다시 분석'),
      meta.link ? h('a.btn.wide.mb', { href: meta.link, target: '_blank' }, '🔗 원본 사이트에서 보기') : null,
      h('button.btn.wide', {
        style: 'border-color:#5c2f2f;color:#ffb4b4',
        onclick: async () => {
          if (!confirm('이 경기를 삭제할까요? (훈련 기록도 함께 사라집니다)')) return;
          await store.delGame(params.id);
          invalidate(params.id);
          toast('삭제했습니다');
          nav('/');
        },
      }, '🗑 이 경기 삭제'),
      h('button.btn.wide.ghost.mt', { onclick: () => paint() }, '닫기'));
    clear(pane);
    pane.appendChild(box);
  }

  /** PGN 을 직접 고친다 (Chessis 의 "Edit Game Pgn"). 고치면 다시 분석해야 한다 */
  async function editPgn() {
    const ta = h('textarea', { rows: 10, style: 'width:100%' });
    ta.value = built.rec.pgn;
    const box = h('div.card',
      h('h3', 'PGN 고치기'),
      h('p.sub.mb', '수를 고치면 분석 결과가 맞지 않게 됩니다. 고친 뒤에는 다시 분석하세요.'),
      ta,
      h('div.btn-row.mt',
        h('button.btn', {
          onclick: async () => {
            const rec = await store.getGame(params.id);
            if (!rec) return toast('경기를 찾을 수 없습니다');
            rec.pgn = ta.value;
            await store.putGame(rec);
            invalidate(params.id);
            toast('저장했습니다 — 다시 분석하세요');
            location.reload();
          },
        }, '저장'),
        h('button.btn.ghost', { onclick: () => paint() }, '취소')));
    clear(pane);
    pane.appendChild(box);
  }

  /* ---------------- 🧩 문제 ---------------- */

  async function quizTab(host) {
    if (!problems.length) {
      host.appendChild(h('div.empty', h('div.big', '🎉'),
        h('p', h('b', '지적할 실수가 없습니다')),
        h('p.sub', '이 경기에서는 큰 실수(승률 -12%p 이상)가 나오지 않았습니다.')));
      return;
    }
    const posKey = 'pos:' + params.id;
    let idx = 0;
    const saved = await store.get(posKey, 0);
    const wrap = h('div');
    host.appendChild(wrap);

    if (saved > 0 && saved < problems.length) {
      const banner = h('div.card',
        h('b', `📌 ${saved + 1}번째 문제부터 이어서 풀 수 있습니다`),
        h('div.btn-row.mt',
          h('button.btn.primary', { onclick: () => { idx = saved; banner.remove(); show(); } }, '이어서 풀기'),
          h('button.btn', { onclick: () => { banner.remove(); show(); } }, '처음부터')));
      host.appendChild(banner);
    } else {
      show();
    }

    function show() {
      clear(wrap);
      const p = problems[idx];
      const header = h('div.row.mb',
        h('span.dim', `문제 ${idx + 1} / ${problems.length}`),
        h('div.spacer'),
        h('button.btn.sm.ghost', { onclick: () => { cur = 'review'; paint(); } }, '🎬 이 장면 복기'));
      mountQuiz(wrap, p, {
        header,
        nextLabel: idx + 1 < problems.length ? '다음 문제 →' : '문제 끝 · 리포트 보기',
        onDone: () => { store.set(posKey, idx + 1 >= problems.length ? 0 : idx + 1); },
        onNext: () => {
          if (idx + 1 < problems.length) { idx++; show(); window.scrollTo(0, 0); }
          else { store.set(posKey, 0); cur = 'report'; paint(); }
        },
      });
    }
  }

  /* ---------------- 🎬 복기 ---------------- */

  function reviewTab(host, startIdx) {
    let i = startIdx || 0;             // 0 = 시작 국면, 1..n = i번째 수를 둔 뒤
    let showArrows = false;
    let flipped = false;
    let timer = null;
    // 국면 읽기·위협 — 분석판과 같은 겹쳐 그리기를 복기에서도 쓴다
    let showElems = !!st.showElems;
    let showThreats = !!st.showThreats;
    const elems = { ...DEFAULT_ELEMS, ...(st.keyElems || {}) };
    const threatMode = { material: true, mate: true, undef: true, ...(st.threatMode || {}) };

    const boardHost = h('div.board-wrap');
    const bar = evalBar();
    const boardRow = h('div.board-row', st.evalBar ? bar.root : null, boardHost);
    const info = h('div.card', { style: 'margin-top:12px' });
    const listBox = h('div.movelist');
    const graphWrap = h('canvas', { height: 90 });

    // ── 이동 바 — 제일 자주 누르는 자리라 크게, 화면 너비를 나눠 갖는다
    const playBtn = h('button.btn.auto', { onclick: () => toggleAuto() }, '▶ 자동');
    const prevBtn = h('button.btn.step', { 'aria-label': '이전 수' }, '◀');
    const nextBtn = h('button.btn.step', { 'aria-label': '다음 수' }, '▶');
    holdRepeat(prevBtn, () => step(-1));       // 꾹 누르면 주르륵 되감긴다
    holdRepeat(nextBtn, () => step(1));
    const controls = h('div.movebar',
      h('button.btn', { 'aria-label': '처음으로', onclick: () => { stopAuto(); go(0); } }, '⏮'),
      prevBtn, nextBtn,
      h('button.btn', { 'aria-label': '끝으로', onclick: () => { stopAuto(); go(plies.length); } }, '⏭'),
      playBtn);

    const insightRow = h('div.toolrow',
      h('button.btn', { 'aria-label': '판 뒤집기', onclick: () => { flipped = !flipped; draw(); } }, '⇅'),
      h('button.btn', {
        onclick: (e) => { showArrows = !showArrows; e.currentTarget.classList.toggle('on'); draw(); },
      }, '🏹 최선'),
      h('button.btn' + (showElems ? '.on' : ''), {
        onclick: async (e) => {
          showElems = !showElems;
          e.currentTarget.classList.toggle('on', showElems);
          await setSetting('showElems', showElems);
          draw();
        },
      }, '🔍 국면'),
      h('button.btn' + (showThreats ? '.on' : ''), {
        onclick: async (e) => {
          showThreats = !showThreats;
          e.currentTarget.classList.toggle('on', showThreats);
          await setSetting('showThreats', showThreats);
          draw();
        },
      }, '⚠️ 위협'),
      h('button.btn', {
        onclick: async () => {
          const fen = i === 0 ? (built.startFen || START) : plies[i - 1].fen;
          await store.set('boardFen', fen);
          nav('/board');
        },
      }, '🔬 분석판'));
    const keNotes = h('div.ke-notes');

    // 넓은 화면(펼친 폰)에서는 두 줄이 한 줄로 붙어 판이 그만큼 커진다
    const ctrlWrap = h('div.ctrlwrap', controls, insightRow);
    host.appendChild(boardRow);
    host.appendChild(ctrlWrap);
    host.appendChild(keNotes);
    host.appendChild(info);
    host.appendChild(h('div.card', h('div.dim.mb', '수 목록 — 눌러서 이동'), listBox));
    host.appendChild(h('div.card', h('div.dim.mb', '평가 그래프'), graphWrap));

    // 판·수 이동 단추가 한 화면에 들어오게 (폰을 접었다 펴면 다시 잰다)
    fitBoard(boardHost, [ctrlWrap]);

    if (st.swipeMove) onSwipe(boardRow, (d) => step(d));
    // 복기 판은 수를 두는 곳이 아니다 — 판 자체를 제일 큰 앞뒤 단추로 쓴다
    onTapSide(boardHost, (d) => step(d));

    /** 자동재생 중이면 먼저 멈추고 한 수 — 단추·판탭·스와이프가 다 같은 길을 탄다 */
    function step(d) {
      stopAuto();
      go(i + d);
    }

    function stopAuto() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      playBtn.textContent = '▶ 자동';
      playBtn.classList.remove('on');
    }
    function toggleAuto() {
      if (timer) return stopAuto();
      if (i >= plies.length) i = 0;
      playBtn.textContent = '⏸ 멈춤';
      playBtn.classList.add('on');
      timer = setInterval(() => {
        if (i >= plies.length) return stopAuto();
        go(i + 1);
      }, Math.max(300, st.autoplayMs || 900));
    }
    // 탭을 옮기거나 화면을 벗어나면 자동재생을 반드시 끈다
    reviewCleanup = stopAuto;

    function go(n) {
      const prev = i;
      i = Math.max(0, Math.min(plies.length, n));
      // 한 수씩 앞으로 갈 때만 소리·진동 — 목록을 눌러 훌쩍 건너뛸 때는 조용히
      if (i === prev + 1 && i > 0) {
        const p = plies[i - 1];
        impact(/#/.test(p.san) ? 'win' : /\+/.test(p.san) ? 'check'
          : /^O-O/.test(p.san) ? 'castle' : /=/.test(p.san) ? 'promote'
          : /x/.test(p.san) ? 'capture' : 'move', st);
      }
      draw();
    }

    function draw() {
      const fen = i === 0 ? (built.startFen || START) : plies[i - 1].fen;
      const marks = {};
      const anim = {};
      if (i > 0) {
        addMark(marks, plies[i - 1].frm, 'hl');
        addMark(marks, plies[i - 1].to, 'hl');
        anim.from = plies[i - 1].frm;
        anim.to = plies[i - 1].to;
        anim.kind = /x/.test(plies[i - 1].san) ? 'capture'
          : /[+#]/.test(plies[i - 1].san) ? 'check' : 'move';
      }
      let arrows = showArrows && i < plies.length ? lineArrows(plies[i].bestLine, 'hint') : [];
      let numbers = {};
      const notes = [];
      if (showElems || showThreats) {
        const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
        if (showElems) {
          const r = readPosition(fen, elems, turn);
          for (const [sq, v] of Object.entries(r.marks)) (marks[sq] = marks[sq] || []).push(...v);
          arrows = arrows.concat(r.arrows);
          numbers = r.numbers;
          notes.push(...r.notes);
        }
        if (showThreats) {
          const r = readThreats(fen, turn === 'w' ? 'b' : 'w', threatMode);
          for (const [sq, v] of Object.entries(r.marks)) (marks[sq] = marks[sq] || []).push(...v);
          arrows = arrows.concat(r.arrows);
          notes.push(...r.notes);
        }
      }
      clear(keNotes);
      for (const n of notes) keNotes.appendChild(h('span.ke-note', n));

      renderBoard(boardHost, fen, {
        orient: flipped ? (orient === 'w' ? 'b' : 'w') : orient,
        marks, numbers,
        ...boardOpts(st),
        arrows: arrows.length ? arrows : null,
        anim: st.animate ? anim : null,
      });
      const wpw = i === 0 ? (report && report.wp0) : (report && report.wp && report.wp[i - 1]);
      bar.set(wpw == null ? 50 : wpw, flipped ? (orient === 'w' ? 'b' : 'w') : orient);
      paintInfo();
      paintList();
      paintGraph();
    }

    function paintInfo() {
      clear(info);
      if (i === 0) {
        info.appendChild(h('b', '시작 국면'));
        info.appendChild(h('p.sub', '▶ 를 누르거나 판의 오른쪽을 톡 쳐서 한 수씩 따라가 보세요. 꾹 누르면 주르륵 넘어갑니다.'));
        return;
      }
      const p = plies[i - 1];
      const q = QUALITY[p.cls] || { g: '·', ko: '', c: '#cfd6e0', tip: '' };
      const wpw = (report && report.wp && report.wp[i - 1] != null) ? report.wp[i - 1] : null;
      info.appendChild(h('div.row',
        qIcon(p.cls, 24),
        h('span', { style: `font-weight:800;color:${qColor(p.cls)};margin-left:8px` },
          `${p.mn}${p.side === 'w' ? '.' : '...'} ${st.figurine ? figurine(p.san) : p.san}${p.glyph}`),
        h('div.spacer'),
        h('span.badge.info', q.ko)));
      if (q.tip) info.appendChild(h('p.dim', { style: 'margin-top:4px' }, q.tip));
      if (p.think != null) {
        const prev = plies[i - 3];   // 같은 쪽의 바로 앞 수
        const slow = prev && prev.think != null && p.think > prev.think * 3 && p.think > 8;
        const fast = p.think <= 1.5;
        info.appendChild(h('p.dim', { style: 'margin-top:3px' },
          `⏱ ${fmtSec(p.think)} 씀` + (p.clk != null ? ` · 남은 시간 ${fmtSec(p.clk)}` : '')
          + (slow ? ' · 오래 고민한 수' : fast ? ' · 즉답' : '')));
      }
      if (wpw != null) {
        info.appendChild(h('div.wpbar.mt',
          h('div.w', { style: `width:${wpw}%` }, wpw >= 18 ? `백 ${Math.round(wpw)}%` : ''),
          h('div.b', { style: `width:${100 - wpw}%` }, 100 - wpw >= 18 ? `흑 ${Math.round(100 - wpw)}%` : '')));
      }
      if (p.hint && p.hint !== p.san) {
        info.appendChild(h('p.sub.mt', '💡 여기서는 ', h('b', st.figurine ? figurine(p.hint) : p.hint), ' 이(가) 최선이었습니다'));
      }
      // 후보수 — 깊게 다시 본 국면에만 있다
      if (p.alts && p.alts.length) {
        const box = h('div.mt');
        box.appendChild(h('div.dim.mb', '이 국면의 후보수 (엔진 순위)'));
        p.alts.forEach((a, k) => {
          const mine = a.san === p.san;
          box.appendChild(h('div.lrow', { style: 'padding:6px 0' },
            h('span.badge' + (k === 0 ? '.good' : ''), { style: 'min-width:26px;text-align:center' }, String(k + 1)),
            h('span.nm', a.san, mine ? h('span.dim', '  ← 실제로 둔 수') : null),
            h('span.val', { style: `color:${accColor(a.w)}` }, Math.round(a.w) + '%')));
          if (a.line && a.line.length > 1) {
            box.appendChild(h('div.dim', { style: 'margin:-4px 0 2px 34px' }, a.line.join(' ')));
          }
        });
        info.appendChild(box);
      }
      if (p.punish && p.punish.length) {
        info.appendChild(h('p.sub.mt', '⚔️ 상대의 응징 수순: ', h('b', p.punish.join(' '))));
      }
      const prob = problems.find((x) => x.ply === i);
      if (prob) {
        info.appendChild(h('button.btn.sm.wide.mt', {
          onclick: () => { cur = 'quiz'; paint(); },
        }, '🧩 이 장면을 문제로 풀기'));
      }
    }

    function paintList() {
      clear(listBox);
      const frag = document.createDocumentFragment();
      plies.forEach((p, k) => {
        if (p.side === 'w') frag.appendChild(h('span.mvno', `${p.mn}.`));
        frag.appendChild(h('span.mv.q-' + p.cls + (k + 1 === i ? ' on' : ''), {
          onclick: () => go(k + 1),
        }, (st.figurine ? figurine(p.san) : p.san) + p.glyph));
        frag.appendChild(document.createTextNode(' '));
      });
      listBox.appendChild(frag);
      const on = listBox.querySelector('.mv.on');
      if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function paintGraph() {
      drawEvalGraph(graphWrap, report, i, (ply) => go(ply));
    }

    draw();
  }

  /* ---------------- 📊 리포트 ---------------- */

  function reportTab(host) {
    if (!report) {
      host.appendChild(h('div.card', h('p.sub', '이 경기에는 분석 데이터가 없습니다.')));
      return;
    }
    const me = myBlack ? 'b' : 'w';
    const opp = me === 'w' ? 'b' : 'w';
    const nameOf = (s2) => (s2 === 'w' ? meta.white : meta.black);

    // 정확도 카드
    host.appendChild(h('div.card',
      h('h3', '정확도'),
      h('div.grid2.mt',
        accCard(nameOf(me) + (st.myName ? ' (나)' : ''), report.acc[me], report.est[me], report.cpl[me]),
        accCard(nameOf(opp), report.acc[opp], report.est[opp], report.cpl[opp]))));

    // 평가 그래프
    const canvas = h('canvas', { height: 130 });
    host.appendChild(h('div.card',
      h('h3', '흐름 (백 승률)'),
      h('p.dim.mb', '실수 지점을 누르면 그 장면으로 이동합니다'),
      canvas));
    drawEvalGraph(canvas, report, -1, (ply) => { reviewStart = ply; cur = 'review'; paint(); }, true);

    // ---- 수 품질 (10단계 · 숫자를 누르면 그 수로 이동) ----
    const cnt = { w: {}, b: {} };
    plies.forEach((p) => { cnt[p.side][p.cls] = (cnt[p.side][p.cls] || 0) + 1; });

    const tagOf = (sd) => (st.myName ? (sd === me ? '나' : '상대') : (sd === 'w' ? '백' : '흑'));
    const hd = (sd) => h('span.qn.hd', h('b', tagOf(sd)), h('span.nm', nameOf(sd)));

    const table = h('div.qtable');
    table.appendChild(h('div.qrow.head', h('span.qlabel'), hd(me), h('span'), hd(opp)));

    for (const k of QUALITY_ORDER) {
      const a = cnt[me][k] || 0;
      const c = cnt[opp][k] || 0;
      if (!a && !c) continue;
      const q = QUALITY[k];
      table.appendChild(h('div.qrow',
        h('span.qlabel', { style: `color:${qColor(k)}` }, q.ko),
        qCell(me, k, a),
        qIcon(k),
        qCell(opp, k, c)));
    }
    host.appendChild(h('div.card',
      h('h3', '수 품질'),
      h('p.dim.mb', '숫자를 누르면 그 수로 바로 갑니다 · 여러 개면 누를 때마다 다음 수로'),
      table));

    function qCell(side, k, n) {
      if (!n) return h('span.qn.zero', '0');
      return h('button.qn.tapn', { style: `color:${qColor(k)}`, onclick: () => jumpQ(side, k) }, String(n));
    }

    // 구간별 정확도
    const ph = report.acc_ph[me] || [];
    const phName = ['오프닝', '미들게임', '엔드게임'];
    host.appendChild(h('div.card',
      h('h3', '구간별 정확도 (나)'),
      h('div.grid3.mt', ...ph.map((v, k) => h('div.stat',
        h('div.k', phName[k]),
        h('div.v', { style: `color:${v == null ? 'var(--dim)' : accColor(v)}` }, v == null ? '—' : v + '%'))))));

    // 품질 비율 막대
    const pct = qualityPct(cnt[me]);
    host.appendChild(h('div.card',
      h('h3', '내 수 분포'),
      h('div.wpbar.mt', { style: 'height:30px' },
        h('div', { style: `width:${pct.g}%;background:#3fae6a;color:#04240f` }, pct.g >= 14 ? `좋음 ${pct.g}%` : ''),
        h('div', { style: `width:${pct.y}%;background:#d8b44a;color:#2a2103` }, pct.y >= 14 ? `부정확 ${pct.y}%` : ''),
        h('div', { style: `width:${pct.r}%;background:#d05656;color:#2a0606` }, pct.r >= 14 ? `실수 ${pct.r}%` : '')),
      h('p.dim.mt', `총 ${Object.values(cnt[me]).reduce((a, x) => a + x, 0)}수 · 평균 손실 ${report.cpl[me]}cp`)));

    // 이 판의 시간 씀씀이 (시계가 기록된 PGN 일 때만)
    if (report.think) {
      const rows = [];
      for (const sd of [me, opp]) {
        const ts = [];
        report.think.forEach((t, k) => {
          if (t == null) return;
          if ((k % 2 === 0 ? 'w' : 'b') === sd) ts.push(t);
        });
        if (!ts.length) continue;
        const sum = ts.reduce((a, x) => a + x, 0);
        const longest = Math.max(...ts);
        rows.push(h('div.lrow',
          h('div', { style: 'flex:1;min-width:0' },
            h('div.nm', `${tagOf(sd)} · ${nameOf(sd)}`),
            h('div.dim', `가장 오래 고민한 수 ${fmtSec(longest)}`)),
          h('span.val', `${fmtSec(sum / ts.length)} / 수`)));
      }
      if (rows.length) {
        host.appendChild(h('div.card', h('h3', '⏱ 시간 씀씀이'),
          h('p.dim.mb', '한 수에 평균 얼마나 썼는지'), ...rows));
      }
    }

    // 이 분석이 어떤 조건에서 나왔는지 — 숫자를 믿을 근거
    host.appendChild(h('div.card',
      h('h3', '분석 정보'),
      h('p.dim', `${report.engine || 'Stockfish'} · 수당 ${report.movetime || '?'}초`
        + (report.wsrc === 'wdl' ? ' · 승률은 엔진의 WDL 실측' : ' · 승률은 점수 환산')
        + (report.accv >= 2 ? ' · 정확도는 변동성 가중' : ''))));
  }

  function accCard(name, acc, est, cpl) {
    return h('div.stat',
      h('div.k', name),
      h('div.v', { style: `color:${accColor(acc)}` }, acc + '%'),
      h('div.dim', `추정 ${est} · 평균손실 ${cpl}cp`));
  }

  // 화면을 떠날 때(라우터가 부른다) 자동재생 타이머를 끈다
  return () => { if (reviewCleanup) reviewCleanup(); };
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** 판 옆 세로 승률 막대 (위=흑, 아래=백 — 판 방향에 맞춰 뒤집는다) */
export function evalBar() {
  const fill = h('div.fill');
  const hi = h('div.num.hi', '');
  const lo = h('div.num.lo', '');
  const root = h('div.evalbar', fill, h('div.mid'), hi, lo);
  return {
    root,
    /** @param wpWhite 백 관점 승률% @param orient 판이 보는 방향(아래쪽 색) */
    set(wpWhite, orient) {
      const v = Math.max(0, Math.min(100, wpWhite));
      const bottomIsWhite = orient !== 'b';
      const bottom = bottomIsWhite ? v : 100 - v;   // 아래쪽 색이 가진 몫
      // column-reverse 라서 fill 은 아래에서 자란다. 색은 판 방향에 맞춰 바꾼다
      fill.style.height = bottom + '%';
      fill.style.background = bottomIsWhite ? '#e8e6df' : '#3a4150';
      root.style.background = bottomIsWhite ? '#3a4150' : '#e8e6df';
      hi.style.color = bottomIsWhite ? '#20242c' : '#dfe4ec';
      lo.style.color = bottomIsWhite ? '#dfe4ec' : '#20242c';
      hi.textContent = bottom >= 50 ? Math.round(bottom) : '';
      lo.textContent = bottom < 50 ? Math.round(100 - bottom) : '';
      root.title = `백 ${Math.round(v)}% · 흑 ${Math.round(100 - v)}%`;
    },
  };
}

/** 승률 곡선 캔버스 (강제 다크모드 영향을 받지 않는 캔버스로 그린다) */
export function drawEvalGraph(canvas, report, curPly, onJump, bigMarkers) {
  if (!report || !report.wp || !report.wp.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
  // 논리 높이는 한 번만 기억한다 (안 그러면 다시 그릴 때마다 dpr 배로 커진다)
  const hgt = +(canvas.dataset.h || canvas.height);
  canvas.dataset.h = hgt;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  canvas.style.height = hgt + 'px';
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hgt);

  const wp = report.wp, n = wp.length;
  const X = (i) => (n <= 1 ? 0 : (i / (n - 1)) * (w - 2) + 1);
  const Y = (v) => hgt - (v / 100) * hgt;

  // 배경
  c.fillStyle = cssVar('--graph-bg', '#12161d');
  c.fillRect(0, 0, w, hgt);
  c.fillStyle = cssVar('--graph-top', '#1b212b');
  c.fillRect(0, 0, w, Y(50));

  // 곡선 + 채움
  c.beginPath();
  c.moveTo(X(0), Y(wp[0]));
  for (let i = 1; i < n; i++) c.lineTo(X(i), Y(wp[i]));
  c.lineTo(X(n - 1), Y(50));
  c.lineTo(X(0), Y(50));
  c.closePath();
  c.fillStyle = cssVar('--graph-fill', 'rgba(232,236,243,.16)');
  c.fill();

  c.beginPath();
  c.moveTo(X(0), Y(wp[0]));
  for (let i = 1; i < n; i++) c.lineTo(X(i), Y(wp[i]));
  c.strokeStyle = cssVar('--graph-line', '#e8ecf3');
  c.lineWidth = 1.6;
  c.stroke();

  // 50% 기준선
  c.beginPath();
  c.moveTo(0, Y(50)); c.lineTo(w, Y(50));
  c.strokeStyle = cssVar('--graph-grid', 'rgba(255,255,255,.22)');
  c.lineWidth = 1;
  c.setLineDash([3, 3]);
  c.stroke();
  c.setLineDash([]);

  // 실수 표시
  const cls = report.cls || [];
  const marks = [];
  for (let i = 0; i < n; i++) {
    const k = cls[i];
    if (k !== 'mistake' && k !== 'blunder') continue;
    const x = X(i), y = Y(wp[i]);
    marks.push({ x, i });
    c.beginPath();
    c.arc(x, y, bigMarkers ? 5 : 3.5, 0, Math.PI * 2);
    c.fillStyle = k === 'blunder' ? '#f05555' : '#f0a030';
    c.fill();
    c.strokeStyle = cssVar('--graph-edge', '#0e1116');
    c.lineWidth = 1.4;
    c.stroke();
  }

  // 현재 수 커서
  if (curPly > 0 && curPly <= n) {
    const x = X(curPly - 1);
    c.beginPath();
    c.moveTo(x, 0); c.lineTo(x, hgt);
    c.strokeStyle = cssVar('--accent', '#4ADE80');
    c.lineWidth = 1.4;
    c.stroke();
  }

  if (onJump && !canvas.dataset.bound) {
    canvas.dataset.bound = '1';
    canvas.addEventListener('click', (ev) => {
      const r = canvas.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = Math.round((px - 1) / Math.max(1, r.width - 2) * (n - 1));
      onJump(Math.max(1, Math.min(n, i + 1)));
    });
  }
}
