/* 📊 실력 통계 · 약점 리포트 — 모든 경기를 누적해서 본다.
 *
 * 여기 있는 숫자는 전부 저장된 report 에서 다시 계산한다(별도 집계 저장 없음).
 * 옛 경기에 없는 항목(시간·시각)은 그 항목만 조용히 빠진다. */

import { h, nav, screen, cssVar, fmtSec } from '../ui.js';
import { settings, store, getSrs } from '../store.js';
import { allCards } from '../games.js';
import { accColor } from './home.js';
import { displayCls, QUALITY, QUALITY_ORDER } from '../quizgen.js';
import { qIcon, qColor } from './game.js';

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
  const isMine = (g) => [g.meta.white, g.meta.black].some((x) => (x || '').toLowerCase() === me);
  const all = games.filter(isMine).sort(byDate);

  if (!all.length) {
    b.appendChild(h('div.card', h('b', `"${st.myName}" 이(가) 등장하는 경기가 없습니다`),
      h('p.sub', '설정에서 아이디를 확인해 주세요.')));
    return;
  }

  /* ---- 기간 고르기 ---- */
  const RANGES = [['all', '전체'], ['30', '최근 30판'], ['10', '최근 10판']];
  let range = 'all';
  const rangeBox = h('div.seg.mb');
  const pane = h('div');
  for (const [k, label] of RANGES) {
    rangeBox.appendChild(h('button' + (k === range ? '.on' : ''), {
      onclick: () => {
        range = k;
        Array.from(rangeBox.children).forEach((el, i) => el.classList.toggle('on', RANGES[i][0] === k));
        paint();
      },
    }, label));
  }
  b.appendChild(rangeBox);
  b.appendChild(pane);

  const cards = (await allCards()).filter((c) => c.mine);
  const srs = await getSrs();

  paint();

  function paint() {
    pane.innerHTML = '';
    const mine = range === 'all' ? all : all.slice(-parseInt(range, 10));
    render(pane, mine, cards, srs, st, me);
  }
}

/* ---------------- 화면 그리기 ---------------- */

