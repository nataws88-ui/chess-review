/* 홈 — 경기 보관함 + 오늘의 훈련 요약.
 * 거르개·태그·즐겨찾기·국면 검색은 Chessis 의 Games Archive 를 옮긴 것이다. */

import { h, nav, screen, toast, clear, isApp, readClipboard } from '../ui.js';
import { store, settings, setSetting, getSrs, today } from '../store.js';
import { allCards, invalidate } from '../games.js';
import { resultKo } from '../quizgen.js';
import { tags, addTag, deleteTag, setGameTags, applyFilter, SORTS, searchPosition } from '../library.js';

const RESULT_TONE = { '1-0': '#e8e6df', '0-1': '#8fa3c0', '1/2-1/2': '#c9c9c9' };

export async function view(app) {
  const st = await settings();
  const games = await store.allGames();
  let tagMap = await tags();

  const s = screen('♟️ 체스 복기왕', {
    back: false,
    right: h('button.icon-btn', { onclick: () => nav('/import'), 'aria-label': '가져오기' }, '＋'),
  });
  app.appendChild(s.root);
  const b = s.body;

  // ---- 오늘의 훈련 ----
  const srs = await getSrs();
  const cards = await allCards();
  const day = today();
  const pool = cards.filter((c) => !st.myName || !st.mineOnly || c.mine);
  const due = pool.filter((c) => srs[c.id] && srs[c.id].due <= day).length;
  const fresh = pool.filter((c) => !srs[c.id]).length;
  const learned = pool.filter((c) => srs[c.id]).length;

  // 오늘의 훈련 카드는 곧장 복습으로 (훈련 입구는 아래 탭에서)
  b.appendChild(h('button.hero.card.tap', { onclick: () => nav('/train/srs') },
    h('div.k', '오늘의 훈련'),
    h('div.v', due + fresh > 0 ? `${Math.min(due + Math.min(fresh, st.newPerDay), 999)}문제 대기중` : '오늘 몫 완료 🎉'),
    h('div.sub', due + fresh > 0
      ? `복습 ${due} · 새 문제 ${Math.min(fresh, st.newPerDay)}${fresh > st.newPerDay ? ` (전체 ${fresh})` : ''}`
      : `익힌 문제 ${learned}개 · 내일 또 만나요`),
  ));

  // ---- 빠른 실행 ----
  b.appendChild(h('div.btn-row.mb',
    h('button.btn.primary', { onclick: () => nav('/import') }, '＋ 경기 추가'),
    h('button.btn', { onclick: () => nav('/puzzle') }, '🧩 퍼즐'),
    h('button.btn', { onclick: () => nav('/board') }, '🔬 분석판'),
    h('button.btn', { onclick: () => nav('/spar') }, '⚔️ 대국'),
  ));

  if (!isApp) {
    b.appendChild(h('div.card.err',
      h('b', '⚠️ 브라우저에서 열렸습니다'),
      h('p.sub', '엔진 분석·대국은 설치된 앱에서만 동작합니다. 저장된 경기 보기는 됩니다.')));
  }

  if (!games.length) {
    b.appendChild(h('div.empty',
      h('div.big', '♟️'),
      h('p', h('b', '아직 경기가 없습니다')),
      h('p.sub', '체스닷컴·리체스 아이디로 자동으로 가져오거나,'),
      h('p.sub', 'PGN을 붙여넣어 첫 복기를 시작해 보세요.'),
      h('div.mt', h('button.btn.primary', { onclick: () => nav('/import') }, '경기 가져오기'))));
    return;
  }

  const me = (st.myName || '').toLowerCase();
  const sideOf = (g) => ((g.meta.white || '').toLowerCase() === me ? 'w' : 'b');
  const inGame = (g) => !!me && [g.meta.white, g.meta.black].some((n) => (n || '').toLowerCase() === me);
  const myAccOf = (g) => (inGame(g) ? (g.acc || {})[sideOf(g)] : null);

  /* ---------------- 거르개 상태 ---------------- */
  const f = {
    q: '', color: 'all', result: 'all', tag: null, fav: false,
    sort: st.gameSort || 'new', opening: null,
  };
  let posHits = null;               // 국면 검색 결과 (Map id → ply)
  let picking = false;              // 여러 개 고르기
  const picked = new Set();

  const list = h('div');
  const countEl = h('h3', '');
  const search = h('input', { type: 'search', placeholder: '상대 이름·이벤트·오프닝으로 찾기' });
  search.addEventListener('input', () => { f.q = search.value.trim(); paintList(); });

  const filterBox = h('div.card');
  const tagBar = h('div.tagbar');
  buildFilterBox();

  const headRow = h('div.row.mb', countEl, h('div.spacer'),
    h('button.btn.sm.ghost', { onclick: () => nav('/openings') }, '📖 오프닝'),
    h('button.btn.sm.ghost', { onclick: () => nav('/stats') }, '📊 통계'));

  b.appendChild(filterBox);
  b.appendChild(headRow);
  b.appendChild(list);
  paintList();

  /* ---------------- 거르개 화면 ---------------- */

  function buildFilterBox() {
    clear(filterBox);
    filterBox.appendChild(search);

    const row = (label, key, opts) => {
      const chips = h('div.chips.mt');
      opts.forEach(([v, name]) => {
        chips.appendChild(h('button.chip.sm' + (f[key] === v ? '.on' : ''), {
          onclick: () => {
            f[key] = v;
            Array.from(chips.children).forEach((c, i) => c.classList.toggle('on', opts[i][0] === v));
            paintList();
          },
        }, name));
      });
      return h('div', h('p.dim', { style: 'margin:8px 0 0' }, label), chips);
    };

    if (me) filterBox.appendChild(row('내 색', 'color', [['all', '전체'], ['w', '⚪ 백'], ['b', '⚫ 흑']]));
    filterBox.appendChild(row('결과', 'result', [['all', '전체'], ['win', '승'], ['loss', '패'], ['draw', '무']]));

    // 정렬
    const sortSel = h('select');
    for (const [v, name] of SORTS) {
      const o = h('option', { value: v }, name);
      if (f.sort === v) o.selected = true;
      sortSel.appendChild(o);
    }
    sortSel.addEventListener('change', async () => {
      f.sort = sortSel.value;
      await setSetting('gameSort', f.sort);
      paintList();
    });
    filterBox.appendChild(h('label.fld.mt', h('span.k', '정렬'), sortSel));

    // 태그 줄
    paintTagBar();
    filterBox.appendChild(h('p.dim', { style: 'margin:10px 0 0' }, '태그'));
    filterBox.appendChild(tagBar);

    filterBox.appendChild(h('div.btn-row.mt',
      h('button.btn.sm', { onclick: doPositionSearch }, '🔎 이 국면이 나온 판 찾기'),
      h('button.btn.sm', { onclick: () => { picking = !picking; picked.clear(); paintList(); } }, '☑ 여러 개 고르기'),
      h('button.btn.sm.ghost', {
        onclick: () => {
          f.q = ''; f.color = 'all'; f.result = 'all'; f.tag = null; f.fav = false; f.opening = null;
          posHits = null; search.value = '';
          buildFilterBox(); paintList();
        },
      }, '거르개 지우기')));
  }

  function paintTagBar() {
    clear(tagBar);
    tagBar.appendChild(h('button.tag.fav' + (f.fav ? '.on' : ''), {
      onclick: () => { f.fav = !f.fav; paintTagBar(); paintList(); },
    }, '★ 즐겨찾기'));
    for (const [id, t] of Object.entries(tagMap)) {
      tagBar.appendChild(h('button.tag' + (f.tag === id ? '.on' : ''), {
        onclick: () => { f.tag = f.tag === id ? null : id; paintTagBar(); paintList(); },
      }, t.name));
    }
    tagBar.appendChild(h('button.tag', {
      onclick: async () => {
        const name = window.prompt ? window.prompt('새 태그 이름') : null;
        if (!name || !name.trim()) return;
        await addTag(name.trim());
        tagMap = await tags();
        paintTagBar();
      },
    }, '＋ 태그'));
    if (Object.keys(tagMap).length) {
      tagBar.appendChild(h('button.tag', {
        style: 'color:#ffb4b4',
        onclick: async () => {
          const names = Object.entries(tagMap).map(([id, t], i) => `${i + 1}. ${t.name}`).join('\n');
          const pickNo = window.prompt ? window.prompt('지울 태그 번호\n(경기는 지워지지 않고 태그만 뗍니다)\n\n' + names) : null;
          const idx = parseInt(pickNo, 10) - 1;
          const ids = Object.keys(tagMap);
          if (!(idx >= 0 && idx < ids.length)) return;
          await deleteTag(ids[idx]);
          tagMap = await tags();
          if (f.tag === ids[idx]) f.tag = null;
          paintTagBar(); paintList();
        },
      }, '태그 지우기'));
    }
  }

  /* ---------------- 국면 검색 ---------------- */

  async function doPositionSearch() {
    if (posHits) { posHits = null; toast('국면 검색을 지웠습니다'); return paintList(); }
    let fen = await readClipboard();
    if (!fen || !/\//.test(fen)) {
      fen = window.prompt ? window.prompt('찾을 국면의 FEN 을 붙여넣으세요\n(분석판에서 「FEN 복사」로 얻을 수 있습니다)') : null;
    }
    if (!fen || !fen.trim()) return toast('FEN 이 없습니다');
    const box = h('p.sub', '찾는 중…');
    list.prepend(box);
    await new Promise((r) => setTimeout(r, 20));
    let hits;
    try {
      hits = searchPosition(games, fen.trim(), {
        onProgress: (i, n) => { box.textContent = `찾는 중… ${i}/${n}`; },
      });
    } catch (e) { box.remove(); return toast('FEN 을 읽지 못했습니다'); }
    box.remove();
    posHits = new Map(hits.map((r) => [r.game.id, r.ply]));
    toast(`${games.length}판 중 ${hits.length}판에서 나왔습니다`);
    paintList();
  }

  /* ---------------- 목록 ---------------- */

  function paintList() {
    clear(list);
    let shown = applyFilter(games, f, me);
    if (posHits) shown = shown.filter((g) => posHits.has(g.id));

    countEl.textContent = shown.length === games.length
      ? `경기 ${games.length}판`
      : `경기 ${shown.length}판 / 전체 ${games.length}판`;

    if (picking) {
      list.appendChild(h('div.card',
        h('div.row',
          h('b', { style: 'flex:1' }, `${picked.size}판 골랐습니다`),
          h('button.btn.sm', { onclick: () => { shown.forEach((g) => picked.add(g.id)); paintList(); } }, '전부'),
          h('button.btn.sm.ghost', { onclick: () => { picking = false; picked.clear(); paintList(); } }, '그만')),
        h('div.btn-row.mt',
          h('button.btn.sm', { onclick: () => applyTagTo(shown) }, '🏷 태그 붙이기'),
          h('button.btn.sm', {
            style: 'border-color:#5c2f2f;color:#ffb4b4',
            onclick: async () => {
              if (!picked.size) return toast('고른 경기가 없습니다');
              if (!confirm(`${picked.size}판을 지울까요? 되돌릴 수 없습니다.`)) return;
              for (const id of picked) await store.delGame(id);
              invalidate();
              toast(`${picked.size}판을 지웠습니다`);
              nav('/', true);
              location.reload();
            },
          }, '🗑 지우기'))));
    }

    if (!shown.length) {
      list.appendChild(h('div.empty', h('p.sub', '조건에 맞는 경기가 없습니다')));
      return;
    }
    for (const g of shown) list.appendChild(gameCard(g));
  }

  async function applyTagTo(shown) {
    if (!picked.size) return toast('고른 경기가 없습니다');
    const ids = Object.keys(tagMap);
    if (!ids.length) return toast('먼저 태그를 만들어 주세요');
    const names = ids.map((id, i) => `${i + 1}. ${tagMap[id].name}`).join('\n');
    const no = window.prompt ? window.prompt('붙일 태그 번호\n\n' + names) : null;
    const idx = parseInt(no, 10) - 1;
    if (!(idx >= 0 && idx < ids.length)) return;
    for (const id of picked) {
      const g = games.find((x) => x.id === id);
      const cur = (g && g.tags) || [];
      await setGameTags(id, [...cur, ids[idx]]);
      if (g) g.tags = [...new Set([...cur, ids[idx]])];
    }
    toast(`${picked.size}판에 「${tagMap[ids[idx]].name}」 태그를 붙였습니다`);
    picking = false; picked.clear();
    paintList();
  }

  function gameCard(g) {
    const myAcc = myAccOf(g);
    const on = picked.has(g.id);
    const card = h('button.card.tap' + (on ? '.picked' : ''), {
      onclick: () => {
        if (picking) {
          if (on) picked.delete(g.id); else picked.add(g.id);
          paintList();
          return;
        }
        const at = posHits && posHits.get(g.id);
        nav('/game/' + encodeURIComponent(g.id) + (at ? '/review?ply=' + at : ''));
      },
    },
      h('div.row',
        h('div', { style: 'min-width:0;flex:1' },
          h('div', { style: 'font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
            g.fav ? h('span', { style: 'color:var(--gold)' }, '★ ') : null,
            h('span', { style: `color:${RESULT_TONE[g.meta.result] || 'var(--tx)'}` }, g.meta.white),
            h('span.dim', ' vs '), g.meta.black),
          h('div.sub', `${g.meta.date || ''} · ${resultKo(g.meta.result, g.meta.termination)}`
            + (g.meta.welo ? ` (${g.meta.welo} vs ${g.meta.belo})` : '')),
        ),
        myAcc != null ? h('div', { style: 'text-align:right' },
          h('div.dim', '내 정확도'),
          h('div', { style: `font-weight:800;font-size:1.05rem;color:${accColor(myAcc)}` }, myAcc + '%')) : null,
      ),
      h('div.row.mt', { style: 'gap:6px;flex-wrap:wrap' },
        h('span.badge.mistake', `🧩 문제 ${g.nprob || 0}`),
        h('span.badge.info', `${g.nply || 0}수`),
        posHits && posHits.get(g.id) ? h('span.badge.info', `${posHits.get(g.id)}수째`) : null,
        ...(g.tags || []).filter((t) => tagMap[t]).map((t) => h('span.tag', tagMap[t].name)),
        g.report && g.report.opening ? h('span.dim', { style: 'margin-left:2px' }, g.report.opening) : null),
    );
    return card;
  }
}

export function accColor(a) {
  if (a >= 90) return '#7ee2a8';
  if (a >= 80) return '#b8e086';
  if (a >= 70) return '#f0d46a';
  if (a >= 55) return '#f0a860';
  return '#f08080';
}
