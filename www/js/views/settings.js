/* ⚙️ 설정 · 데이터 이전 · 정보 */

import { h, nav, screen, toast, clear, saveFile, pickFile, pickBinary, isApp, Native, applyTheme, askNotify } from '../ui.js';
import { settings, setSetting, store, getSrs, setSrs } from '../store.js';
import { THEMES, THEME_KO as BOARD_KO, ARROW_SIZES, ARROW_SIZE_KO, renderBoard, boardOpts } from '../board.js';
import { getState as puzzleState } from '../puzzles.js';
import { listSets, importZip, deleteSet, applySet } from '../pieces.js';
import { KEY_ELEMENTS } from '../insight.js';
import * as evalCache from '../evalcache.js';
import { peek, fingerprint, gameId, invalidate } from '../games.js';
import { buildGame } from '../quizgen.js';

// GPLv3 로 배포하므로 앱 안에서 소스 위치를 밝혀야 한다
const SOURCE_URL = 'https://github.com/nataws88-ui/chess-review';
const POLICY_URL = 'https://nataws88-ui.github.io/chess-review/store/privacy-policy.html';

const MOVETIMES = [[150, '빠름'], [250, '보통'], [500, '정밀'], [1000, '최고']];
const THEME_KO = BOARD_KO;
// 견본 판 — 양쪽 기물이 밝은 칸·어두운 칸에 골고루 놓인 국면
const SAMPLE_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1';

