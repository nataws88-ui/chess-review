/* 저장소 — IndexedDB(게임) + 작은 값(kv). 전부 기기 안에만 저장된다. */

const DB_NAME = 'chessreview';
const DB_VER = 1;
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const store = {
  getGame: (id) => tx('games', 'readonly', (s) => s.get(id)),
  putGame: (rec) => tx('games', 'readwrite', (s) => s.put(rec)),
  delGame: (id) => tx('games', 'readwrite', (s) => s.delete(id)),
  allGames: () => tx('games', 'readonly', (s) => s.getAll()),
  clearGames: () => tx('games', 'readwrite', (s) => s.clear()),

  get: (k, def = null) => tx('kv', 'readonly', (s) => s.get(k)).then((v) => (v === undefined ? def : v)),
  set: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
};

/* ---------------- 설정 ---------------- */

export const DEFAULTS = {
  myName: '',              // 내 아이디 (내 실수만 훈련 / 통계 기준)
  movetime: 250,           // 수당 분석 시간(ms)
  boardTheme: 'green',
  boardShade: 2,           // 판 밝기 0=밝게 1=진하게 2=더 진하게(기본)
  sound: true,
  haptic: true,
  showCoords: true,
  animate: true,
  sparElo: 1200,
  newPerDay: 10,
  theme: 'dark',           // dark | light | auto (기기 설정 따라감)
  evalBar: true,           // 복기 화면에서 판 옆 승률 막대
  swipeMove: true,         // 판을 좌우로 밀어 수 이동
  autoplayMs: 900,         // 자동 재생 간격
  site: 'chesscom',        // 기본 가져오기 사이트 (chesscom | lichess)
  lichessName: '',

  /* ---- 아래는 Chessis 에서 옮겨 온 것들 ---- */
  // 판 꾸미기
  arrowSize: 'big',        // 화살표 굵기 normal | big | huge
  dragMove: true,          // 기물을 끌어서(밀어서) 옮기기
  fx: true,                // 타격감 — 놓이는 칸의 파장·흔들림
  boardCustom: null,       // {l,d} 를 직접 고르면 테마 대신 이걸 쓴다
  boardBg: null,           // 판 배경 그림 (data URL)
  pieceSet: 'cburnett',    // 기물 세트 id (pieces.js)
  lastMoveStyle: 'square', // square | dot | frame
  legalDots: true,         // 합법수 점
  figurine: false,         // ♘f3 처럼 그림기물로 표기
  animMs: 180,             // 기물 이동 애니메이션 (ms)
  // 국면 읽기·위협
  showElems: false,
  keyElems: null,          // {pin:true, ...} — insight.js 의 DEFAULT_ELEMS 위에 덮어쓴다
  showThreats: false,
  threatMode: null,        // {material, mate, undef}
  elemsInPlay: false,      // 대국 중에도 보여 줄까
  threatsInPlay: false,
  // 엔진·분석
  engineLines: 3,          // 분석판 후보 수(MultiPV)
  engineArrows: true,
  analysisBy: 'time',      // time | depth
  quickTime: 250, quickDepth: 12,
  deepTime: 1200, deepDepth: 18,
  reportLevel: 'quick',    // 기본 리포트 단계 (quick | deep)
  gameSort: 'new',         // 경기 목록 정렬
  resumeAnalysis: true,    // 이미 분석한 국면은 건너뛴다
  notifyDone: true,        // 분석이 끝나면 알림
  // 대국
  clockMin: 0, clockInc: 0,   // 0 = 시간 제한 없음
  chess960: false,
  pauseOnBlunder: true,
  pauseOnMistake: false,
  showMoveStrength: true,     // 내 수 강도 실시간
  showOppStrength: false,
};

let _settings = null;

export async function settings() {
  if (!_settings) _settings = { ...DEFAULTS, ...((await store.get('settings')) || {}) };
  return _settings;
}

/**
 * 기다리지 않고 지금 값을 꺼낸다.
 * 앱은 시작할 때 settings() 를 먼저 기다리므로 화면이 그려지는 시점에는 항상 채워져 있다.
 * (이게 없으면 판을 기본색으로 한 번 그렸다가 설정색으로 다시 그려 색이 깜빡였다.)
 */
export function settingsNow() {
  return _settings || DEFAULTS;
}

export async function setSetting(k, v) {
  const s = await settings();
  s[k] = v;
  await store.set('settings', s);
  return s;
}

/* ---------------- SRS(안키식 간격 반복) ---------------- */

export const IVL = [1, 3, 7, 14, 30, 60];

export function today() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

export async function getSrs() { return (await store.get('srs')) || {}; }
export async function setSrs(s) { return store.set('srs', s); }

/** 정답/오답에 따라 다음 복습일 계산. lapsed=이번 세션에서 이미 틀린 카드 */
export function schedule(rec, ok, lapsed) {
  const day = today();
  const r = rec || { s: 0, reps: 0, lap: 0 };
  r.reps++;
  let msg;
  if (ok) {
    let iv;
    if (lapsed) { r.s = 1; iv = 1; }
    else { iv = IVL[Math.min(r.s, IVL.length - 1)]; r.s = Math.min(r.s + 1, IVL.length); }
    r.due = day + iv;
    msg = `📅 다음 복습: ${iv}일 뒤`;
  } else {
    r.lap++; r.s = 0; r.due = day;
    msg = '🔁 이 카드는 잠시 후 다시 나옵니다';
  }
  return [r, msg];
}