function render(b, mine, cards, srs, st, me) {
  const side = (g) => ((g.meta.white || '').toLowerCase() === me ? 'w' : 'b');
  const won = (g) => (g.meta.result === '1-0' && side(g) === 'w') || (g.meta.result === '0-1' && side(g) === 'b');
  const draw = (g) => g.meta.result === '1/2-1/2';
  const myAcc = (g) => (g.acc || {})[side(g)];

  const W = mine.filter(won).length;
  const D = mine.filter(draw).length;
  const L = mine.length - W - D;
  const accs = mine.map(myAcc).filter((x) => x != null);
  const avgAcc = avg(accs) || 0;
  const avg5 = avg(accs.slice(-5)) || 0;
  const ests = mine.map((g) => (g.report && g.report.est ? g.report.est[side(g)] : null)).filter((x) => x != null);

  /* ---- 1. 요약 ---- */
  b.appendChild(h('div.card',
    h('h3', `${st.myName} · ${mine.length}판`),
    h('div.grid3.mt',
      stat('전적', `${W}·${D}·${L}`, null, '승·무·패'),
      stat('평균 정확도', avgAcc + '%', accColor(avgAcc)),
      stat('최근 5판', avg5 + '%', accColor(avg5), avg5 >= avgAcc ? '▲ 오름세' : '▼ 내림세')),
    h('div.wpbar.mt', { style: 'height:24px' },
      bar(W / mine.length, '#3fae6a', '#04240f', W),
      bar(D / mine.length, '#6b7684', '#0e1116', D),
      bar(L / mine.length, '#d05656', '#2a0606', L)),
    h('p.dim.mt', `승률 ${pct(W, mine.length)}%`
      + (ests.length ? ` · 이 경기력의 추정 레이팅 ${Math.round(avg(ests))}` : ''))));

  /* ---- 2. 정확도 추이 ---- */
  const canvas = h('canvas', { height: 130 });
  b.appendChild(h('div.card',
    h('h3', '정확도 추이'),
    h('p.dim.mb', '점 = 한 판 · 선 = 최근 5판 평균 (오른쪽이 최신)'),
    canvas));
  drawTrend(canvas, mine.map((g) => myAcc(g) || 0));

  /* ---- 3. 색깔별 ---- */
  const byColor = { w: [], b: [] };
  mine.forEach((g) => byColor[side(g)].push(g));
  b.appendChild(h('div.card',
    h('h3', '백·흑 어느 쪽이 강한가'),
    h('div.grid2.mt',
      colorCard('⚪ 백', byColor.w, won, draw, myAcc),
      colorCard('⚫ 흑', byColor.b, won, draw, myAcc))));

  /* ---- 4. 시간제어별 ---- */
  const byTc = groupBy(mine, (g) => tcName(g.meta.timeControl));
  if (Object.keys(byTc).length > 1) {
    b.appendChild(h('div.card',
      h('h3', '시간제어별 성적'),
      ...Object.entries(byTc).sort((a, c) => c[1].length - a[1].length).map(([name, gs]) =>
        lrow(name, `${gs.length}판 · 승률 ${pct(gs.filter(won).length, gs.length)}%`,
          fmtPct(avg(gs.map(myAcc).filter((x) => x != null)))))));
  }

  /* ---- 5. 구간별 정확도 ---- */
  const phSum = [[], [], []];
  const counts = {};
  let totalMoves = 0, missedWins = 0;
  for (const g of mine) {
    const r = g.report;
    if (!r) continue;
    const sd = side(g);
    ((r.acc_ph || {})[sd] || []).forEach((v, i) => { if (v != null) phSum[i].push(v); });
    for (const [k, v] of Object.entries((r.counts || {})[sd] || {})) {
      if (k === 'mw') { missedWins += v; continue; }
      counts[k] = (counts[k] || 0) + v;
      totalMoves += v;
    }
    // 7단계 집계에 💎탁월/❗매우 좋아요/✗놓친 수를 반영한다 (해당 수의 원래 등급에서 옮김)
    const dc = displayCls(r);
    for (let i = 0; i < dc.length; i++) {
      if ((i % 2 === 0 ? 'w' : 'b') !== sd) continue;
      const base = (r.cls || [])[i];
      if (!base || dc[i] === base) continue;
      counts[base] = Math.max(0, (counts[base] || 0) - 1);
      counts[dc[i]] = (counts[dc[i]] || 0) + 1;
    }
  }
  const phName = ['오프닝', '미들게임', '엔드게임'];
  const phAvg = phSum.map(avg);
  const worst = phAvg.reduce((a, v, i) => (v != null && (a < 0 || v < phAvg[a]) ? i : a), -1);
  b.appendChild(h('div.card',
    h('h3', '구간별 정확도'),
    h('div.grid3.mt', ...phAvg.map((v, i) => h('div.stat',
      h('div.k', phName[i]),
      h('div.v', { style: `color:${v == null ? 'var(--dim)' : accColor(v)}` }, v == null ? '—' : v + '%')))),
    worst >= 0 ? h('p.dim.mt', `가장 약한 구간은 ${phName[worst]}입니다`) : null));

  /* ---- 6. 수 품질 누적 ---- */
  if (totalMoves) {
    const qt = h('div.qtable');
    for (const k of QUALITY_ORDER) {
      const v = counts[k] || 0;
      if (!v) continue;
      const q = QUALITY[k];
      qt.appendChild(h('div.qrow', { style: 'grid-template-columns:30px 1fr 58px 64px' },
        qIcon(k),
        h('span.qlabel', { style: `color:${qColor(k)};padding-left:6px` }, q.ko),
        h('span.qn', { style: `color:${qColor(k)}` }, String(v)),
        h('span.qn.zero', { style: 'font-size:.8rem;font-weight:700' },
          (Math.round(v / totalMoves * 1000) / 10) + '%')));
    }
    const bad = (counts.mistake || 0) + (counts.blunder || 0) + (counts.miss || 0);
    b.appendChild(h('div.card',
      h('h3', '수 품질 (전체 누적)'),
      h('p.dim.mb', `내가 둔 ${totalMoves}수 · 큰 실수 ${bad}개`
        + (bad ? ` — 평균 ${Math.round(totalMoves / bad)}수에 한 번` : '')),
      qt));
  }

  /* ---- 7. 실수 원인 ---- */
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
      h('div.row', h('b', { style: 'flex:1' }, label), h('span.dim', `${cnt}회 (${pct(cnt, totalCause)}%)`)),
      h('div.mini', h('div', { style: `width:${cnt / totalCause * 100}%;background:var(--red)` })),
      h('p.dim', { style: 'margin-top:5px' }, '💡 ' + tip)));
  }
  b.appendChild(h('div.card',
    h('h3', '실수 원인 분석'),
    h('p.dim.mb', `내 실수 ${cards.length}건을 원인별로 묶었습니다`),
    cards.length ? tags : h('p.sub', '아직 지적된 실수가 없습니다 🎉')));

  /* ---- 8. 시간 관리 ---- */
  const tm = timeStats(mine, side);
  if (tm) {
    const ratio = tm.fastBadPct && tm.slowBadPct ? tm.fastBadPct / Math.max(0.1, tm.slowBadPct) : 0;
    b.appendChild(h('div.card',
      h('h3', '⏱ 시간 관리'),
      h('p.dim.mb', `시계 기록이 있는 ${tm.games}판 · 내 수 ${tm.n}개`),
      h('div.grid3',
        stat('한 수 평균', fmtSec(tm.avgAll)),
        stat('실수한 수', fmtSec(tm.avgBad), tm.avgBad < tm.avgAll ? 'var(--red)' : null),
        stat('좋은 수', fmtSec(tm.avgGood))),
      h('div.mt',
        lrow(`빨리 둔 수 (${tm.fastCut}초 이하)`, `${tm.fast}수`, fmtPct(tm.fastBadPct) + ' 실수'),
        lrow('충분히 생각한 수', `${tm.n - tm.fast}수`, fmtPct(tm.slowBadPct) + ' 실수')),
      h('p.dim.mt', timeTip(tm, ratio))));
  }

  /* ---- 9. 오프닝별 (백/흑 분리) ---- */
  for (const sd of ['w', 'b']) {
    const gs = mine.filter((g) => side(g) === sd);
    if (gs.length < 2) continue;
    const byOp = groupBy(gs, (g) => (g.report && g.report.opening) || '오프닝 불명');
    const rows = Object.entries(byOp).sort((a, c) => c[1].length - a[1].length).slice(0, 6);
    if (!rows.length) continue;
    b.appendChild(h('div.card',
      h('h3', `${sd === 'w' ? '⚪ 백' : '⚫ 흑'}으로 둔 오프닝`),
      ...rows.map(([name, list]) => {
        const wr = pct(list.filter(won).length, list.length);
        return h('div', { style: 'padding:7px 0;border-bottom:1px solid var(--line)' },
          h('div.row',
            h('div.nm', { style: 'flex:1' }, name),
            h('span', { style: `font-weight:800;color:${accColor(avg(list.map(myAcc).filter((x) => x != null)) || 0)}` },
              fmtPct(avg(list.map(myAcc).filter((x) => x != null))))),
          h('div.dim', `${list.length}판 · 승률 ${wr}%`),
          h('div.mini', h('div', { style: `width:${wr}%;background:var(--accent)` })));
      })));
  }

  /* ---- 10. 상대 레이팅대별 ---- */
  const rated = mine.filter((g) => oppElo(g, side(g)) > 0);
  if (rated.length >= 3) {
    const byBand = groupBy(rated, (g) => band(oppElo(g, side(g))));
    b.appendChild(h('div.card',
      h('h3', '상대 레이팅대별 성적'),
      ...Object.entries(byBand).sort((a, c) => parseInt(a[0], 10) - parseInt(c[0], 10)).map(([name, gs]) =>
        lrow(name, `${gs.length}판 · 승률 ${pct(gs.filter(won).length, gs.length)}%`,
          fmtPct(avg(gs.map(myAcc).filter((x) => x != null)))))));
  }

  /* ---- 11. 시간대 ---- */
  const timed = mine.filter((g) => localDate(g.meta));
  if (timed.length >= 5) {
    const slots = [[0, 6, '🌙 새벽 0~6시'], [6, 12, '🌅 오전 6~12시'], [12, 18, '☀️ 오후 12~18시'], [18, 24, '🌆 저녁 18~24시']];
    const rows = slots.map(([lo, hi, label]) => {
      const gs = timed.filter((g) => { const hr = localDate(g.meta).getHours(); return hr >= lo && hr < hi; });
      return [label, gs];
    }).filter(([, gs]) => gs.length);
    if (rows.length > 1) {
      b.appendChild(h('div.card',
        h('h3', '언제 둘 때 잘 두나'),
        h('p.dim.mb', '한국 시간 기준'),
        ...rows.map(([label, gs]) =>
          lrow(label, `${gs.length}판 · 승률 ${pct(gs.filter(won).length, gs.length)}%`,
            fmtPct(avg(gs.map(myAcc).filter((x) => x != null)))))));
    }
  }

  /* ---- 12. 뒤집힌 판 ---- */
  const sw = swingStats(mine, side, won);
  if (sw.comeback || sw.thrown || missedWins) {
    b.appendChild(h('div.card',
      h('h3', '뒤집힌 판'),
      h('div.grid3',
        stat('역전승', sw.comeback + '판', 'var(--accent)', '지던 판을 이김'),
        stat('역전패', sw.thrown + '판', 'var(--red)', '이기던 판을 놓침'),
        stat('놓친 승리', missedWins + '회', 'var(--orange)', '결정타를 안 둔 수')),
      sw.thrown
        ? h('p.dim.mt', '💡 이기던 판을 놓친 적이 있습니다. 유리할 때는 새 공격보다 상대의 반격부터 확인하세요.')
        : null));
  }

  /* ---- 13. 자꾸 틀리는 문제 ---- */
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

