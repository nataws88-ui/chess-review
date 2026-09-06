/* 화면 공통 도우미 — 미니 하이퍼스크립트, 라우터, 토스트, 소리, 진동 */

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** h('div.card', {onclick}, '내용') · h('div#toast.toast') 처럼 id 도 붙일 수 있다 */
export function h(spec, props, ...children) {
  const m = /^([a-zA-Z][a-zA-Z0-9]*)?(?:#([\w-]+))?((?:\.[\w-]+)*)$/.exec(String(spec)) || [];
  const tag = m[1] || 'div';
  const id = m[2];
  const cls = (m[3] || '').split('.').filter(Boolean);
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls.length) e.className = cls.join(' ');
  if (props && (typeof props !== 'object' || Array.isArray(props) || props.nodeType)) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className += (e.className ? ' ' : '') + v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.style.cssText += v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return e;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* ---------------- 토스트 ---------------- */

let toastTimer = null;
export function toast(msg, ms = 2200) {
  let t = $('toast');
  if (!t) {
    t = h('div#toast.toast');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------------- 라우터 ---------------- */

const routes = [];
let currentCleanup = null;

export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  }) + '$');
  routes.push({ rx, keys, handler });
}

export function nav(path, replace = false) {
  if (replace) location.replace('#' + path);
  else location.hash = path;
}

export async function dispatch() {
  // 주소 뒤의 ?query 는 경로에서 떼어 낸다 (#/game/x/review?ply=12 처럼 쓴다)
  const raw = (location.hash || '#/').slice(1) || '/';
  const path = raw.split('?')[0] || '/';
  const app = $('app');
  adBanner(path);
  for (const r of routes) {
    const m = r.rx.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
    fullscreen(false);
    clear(app);
    app.scrollTop = 0;
    window.scrollTo(0, 0);
    try {
      currentCleanup = (await r.handler(app, params)) || null;
    } catch (e) {
      console.error(e);
      app.appendChild(h('div.card.err', h('b', '오류가 났습니다'), h('p.sub', String(e && e.message || e))));
    }
    return;
  }
  nav('/', true);
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

/* ---------------- 화면 껍데기 ---------------- */

export function screen(title, opts = {}) {
  const back = opts.back !== false;
  const head = h('header.top',
    back ? h('button.icon-btn', { onclick: () => history.back(), 'aria-label': '뒤로' }, '‹') : null,
    h('h1.title', title),
    opts.right || null,
  );
  const body = h('div.body');
  return { head, body, root: h('div.screen', head, body) };
}

/** CSS 변수 읽기 — 캔버스는 CSS를 못 쓰므로 색을 여기서 가져다 칠한다 */
export function cssVar(name, fallback = '#000') {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}

/** 좌우로 미는 동작. 세로로 더 많이 움직였으면 스크롤로 보고 무시한다 */
export function onSwipe(el, cb) {
  let x0 = 0, y0 = 0, t0 = 0, on = false;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { on = false; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = e.timeStamp; on = true;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!on) return;
    on = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (e.timeStamp - t0 > 700) return;              // 천천히 끈 건 스와이프가 아니다
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    cb(dx < 0 ? 1 : -1);                             // 왼쪽으로 밀면 다음 수
  }, { passive: true });
}

/* 톡 치면 한 번, 꾹 누르고 있으면 계속 — 끝까지 보려고 스무 번 누르지 않아도 된다.
 * 눌러서 이미 넘어갔으면 손을 뗄 때 한 수 더 가지 않도록 그 click 은 흘린다.
 * (click 으로도 부르므로 키보드·접근성에서도 그대로 눌린다) */
export function holdRepeat(btn, fn) {
  let wait = null, rep = null, fired = false;
  const stop = () => {
    if (wait) clearTimeout(wait);
    if (rep) clearInterval(rep);
    wait = rep = null;
    btn.classList.remove('hold');
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    stop();
    wait = setTimeout(() => {
      btn.classList.add('hold');
      fired = true;
      fn();
      rep = setInterval(fn, 130);
    }, 420);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    btn.addEventListener(ev, stop);
  }
  btn.addEventListener('click', () => {
    if (fired) { fired = false; return; }
    fn();
  });
  window.addEventListener('blur', stop);
  return stop;
}

/* 판의 왼쪽·오른쪽을 톡 치면 한 수 뒤로·앞으로.
 * 미는 것보다 빠르고, 판 자체가 제일 큰 단추가 된다(수를 두지 않는 화면에서만 쓴다). */