export async function view(app) {
  const st = await settings();
  const s = screen('⚙️ 설정', { back: false });
  app.appendChild(s.root);
  const b = s.body;

  /* ---- 내 정보 ---- */
  const nameInput = h('input', { type: 'text', value: st.myName || '', placeholder: '예: bicyail' });
  nameInput.addEventListener('change', async () => {
    await setSetting('myName', nameInput.value.trim());
    invalidate();
    toast('저장했습니다');
  });
  const liInput = h('input', { type: 'text', value: st.lichessName || '', placeholder: '리체스 아이디 (안 쓰면 비워두세요)' });
  liInput.addEventListener('change', async () => {
    await setSetting('lichessName', liInput.value.trim());
    toast('저장했습니다');
  });
  b.appendChild(h('div.card',
    h('h3', '내 아이디'),
    h('p.sub.mb', '어느 쪽이 내 수인지 판단하는 기준입니다. 통계는 이 이름으로 냅니다.'),
    nameInput,
    h('div.mt', liInput)));

  /* ---- 분석 ---- */
  const mtChips = h('div.chips');
  MOVETIMES.forEach(([ms, label]) => {
    mtChips.appendChild(h('button.chip' + (st.movetime === ms ? '.on' : ''), {
      onclick: async (e) => {
        await setSetting('movetime', ms);
        Array.from(mtChips.children).forEach((c) => c.classList.remove('on'));
        e.target.classList.add('on');
      },
    }, `${label} (${ms}ms)`));
  });
  const newPer = h('input', { type: 'number', min: 1, max: 50, value: st.newPerDay });
  newPer.addEventListener('change', () => setSetting('newPerDay', Math.max(1, Math.min(50, +newPer.value || 10))));
  b.appendChild(h('div.card',
    h('h3', '분석·훈련'),
    h('p.sub.mb', '수당 엔진 계산 시간. 길수록 정확하지만 오래 걸립니다.'),
    mtChips,
    h('label.fld.mt', h('span.k', '하루에 새로 배울 문제 수'), newPer)));

  /* ---- 화면 ---- */
  // 판 색·밝기는 고른 즉시 바로 아래 견본에 반영된다 (경기 화면까지 안 가봐도 되게)
  const sample = h('div.board-wrap', { style: 'max-width:220px;margin:0 auto 12px' });
  const drawSample = () => renderBoard(sample, SAMPLE_FEN, {
    ...boardOpts(st), drag: false,
    // 화살표 굵기를 고른 자리에서 바로 확인할 수 있게 견본에도 하나 그린다
    arrows: [{ f: 'e2', t: 'e4', kind: 'best' }],
  });

  const themeChips = h('div.chips.mb');
  Object.keys(THEMES).forEach((k) => {
    themeChips.appendChild(h('button.chip' + (st.boardTheme === k ? '.on' : ''), {
      onclick: async (e) => {
        st.boardTheme = k;
        st.boardCustom = null;
        await setSetting('boardTheme', k);
        await setSetting('boardCustom', null);
        Array.from(themeChips.children).forEach((c) => c.classList.remove('on'));
        e.target.classList.add('on');
        drawSample();
      },
    }, THEME_KO[k] || k));
  });

  const SHADE_KO = [['0', '밝게'], ['1', '진하게'], ['2', '더 진하게']];
  const shadeSeg = h('div.seg.mb');
  SHADE_KO.forEach(([v, label]) => {
    shadeSeg.appendChild(h('button' + (String(st.boardShade) === v ? '.on' : ''), {
      onclick: async () => {
        await setSetting('boardShade', +v);
        Array.from(shadeSeg.children).forEach((el, i) => el.classList.toggle('on', SHADE_KO[i][0] === v));
        drawSample();
      },
    }, label));
  });
  // 화살표 굵기 — 폰에서 손가락 옆으로 지나가는 화살표는 굵어야 눈에 든다
  const arrowSeg = h('div.seg.mb');
  Object.keys(ARROW_SIZES).forEach((k) => {
    arrowSeg.appendChild(h('button' + ((st.arrowSize || 'big') === k ? '.on' : ''), {
      onclick: async () => {
        st.arrowSize = k;
        await setSetting('arrowSize', k);
        Array.from(arrowSeg.children).forEach((el, i) =>
          el.classList.toggle('on', Object.keys(ARROW_SIZES)[i] === k));
        drawSample();
      },
    }, ARROW_SIZE_KO[k]));
  });

  const sw = (key, label) => {
    const el = h('div.sw' + (st[key] ? '.on' : ''));
    return h('div.switch', {
      onclick: async () => {
        const v = !(await settings())[key];
        await setSetting(key, v);
        el.classList.toggle('on', v);
      },
    }, h('span', label), el);
  };
  // 앱 전체 밝기 테마
  const APP_THEMES = [['dark', '어두움'], ['light', '밝음'], ['auto', '기기 설정']];
  const appTheme = h('div.seg.mb');
  APP_THEMES.forEach(([k, label]) => {
    appTheme.appendChild(h('button' + (st.theme === k ? '.on' : ''), {
      onclick: async () => {
        await setSetting('theme', k);
        applyTheme(k);
        Array.from(appTheme.children).forEach((el, i) => el.classList.toggle('on', APP_THEMES[i][0] === k));
      },
    }, label));
  });

  const speed = h('input', { type: 'number', min: 3, max: 30, step: 1, value: Math.round((st.autoplayMs || 900) / 100) });
  speed.addEventListener('change', () => {
    const v = Math.max(3, Math.min(30, +speed.value || 9));
    speed.value = v;
    setSetting('autoplayMs', v * 100);
  });

  b.appendChild(h('div.card',
    h('h3', '화면'),
    h('p.sub.mb', '앱 테마'),
    appTheme,
    h('p.sub.mb', '판 색'),
    themeChips,
    h('p.sub.mb', '판 밝기 — 어두운 곳에서 눈이 부시면 진하게 두세요'),
    shadeSeg,
    sample,
    h('p.sub.mb', '화살표 굵기 — 최선의 수·위협을 가리키는 화살표'),
    arrowSeg,
    sw('showCoords', '좌표 표시 (a~h, 1~8)'),
    sw('animate', '기물 이동 애니메이션'),
    sw('dragMove', '기물을 끌어서(밀어서) 옮기기'),
    sw('fx', '타격감 — 수를 놓을 때 파장·흔들림'),
    sw('evalBar', '복기할 때 판 옆에 승률 막대'),
    sw('swipeMove', '판을 좌우로 밀어 수 이동'),
    sw('sound', '소리'),
    sw('haptic', '진동'),
    h('label.fld.mt', { style: 'margin-top:12px' },
      h('span.k', '자동 재생 간격 (0.1초 단위 — 9 = 0.9초)'), speed)));
  drawSample();

  /* ---- 판 꾸미기 (Chessis 이식) ---- */
  b.appendChild(await boardLookCard(st, drawSample));

  /* ---- 국면 읽기·위협 ---- */
  b.appendChild(insightDefaultsCard(st));

  /* ---- 엔진·분석 ---- */
  b.appendChild(analysisCard(st));

  /* ---- 대국 ---- */
  b.appendChild(playCard(st));

  /* ---- 데이터 ---- */
  const dataBox = h('div.card',
    h('h3', '데이터'),
    h('p.sub.mb', '모든 기록은 이 기기 안에만 저장됩니다. 서버로 보내지 않습니다.'),
    h('div.btn-row.mb',
      h('button.btn', { onclick: doExport }, '💾 백업 내보내기'),
      h('button.btn', { onclick: doImport }, '📥 가져오기')),
    h('p.dim', '기존 "체스 퀴즈"(폰 로컬 서버)에서 옮겨오려면, PC/Termux에서 export_from_old.py 를 돌려 만든 파일을 여기서 가져오면 됩니다. 훈련 진도(SRS)까지 그대로 이어집니다.'),
    h('button.btn.wide.mt', {
      style: 'border-color:#5c2f2f;color:#ffb4b4',
      onclick: async () => {
        if (!confirm('저장된 경기와 훈련 기록을 모두 지웁니다. 계속할까요?')) return;
        await store.clearGames();
        await setSrs({});
        await store.set('puzzleState', null);
        await store.set('practiceDone', null);
        invalidate();
        toast('모두 지웠습니다');
        nav('/');
      },
    }, '🗑 전체 데이터 삭제'));
  b.appendChild(dataBox);

  const games = await store.allGames();
  const srs = await getSrs();
  const puz = await puzzleState();
  await evalCache.load();
  const cacheN = evalCache.size();
  b.appendChild(h('div.card',
    h('div.grid3',
      h('div.stat', h('div.k', '저장된 경기'), h('div.v', games.length)),
      h('div.stat', h('div.k', '훈련 카드'), h('div.v', Object.keys(srs).length)),
      h('div.stat', h('div.k', '용량'), h('div.v', approxSize(games)))),
    h('div.switch', { style: 'margin-top:8px' },
      h('span', '퍼즐 점수 ', h('b', String(puz.rating)),
        h('span.dim', ` · 푼 문제 ${Object.keys(puz.solved || {}).length}개`)),
      h('button.btn.sm.ghost', {
        onclick: async () => {
          if (!confirm('퍼즐 점수와 연습 진도를 처음으로 되돌릴까요? (경기·훈련 카드는 그대로입니다)')) return;
          await store.set('puzzleState', null);
          await store.set('practiceDone', null);
          toast('되돌렸습니다');
        },
      }, '되돌리기')),
    h('div.switch', { style: 'margin-top:8px' },
      h('span', '분석해 둔 국면 ', h('b', String(cacheN)), h('span.dim', ' 개 — 다시 분석할 때 건너뜁니다')),
      h('button.btn.sm.ghost', {
        onclick: async () => {
          if (!confirm('분석해 둔 국면 기록을 비울까요? (경기·훈련 기록은 그대로입니다)')) return;
          await evalCache.clear();
          toast('비웠습니다');
        },
      }, '비우기'))));

  /* ---- 광고 ---- */
  if (isApp) {
    const adCard = h('div.card',
      h('h3', '광고'),
      h('p.sub', '앱을 무료로 유지하기 위한 광고입니다. 경기 목록·통계·설정 화면에만 하단 배너가 붙고, '
        + '체스판이 뜨는 화면에는 광고가 없습니다. 분석이나 훈련을 마친 뒤에만 전면 광고가 잠깐 나옵니다.'));
    try {
      if (Native.adTestMode && Native.adTestMode()) {
        adCard.appendChild(h('p.sub.mt', { style: 'color:var(--gold)' },
          '⚠️ 지금은 테스트 광고입니다 (수익 0원). 실제 광고 ID로 바꾸면 사라지는 안내입니다.'));
      }
      if (Native.adPrivacyRequired && Native.adPrivacyRequired()) {
        adCard.appendChild(h('button.btn.wide.mt', {
          onclick: () => Native.adPrivacyOptions(),
        }, '광고 개인정보 설정'));
      }
    } catch (e) {}
    b.appendChild(adCard);
  }

  b.appendChild(h('button.card.tap', { onclick: () => nav('/about') },
    h('div.row', h('b', { style: 'flex:1' }, 'ℹ️ 앱 정보 · 오픈소스 라이선스'), h('span.dim', '›'))));

  /* ---------------- 내보내기/가져오기 ---------------- */

  async function doExport() {
    const all = await store.allGames();
    const data = {
      app: 'chess-review', v: 3,
      exportedAt: new Date().toISOString(),
      settings: await settings(),
      srs: await getSrs(),
      tags: await store.get('tags', {}),
      pieceSets: await store.get('pieceSets', {}),
      // v3 — 퍼즐 점수·연습 진도도 같이 (기기를 바꿔도 기록이 살아남게)
      puzzleState: await store.get('puzzleState', null),
      practiceDone: await store.get('practiceDone', null),
      games: all.map((g) => ({
        id: g.id, pgn: g.pgn, meta: g.meta, report: g.report,
        addedAt: g.addedAt, source: g.source,
        tags: g.tags || null, fav: g.fav || false,      // 태그·즐겨찾기도 함께 (v2)
      })),
    };
    const d = new Date();
    const name = `체스복기왕-백업-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    saveFile(name, JSON.stringify(data));
  }

  async function doImport() {
    let text;
    try { text = (await pickFile()).content; } catch (e) { return; }
    let data;
    try { data = JSON.parse(text); } catch (e) { return toast('JSON을 읽을 수 없습니다'); }
    if (!data || !Array.isArray(data.games)) return toast('형식이 맞지 않는 파일입니다');

    const cur = await settings();
    let added = 0, skipped = 0;
    const existing = await store.allGames();
    const haveFp = new Map(existing.map((g) => [g.fp, g.id]));

    for (const g of data.games) {
      try {
        const info = peek(g.pgn);
        const fp = fingerprint(info.sans);
        if (haveFp.has(fp)) { skipped++; continue; }
        const meta = g.meta || info.meta;
        const rec = {
          id: g.id || gameId(meta), pgn: g.pgn, meta, report: g.report || null, fp,
          nply: info.sans.length, addedAt: g.addedAt || Date.now(), source: g.source || 'import',
        };
        if (g.tags) rec.tags = g.tags;
        if (g.fav) rec.fav = true;
        const built = buildGame(rec, cur.myName);
        rec.nprob = built.problems.length;
        rec.acc = rec.report ? rec.report.acc : null;
        await store.putGame(rec);
        haveFp.set(fp, rec.id);
        added++;
      } catch (e) { skipped++; }
    }

    if (data.srs && typeof data.srs === 'object') {
      const merged = await getSrs();
      for (const [k, v] of Object.entries(data.srs)) {
        const old = merged[k];
        if (!old || (v.reps || 0) > (old.reps || 0)) merged[k] = v;
      }
      await setSrs(merged);
    }
    if (data.settings && data.settings.myName && !cur.myName) await setSetting('myName', data.settings.myName);

    // 태그 사전·기물 세트도 합친다 (v2 백업)
    if (data.tags && typeof data.tags === 'object') {
      await store.set('tags', { ...(await store.get('tags', {})), ...data.tags });
    }
    if (data.pieceSets && typeof data.pieceSets === 'object') {
      await store.set('pieceSets', { ...(await store.get('pieceSets', {})), ...data.pieceSets });
    }
    // 퍼즐·연습 기록 (v3) — 더 많이 푼 쪽을 남긴다
    if (data.puzzleState && typeof data.puzzleState === 'object') {
      const cur2 = await store.get('puzzleState', null);
      const mineN = cur2 && cur2.solved ? Object.keys(cur2.solved).length : 0;
      const theirN = data.puzzleState.solved ? Object.keys(data.puzzleState.solved).length : 0;
      if (theirN > mineN) await store.set('puzzleState', data.puzzleState);
    }
    if (data.practiceDone && typeof data.practiceDone === 'object') {
      await store.set('practiceDone', { ...(await store.get('practiceDone', {})), ...data.practiceDone });
    }

    invalidate();
    toast(`${added}판 추가 · ${skipped}판 건너뜀`);
    setTimeout(() => nav('/'), 900);
  }
}

/* ==================== 판 꾸미기 ==================== */

/** 켜고 끄는 줄 하나 — 저장까지 같이 한다 */
function toggle(st, key, label, note, after) {
  const el = h('div.sw' + (st[key] ? '.on' : ''));
  return h('div.switch', {
    onclick: async () => {
      st[key] = !st[key];
      await setSetting(key, st[key]);
      el.classList.toggle('on', st[key]);
      if (after) after();
    },
  }, h('span', label, note ? h('span.dim', ' · ' + note) : null), el);
}

/** 여러 개 중 하나 고르기 */
function pick(st, key, opts, after) {
  const seg = h('div.seg.mb');
  opts.forEach(([v, label]) => {
    seg.appendChild(h('button' + (st[key] === v ? '.on' : ''), {
      onclick: async () => {
        st[key] = v;
        await setSetting(key, v);
        Array.from(seg.children).forEach((el, i) => el.classList.toggle('on', opts[i][0] === v));
        if (after) after();
      },
    }, label));
  });
  return seg;
}

/** 숫자 입력 한 줄 */
function num(st, key, label, min, max, after) {
  const inp = h('input', { type: 'number', min, max, value: st[key] });
  inp.addEventListener('change', async () => {
    const v = Math.max(min, Math.min(max, +inp.value || min));
    inp.value = v;
    st[key] = v;
    await setSetting(key, v);
    if (after) after();
  });
  return h('label.fld.mt', h('span.k', label), inp);
}

async function boardLookCard(st, redraw) {
  const card = h('div.card', h('h3', '판 꾸미기'),
    h('p.sub.mb', '기물 모양·칸 색·배경 그림까지 바꿀 수 있습니다.'));

  /* 기물 세트 */
  const setRow = h('div.chips.mb');
  async function paintSets() {
    clear(setRow);
    const list = await listSets();
    for (const it of list) {
      setRow.appendChild(h('button.chip.sm' + (st.pieceSet === it.id ? '.on' : ''), {
        onclick: async () => {
          st.pieceSet = it.id;
          await setSetting('pieceSet', it.id);
          await applySet(it.id);
          await paintSets();
          redraw();
        },
        oncontextmenu: (e) => e.preventDefault(),
      }, it.name));
    }
    // 내가 넣은 세트는 길게 눌러 지우는 대신 지우기 칩을 따로 둔다(웹뷰에서 롱프레스는 불안정)
    for (const it of list.filter((x) => !x.builtin)) {
      setRow.appendChild(h('button.chip.sm', {
        style: 'color:#ffb4b4',
        onclick: async () => {
          if (!confirm(`"${it.name}" 세트를 지울까요?`)) return;
          await deleteSet(it.id);
          if (st.pieceSet === it.id) {
            st.pieceSet = 'cburnett';
            await setSetting('pieceSet', 'cburnett');
            await applySet('cburnett');
          }
          await paintSets();
          redraw();
        },
      }, `🗑 ${it.name}`));
    }
  }
  await paintSets();

  card.appendChild(h('p.sub.mb', '기물 모양'));
  card.appendChild(setRow);
  card.appendChild(h('button.btn.sm.wide.mb', {
    onclick: async () => {
      let f;
      try { f = await pickBinary('application/zip'); } catch (e) { return; }
      try {
        const name = (f.name || 'zip').replace(/\.zip$/i, '').split('/').pop();
        const r = await importZip(name, f.buffer);
        st.pieceSet = r.id;
        await setSetting('pieceSet', r.id);
        await applySet(r.id);
        await paintSets();
        redraw();
        toast(`"${r.name}" 세트를 넣었습니다`);
      } catch (e) { toast(e.message); }
    },
  }, '📦 ZIP 으로 기물 세트 넣기'));
  card.appendChild(h('p.dim.mb',
    'wp.svg · bk.svg 처럼 12개 SVG 가 든 ZIP 이면 됩니다. 리체스·체스닷컴에서 쓰는 세트를 그대로 넣을 수 있습니다.'));

  /* 칸 색 직접 고르기 */
  const cur = st.boardCustom || THEMES[st.boardTheme] || THEMES.green;
  const lightIn = h('input', { type: 'color', value: cur.l });
  const darkIn = h('input', { type: 'color', value: cur.d });
  const applyColors = async () => {
    st.boardCustom = { l: lightIn.value, d: darkIn.value };
    await setSetting('boardCustom', st.boardCustom);
    redraw();
  };
  lightIn.addEventListener('change', applyColors);
  darkIn.addEventListener('change', applyColors);
  card.appendChild(h('div.colorrow', h('span', { style: 'flex:1' }, '밝은 칸 색'), lightIn));
  card.appendChild(h('div.colorrow', h('span', { style: 'flex:1' }, '어두운 칸 색'), darkIn));
  card.appendChild(h('button.btn.sm.wide.mb', {
    onclick: async () => {
      st.boardCustom = null;
      await setSetting('boardCustom', null);
      redraw();
      toast('고른 색을 지우고 테마 색으로 돌아갑니다');
    },
  }, '고른 색 지우기'));

  /* 배경 그림 */
  card.appendChild(h('div.btn-row.mb',
    h('button.btn.sm', {
      onclick: async () => {
        let f;
        try { f = await pickBinary('image/*'); } catch (e) { return; }
        try {
          const bytes = new Uint8Array(f.buffer);
          if (bytes.length > 1400000) return toast('그림이 너무 큽니다 (1.4MB 이하)');
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          const mime = /\.png$/i.test(f.name || '') ? 'image/png' : 'image/jpeg';
          st.boardBg = `data:${mime};base64,` + btoa(bin);
          await setSetting('boardBg', st.boardBg);
          redraw();
          toast('배경 그림을 넣었습니다');
        } catch (e) { toast('그림을 읽지 못했습니다'); }
      },
    }, '🖼 판 배경 그림'),
    h('button.btn.sm.ghost', {
      onclick: async () => { st.boardBg = null; await setSetting('boardBg', null); redraw(); },
    }, '배경 지우기')));

  /* 표기·표시 */
  card.appendChild(h('p.sub.mb.mt', '마지막 수 강조'));
  card.appendChild(pick(st, 'lastMoveStyle', [['square', '칸 전체'], ['dot', '점'], ['frame', '테두리']]));
  card.appendChild(toggle(st, 'legalDots', '갈 수 있는 칸 점으로 표시'));
  card.appendChild(toggle(st, 'figurine', '기보를 그림기물로', '♘f3'));
  return card;
}

/* ==================== 국면 읽기·위협 ==================== */

function insightDefaultsCard(st) {
  const elems = { ...(st.keyElems || {}) };
  const chips = h('div.chips.mb');
  for (const [id, name, why] of KEY_ELEMENTS) {
    chips.appendChild(h('button.chip.sm' + (elems[id] ? '.on' : ''), {
      onclick: async (e) => {
        elems[id] = !elems[id];
        e.currentTarget.classList.toggle('on', elems[id]);
        st.keyElems = elems;
        await setSetting('keyElems', elems);
      },
      title: why,
    }, name));
  }
  const list = h('div.kelist');
  for (const [, name, why] of KEY_ELEMENTS) {
    list.appendChild(h('div.lrow', h('div', h('b', name), h('p.sub', why))));
  }
  return h('div.card',
    h('h3', '🔍 국면 읽기'),
    h('p.sub.mb', '판 위에 지금 무엇이 걸려 있는지 겹쳐 그립니다. 엔진 없이 판만 보고 내므로 즉시 뜹니다.'),
    chips,
    toggle(st, 'elemsInPlay', '대국 중에도 보이기'),
    toggle(st, 'showThreats', '위협 기본으로 켜기'),
    toggle(st, 'threatsInPlay', '대국 중에도 위협 보이기'),
    h('button.btn.wide.mt', { onclick: () => nav('/learn') }, '🎓 예제 국면으로 배우기'),
    h('details.mt', h('summary.sub', '각 항목이 무슨 뜻인가요?'), list));
}

/* ==================== 엔진·분석 ==================== */

function analysisCard(st) {
  return h('div.card',
    h('h3', '🤖 엔진·분석'),
    h('p.sub.mb', '분석 기준 — 시간으로 할지, 깊이(depth)로 할지'),
    pick(st, 'analysisBy', [['time', '시간'], ['depth', '깊이']]),
    h('p.dim.mb', '시간 기준은 기기가 느려도 예측 가능한 시간에 끝납니다. 깊이 기준은 기기가 빠를수록 빨리 끝나고 결과가 항상 같습니다.'),
    num(st, 'quickTime', '빠른 분석 — 수당 시간 (ms)', 80, 2000),
    num(st, 'quickDepth', '빠른 분석 — 수당 깊이', 6, 24),
    num(st, 'deepTime', '정밀 분석 — 수당 시간 (ms)', 300, 10000),
    num(st, 'deepDepth', '정밀 분석 — 수당 깊이', 10, 30),
    num(st, 'engineLines', '분석판 후보 수(라인) 개수', 1, 5),
    toggle(st, 'engineArrows', '분석판에 엔진 화살표'),
    toggle(st, 'resumeAnalysis', '다시 분석할 때 이미 본 국면은 건너뛰기'),
    toggle(st, 'notifyDone', '분석이 끝나면 알림', '앱을 벗어나 있을 때만', () => { if (st.notifyDone) askNotify(); }));
}

/* ==================== 대국 ==================== */

function playCard(st) {
  return h('div.card',
    h('h3', '⚔️ 대국'),
    h('p.sub.mb', '시간 제한 — 0분이면 시간을 재지 않습니다.'),
    num(st, 'clockMin', '한 사람당 시간 (분)', 0, 180),
    num(st, 'clockInc', '한 수마다 더하는 시간 (초)', 0, 60),
    toggle(st, 'chess960', '무작위 배치 (체스960)', '뒷줄을 섞는다 · 캐슬링은 없음'),
    toggle(st, 'pauseOnBlunder', '블런더를 두면 멈추고 알려 주기'),
    toggle(st, 'pauseOnMistake', '실수를 둬도 멈추기'),
    toggle(st, 'showMoveStrength', '내 수의 강도 실시간 표시'),
    toggle(st, 'showOppStrength', '상대 수의 강도도 표시'));
}

function approxSize(games) {
  const bytes = games.reduce((a, g) => a + (g.pgn || '').length + JSON.stringify(g.report || {}).length, 0);
  return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + 'MB' : Math.round(bytes / 1024) + 'KB';
}

/* ---------------- 정보 ---------------- */

export async function about(app) {
  const s = screen('앱 정보');
  app.appendChild(s.root);
  const b = s.body;
  const ver = (isApp && Native.appVersion && Native.appVersion()) || '개발판';
  const enginePath = (isApp && Native.enginePath && Native.enginePath()) || '(앱 아님)';

  b.appendChild(h('div.card',
    h('h3', '♟️ 체스 복기왕'),
    h('p.sub', `버전 ${ver}`),
    h('p.sub.mt', '내가 둔 경기를 엔진으로 분석해 실수를 문제로 만들고, 안키식 간격 반복으로 복습하는 앱입니다. 인터넷은 체스닷컴·리체스에서 경기를 가져올 때와 광고를 받을 때만 씁니다.')));

  b.appendChild(h('div.card',
    h('h3', '엔진'),
    h('p.sub', 'Stockfish 18 (arm64 네이티브 · SFNNv10 신경망)'),
    h('p.dim', enginePath),
    h('p.dim.mt', '17.1 대비 최대 46 Elo 강해졌고, 승률은 엔진이 직접 내놓는 승/무/패 확률(WDL)로 계산합니다.'),
    h('button.btn.sm.wide.mt', {
      onclick: async () => {
        try {
          const eng = (await import('../engine.js')).default;
          await eng.start();
          toast(`엔진 정상: ${eng.id.name || 'Stockfish'} · 스레드 ${eng.options.Threads} · 해시 ${eng.options.Hash}MB`
            + (eng.wdl ? ' · WDL 켜짐' : ''));
        } catch (e) { toast('엔진 오류: ' + (e.message || e)); }
      },
    }, '엔진 상태 확인')));

  b.appendChild(h('div.card',
    h('h3', '소스 코드'),
    h('p.sub.mb', 'GPLv3에 따라 이 앱의 전체 소스를 공개합니다.'),
    h('a.btn.wide', { href: SOURCE_URL, target: '_blank' }, 'GitHub에서 보기'),
    h('a.btn.wide.ghost.mt', { href: POLICY_URL, target: '_blank' }, '개인정보 처리방침')));

  b.appendChild(h('div.card',
    h('h3', '오픈소스 라이선스'),
    lic('Stockfish 18', 'GNU General Public License v3', 'https://github.com/official-stockfish/Stockfish',
      '이 앱은 스톡피시를 그대로 실행합니다. GPLv3에 따라 이 앱의 소스도 공개합니다.'),
    lic('chess.js 1.4.0', 'BSD 2-Clause', 'https://github.com/jhlywa/chess.js', '수 생성·PGN 파싱'),
    lic('체스 기물 이미지', 'GFDL / BSD / GPL', 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces',
      'Colin M.L. Burnett 제작'),
    h('p.dim.mt', '이 앱 자체도 GPLv3로 배포됩니다.')));
}

function lic(name, license, url, note) {
  return h('div', { style: 'padding:9px 0;border-bottom:1px solid var(--line)' },
    h('b', name),
    h('div.sub', license),
    note ? h('div.dim', note) : null,
    h('a.dim', { href: url, target: '_blank' }, url));
}