/* ---------------- 작은 도우미 ---------------- */

const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length * 10) / 10 : null);
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const fmtPct = (v) => (v == null ? '—' : v + '%');
const byDate = (a, c) => (a.meta.date < c.meta.date ? -1 : a.meta.date > c.meta.date ? 1 : (a.addedAt || 0) - (c.addedAt || 0));

function groupBy(list, keyOf) {
  const out = {};
  for (const x of list) (out[keyOf(x)] = out[keyOf(x)] || []).push(x);
  return out;
}

function stat(k, v, color, note) {
  return h('div.stat',
    h('div.k', k),
    h('div.v' + (String(v).length > 7 ? '.sm' : ''), color ? { style: `color:${color}` } : null, v),
    note ? h('div.dim', note) : null);
}

function bar(frac, bg, fg, label) {
  return h('div', { style: `width:${frac * 100}%;background:${bg};color:${fg}` }, label ? String(label) : '');
}

function lrow(name, sub, val) {
  return h('div.lrow',
    h('div', { style: 'flex:1;min-width:0' }, h('div.nm', name), h('div.dim', sub)),
    h('span.val', val));
}

function colorCard(label, gs, won, draw, myAcc) {
  if (!gs.length) return h('div.stat', h('div.k', label), h('div.v', '—'));
  const w = gs.filter(won).length;
  const d = gs.filter(draw).length;
  const a = avg(gs.map(myAcc).filter((x) => x != null));
  return h('div.stat',
    h('div.k', `${label} ${gs.length}판`),
    h('div.v', { style: `color:${accColor(a || 0)}` }, fmtPct(a)),
    h('div.dim', `${w}승 ${d}무 ${gs.length - w - d}패 · 승률 ${pct(w, gs.length)}%`));
}

