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
await renderView('훈련', '../www/js/views/train.js', 'view', {}, seeded ? ['카드'] : ['문제']);
await renderView('대국', '../www/js/views/spar.js', 'view', {}, ['앱에서만']);
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

  const clickSquare = (sq, orient) => {
    const entry = [...listeners].reverse().find(([el, t]) => t === 'click' && el.tagName === 'SVG');
    if (!entry) throw new Error('판에 클릭 처리기가 없습니다');
    const [x, y] = sqXY(sq, orient);
    entry[2]({ clientX: (x + 50) / 800 * 360, clientY: (y + 50) / 800 * 360 });
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

console.log(`\n${'='.repeat(46)}\n화면 테스트: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
