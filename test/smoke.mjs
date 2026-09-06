/* 모듈 적재 점검 — 문법 오류·잘못된 import·모듈 최상단 실수를 잡는다.
 * (브라우저가 없으므로 DOM은 최소한만 흉내 낸다) */

const noop = () => {};
const fakeEl = () => new Proxy({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  children: [], appendChild: (c) => c, removeChild: noop, setAttribute: noop, getAttribute: () => null,
  addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  insertBefore: noop, remove: noop, textContent: '', innerHTML: '', firstChild: null,
}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });

global.window = {
  addEventListener: noop, location: { hash: '#/' }, devicePixelRatio: 1,
  requestAnimationFrame: noop, scrollTo: noop, matchMedia: () => ({ matches: true }),
};
global.document = {
  getElementById: () => fakeEl(),
  createElement: fakeEl,
  createElementNS: fakeEl,
  createTextNode: (t) => ({ nodeType: 3, textContent: t }),
  createDocumentFragment: fakeEl,
  body: fakeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
};
global.location = global.window.location;
global.history = { back: noop, replaceState: noop };
try { Object.defineProperty(global, 'navigator', { value: { clipboard: null }, configurable: true }); } catch (e) {}
global.fetch = () => Promise.resolve({ text: () => Promise.resolve('') });
global.requestAnimationFrame = noop;
global.indexedDB = { open: () => ({}) };
global.sessionStorage = { getItem: () => null, setItem: noop, removeItem: noop };
global.localStorage = global.sessionStorage;

const MODULES = [
  ['engine.js', ['engine', 'toScore', 'wdlPct']],
  ['openings.js', ['OPENINGS', 'findOpening']],
  ['analyze.js', ['analyzeGame', 'wp', 'moveAcc', 'classify', 'findOpening', 'uciToSan',
    'gameAccuracy', 'parseClocks', 'parseTimeControl', 'thinkTimes']],
  ['quizgen.js', ['buildGame', 'moveFacts', 'hangingAfter', 'buildWhys', 'winPcts', 'legalMovesData', 'qualityPct']],
  ['games.js', ['splitPgn', 'peek', 'analyzeAndSave', 'loadBuilt', 'allCards', 'chessComUrl',
    'lichessUrl', 'migrateAccuracy', 'analysisOpts']],
  ['store.js', ['store', 'settings', 'settingsNow', 'setSetting', 'getSrs', 'setSrs', 'schedule', 'today', 'IVL']],
  ['puzzles.js', ['allPuzzles', 'minePuzzles', 'runner', 'pickPuzzle', 'applyResult', 'getState',
    'setState', 'tagThemes', 'guessRating', 'THEME_KO', 'MAIN_THEMES']],
  ['practicedata.js', ['CHAPTERS', 'findChapter', 'chapterSize', 'GOAL_KO']],
  ['board.js', ['renderBoard', 'loadSprite', 'fenMap', 'addMark', 'sqXY', 'xyToSq', 'THEMES',
    'boardOpts', 'ARROW_SIZES', 'ARROW_SIZE_KO']],
  ['ui.js', ['h', 'route', 'nav', 'screen', 'toast', 'httpGet', 'pickFile', 'saveFile', 'play', 'progressBar',
    'applyTheme', 'onSwipe', 'cssVar', 'fmtSec', 'impact', 'moveKind', 'haptic']],
  ['views/home.js', ['view', 'accColor']],
  ['views/import.js', ['view']],
  ['views/game.js', ['view', 'drawEvalGraph']],
  ['views/quiz.js', ['mountQuiz']],
  ['views/train.js', ['view', 'hub']],
  ['views/puzzle.js', ['view']],
  ['views/practice.js', ['view']],
  ['views/spar.js', ['view', 'random960']],
  ['views/stats.js', ['view']],
  ['views/settings.js', ['view', 'about']],
  ['views/board.js', ['view']],
  ['views/openings.js', ['view']],
  ['views/learn.js', ['view']],
  ['evalcache.js', ['load', 'get', 'put', 'save', 'clear', 'size', 'key']],
  ['library.js', ['tags', 'addTag', 'deleteTag', 'setGameTags', 'toggleFav', 'applyFilter',
    'searchPosition', 'openingStats', 'posKey', 'SORTS']],
  ['insight.js', ['readPosition', 'readThreats', 'pinnedPieces', 'undefendedPieces', 'mobility',
    'pawnStructure', 'checkableKing', 'discoveredAttacks', 'forkSquares', 'staticThreats', 'KEY_ELEMENTS']],
  ['notation.js', ['figurine', 'sanKo']],
  ['pieces.js', ['applySet', 'importZip', 'listSets', 'unzip', 'CODES']],
];

let pass = 0, fail = 0;
for (const [file, expected] of MODULES) {
  try {
    const m = await import('../www/js/' + file);
    const missing = expected.filter((k) => !(k in m));
    if (missing.length) {
      console.log(`  ❌ ${file} — 없는 export: ${missing.join(', ')}`);
      fail++;
    } else {
      console.log(`  ✅ ${file} (${expected.length}개 export)`);
      pass++;
    }
  } catch (e) {
    console.log(`  ❌ ${file} — ${e.message}`);
    fail++;
  }
}

console.log(`\n모듈 ${pass}개 정상, ${fail}개 문제`);
process.exit(fail ? 1 : 0);