/** "600+5" / "1/259200" → 사람이 쓰는 이름 */
export function tcName(tc) {
  const s = String(tc || '');
  if (!s || s === '-') return '기타';
  if (s.includes('/')) return '통신(일일)';
  const base = parseInt(s, 10);
  if (!base && base !== 0) return '기타';
  const inc = parseInt((s.split('+')[1] || '0'), 10) || 0;
  const est = base + inc * 40;
  if (est < 180) return '불릿';
  if (est < 600) return '블리츠';
  if (est < 1800) return '래피드';
  return '클래식';
}

function oppElo(g, sd) {
  return parseInt((sd === 'w' ? g.meta.belo : g.meta.welo) || '0', 10) || 0;
}

function band(elo) {
  const lo = Math.floor(elo / 200) * 200;
  return `${lo}~${lo + 199}`;
}

/** PGN 의 UTC 날짜·시각 → 기기(한국) 시간의 Date. 없으면 null */
export function localDate(meta) {
  if (!meta || !meta.date || !meta.time) return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(meta.date);
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(meta.time);
  if (!d || !t) return null;
  return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +(t[3] || 0)));
}

/** 시간 통계를 한 줄 조언으로 — 빠른 수와 오래 고민한 수 중 어디서 실수가 나는가 */
function timeTip(tm, ratio) {
  if (ratio > 1.3) {
    return `💡 급하게 둔 수의 실수율이 ${Math.round(ratio * 10) / 10}배 높습니다. 한 박자만 쉬어도 정확도가 올라갑니다.`;
  }
  if (tm.slowBadPct > tm.fastBadPct * 1.3) {
    return '💡 실수는 오래 고민한 자리에서 더 많이 나옵니다. 어려운 국면 자체가 문제라는 뜻이니,'
      + ' 그런 장면을 훈련 문제로 반복해 두면 효과가 큽니다.';
  }
  return '💡 시간을 들인 수와 빨리 둔 수의 실수율 차이가 크지 않습니다.';
}

