/* 화면 실행 테스트 — 브라우저 없이 각 화면(view)을 실제로 그려 본다.
 *
 * 에뮬레이터가 없으므로 DOM·IndexedDB를 메모리로 흉내 내고,
 * 실제 이전 데이터(또는 기존 /root/chess 게임)를 넣은 뒤 모든 화면을 렌더링한다.
 * → 화면 코드의 실행 오류(오타·없는 함수·잘못된 h() 사용)를 설치 전에 잡는다.
 */

import { existsSync, readFileSync } from 'node:fs';

/* ---------------- DOM 흉내 ---------------- */
const listeners = [];

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.attrs = {};
    this._cls = '';
    this._text = null;
    this.style = { cssText: '' };
    this.dataset = {};
    this.parentElement = null;
    this.clientWidth = 360;
    this.scrollHeight = 0;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.value = '';
    this.disabled = false;
    this.id = '';
  }
  set className(v) { this._cls = String(v); }
  get className() { return this._cls; }
  get classList() {
    const self = this;
    const list = () => self._cls.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { self._cls = [...new Set([...list(), ...c])].join(' '); },
      remove: (...c) => { self._cls = list().filter((x) => !c.includes(x)).join(' '); },
      contains: (c) => list().includes(c),
      toggle: (c, on) => {
        const has = list().includes(c);
        const want = on === undefined ? !has : !!on;
        if (want) self._cls = [...new Set([...list(), c])].join(' ');
        else self._cls = list().filter((x) => x !== c).join(' ');
      },
    };
  }
  appendChild(c) { this.children.push(c); if (c) c.parentElement = this; return c; }
  insertBefore(c) { return this.appendChild(c); }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { listeners.push([this, t, f]); }
  removeEventListener() {}
  set textContent(v) { this._text = v == null ? '' : String(v); this.children = []; }
  get textContent() {
    if (this._text != null) return this._text;
    return this.children.map((c) => (c.textContent == null ? '' : c.textContent)).join('');
  }
  set innerHTML(v) { this._html = v; if (v === '' || v == null) { this.children = []; this._text = null; } }
  get innerHTML() { return this._html || ''; }
  get firstChild() { return this.children[0] || null; }
  querySelector(sel) {
    const want = String(sel).replace(/^\./, '');
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.className && String(c.className).split(/\s+/).includes(want)) return c;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(this);
  }
  querySelectorAll() { return []; }
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 360, height: 360 }; }
  getContext() { return new Proxy({}, { get: () => () => ({}) }); }
  focus() {}
  click() {}
  set width(v) { this._w = v; } get width() { return this._w || 360; }
  set height(v) { this._h = v; } get height() { return this._h || 90; }
}

const doc = new El('body');
global.document = {
  body: doc,
  createElement: (t) => new El(t),
  createElementNS: (ns, t) => new El(t),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  createDocumentFragment: () => new El('fragment'),
  getElementById: (id) => {
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.id === id) return c;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(doc);
  },
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
};
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  devicePixelRatio: 1,
  scrollTo: () => {},
  location: { hash: '#/' },
  requestAnimationFrame: () => {},
  confirm: () => false,
  prompt: () => null,
  AudioContext: null,
};
global.location = global.window.location;
global.history = { back: () => {}, replaceState: () => {} };
global.requestAnimationFrame = () => {};
global.confirm = () => false;
global.prompt = () => null;
global.fetch = () => Promise.resolve({ text: () => Promise.resolve('<svg></svg>'), ok: true });
global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.localStorage = global.sessionStorage;
try { Object.defineProperty(global, 'navigator', { value: { clipboard: null }, configurable: true }); } catch (e) {}
global.URL = global.URL || { createObjectURL: () => '' };
global.Blob = global.Blob || class {};

/* ---------------- IndexedDB 흉내 ---------------- */
const mem = { games: new Map(), kv: new Map() };
function req(resultFn) {
  const r = { onsuccess: null, onerror: null };
  queueMicrotask(() => { r.result = resultFn(); if (r.onsuccess) r.onsuccess(); });
  return r;
}
global.indexedDB = {
  open() {
    const r = { onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      r.result = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        transaction(name) {
          const store = mem[name];
          const tx = {
            oncomplete: null, onerror: null, onabort: null,
            objectStore: () => ({
              get: (k) => req(() => store.get(k)),
              put: (v, k) => req(() => { store.set(k === undefined ? v.id : k, v); return k; }),
              delete: (k) => req(() => store.delete(k)),
              getAll: () => req(() => [...store.values()]),
              clear: () => req(() => store.clear()),
            }),
          };
          // 실제 IndexedDB 는 요청이 다 끝난 뒤에 oncomplete 를 부른다.
          // 요청은 마이크로태스크, 완료는 매크로태스크로 두어 순서를 맞춘다.
          setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
          return tx;
        },
      };
      if (r.onsuccess) r.onsuccess();
    });
    return r;
  },
};

