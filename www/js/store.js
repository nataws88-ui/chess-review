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
  sound: true,
  haptic: true,
  showCoords: true,
  animate: true,
  sparElo: 1200,
  newPerDay: 10,
};

let _settings = null;

export async function settings() {
  if (!_settings) _settings = { ...DEFAULTS, ...((await store.get('settings')) || {}) };
  return _settings;
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