/** 시계 기록이 있는 판만 모아 시간 관리 통계 */
export function timeStats(games, sideOf) {
  const FAST = 2;                 // 이 초 이하면 "빨리 둔 수"
  let n = 0, sum = 0, used = 0;
  let bad = 0, badSum = 0, good = 0, goodSum = 0;
  let fast = 0, fastBad = 0, slow = 0, slowBad = 0;
  for (const g of games) {
    const r = g.report;
    if (!r || !r.think) continue;
    used++;
    const sd = sideOf(g);
    const cls = r.cls || [];
    for (let i = 0; i < r.think.length; i++) {
      if ((i % 2 === 0 ? 'w' : 'b') !== sd) continue;
      const t = r.think[i];
      if (t == null) continue;
      n++; sum += t;
      const isBad = cls[i] === 'mistake' || cls[i] === 'blunder';
      if (isBad) { bad++; badSum += t; } else { good++; goodSum += t; }
      if (t <= FAST) { fast++; if (isBad) fastBad++; } else { slow++; if (isBad) slowBad++; }
    }
  }
  if (!n || !used) return null;
  return {
    games: used, n, fastCut: FAST,
    avgAll: Math.round(sum / n * 10) / 10,
    avgBad: bad ? Math.round(badSum / bad * 10) / 10 : 0,
    avgGood: good ? Math.round(goodSum / good * 10) / 10 : 0,
    fast,
    fastBadPct: fast ? Math.round(fastBad / fast * 1000) / 10 : 0,
    slowBadPct: slow ? Math.round(slowBad / slow * 1000) / 10 : 0,
  };
}

/** 역전승·역전패 세기 */
export function swingStats(games, sideOf, won) {
  let comeback = 0, thrown = 0;
  for (const g of games) {
    const r = g.report;
    if (!r || !r.wp || !r.wp.length) continue;
    const sd = sideOf(g);
    const mineWp = r.wp.map((v) => (sd === 'w' ? v : 100 - v));
    const lo = Math.min(...mineWp);
    const hi = Math.max(...mineWp);
    if (won(g)) { if (lo <= 20) comeback++; }
    else if (g.meta.result !== '1/2-1/2') { if (hi >= 80) thrown++; }
  }
  return { comeback, thrown };
}

/** 정확도 추이 — 점(한 판) + 5판 이동평균 선 */
function drawTrend(canvas, vals) {
  if (!vals.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
  const hgt = +(canvas.dataset.h || canvas.height);
  canvas.dataset.h = hgt;
  canvas.width = w * dpr; canvas.height = hgt * dpr; canvas.style.height = hgt + 'px';
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = cssVar('--graph-bg', '#12161d');
  c.fillRect(0, 0, w, hgt);

  const pad = 6;
  const X = (i) => (vals.length <= 1 ? w / 2 : pad + (i / (vals.length - 1)) * (w - pad * 2));
  const Y = (v) => hgt - pad - ((Math.max(30, Math.min(100, v)) - 30) / 70) * (hgt - pad * 2);

  for (const line of [50, 75, 90]) {
    c.beginPath(); c.moveTo(0, Y(line)); c.lineTo(w, Y(line));
    c.strokeStyle = cssVar('--graph-grid', 'rgba(255,255,255,.18)'); c.lineWidth = 1; c.stroke();
    c.fillStyle = cssVar('--graph-dim', 'rgba(255,255,255,.28)'); c.font = '10px system-ui';
    c.fillText(line + '%', 3, Y(line) - 3);
  }

  // 5판 이동평균
  if (vals.length >= 3) {
    c.beginPath();
    vals.forEach((_, i) => {
      const from = Math.max(0, i - 4);
      const win = vals.slice(from, i + 1);
      const m = win.reduce((a, x) => a + x, 0) / win.length;
      if (i) c.lineTo(X(i), Y(m)); else c.moveTo(X(i), Y(m));
    });
    c.strokeStyle = cssVar('--accent', '#4ADE80');
    c.lineWidth = 2.2; c.lineJoin = 'round'; c.stroke();
  }

  vals.forEach((v, i) => {
    c.beginPath(); c.arc(X(i), Y(v), 3, 0, Math.PI * 2);
    c.fillStyle = v >= 80 ? '#7ee2a8' : v >= 65 ? '#f0d46a' : '#f08080';
    c.fill();
    c.strokeStyle = cssVar('--graph-edge', '#0e1116');
    c.lineWidth = 1.2; c.stroke();
  });
}