/* ---------------- 데이터 넣기 ---------------- */
const { peek, fingerprint } = await import('../www/js/games.js');
const { buildGame } = await import('../www/js/quizgen.js');

const MIG = ['/sdcard/체스퀴즈/복기왕-이전.json', process.env.MIGRATION_FILE].filter(Boolean).find(existsSync);
let seeded = 0;
let firstId = null;
if (MIG) {
  const data = JSON.parse(readFileSync(MIG, 'utf8'));
  for (const g of data.games) {
    const info = peek(g.pgn);
    const rec = {
      id: g.id, pgn: g.pgn, meta: g.meta, report: g.report,
      fp: fingerprint(info.sans), nply: info.sans.length, addedAt: Date.now(), source: 'legacy',
    };
    const b = buildGame(rec, 'bicyail');
    rec.nprob = b.problems.length;
    rec.acc = rec.report ? rec.report.acc : null;
    mem.games.set(rec.id, rec);
    if (!firstId) firstId = rec.id;
    seeded++;
  }
  mem.kv.set('settings', { myName: 'bicyail', movetime: 250, boardTheme: 'green', newPerDay: 10, sound: false, haptic: false, animate: true, showCoords: true });
  mem.kv.set('srs', { [`${firstId}#11b`]: { s: 2, reps: 3, lap: 1, due: 0 } });
}
console.log(`데이터 준비: 경기 ${seeded}판${MIG ? ` (${MIG})` : ' — 이전 파일이 없어 빈 상태로 검사'}`);

/* ---------------- 화면 그려 보기 ---------------- */
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => {
  if (c) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
};