export function onTapSide(el, cb) {
  let x0 = 0, y0 = 0, t0 = 0, on = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) { on = false; return; }
    on = true; x0 = e.clientX; y0 = e.clientY; t0 = Date.now();
  });
  el.addEventListener('pointerup', (e) => {
    if (!on) return;
    on = false;
    if (Date.now() - t0 > 500) return;                       // 오래 누른 건 탭이 아니다
    if (Math.abs(e.clientX - x0) > 12 || Math.abs(e.clientY - y0) > 12) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    cb(e.clientX - r.left < r.width / 2 ? -1 : 1);
  });
}

/* ---------------- 테마 ----------------
 * 앱 WebView 는 강제 다크모드를 꺼놨으므로(setAlgorithmicDarkeningAllowed(false))
 * 밝은 테마도 우리가 칠한 색 그대로 나온다. */

export const THEME_BG = { dark: '#0E1116', light: '#F6F7FA' };

export function applyTheme(theme) {
  const auto = !theme || theme === 'auto';
  const dark = auto
    ? !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
    : theme !== 'light';
  const root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', dark ? THEME_BG.dark : THEME_BG.light);
  return dark ? 'dark' : 'light';
}

/* ---------------- 판을 화면에 맞추기 ----------------
 * 폴더블은 펴면 화면이 넓어지면서(정사각에 가까워지면서) 판이 세로로 넘쳐,
 * 「지금 무슨 차례인지」와 단추가 화면 밖으로 밀린다. 접으면 반대로 판이 작아진다.
 * 그래서 판 크기를 폭이 아니라 **남은 높이**로 정한다 — 접었다 펴면 다시 잰다.
 *
 * @param wrap   .board-wrap 요소
 * @param below  판 아래에서 반드시 같이 보여야 하는 요소들
 * @returns 정리 함수 (화면을 나갈 때 부른다)
 */
export function fitBoard(wrap, below = []) {
  if (!wrap || typeof window === 'undefined') return () => {};

  const calc = () => {
    const vh = window.innerHeight || 0;
    if (!vh || !wrap.getBoundingClientRect) return;
    wrap.style.maxWidth = '';                       // 먼저 풀어야 제 자리를 잰다
    // 스크롤한 뒤에 다시 재도 같은 답이 나오도록 문서 기준 위치로 잰다
    const top = wrap.getBoundingClientRect().top + (window.scrollY || 0);
    if (!top && top !== 0) return;
    // 판 옆(오른쪽)에 선 것은 세로를 먹지 않는다 — 넓은 화면에서 옆으로 세울 때를 위해
    const bottom = wrap.getBoundingClientRect().bottom + (window.scrollY || 0);
    let rest = 0;
    for (const el of below) {
      if (!el || !el.offsetHeight) continue;
      const t = el.getBoundingClientRect().top + (window.scrollY || 0);
      if (t < bottom - 4) continue;
      rest += el.offsetHeight + 6;
    }
    const avail = vh - top - rest - bottomReserve() - 10;
    const parent = wrap.parentElement;
    const w = (parent && parent.clientWidth) || avail;
    const px = Math.max(200, Math.min(w, Math.floor(avail)));
    wrap.style.maxWidth = px + 'px';
    wrap.style.marginLeft = 'auto';
    wrap.style.marginRight = 'auto';
  };

  // 글꼴·이미지가 자리를 잡은 뒤 재야 정확하다.
  // 판이 화면에서 사라지면 스스로 손을 뗀다 — 화면마다 정리 함수를 챙기지 않아도 되게.
  let off = null;
  const soon = () => {
    if (wrap.isConnected === false) { if (off) off(); return; }
    try { calc(); } catch (e) {}
  };
  requestAnimationFrame(soon);
  const t1 = setTimeout(soon, 60);
  const t2 = setTimeout(soon, 300);

  window.addEventListener('resize', soon);
  window.addEventListener('orientationchange', soon);
  const vv = window.visualViewport;
  if (vv && vv.addEventListener) vv.addEventListener('resize', soon);

  off = () => {
    clearTimeout(t1); clearTimeout(t2);
    window.removeEventListener('resize', soon);
    window.removeEventListener('orientationchange', soon);
    if (vv && vv.removeEventListener) vv.removeEventListener('resize', soon);
  };
  return off;
}

/** 아래 메뉴·광고 배너가 먹는 높이 (#app 의 아래 여백에 그대로 들어 있다) */
function bottomReserve() {
  try {
    const app = document.getElementById('app');
    if (!app) return 86;
    const v = parseFloat(getComputedStyle(app).paddingBottom);
    return Number.isFinite(v) ? v : 86;
  } catch (e) { return 86; }
}

