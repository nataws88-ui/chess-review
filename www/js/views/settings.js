/* ⚙️ 설정 · 데이터 이전 · 정보 */

import { h, nav, screen, toast, clear, saveFile, pickFile, isApp, Native } from '../ui.js';
import { settings, setSetting, store, getSrs, setSrs, DEFAULTS } from '../store.js';
import { THEMES } from '../board.js';
import { peek, fingerprint, gameId, invalidate } from '../games.js';
import { buildGame } from '../quizgen.js';

// GPLv3 로 배포하므로 앱 안에서 소스 위치를 밝혀야 한다
const SOURCE_URL = 'https://github.com/nataws88-ui/chess-review';
const POLICY_URL = 'https://nataws88-ui.github.io/chess-review/store/privacy-policy.html';

const MOVETIMES = [[150, '빠름'], [250, '보통'], [500, '정밀'], [1000, '최고']];
const THEME_KO = { green: '클래식 그린', wood: '우드', ocean: '오션', slate: '슬레이트' };

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
  b.appendChild(h('div.card',
    h('h3', '내 아이디'),
    h('p.sub.mb', '체스닷컴 아이디. 어느 쪽이 내 수인지 판단하는 기준입니다.'),
    nameInput));

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
  const themeChips = h('div.chips.mb');
  Object.keys(THEMES).forEach((k) => {
    themeChips.appendChild(h('button.chip' + (st.boardTheme === k ? '.on' : ''), {
      onclick: async (e) => {
        await setSetting('boardTheme', k);
        Array.from(themeChips.children).forEach((c) => c.classList.remove('on'));
        e.target.classList.add('on');
      },
    }, THEME_KO[k] || k));
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
  b.appendChild(h('div.card',
    h('h3', '화면'),
    h('p.sub.mb', '판 색'),
    themeChips,
    sw('showCoords', '좌표 표시 (a~h, 1~8)'),
    sw('animate', '기물 이동 애니메이션'),
    sw('sound', '소리'),
    sw('haptic', '진동')));

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
        invalidate();
        toast('모두 지웠습니다');
        nav('/');
      },
    }, '🗑 전체 데이터 삭제'));
  b.appendChild(dataBox);

  const games = await store.allGames();
  const srs = await getSrs();
  b.appendChild(h('div.card',
    h('div.grid3',
      h('div.stat', h('div.k', '저장된 경기'), h('div.v', games.length)),
      h('div.stat', h('div.k', '훈련 카드'), h('div.v', Object.keys(srs).length)),
      h('div.stat', h('div.k', '용량'), h('div.v', approxSize(games))))));

  b.appendChild(h('button.card.tap', { onclick: () => nav('/about') },
    h('div.row', h('b', { style: 'flex:1' }, 'ℹ️ 앱 정보 · 오픈소스 라이선스'), h('span.dim', '›'))));

  /* ---------------- 내보내기/가져오기 ---------------- */

  async function doExport() {
    const all = await store.allGames();
    const data = {
      app: 'chess-review', v: 1,
      exportedAt: new Date().toISOString(),
      settings: await settings(),
      srs: await getSrs(),
      games: all.map((g) => ({ id: g.id, pgn: g.pgn, meta: g.meta, report: g.report, addedAt: g.addedAt, source: g.source })),
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

    invalidate();
    toast(`${added}판 추가 · ${skipped}판 건너뜀`);
    setTimeout(() => nav('/'), 900);
  }
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
    h('p.sub.mt', '내가 둔 경기를 엔진으로 분석해 실수를 문제로 만들고, 안키식 간격 반복으로 복습하는 앱입니다. 인터넷 연결은 체스닷컴에서 경기를 가져올 때만 씁니다.')));

  b.appendChild(h('div.card',
    h('h3', '엔진'),
    h('p.sub', 'Stockfish 17.1 (arm64 네이티브)'),
    h('p.dim', enginePath),
    h('button.btn.sm.wide.mt', {
      onclick: async () => {
        try {
          const eng = (await import('../engine.js')).default;
          await eng.start();
          toast('엔진 정상: ' + (eng.id.name || 'Stockfish'));
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
    lic('Stockfish 17.1', 'GNU General Public License v3', 'https://github.com/official-stockfish/Stockfish',
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
