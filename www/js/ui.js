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
  const path = (location.hash || '#/').slice(1) || '/';
  const app = $('app');
  for (const r of routes) {
    const m = r.rx.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
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

/* ---------------- 네이티브 다리 ---------------- */

export const Native = (typeof window !== 'undefined' && window.Native) || null;
export const isApp = !!Native;

export function haptic(on = true) {
  if (!on) return;
  try { Native && Native.haptic(); } catch (e) {}
}

export function keepAwake(on) {
  try { Native && Native.keepAwake(!!on); } catch (e) {}
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

export function httpGet(url) {
  if (Native && Native.httpGet) {
    const id = 'r' + (++reqSeq);
    return new Promise((resolve, reject) => {
      reqMap.set(id, { resolve, reject });
      Native.httpGet(url, id);
      setTimeout(() => {
        if (reqMap.has(id)) { reqMap.delete(id); reject(new Error('요청 시간 초과')); }
      }, 45000);
    });
  }
  return fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))));
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

export function saveFile(name, content) {
  if (Native && Native.saveFile) { Native.saveFile(name, content); return true; }
  const a = h('a', { href: URL.createObjectURL(new Blob([content], { type: 'application/json' })), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  return true;
}

/* ---------------- 소리 (파일 없이 합성) ---------------- */

let actx = null;
function ctx() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) actx = new AC();
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}

const TONES = {
  move: [[330, 0.05, 'triangle'], [440, 0.05, 'triangle']],
  capture: [[220, 0.07, 'square'], [160, 0.08, 'square']],
  ok: [[660, 0.08, 'sine'], [880, 0.12, 'sine']],
  bad: [[220, 0.14, 'sawtooth'], [160, 0.16, 'sawtooth']],
  win: [[523, 0.09, 'sine'], [659, 0.09, 'sine'], [784, 0.18, 'sine']],
};

export function play(name, enabled = true) {
  if (!enabled) return;
  const c = ctx();
  if (!c) return;
  let t = c.currentTime;
  for (const [freq, dur, type] of TONES[name] || TONES.move) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
    t += dur * 0.75;
  }
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
