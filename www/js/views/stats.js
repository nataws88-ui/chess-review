/* 📊 실력 통계 · 약점 리포트 — 모든 경기를 누적해서 본다 */

import { h, nav, screen, clear } from '../ui.js';
import { settings, store, getSrs } from '../store.js';
import { allCards } from '../games.js';
import { accColor } from './home.js';

export async function view(app) {
  const st = await settings();
  const s = screen('📊 실력 통계', { back: false });
  app.appendChild(s.root);
  const b = s.body;

  const games = await store.allGames();
  if (!games.length) {
    b.appendChild(h('div.empty', h('div.big', '📊'), h('p', h('b', '분석한 경기가 없습니다')),
      h('div.mt', h('button.btn.primary', { onclick: () => nav('/import') }, '경기 가져오기'))));
    return;
  }
  if (!st.myName) {
    b.appendChild(h('div.card',
      h('b', '내 아이디를 알려주세요'),
      h('p.sub.mb', '어느 쪽이 내 수인지 알아야 통계를 낼 수 있습니다.'),
      h('button.btn.primary.wide', { onclick: () => nav('/settings') }, '설정에서 입력하기')));
    return;
  }

  const me = st.myName.toLowerCase();
  const mine = games
    .filter((g) => [g.meta.white, g.meta.black].some((x) => (x || '').toLowerCase() === me))
    .sort((a, c) => (a.meta.date < c.meta.date ? -1 : 1));

  if (!mine.length) {
    b.appendChild(h('div.card', h('b', `"${st.myName}" 이(가) 등장하는 경기가 없습니다`),
      h('p.sub', '설정에서 아이디를 확인해 주세요.')));
    return;
  }

  const side = (g) => ((g.meta.white || '').toLowerCase() === me ? 'w' : 'b');
  const won = (g) => (g.meta.result === '1-0' && side(g) === 'w') || (g.meta.result === '0-1' && side(g) === 'b');
  const draw = (g) => g.meta.result === '1/2-1/2';

  const W = mine.filter(won).length;
  const D = mine.filter(draw).length;
  const L = mine.length - W - D;
  const accs = mine.map((g) => (g.acc || {})[side(g)]).filter((x) => x != null);
  const avgAcc = accs.length ? Math.round(accs.reduce((a, x) => a + x, 0) / accs.length * 10) / 10 : 0;
  const last5 = accs.slice(-5);
  const avg5 = last5.length ? Math.round(last5.reduce((a, x) => a + x, 0) / last5.length * 10) / 10 : 0;

  // ---- 요약 ----
  b.appendChild(h('div.card',
    h('h3', `${st.myName} · ${mine.length}판`),
    h('div.grid3.mt',
      h('div.stat', h('div.k', '전적'), h('div.v', `${W}승 ${D}무 ${L}패`)),
      h('div.stat', h('div.k', '평균 정확도'), h('div.v', { style: `color:${accColor(avgAcc)}` }, avgAcc + '%')),
      h('div.stat', h('div.k', '최근 5판'), h('div.v', { style: `color:${accColor(avg5)}` }, avg5 + '%'))),
    h('div.wpbar.mt', { style: 'height:24px' },
      h('div', { style: `width:${W / mine.length * 100}%;background:#3fae6a;color:#04240f` }, W ? String(W) : ''),
      h('div', { style: `width:${D / mine.length * 100}%;background:#6b7684;color:#0e1116` }, D ? String(D) : ''),
      h('div', { style: `width:${L / mine.length * 100}%;background:#d05656;color:#2a0606` }, L ? String(L) : ''))));

  // ---- 정확도 추이 ----
  const canvas = h('canvas', { height: 120 });
  b.appendChild(h('div.card', h('h3', '정확도 추이'), h('p.dim.mb', '최근 경기일수록 오른쪽'), canvas));
  drawTrend(canvas, mine.map((g) => (g.acc || {})[side(g)] || 0));

  // ---- 구간별 정확도 ----
  const phSum = [[], [], []];
  const counts = {};
  let totalMoves = 0, missedWins = 0;
  for (const g of mine) {
    const r = g.report;
    if (!r) continue;
    const sd = side(g);
    (r.acc_ph[sd] || []).forEach((v, i) => { if (v != null) phSum[i].push(v); });
    for (const [k, v] of Object.entries(r.counts[sd] || {})) {
      if (k === 'mw') { missedWins += v; continue; }
      counts[k] = (counts[k] || 0) + v;
      totalMoves += v;
    }
  }
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length * 10) / 10 : null);
  const phName = ['오프닝', '미들게임', '엔드게임'];
  const phAvg = phSum.map(avg);
  b.appendChild(h('div.card',
    h('h3', '구간별 정확도'),
    h('div.grid3.mt', ...phAvg.map((v, i) => h('div.stat',
      h('div.k', phName[i]),
      h('div.v', { style: `color:${v == null ? 'var(--dim)' : accColor(v)}` }, v == null ? '—' : v + '%'))))));

  // ---- 약점 태그 ----
  const cards = (await allCards()).filter((c) => c.mine);
  const cause = { hang: 0, tactic: 0, mate: 0, judge: 0 };
  for (const c of cards) {
    if (/잡힐 위기/.test(c.playedWhy || '')) cause.hang++;
    else if (/체크메이트/.test(c.bestWhy || '')) cause.mate++;
    else if (/양걸이|위협/.test(c.bestWhy || '')) cause.tactic++;
    else cause.judge++;
  }
  const causeRows = [
    ['🩸 기물을 그냥 놓침', cause.hang, '수를 두기 전에 "이 수를 두면 뭐가 잡히나"를 한 번 더 확인하세요'],
    ['🎯 전술(양걸이·위협) 놓침', cause.tactic, '상대 기물이 한 줄에 있거나 방어가 없는지 매 수 확인하세요'],
    ['👑 메이트 기회·위험 놓침', cause.mate, '킹 주변이 열렸을 때는 강제 수순부터 계산하세요'],
    ['🧭 판단 실수(자리·계획)', cause.judge, '급할 게 없을 땐 가장 약한 기물을 개선하세요'],
  ].sort((a, c2) => c2[1] - a[1]);

  const tags = h('div');
  const totalCause = Math.max(1, cards.length);
  for (const [label, cnt, tip] of causeRows) {
    if (!cnt) continue;
    tags.appendChild(h('div', { style: 'padding:9px 0;border-bottom:1px solid var(--line)' },
      h('div.row', h('b', { style: 'flex:1' }, label), h('span.dim', `${cnt}회 (${Math.round(cnt / totalCause * 100)}%)`)),
      h('div.pbar-track', { style: 'margin-top:6px' },
        h('div', { style: `height:100%;width:${cnt / totalCause * 100}%;background:linear-gradient(90deg,#d05656,#f0a030);border-radius:99px` })),
      h('p.dim', { style: 'margin-top:5px' }, '💡 ' + tip)));
  }
  b.appendChild(h('div.card',
    h('h3', '실수 원인 분석'),
    h('p.dim.mb', `내 실수 ${cards.length}건을 원인별로 묶었습니다`),
    cards.length ? tags : h('p.sub', '아직 지적된 실수가 없습니다 🎉'),
    missedWins ? h('p.sub.mt', `🏆 놓친 승리 ${missedWins}회`) : null));

  // ---- 오프닝별 성적 ----
  const byOpening = {};
  for (const g of mine) {
    const key = (g.report && g.report.opening) || '오프닝 불명';
    const o = byOpening[key] || (byOpening[key] = { n: 0, w: 0, acc: [] });
    o.n++;
    if (won(g)) o.w++;
    const a = (g.acc || {})[side(g)];
    if (a != null) o.acc.push(a);
  }
  const opRows = Object.entries(byOpening).sort((a, c2) => c2[1].n - a[1].n).slice(0, 8);
  b.appendChild(h('div.card',
    h('h3', '오프닝별 성적'),
    ...opRows.map(([name, o]) => h('div.row', { style: 'padding:7px 0;border-bottom:1px solid var(--line)' },
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { style: 'font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, name),
        h('div.dim', `${o.n}판 · 승률 ${Math.round(o.w / o.n * 100)}%`)),
      h('div', { style: `font-weight:800;color:${accColor(avg(o.acc) || 0)}` }, (avg(o.acc) ?? '—') + '%')))));

  // ---- 반복해서 틀리는 문제 ----
  const srs = await getSrs();
  const tough = cards.filter((c) => srs[c.id] && srs[c.id].lap >= 2)
    .sort((a, c2) => srs[c2.id].lap - srs[a.id].lap).slice(0, 5);
  if (tough.length) {
    b.appendChild(h('div.card',
      h('h3', '🔁 자꾸 틀리는 문제'),
      ...tough.map((c) => h('button.card.tap', { style: 'margin:8px 0 0', onclick: () => nav('/game/' + encodeURIComponent(c.gameId) + '/quiz') },
        h('div.row', h('b', { style: 'flex:1' }, `${c.moveLabel} — ${c.best}`), h('span.badge.mistake', `${srs[c.id].lap}회 틀림`)),
        h('div.dim', `${c.d} · ${c.g}`))),
      h('button.btn.wide.mt', { onclick: () => nav('/train') }, '지금 훈련하기')));
  }
}