/* ---------------- 전체 화면 ----------------
 * 판을 크게 보고 싶을 때 위 제목줄과 아래 메뉴를 감춘다 (Chessis 의 Full Screen).
 * 화면을 옮기면 자동으로 풀린다 — 갇히지 않게. */

export function fullscreen(on) {
  try {
    document.body.classList.toggle('fullscreen', !!on);
  } catch (e) {}
  return !!on;
}

export function isFullscreen() {
  try { return document.body.classList.contains('fullscreen'); } catch (e) { return false; }
}

/* ---------------- 네이티브 다리 ---------------- */

export const Native = (typeof window !== 'undefined' && window.Native) || null;
export const isApp = !!Native;

/**
 * 진동. 종류마다 길이·박자가 다르다(VIBE 표는 아래 소리 부분에 있다).
 * navigator.vibrate 는 박자를 줄 수 있어 먼저 쓰고, 막혀 있으면 네이티브로 내려간다.
 */
export function haptic(on = true, kind = 'ok') {
  if (!on) return;
  const pat = VIBE[kind] == null ? VIBE.ok : VIBE[kind];
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate && navigator.vibrate(pat)) return;
  } catch (e) {}
  try {
    if (Native && Native.vibrate) { Native.vibrate(Array.isArray(pat) ? pat[1] || 15 : pat); return; }
    if (Native) Native.haptic();
  } catch (e) {}
}

export function keepAwake(on) {
  try { Native && Native.keepAwake(!!on); } catch (e) {}
}

/* ---------------- 광고 ----------------
 * 체스판이 뜨는 화면에서는 배너를 내린다 — 판 크기를 한 픽셀도 양보하지 않는다.
 * 전면광고는 "분석 완료"처럼 사용자가 이미 손을 멈춘 순간에만 부르고,
 * 실제로 띄울지(간격·준비 여부)는 네이티브가 판단한다. */

const BOARD_ROUTES = [/^\/game\//, /^\/train/, /^\/spar/, /^\/board/, /^\/puzzle/, /^\/practice/, /^\/learn/];

export function adBanner(path) {
  const show = !BOARD_ROUTES.some((rx) => rx.test(path));
  try { Native && Native.adBanner && Native.adBanner(show); } catch (e) {}
}

export function adBreak(reason) {
  try { Native && Native.adInterstitial && Native.adInterstitial(String(reason || '')); } catch (e) {}
}

/** 네이티브 HTTP GET (CORS 우회). 앱이 아니면 fetch로 시도 */
let reqSeq = 0;
const reqMap = new Map();
if (typeof window !== 'undefined') {
  window.__httpDone = (id, status, body) => {
    const r = reqMap.get(id);
    if (!r) return;
    reqMap.delete(id);
    if (status >= 200 && status < 300) r.resolve(body);
    else r.reject(new Error(status === -1 ? body : `HTTP ${status}`));
  };
  window.__filePicked = (id, name, content) => {
    const r = reqMap.get(id);
    if (!r) return;
    reqMap.delete(id);
    if (content == null) r.reject(new Error('취소'));
    else r.resolve({ name, content });
  };
}

export function httpGet(url, accept) {
  if (Native && Native.httpGet) {
    const id = 'r' + (++reqSeq);
    return new Promise((resolve, reject) => {
      reqMap.set(id, { resolve, reject });
      // 리체스는 Accept 헤더로 응답 형식(PGN/ndjson)이 갈린다
      if (accept && Native.httpGetAs) Native.httpGetAs(url, id, accept);
      else Native.httpGet(url, id);
      setTimeout(() => {
        if (reqMap.has(id)) { reqMap.delete(id); reject(new Error('요청 시간 초과')); }
      }, 45000);
    });
  }
  return fetch(url, accept ? { headers: { Accept: accept } } : undefined)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))));
}

export function pickFile() {
  if (Native && Native.pickFile) {
    const id = 'f' + (++reqSeq);
    return new Promise((resolve, reject) => {
      reqMap.set(id, { resolve, reject });
      Native.pickFile(id);
    });
  }
  // 브라우저 미리보기용 — 파일 선택창
  return new Promise((resolve, reject) => {
    const inp = h('input', { type: 'file', accept: '.json,.pgn,application/json,text/plain', style: 'display:none' });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) { inp.remove(); return reject(new Error('취소')); }
      const r = new FileReader();
      r.onload = () => { inp.remove(); resolve({ name: f.name, content: String(r.result) }); };
      r.onerror = () => { inp.remove(); reject(new Error('읽기 실패')); };
      r.readAsText(f);
    });
    document.body.appendChild(inp);
    inp.click();
  });
}

/* 이진 파일 고르기 — 기물 세트 ZIP·판 배경 그림.
 * 네이티브는 base64 로 넘겨 준다(웹뷰 다리는 글자만 오간다). */
