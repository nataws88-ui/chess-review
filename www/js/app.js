/* 체스 복기왕 — 진입점 */

import { route, startRouter, h, $, nav, toast, isApp } from './ui.js';
import { loadSprite } from './board.js';
import { settings } from './store.js';

import * as home from './views/home.js';
import * as importView from './views/import.js';
import * as game from './views/game.js';
import * as train from './views/train.js';
import * as spar from './views/spar.js';
import * as stats from './views/stats.js';
import * as setting from './views/settings.js';

const NAV = [
  ['/', '♟️', '경기'],
  ['/train', '🎯', '훈련'],
  ['/spar', '⚔️', '대국'],
  ['/stats', '📊', '통계'],
  ['/settings', '⚙️', '설정'],
];

function renderNav() {
  const cur = (location.hash || '#/').slice(1);
  const el = $('nav');
  el.innerHTML = '';
  for (const [path, ic, label] of NAV) {
    const on = path === '/' ? (cur === '/' || cur.startsWith('/game') || cur.startsWith('/import')) : cur.startsWith(path);
    el.appendChild(h('a', { href: '#' + path, class: on ? 'on' : '' },
      h('span.ic', ic), label));
  }
}

route('/', home.view);
route('/import', importView.view);
route('/game/:id', game.view);
route('/game/:id/:tab', game.view);
route('/train', train.view);
route('/spar', spar.view);
route('/stats', stats.view);
route('/settings', setting.view);
route('/about', setting.about);

/* 공유(SEND) 인텐트로 들어온 PGN */
window.__incomingPgn = (text) => {
  try { sessionStorage.setItem('incomingPgn', text); } catch (e) {}
  if (location.hash === '#/import') location.reload();
  else nav('/import');
};

async function boot() {
  await loadSprite();
  await settings();
  window.addEventListener('hashchange', renderNav);
  renderNav();
  startRouter();

  // 앱 시작 시점에 이미 들어와 있던 공유 텍스트 처리
  if (isApp && window.Native.takePendingShare) {
    const t = window.Native.takePendingShare();
    if (t && t.trim()) window.__incomingPgn(t);
  }
  if (!isApp) toast('브라우저 미리보기 — 엔진은 앱에서만 동작합니다', 3200);
}

boot();
