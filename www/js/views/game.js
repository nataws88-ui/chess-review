/* 한 경기 화면 — 🧩 문제 / 🎬 복기 / 📊 리포트 */

import { h, nav, screen, toast, $, clear } from '../ui.js';
import { renderBoard, addMark, lineArrows } from '../board.js';
import { settings, store } from '../store.js';
import { loadBuilt } from '../games.js';
import { resultKo, qualityPct } from '../quizgen.js';
import { mountQuiz } from './quiz.js';
import { accColor } from './home.js';

const QUALITY = {
  best: ['⭐', '최선', '#8fe3ab'], excellent: ['✨', '훌륭', '#a8dfc0'],
  good: ['👍', '좋음', '#b8c8d8'], book: ['📖', '정석', '#9ab0c8'],
  inaccuracy: ['🤔', '부정확', '#ffe08a'], mistake: ['❗', '실수', '#ffc08a'],
  blunder: ['💥', '블런더', '#ff9a9a'],
};

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

  let reviewStart = 0;
  function paint() {
    Array.from(tabs.children).forEach((t, i) => t.classList.toggle('on', TABS[i][0] === cur));
    clear(pane);
    if (cur === 'quiz') quizTab(pane);
    else if (cur === 'review') { reviewTab(pane, reviewStart); reviewStart = 0; }
    else reportTab(pane);
  }
  paint();

  function menu() {
    const box = h('div.card',
      h('h3', '이 경기'),
      h('button.btn.wide.mb', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(built.rec.pgn); toast('PGN을 복사했습니다'); } }, '📋 PGN 복사'),
      meta.link ? h('a.btn.wide.mb', { href: meta.link, target: '_blank' }, '🔗 체스닷컴에서 보기') : null,
      h('button.btn.wide', {
        style: 'border-color:#5c2f2f;color:#ffb4b4',
        onclick: async () => {
          if (!confirm('이 경기를 삭제할까요? (훈련 기록도 함께 사라집니다)')) return;
          await store.delGame(params.id);
          toast('삭제했습니다');
          nav('/');
        },
      }, '🗑 이 경기 삭제'));
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

    const boardHost = h('div.board-wrap');
    const info = h('div.card', { style: 'margin-top:12px' });
    const listBox = h('div.movelist');
    const graphWrap = h('canvas', { height: 90 });
    const controls = h('div.row', { style: 'gap:6px;margin-top:10px' },
      h('button.btn.sm', { onclick: () => go(0) }, '⏮'),
      h('button.btn.sm', { onclick: () => go(i - 1) }, '◀'),
      h('button.btn.sm', { onclick: () => go(i + 1) }, '▶'),
      h('button.btn.sm', { onclick: () => go(plies.length) }, '⏭'),
      h('div.spacer'),
      h('button.btn.sm', {
        onclick: (e) => { showArrows = !showArrows; e.target.classList.toggle('on'); draw(); },
      }, '🏹 최선 수순'));

    host.appendChild(boardHost);
    host.appendChild(controls);
    host.appendChild(info);
    host.appendChild(h('div.card', h('div.dim.mb', '수 목록 — 눌러서 이동'), listBox));
    host.appendChild(h('div.card', h('div.dim.mb', '평가 그래프'), graphWrap));

    function go(n) {
      i = Math.max(0, Math.min(plies.length, n));
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
      }
      const arrows = showArrows && i < plies.length ? lineArrows(plies[i].bestLine, 'hint') : null;
      renderBoard(boardHost, fen, {
        orient, marks, theme: st.boardTheme, coords: st.showCoords, arrows,
        anim: st.animate ? anim : null,
      });
      paintInfo();
      paintList();
      paintGraph();
    }

    function paintInfo() {
      clear(info);
      if (i === 0) {
        info.appendChild(h('b', '시작 국면'));
        info.appendChild(h('p.sub', '▶ 를 눌러 한 수씩 따라가 보세요.'));
        return;
      }
      const p = plies[i - 1];
      const [ic, name, color] = QUALITY[p.cls] || ['·', '', '#cfd6e0'];
      const wpw = (report && report.wp && report.wp[i - 1] != null) ? report.wp[i - 1] : null;
      info.appendChild(h('div.row',
        h('span', { style: `font-weight:800;color:${color}` }, `${ic} ${p.mn}${p.side === 'w' ? '.' : '...'} ${p.san}${p.glyph}`),
        h('div.spacer'),
        h('span.badge.info', name)));
      if (wpw != null) {
        info.appendChild(h('div.wpbar.mt',
          h('div.w', { style: `width:${wpw}%` }, wpw >= 18 ? `백 ${Math.round(wpw)}%` : ''),
          h('div.b', { style: `width:${100 - wpw}%` }, 100 - wpw >= 18 ? `흑 ${Math.round(100 - wpw)}%` : '')));
      }
      if (p.hint && p.hint !== p.san) {
        info.appendChild(h('p.sub.mt', '💡 여기서는 ', h('b', p.hint), ' 이(가) 최선이었습니다'));
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
        }, p.san + p.glyph));
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

    // 수 품질 통계
    const rows = ['best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'];
    const table = h('div');
    for (const k of rows) {
      const [ic, label, color] = QUALITY[k];
      const mine = (report.counts[me] || {})[k] || 0;
      const theirs = (report.counts[opp] || {})[k] || 0;
      if (!mine && !theirs) continue;
      table.appendChild(h('div.row', { style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
        h('span', { style: `color:${color};font-weight:700;flex:1` }, `${ic} ${label}`),
        h('span', { style: 'width:52px;text-align:right;font-weight:800' }, String(mine)),
        h('span.dim', { style: 'width:52px;text-align:right' }, String(theirs))));
    }
    host.appendChild(h('div.card',
      h('div.row.mb', h('h3', { style: 'flex:1' }, '수 품질'),
        h('span.dim', { style: 'width:52px;text-align:right' }, '나'),
        h('span.dim', { style: 'width:52px;text-align:right' }, '상대')),
      table,
      (report.counts[me] || {}).mw
        ? h('p.sub.mt', `🏆 놓친 승리 ${report.counts[me].mw}회 — 이겼어야 할 국면을 놓쳤습니다`)
        : null));

    // 구간별 정확도
    const ph = report.acc_ph[me] || [];
    const phName = ['오프닝', '미들게임', '엔드게임'];
    host.appendChild(h('div.card',
      h('h3', '구간별 정확도 (나)'),
      h('div.grid3.mt', ...ph.map((v, k) => h('div.stat',
        h('div.k', phName[k]),
        h('div.v', { style: `color:${v == null ? 'var(--dim)' : accColor(v)}` }, v == null ? '—' : v + '%'))))));

    // 품질 비율 막대
    const pct = qualityPct(report.counts[me] || {});
    host.appendChild(h('div.card',
      h('h3', '내 수 분포'),
      h('div.wpbar.mt', { style: 'height:30px' },
        h('div', { style: `width:${pct.g}%;background:#3fae6a;color:#04240f` }, pct.g >= 14 ? `좋음 ${pct.g}%` : ''),
        h('div', { style: `width:${pct.y}%;background:#d8b44a;color:#2a2103` }, pct.y >= 14 ? `부정확 ${pct.y}%` : ''),
        h('div', { style: `width:${pct.r}%;background:#d05656;color:#2a0606` }, pct.r >= 14 ? `실수 ${pct.r}%` : '')),
      h('p.dim.mt', `총 ${Object.values(report.counts[me] || {}).reduce((a, x) => a + x, 0)}수 · 평균 손실 ${report.cpl[me]}cp`)));
  }

  function accCard(name, acc, est, cpl) {
    return h('div.stat',
      h('div.k', name),
      h('div.v', { style: `color:${accColor(acc)}` }, acc + '%'),
      h('div.dim', `추정 ${est} · 평균손실 ${cpl}cp`));
  }
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
  c.fillStyle = '#12161d';
  c.fillRect(0, 0, w, hgt);
  c.fillStyle = '#1b212b';
  c.fillRect(0, 0, w, Y(50));

  // 곡선 + 채움
  c.beginPath();
  c.moveTo(X(0), Y(wp[0]));
  for (let i = 1; i < n; i++) c.lineTo(X(i), Y(wp[i]));
  c.lineTo(X(n - 1), Y(50));
  c.lineTo(X(0), Y(50));
  c.closePath();
  c.fillStyle = 'rgba(232,236,243,.16)';
  c.fill();

  c.beginPath();
  c.moveTo(X(0), Y(wp[0]));
  for (let i = 1; i < n; i++) c.lineTo(X(i), Y(wp[i]));
  c.strokeStyle = '#e8ecf3';
  c.lineWidth = 1.6;
  c.stroke();

  // 50% 기준선
  c.beginPath();
  c.moveTo(0, Y(50)); c.lineTo(w, Y(50));
  c.strokeStyle = 'rgba(255,255,255,.22)';
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
    c.strokeStyle = '#0e1116';
    c.lineWidth = 1.4;
    c.stroke();
  }

  // 현재 수 커서
  if (curPly > 0 && curPly <= n) {
    const x = X(curPly - 1);
    c.beginPath();
    c.moveTo(x, 0); c.lineTo(x, hgt);
    c.strokeStyle = '#4ADE80';
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