const binMap = new Map();
if (typeof window !== 'undefined') {
  window.__binPicked = (id, name, b64) => {
    const w = binMap.get(id);
    if (!w) return;
    binMap.delete(id);
    if (!b64) return w.reject(new Error('취소'));
    try {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      w.resolve({ name, buffer: u8.buffer, dataUrl: null });
    } catch (e) { w.reject(new Error('파일을 읽지 못했습니다')); }
  };
}

/**
 * @param {string} mime  'application/zip' · 'image/*'
 * @returns {Promise<{name, buffer:ArrayBuffer}>}
 */
export function pickBinary(mime = '*/*') {
  if (Native && Native.pickBinary) {
    const id = 'b' + (++reqSeq);
    return new Promise((resolve, reject) => {
      binMap.set(id, { resolve, reject });
      Native.pickBinary(id, mime);
    });
  }
  return new Promise((resolve, reject) => {
    const inp = h('input', { type: 'file', accept: mime, style: 'display:none' });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) { inp.remove(); return reject(new Error('취소')); }
      const r = new FileReader();
      r.onload = () => { inp.remove(); resolve({ name: f.name, buffer: r.result }); };
      r.onerror = () => { inp.remove(); reject(new Error('읽기 실패')); };
      r.readAsArrayBuffer(f);
    });
    document.body.appendChild(inp);
    inp.click();
  });
}

/** 오래 걸린 일이 끝났을 때 — 사용자가 다른 앱을 보고 있으면 알림으로 알린다 */
export function notify(title, text) {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
  if (Native && Native.notify) { Native.notify(title, text); return true; }
  return false;
}

export function askNotify() {
  if (Native && Native.askNotify) Native.askNotify();
}

/** 글자 복사 — 클립보드가 막힌 웹뷰에서는 임시 입력칸으로 되돌아간다 */
export function copyText(txt, msg = '복사했습니다') {
  const done = () => toast(msg);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, () => fallback());
      return;
    }
  } catch (e) {}
  fallback();
  function fallback() {
    try {
      const ta = h('textarea', { style: 'position:fixed;opacity:0;left:-999px' });
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) { toast('복사하지 못했습니다'); }
  }
}

/** 붙여넣기 — 클립보드 읽기가 막혀 있으면 null */
export async function readClipboard() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) return await navigator.clipboard.readText();
  } catch (e) {}
  return null;
}

export function saveFile(name, content) {
  if (Native && Native.saveFile) { Native.saveFile(name, content); return true; }
  const a = h('a', { href: URL.createObjectURL(new Blob([content], { type: 'application/json' })), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  return true;
}

/* ---------------- 소리 (파일 없이 합성) ----------------
 * 음원 파일을 넣지 않고 그때그때 만든다. 앱 용량이 늘지 않고 지연도 없다.
 * 「타격감」은 소리 하나로 나지 않는다 — 짧은 잡음(나무 부딪는 소리)에
 * 낮은 사인파(울림)를 겹쳐야 판에 놓이는 느낌이 난다. */

let actx = null;
function ctx() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) actx = new AC();
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}