async function renderView(label, mod, fn, params, expect = []) {
  const app = new El('div');
  app.id = 'app';
  doc.children = [app];
  try {
    const m = await import(mod);
    await m[fn](app, params || {});
    // 화면 안에서 비동기로 채워지는 부분(저장소 조회 등)이 끝날 때까지 잠깐 기다린다
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 12));
    const txt = app.textContent;
    const missing = expect.filter((e) => !txt.includes(e));
    if (missing.length) {
      fail++;
      console.log(`  ❌ ${label} — 빠진 내용: ${missing.join(', ')}`);
      return;
    }
    pass++;
    console.log(`  ✅ ${label} (${txt.length}자 렌더)`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${label} — ${e.message}\n     ${(e.stack || '').split('\n')[1] || ''}`);
  }
}

console.log('\n화면 렌더링');
await renderView('홈', '../www/js/views/home.js', 'view', {}, seeded ? ['오늘의 훈련', '경기'] : ['경기']);
await renderView('가져오기', '../www/js/views/import.js', 'view', {}, ['체스닷컴', 'PGN']);
if (firstId) {
  await renderView('경기 — 문제', '../www/js/views/game.js', 'view', { id: firstId, tab: 'quiz' },
    ['최선의 수는?', '움직여 답하세요', '모르겠어요']);
  await renderView('경기 — 복기', '../www/js/views/game.js', 'view', { id: firstId, tab: 'review' }, ['복기', '수 목록']);
  await renderView('경기 — 리포트', '../www/js/views/game.js', 'view', { id: firstId, tab: 'report' }, ['정확도', '수 품질']);
}
await renderView('훈련 입구', '../www/js/views/train.js', 'hub', {}, ['퍼즐', '연습 코스', '내 실수 복습']);
await renderView('내 실수 복습', '../www/js/views/train.js', 'view', {}, seeded ? ['카드'] : ['문제']);
await renderView('퍼즐', '../www/js/views/puzzle.js', 'view', {}, []);
await renderView('퍼즐 성적', '../www/js/views/puzzle.js', 'view', { mode: 'stats' }, ['퍼즐 점수', '주제별 성적']);
await renderView('연속 도전', '../www/js/views/puzzle.js', 'view', { mode: 'rush' }, ['남은 목숨', '최고 기록']);
await renderView('연습 코스', '../www/js/views/practice.js', 'view', {}, ['기본 메이트', '양걸이']);
await renderView('연습 — 코스 하나', '../www/js/views/practice.js', 'view', { cid: 'mate-basic' }, ['퀸으로 몰기']);
await renderView('연습 — 과제', '../www/js/views/practice.js', 'view', { cid: 'mate-basic', idx: '0' }, ['메이트로 끝내기']);
await renderView('대국', '../www/js/views/spar.js', 'view', {}, ['앱에서만']);
await renderView('분석판', '../www/js/views/board.js', 'view', {}, ['국면 읽기', '엔진 라인', '위협']);
await renderView('오프닝', '../www/js/views/openings.js', 'view', {}, []);
await renderView('국면 읽기 배우기', '../www/js/views/learn.js', 'view', {}, ['핀 걸린 기물']);
await renderView('통계', '../www/js/views/stats.js', 'view', {}, seeded ? ['전적', '실수 원인'] : []);
await renderView('설정', '../www/js/views/settings.js', 'view', {}, ['내 아이디', '데이터']);
await renderView('앱 정보', '../www/js/views/settings.js', 'about', {}, ['라이선스', 'Stockfish']);

/* 토스트·진행률 등 공통 위젯 */
console.log('\n공통 위젯');
try {
  const ui = await import('../www/js/ui.js');
  ui.toast('테스트');
  const t = document.getElementById('toast');
  ok(!!t, 'toast 가 id 로 다시 찾아짐 (h("div#toast") 파싱)');
  ok(t && t.textContent === '테스트', 'toast 문구 표시');
  ui.toast('두 번째');
  ok(document.getElementById('toast').textContent === '두 번째', 'toast 재사용(중복 생성 안 함)');
  const pb = ui.progressBar();
  pb.set(40, '진행중');
  ok(pb.root.textContent.includes('진행중'), '진행률 라벨');
} catch (e) {
  fail++;
  console.log(`  ❌ 공통 위젯 — ${e.message}`);
}

/* ---------------- 실제 문제 풀이 동작 ---------------- */
if (firstId) {
  console.log('\n문제 풀이 동작 (판을 눌러 답하기)');
  const { sqXY } = await import('../www/js/board.js');
  const { mountQuiz } = await import('../www/js/views/quiz.js');
  const { loadBuilt } = await import('../www/js/games.js');

  // 문제가 있는 경기를 찾는다
  let built = null;
  for (const id of mem.games.keys()) {
    const b = await loadBuilt(id);
    if (b.problems.length) { built = b; break; }
  }

  // 판은 이제 pointerdown 으로 고르고(끌어서 옮기기 때문), 옛 click 도 남아 있다
  const clickSquare = (sq, orient) => {
    const entry = [...listeners].reverse()
      .find(([el, t]) => (t === 'pointerdown' || t === 'click') && el.tagName === 'SVG');
    if (!entry) throw new Error('판에 누르기 처리기가 없습니다');
    const [x, y] = sqXY(sq, orient);
    entry[2]({
      clientX: (x + 50) / 800 * 360, clientY: (y + 50) / 800 * 360,
      button: 0, preventDefault() {},
    });
  };

  const solve = async (problem, from, to) => {
    const host = new El('div');
    let result = null;
    mountQuiz(host, problem, { onDone: (okAns, gaveUp) => { result = { okAns, gaveUp }; } });
    await new Promise((r) => setTimeout(r, 20));
    clickSquare(from, problem.side);
    await new Promise((r) => setTimeout(r, 10));
    clickSquare(to, problem.side);
    await new Promise((r) => setTimeout(r, 30));
    return { result, text: host.textContent };
  };

  if (built) {
    const p = built.problems[0];
    ok(!!p.legals && p.legals.length > 0, `문제 준비: ${p.moveLabel} (합법수 ${p.legals.length}개)`);

    // 1) 정답을 두면
    const good = await solve(p, p.bf, p.bt);
    ok(good.result && good.result.okAns === true, '정답 처리됨 (onDone(true))');
    ok(good.text.includes('정답'), '정답 피드백 표시');
    ok(good.text.includes(p.best), `최선 수 표시 (${p.best})`);
    ok(good.text.includes('왜 최선인가'), '원인 규명 문구 표시');
    ok(good.text.includes('최선 수순'), '수순 화살표 칩 표시');

    // 2) 실전에서 뒀던 (틀린) 수를 두면
    if (p.pf !== p.bf || p.pt !== p.bt) {
      const bad = await solve(p, p.pf, p.pt);
      ok(bad.result && bad.result.okAns === false, '오답 처리됨 (onDone(false))');
      ok(bad.text.includes('아쉽습니다'), '오답 피드백 표시');
      ok(bad.text.includes('내 수의 결과'), '내가 둔 수의 결과 칩 제공');
    }

    // 3) 모르겠어요
    const host = new El('div');
    let done = null;
    const q = mountQuiz(host, p, { onDone: (o, g) => { done = { o, g }; } });
    q.reveal();
    await new Promise((r) => setTimeout(r, 20));
    ok(done && done.o === false && done.g === true, '"모르겠어요" → 오답 + 정답 공개');
    ok(host.textContent.includes('정답은 이 수였습니다'), '정답 공개 문구');
  } else {
    console.log('  ⏭ 문제가 있는 경기가 없어 건너뜀');
  }
}

/* ---------------- 수 품질 표: 등급별 개수 + 눌러서 그 수로 ---------------- */
if (firstId) {
  console.log('\n수 품질 표 (리포트)');
  try {
    const { QUALITY, QUALITY_ORDER, displayCls } = await import('../www/js/quizgen.js');
    const { loadBuilt } = await import('../www/js/games.js');
    const built = await loadBuilt(firstId);

    ok(QUALITY_ORDER.length === 10, `등급 10단계 정의 (${QUALITY_ORDER.map((k) => QUALITY[k].ko).join('/')})`);
    ok(QUALITY_ORDER.every((k) => QUALITY[k] && QUALITY[k].g && QUALITY[k].c), '모든 등급에 기호·색 있음');

    const dc = displayCls(built.report);
    ok(dc.length === built.plies.length, '표시용 분류 길이 = 수 개수');
    ok(built.plies.every((p, i) => p.cls === dc[i]), '수 목록의 등급 = 표시용 분류');
    ok(built.plies.every((p) => QUALITY[p.cls] || !p.cls), '알 수 없는 등급 없음');

    // 화면에 실제로 개수가 나오는지 + 숫자를 누르면 그 수로 가는지
    const app = new El('div');
    app.id = 'app';
    doc.children = [app];
    const gm = await import('../www/js/views/game.js');
    await gm.view(app, { id: firstId, tab: 'report' });
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 12));

    const cnt = {};
    built.plies.forEach((p) => { cnt[p.cls] = (cnt[p.cls] || 0) + 1; });
    const shown = QUALITY_ORDER.filter((k) => cnt[k]);
    const txt = app.textContent;
    ok(shown.every((k) => txt.includes(QUALITY[k].ko)), `등급 이름 표시 (${shown.map((k) => `${QUALITY[k].ko} ${cnt[k]}`).join(', ')})`);

    const findAll = (el, out = []) => {
      if (el.classList && el.classList.contains && el.classList.contains('tapn')) out.push(el);
      (el.children || []).forEach((c) => c.appendChild && findAll(c, out));
      return out;
    };
    const taps = findAll(app);
    ok(taps.length > 0, `누를 수 있는 숫자 ${taps.length}개`);
    if (taps.length) {
      const before = app.textContent;
      taps[0].dispatchEvent ? taps[0].dispatchEvent({ type: 'click' }) : null;
      const ev = [...listeners].find(([el, t]) => el === taps[0] && t === 'click');
      if (ev) ev[2]({});
      for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 12));
      ok(app.textContent.includes('수 목록'), '숫자를 누르면 복기 화면으로 이동');
      ok(app.textContent !== before, '화면이 실제로 바뀜');
    }
  } catch (e) {
    fail++;
    console.log(`  ❌ 수 품질 표 — ${e.message}\n     ${(e.stack || '').split('\n')[1] || ''}`);
  }
}


/* ---------------- 퍼즐·연습 동작 ---------------- */

console.log('\n퍼즐 (내 경기에서 캔 문제)');
{
  const { minePuzzles, runner, applyResult, emptyState, pickPuzzle, THEME_KO } =
    await import('../www/js/puzzles.js');
  let mined = [];
  for (const rec of mem.games.values()) mined = mined.concat(minePuzzles(rec));
  ok(mined.length > 0, `내 경기에서 퍼즐 ${mined.length}개를 캤다`);

  let played = 0, bad = 0;
  for (const p of mined) {
    const r = runner(p);
    r.opponent();                       // 상대의 실수를 놓는다
    let good = true;
    while (!r.done) {
      const res = r.try(r.expect);
      if (!res.ok) { good = false; break; }
      if (!r.done) r.opponent();
    }
    played++;
    if (!good) bad++;
  }
  ok(bad === 0, `정답 수순으로 끝까지 풀린다 (${played}개 중 실패 ${bad}개)`);

  if (mined.length) {
    const r2 = runner(mined[0]);
    r2.opponent();
    const wrong = r2.chess.moves({ verbose: true }).find((m) => m.lan !== r2.expect);
    if (wrong) {
      const res = r2.try(wrong.lan);
      ok(!res.ok || res.alt, '엉뚱한 수는 오답으로 잡힌다');
      ok(r2.solutionSans().length > 0, '정답 수순을 SAN 으로 보여 준다');
    }
    const st0 = emptyState();
    const up = applyResult(st0, mined[0], true);
    const down = applyResult(st0, mined[0], false);
    ok(up.state.rating > st0.rating, `맞히면 점수가 오른다 (${st0.rating}→${up.state.rating})`);
    ok(down.state.rating < st0.rating, `틀리면 점수가 내린다 (${st0.rating}→${down.state.rating})`);
    ok(up.state.streak === 1 && down.state.streak === 0, '연속 정답이 맞게 센다');
    ok(!!pickPuzzle(mined, st0, {}), '다음 문제를 골라 준다');
    const themed = pickPuzzle(mined, st0, { theme: 'pin' });
    ok(!themed || themed.themes.includes('pin'), '주제로 거르면 그 주제만 나온다');
    ok(Object.keys(THEME_KO).length > 10, '주제 한글 이름이 갖춰져 있다');
  }
}

console.log('\n기본 퍼즐 꾸러미');
{
  const { PACK_PUZZLES } = await import('../www/js/puzzledata.js');
  const { runner } = await import('../www/js/puzzles.js');
  let bad = 0, mateBad = 0, mates = 0;
  for (const p of PACK_PUZZLES) {
    const r = runner(p);
    r.opponent();
    let good = true;
    while (!r.done) {
      const res = r.try(r.expect);
      if (!res.ok) { good = false; break; }
      if (!r.done) r.opponent();
    }
    if (!good) bad++;
    if (p.themes.includes('mate')) {
      mates++;
      if (!r.chess.isCheckmate()) mateBad++;   // 메이트라고 딱지 붙인 건 실제로 메이트여야 한다
    }
  }
  ok(PACK_PUZZLES.length > 50, `기본 퍼즐 ${PACK_PUZZLES.length}개`);
  ok(bad === 0, `전부 정답 수순으로 풀린다 (실패 ${bad}개)`);
  ok(mateBad === 0, `메이트 딱지가 붙은 ${mates}개는 실제로 메이트로 끝난다`);
}

console.log('\n퍼즐 화면 동작');
{
  const app2 = new El('div');
  app2.id = 'app';
  doc.children = [app2];
  const pv = await import('../www/js/views/puzzle.js');
  await pv.view(app2, {});
  // 상대의 실수 수가 자동으로 놓일 때까지 기다린다
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 30));
  const txt = app2.textContent;
  ok(/차례/.test(txt), '상대가 실수를 두고 내 차례가 된다');
  const handler = [...listeners].reverse().find(([el, t]) => t === 'pointerdown' && el.tagName === 'SVG');
  ok(!!handler, '판에서 기물을 고를 수 있다 (누르기·끌기 처리기)');
  ok(/난이도/.test(txt), '난이도를 보여 준다');
}

console.log('\n연습 코스 (국면 검증)');
{
  const { CHAPTERS, chapterSize } = await import('../www/js/practicedata.js');
  const { Chess } = await import('../www/js/lib/chess.js');
  let lessons = 0, illegal = [];
  for (const ch of CHAPTERS) {
    if (ch.kind !== 'lesson') continue;
    for (const it of ch.items) {
      lessons++;
      try {
        const c = new Chess(it.fen);
        if (c.isGameOver()) illegal.push(`${it.id}(이미 끝난 국면)`);
        if (!c.moves().length) illegal.push(`${it.id}(둘 수가 없음)`);
      } catch (e) { illegal.push(`${it.id}(${e.message})`); }
    }
  }
  ok(illegal.length === 0, `연습 국면 ${lessons}개 전부 합법`, illegal.join(', '));
  ok(CHAPTERS.every((c) => chapterSize(c) > 0), '모든 코스에 과제가 있다');
  ok(CHAPTERS.every((c) => c.kind !== 'theme' || c.theme), '주제 코스에는 주제가 붙어 있다');
}

console.log(`\n${'='.repeat(46)}\n화면 테스트: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