function drawTrend(canvas, vals) {
  if (!vals.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
  const hgt = +(canvas.dataset.h || canvas.height);
  canvas.dataset.h = hgt;
  canvas.width = w * dpr; canvas.height = hgt * dpr; canvas.style.height = hgt + 'px';
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#12161d';
  c.fillRect(0, 0, w, hgt);

  const pad = 6;
  const X = (i) => (vals.length <= 1 ? w / 2 : pad + (i / (vals.length - 1)) * (w - pad * 2));
  const Y = (v) => hgt - pad - ((Math.max(30, Math.min(100, v)) - 30) / 70) * (hgt - pad * 2);

  for (const line of [50, 75, 90]) {
    c.beginPath(); c.moveTo(0, Y(line)); c.lineTo(w, Y(line));
    c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.28)'; c.font = '10px system-ui';
    c.fillText(line + '%', 3, Y(line) - 3);
  }

  c.beginPath();
  vals.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
  c.strokeStyle = '#4ADE80'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();

  vals.forEach((v, i) => {
    c.beginPath(); c.arc(X(i), Y(v), 3, 0, Math.PI * 2);
    c.fillStyle = v >= 80 ? '#7ee2a8' : v >= 65 ? '#f0d46a' : '#f08080';
    c.fill();
  });
}