let noiseBuf = null;
function noiseBuffer(c) {
  if (!noiseBuf) {
    const n = Math.floor(c.sampleRate * 0.4);
    noiseBuf = c.createBuffer(1, n, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** 잡음 한 번 — 나무·돌이 부딪는 소리의 뼈대 */
function knock(c, t, { freq = 1200, q = 1.2, dur = 0.06, gain = 0.35 }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur + 0.02);
}

/** 사인/사각파 한 음 — slide 를 주면 그 주파수까지 미끄러진다 */
function tone(c, t, { freq, dur = 0.08, type = 'sine', gain = 0.16, slide = null }) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

const SOUNDS = {
  // 판에 톡 — 짧고 마른 소리 + 아주 낮은 울림
  move: (c, t) => {
    knock(c, t, { freq: 1500, q: 1.1, dur: 0.045, gain: 0.32 });
    tone(c, t, { freq: 190, dur: 0.07, type: 'sine', gain: 0.2, slide: 120 });
  },
  // 잡는 수는 한 번 더 무겁게 — 퍽
  capture: (c, t) => {
    knock(c, t, { freq: 620, q: 0.7, dur: 0.13, gain: 0.55 });
    knock(c, t + 0.02, { freq: 2200, q: 1.6, dur: 0.05, gain: 0.22 });
    tone(c, t, { freq: 110, dur: 0.16, type: 'sawtooth', gain: 0.26, slide: 55 });
  },
  // 체크는 귀에 걸리게 두 번
  check: (c, t) => {
    tone(c, t, { freq: 980, dur: 0.06, type: 'square', gain: 0.13 });
    tone(c, t + 0.075, { freq: 1320, dur: 0.09, type: 'square', gain: 0.13 });
  },
  castle: (c, t) => {
    knock(c, t, { freq: 1300, q: 1.1, dur: 0.05, gain: 0.3 });
    knock(c, t + 0.085, { freq: 1000, q: 1.1, dur: 0.06, gain: 0.34 });
    tone(c, t + 0.085, { freq: 170, dur: 0.08, type: 'sine', gain: 0.18 });
  },
  promote: (c, t) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(c, t + i * 0.06, { freq: f, dur: 0.12, type: 'triangle', gain: 0.14 }));
  },
  ok: (c, t) => {
    tone(c, t, { freq: 660, dur: 0.08, type: 'sine', gain: 0.15 });
    tone(c, t + 0.06, { freq: 990, dur: 0.13, type: 'sine', gain: 0.15 });
  },
  bad: (c, t) => {
    tone(c, t, { freq: 220, dur: 0.14, type: 'sawtooth', gain: 0.14, slide: 150 });
    tone(c, t + 0.1, { freq: 150, dur: 0.18, type: 'sawtooth', gain: 0.13, slide: 90 });
  },
  win: (c, t) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(c, t + i * 0.075, { freq: f, dur: i === 3 ? 0.26 : 0.1, type: 'sine', gain: 0.16 }));
  },
  lose: (c, t) => {
    [523, 440, 349, 262].forEach((f, i) =>
      tone(c, t + i * 0.085, { freq: f, dur: i === 3 ? 0.3 : 0.11, type: 'triangle', gain: 0.15 }));
  },
  click: (c, t) => knock(c, t, { freq: 2400, q: 2, dur: 0.025, gain: 0.18 }),
  tick: (c, t) => knock(c, t, { freq: 3200, q: 3, dur: 0.018, gain: 0.12 }),
};

export function play(name, enabled = true) {
  if (!enabled) return;
  const c = ctx();
  if (!c) return;
  try { (SOUNDS[name] || SOUNDS.move)(c, c.currentTime + 0.001); } catch (e) {}
}

/* ---------------- 진동 세기 ----------------
 * 소리와 진동이 같이 나야 「쳤다」는 느낌이 난다. 종류마다 길이를 다르게 준다. */

const VIBE = {
  move: 14,
  capture: [0, 22, 30, 26],
  check: [0, 16, 45, 16, 45, 24],
  castle: [0, 14, 60, 18],
  promote: [0, 12, 40, 12, 40, 30],
  ok: 20,
  bad: [0, 34, 55, 34],
  win: [0, 22, 45, 22, 45, 60],
  lose: [0, 60, 70, 90],
  click: 8,
};

/**
 * 소리 + 진동을 한 번에. 화면 코드에서는 이것만 부르면 된다.
 * @param kind move|capture|check|castle|promote|ok|bad|win|lose|click
 * @param st   설정 객체 ({sound, haptic})
 */
export function impact(kind, st) {
  const s = st || {};
  play(kind, s.sound !== false);
  haptic(s.haptic !== false, kind);
}

/** 수 하나(chess.js move 객체) → 어떤 타격인지 */
export function moveKind(m, chess) {
  if (!m) return 'move';
  // 메이트도 여기서는 체크로 본다 — 이긴 건지 진 건지는 부르는 쪽이 안다
  if (chess && chess.isCheck && chess.isCheck()) return 'check';
  if (m.promotion) return 'promote';
  const castle = typeof m.isCastle === 'function' ? m.isCastle() : /^O-O/.test(m.san || '');
  if (castle) return 'castle';
  const cap = typeof m.isCapture === 'function' ? m.isCapture() : !!m.captured;
  return cap ? 'capture' : 'move';
}

/* ---------------- 진행률 표시 ---------------- */

export function progressBar() {
  const bar = h('div.pbar-fill');
  const label = h('div.pbar-label', '');
  const root = h('div.pbar', h('div.pbar-track', bar), label);
  return {
    root,
    set(pct, text) {
      bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (text != null) label.textContent = text;
    },
  };
}

export function fmtDate(d) {
  if (!d) return '';
  return String(d).replace(/-/g, '.').replace(/\.$/, '');
}

/** 초 → "1분 12초" / "8.4초" */
export function fmtSec(s) {
  if (s == null) return '';
  if (s < 60) return (s < 10 ? Math.round(s * 10) / 10 : Math.round(s)) + '초';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m}분 ${r}초` : `${m}분`;
}
