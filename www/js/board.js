/* 체스판 렌더러 — SVG 벡터.
 * 앱 WebView에서는 강제 다크모드를 껐기 때문에 색이 반전되지 않는다(기존 PNG 우회 불필요). */

const FILES = 'abcdefgh';
const S = 100;                      // 한 칸 크기(viewBox 단위)
const PAD = 0;

export const THEMES = {
  green:  { l: '#EEEED2', d: '#7FA650', edge: '#3f5232', lab: '#3d5230', labL: '#eaeed6' },
  wood:   { l: '#F0D9B5', d: '#B58863', edge: '#6b4a30', lab: '#6b4a30', labL: '#f4e3c8' },
  ocean:  { l: '#DEE3E6', d: '#5B87A8', edge: '#2f4b60', lab: '#2f4b60', labL: '#e8eef2' },
  // 어두운 계열이지만 검은 기물이 묻히지 않을 만큼의 명도는 유지한다
  slate:  { l: '#8E9BB2', d: '#5B6980', edge: '#2b3444', lab: '#3a4457', labL: '#e3e8f0' },
  // 아래 넷은 Chessis 프리셋에서 가져온 배색
  brown:  { l: '#F0D9B5', d: '#946f51', edge: '#5a4231', lab: '#5a4231', labL: '#f2e2cc' },
  grass:  { l: '#EDEED1', d: '#6E9552', edge: '#3b5030', lab: '#3b5030', labL: '#eaeed6' },
  darkwood: { l: '#C7A67B', d: '#6B4A2F', edge: '#3a2717', lab: '#3a2717', labL: '#e3cfb2' },
  darkblue: { l: '#9DB3C8', d: '#3C5A78', edge: '#1e2f3f', lab: '#22344a', labL: '#dbe6f0' },
};

export const THEME_KO = {
  green: '클래식 그린', wood: '우드', ocean: '오션', slate: '슬레이트',
  brown: '브라운', grass: '잔디', darkwood: '진한 우드', darkblue: '진한 블루',
  custom: '내가 고른 색',
};

/* 판 밝기 — 어두운 방에서는 기본 판이 눈부시다는 요구로 넣었다.
 * 기물이 순백/순흑에 반대색 외곽선이라, 칸을 어둡게 해도 양쪽 다 잘 보인다.
 * 0=원래(밝음) · 1=진하게(기본) · 2=더 진하게 */
export const SHADES = [1, 0.82, 0.66];

/** 색을 그대로 어둡게 (색조는 유지) */
export function shade(hex, f) {
  if (f >= 1) return hex;
  let c = String(hex).trim();
  if (c[0] !== '#') return hex;
  if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  const v = [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * f));
  return '#' + v.map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

/** 글자가 배경에 묻히지 않을 색(밝으면 검게, 어두우면 희게) */
export function readable(hex) {
  let c = String(hex || '').trim();
  if (c[0] !== '#') return '#222';
  if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1b1b1b' : '#f2f2f2';
}

/**
 * 테마 + 밝기 단계 → 실제로 칠할 색
 * @param {string|{l,d}} name  이름이거나, 직접 고른 {l,d} 두 색
 */
export function themeColors(name, level = 1) {
  if (name && typeof name === 'object' && name.l && name.d) {
    return { l: name.l, d: name.d, edge: name.d, lab: readable(name.l), labL: readable(name.d) };
  }
  const base = THEMES[name] || THEMES.green;
  const f = SHADES[level] == null ? SHADES[1] : SHADES[level];
  if (f >= 1) return base;
  return {
    ...base,
    l: shade(base.l, f),
    d: shade(base.d, f),
    // 칸이 어두워지면 밝은 칸 위의 좌표 글씨도 같이 낮춰야 묻히지 않는다
    lab: shade(base.lab, Math.min(1, f + 0.15)),
  };
}

let spritePromise = null;
export function loadSprite() {
  if (!spritePromise) {
    spritePromise = fetch('assets/pieces.svg')
      .then((r) => r.text())
      .then((txt) => {
        const holder = document.createElement('div');
        holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        holder.innerHTML = txt;
        document.body.appendChild(holder);
      })
      .catch(() => {});
  }
  return spritePromise;
}

export function sqXY(sq, orient) {
  const f = FILES.indexOf(sq[0]);
  const r = parseInt(sq[1], 10) - 1;
  const x = orient === 'b' ? 7 - f : f;
  const y = orient === 'b' ? r : 7 - r;
  return [x * S + PAD, y * S + PAD];
}

export function xyToSq(px, py, orient) {
  const cx = Math.floor(px / S), cy = Math.floor(py / S);
  if (cx < 0 || cx > 7 || cy < 0 || cy > 7) return null;
  const f = orient === 'b' ? 7 - cx : cx;
  const r = orient === 'b' ? cy : 7 - cy;
  return FILES[f] + (r + 1);
}

/** FEN → {square: 'wp'|'bk'|...} */
export function fenMap(fen) {
  const out = {};
  const rows = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += parseInt(ch, 10); continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      out[FILES[f] + (8 - r)] = color + ch.toLowerCase();
      f++;
    }
  }
  return out;
}

/**
 * 설정 → renderBoard 공통 옵션.
 * 화면마다 따로 챙기다 보니 어떤 화면은 옛 굵기·기본색으로 그려지는 일이 있었다.
 * 판을 그리는 곳은 전부 이걸 펴 넣고 시작한다.
 */
export function boardOpts(st = {}) {
  return {
    theme: st.boardCustom || st.boardTheme,
    shade: st.boardShade,
    coords: st.showCoords !== false,
    bgImage: st.boardBg || null,
    arrowSize: st.arrowSize,
    drag: st.dragMove !== false,
    fx: st.fx !== false,
    animMs: st.animMs,
  };
}

export function addMark(marks, sq, type) {
  if (!sq) return marks;
  (marks[sq] = marks[sq] || []).push(type);
  return marks;
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const c of children) e.appendChild(c);
  return e;
}

/**
 * 판 그리기
 * @param {HTMLElement} host
 * @param {string} fen
 * @param {object} o {orient, marks, theme, shade:0~2, coords, onSquare, arrows, anim:{from,to}, check:'e1'}
 */
export function renderBoard(host, fen, o = {}) {
  const orient = o.orient === 'b' ? 'b' : 'w';
  const th = themeColors(o.theme, o.shade == null ? 1 : o.shade);
  const marks = o.marks || {};
  const pieces = fenMap(fen);

  const svg = el('svg', {
    viewBox: `0 0 ${S * 8} ${S * 8}`,
    class: 'board-svg',
    xmlns: 'http://www.w3.org/2000/svg',
  });

  // ---- 판 배경 그림 (있으면 칸을 반투명으로 얹는다) ----
  if (o.bgImage) {
    svg.appendChild(el('image', {
      href: o.bgImage, x: 0, y: 0, width: S * 8, height: S * 8,
      preserveAspectRatio: 'xMidYMid slice',
    }));
  }
  const sqOpacity = o.bgImage ? (o.bgOpacity == null ? 0.72 : o.bgOpacity) : 1;

  // ---- 칸 ----
  const gSq = el('g', { class: 'sq-layer' });
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = xyToSq(x * S, y * S, orient);
      const light = (x + y) % 2 === 0;
      gSq.appendChild(el('rect', {
        x: x * S, y: y * S, width: S, height: S,
        fill: light ? th.l : th.d, 'fill-opacity': sqOpacity,
      }));
      if (o.coords !== false) {
        if (y === 7) {
          gSq.appendChild(el('text', {
            x: x * S + S - 8, y: y * S + S - 7, 'text-anchor': 'end',
            'font-size': 22, 'font-weight': 700, fill: light ? th.lab : th.labL, class: 'coord',
          })).textContent = sq[0];
        }
        if (x === 0) {
          gSq.appendChild(el('text', {
            x: 7, y: y * S + 26, 'font-size': 22, 'font-weight': 700,
            fill: light ? th.lab : th.labL, class: 'coord',
          })).textContent = sq[1];
        }
      }
    }
  }
  svg.appendChild(gSq);

  // ---- 표시(하이라이트) ----
  const gMark = el('g', { class: 'mark-layer' });
  const box = (x, y, fill, op) => el('rect', { x, y, width: S, height: S, fill, 'fill-opacity': op });
  const ring = (x, y, stroke, w = 8, r = 43, dash = null) => el('circle', {
    cx: x + S / 2, cy: y + S / 2, r, fill: 'none', stroke,
    'stroke-width': w, 'stroke-opacity': 0.95, 'stroke-dasharray': dash,
  });
  const corner = (x, y, fill) => el('path', {
    d: `M ${x} ${y} L ${x + 30} ${y} L ${x} ${y + 30} Z`, fill, 'fill-opacity': 0.95,
  });

  for (const [sq, types] of Object.entries(marks)) {
    const [x, y] = sqXY(sq, orient);
    for (const t of types) {
      switch (t) {
        // ── 기본 ──
        case 'hl': gMark.appendChild(box(x, y, '#f6d650', 0.42)); break;
        case 'sel': gMark.appendChild(box(x, y, '#f6d650', 0.62)); break;
        case 'good': gMark.appendChild(box(x, y, '#48d17a', 0.5)); break;
        case 'bad': gMark.appendChild(box(x, y, '#ef5b5b', 0.5)); break;
        case 'dot': gMark.appendChild(el('circle', { cx: x + S / 2, cy: y + S / 2, r: 15, fill: '#111', 'fill-opacity': 0.28 })); break;
        case 'cap': gMark.appendChild(el('circle', {
          cx: x + S / 2, cy: y + S / 2, r: 44, fill: 'none',
          stroke: '#111', 'stroke-opacity': 0.3, 'stroke-width': 10,
        })); break;
        case 'check': gMark.appendChild(el('circle', { cx: x + S / 2, cy: y + S / 2, r: 50, fill: 'url(#checkGlow)' })); break;
        // ── 마지막 수 강조 유형 ──
        case 'lm-dot': gMark.appendChild(el('circle', { cx: x + S / 2, cy: y + S / 2, r: 12, fill: '#f6d650', 'fill-opacity': 0.85 })); break;
        case 'lm-frame': gMark.appendChild(el('rect', {
          x: x + 4, y: y + 4, width: S - 8, height: S - 8, fill: 'none',
          stroke: '#f6d650', 'stroke-width': 8, 'stroke-opacity': 0.85,
        })); break;
        // ── 국면 읽기(Key Elements) ──
        case 'ke-pin': gMark.appendChild(ring(x, y, '#c586f0')); break;
        case 'ke-undef': gMark.appendChild(ring(x, y, '#ff6b6b', 8, 43, '14 10')); break;
        case 'ke-passed': gMark.appendChild(corner(x, y, '#3fd07a')); break;
        case 'ke-isolated': gMark.appendChild(corner(x, y, '#ffb347')); break;
        case 'ke-backward': gMark.appendChild(corner(x, y, '#7fa0ff')); break;
        case 'ke-king': gMark.appendChild(box(x, y, '#ff8c42', 0.4)); break;
        case 'ke-checksq': gMark.appendChild(el('circle', { cx: x + S / 2, cy: y + S / 2, r: 13, fill: '#ff8c42', 'fill-opacity': 0.8 })); break;
        case 'ke-discover': gMark.appendChild(ring(x, y, '#ffd93d')); break;
        case 'ke-fork': gMark.appendChild(box(x, y, '#3fd07a', 0.45)); break;
        case 'ke-forkrisky': gMark.appendChild(box(x, y, '#3fd07a', 0.2)); break;
        case 'ke-forktarget': gMark.appendChild(ring(x, y, '#3fd07a', 6, 45, '10 8')); break;
        // ── 위협 ──
        case 'th-square': gMark.appendChild(box(x, y, '#e04f4f', 0.32)); break;
        case 'th-hang': gMark.appendChild(ring(x, y, '#e04f4f', 7, 44, '12 9')); break;
        default: break;
      }
    }
  }
  // 체크 글로우 그라데이션
  const defs = el('defs');
  const rg = el('radialGradient', { id: 'checkGlow' });
  rg.appendChild(el('stop', { offset: '0%', 'stop-color': '#ff4d4d', 'stop-opacity': 0.95 }));
  rg.appendChild(el('stop', { offset: '100%', 'stop-color': '#ff4d4d', 'stop-opacity': 0 }));
  defs.appendChild(rg);
  const sh = el('filter', { id: 'pieceShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
  sh.appendChild(el('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2.2, 'flood-color': '#000', 'flood-opacity': 0.45 }));
  defs.appendChild(sh);
  svg.appendChild(defs);
  svg.appendChild(gMark);

  // ---- 타격감(도착 칸 파장) ----
  // 수가 놓이는 순간 도착 칸에서 고리가 퍼진다. 잡은 수는 더 굵고 붉게.
  if (o.anim && o.anim.to && o.fx !== false) {
    const [ax, ay] = sqXY(o.anim.to, orient);
    const cx = ax + S / 2, cy = ay + S / 2;
    const kind = o.anim.kind || 'move';
    const col = kind === 'capture' ? '#ff7a5c' : kind === 'check' ? '#ff4d4d' : '#ffe37a';
    const gFx = el('g', { class: 'fx-layer' });
    gFx.appendChild(el('circle', {
      cx, cy, r: 40, fill: 'none', stroke: col, 'stroke-width': kind === 'move' ? 8 : 12,
      class: 'fx-ring', style: `transform-origin:${cx}px ${cy}px`,
    }));
    if (kind !== 'move') {
      gFx.appendChild(el('circle', {
        cx, cy, r: 40, fill: col, 'fill-opacity': 0.45,
        class: 'fx-flash', style: `transform-origin:${cx}px ${cy}px`,
      }));
    }
    svg.appendChild(gFx);
    if (kind === 'capture' || kind === 'check') {
      try {
        host.classList.remove('hit');
        requestAnimationFrame(() => host.classList.add('hit'));
        setTimeout(() => host.classList.remove('hit'), 260);
      } catch (e) {}
    }
  }

  // ---- 기물 ----
  const gP = el('g', { class: 'piece-layer', filter: 'url(#pieceShadow)' });
  for (const [sq, code] of Object.entries(pieces)) {
    const [x, y] = sqXY(sq, orient);
    const use = el('use', {
      href: `#p${code}`, x: 0, y: 0, width: S, height: S,
      transform: `translate(${x},${y})`, class: 'pc', 'data-sq': sq,
    });
    // 이동 애니메이션: 출발 칸에 그렸다가 다음 프레임에 도착 칸으로
    if (o.anim && o.anim.to === sq && o.anim.from) {
      const [fx, fy] = sqXY(o.anim.from, orient);
      const ms = o.animMs || 190;
      use.setAttribute('transform', `translate(${fx},${fy})`);
      use.style.transitionDuration = ms + 'ms';
      requestAnimationFrame(() => {
        use.classList.add('moving');
        requestAnimationFrame(() => use.setAttribute('transform', `translate(${x},${y})`));
      });
      // 도착하는 순간 살짝 눌렸다 펴진다 — 손맛
      if (o.fx !== false) setTimeout(() => use.classList.add('landed'), ms);
    }
    gP.appendChild(use);
  }
  svg.appendChild(gP);

  // ---- 활동성 숫자 (칸 왼쪽 아래 — Chessis 와 같은 자리) ----
  if (o.numbers && Object.keys(o.numbers).length) {
    const gN = el('g', { class: 'num-layer' });
    for (const [sq, n] of Object.entries(o.numbers)) {
      if (!n) continue;
      const [x, y] = sqXY(sq, orient);
      gN.appendChild(el('circle', { cx: x + 17, cy: y + S - 17, r: 15, fill: '#15181d', 'fill-opacity': 0.82 }));
      const t = el('text', {
        x: x + 17, y: y + S - 10, 'text-anchor': 'middle',
        'font-size': 21, 'font-weight': 800, fill: '#fff',
      });
      t.textContent = String(n);
      gN.appendChild(t);
    }
    svg.appendChild(gN);
  }

  // ---- 화살표(수순) ----
  const allArrows = [...(o.arrows || []), ...(o.userArrows || [])];
  if (allArrows.length) svg.appendChild(arrowLayer(allArrows, orient, o.arrowSize));

  // ---- 입력 ----
  const at = (ev) => {
    const r = svg.getBoundingClientRect();
    const t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    return xyToSq((t.clientX - r.left) / r.width * S * 8, (t.clientY - r.top) / r.height * S * 8, orient);
  };

  if (o.onDraw) {
    /* 화살표 그리기 모드 — 끌어서 그린다. Chessis 처럼 이 동안은 기물 이동이 꺼진다.
     * 같은 칸에서 떼면 그 칸을 동그라미로 표시하고, 이미 있으면 지운다. */
    svg.style.cursor = 'crosshair';
    svg.style.touchAction = 'none';
    let from = null;
    const start = (ev) => { from = at(ev); if (from) ev.preventDefault(); };
    const end = (ev) => {
      if (!from) return;
      const to = at(ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev);
      const f = from; from = null;
      if (to) o.onDraw(f, to);
    };
    svg.addEventListener('pointerdown', start);
    svg.addEventListener('pointerup', end);
    svg.addEventListener('touchstart', start, { passive: false });
    svg.addEventListener('touchend', end);
  } else if (o.onSquare && o.drag !== false) {
    /* 눌러서 고르기 + 끌어서 옮기기.
     * 손가락을 대는 순간 onSquare 로 골라 두고(합법수 점이 뜬다),
     * 그대로 끌면 기물이 손가락을 따라오다가 뗀 칸으로 간다.
     * 화면은 onSquare 안에서 다시 그려지므로, 끄는 동안의 상태는
     * 모듈 바깥(activeDrag)과 window 이벤트로 들고 있어야 살아남는다. */
    svg.style.cursor = 'pointer';
    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      const sq = at(ev);
      if (!sq) return;
      ev.preventDefault();
      const code = pieces[sq];
      o.onSquare(sq);
      if (code) startDrag(host, o, sq, code, ev, orient);
    });
  } else if (o.onSquare) {
    svg.style.cursor = 'pointer';
    svg.addEventListener('click', (ev) => {
      const sq = at(ev);
      if (sq) o.onSquare(sq);
    });
  }

  host.innerHTML = '';
  host.appendChild(svg);
  return svg;
}

/* ---------------- 끌어서 옮기기 ---------------- */

let activeDrag = null;

function startDrag(host, o, from, code, ev, orient) {
  if (activeDrag) endDrag(activeDrag);
  const svg0 = host.querySelector('svg');
  const r0 = svg0 ? svg0.getBoundingClientRect() : { width: 320, height: 320 };
  const cell = r0.width / 8;

  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  // 처음엔 숨긴다 — 그냥 톡 눌렀을 뿐인데 유령이 번쩍이면 안 된다
  ghost.style.cssText = `position:fixed;left:0;top:0;width:${cell}px;height:${cell}px;`
    + 'pointer-events:none;z-index:900;will-change:transform;opacity:0';
  ghost.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%">`
    + `<use href="#p${code}" x="0" y="0" width="100" height="100"/></svg>`;
  document.body.appendChild(ghost);

  const d = { host, o, from, orient, ghost, cell, moved: false, x: ev.clientX, y: ev.clientY };
  activeDrag = d;
  place(d, ev.clientX, ev.clientY);
  // 고르기로 판이 다시 그려진 뒤, 원래 칸의 기물을 흐리게 (들려 있는 느낌)
  requestAnimationFrame(() => {
    if (activeDrag !== d) return;
    const cur = host.querySelector(`.pc[data-sq="${from}"]`);
    if (cur) { cur.style.opacity = '0.25'; d.dim = cur; }
  });

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

function place(d, x, y) {
  d.ghost.style.transform =
    `translate(${x - d.cell / 2}px, ${y - d.cell / 2}px) scale(1.18)`;
}

function squareAt(d, x, y) {
  const svg = d.host.querySelector('svg');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  if (!r.width) return null;
  return xyToSq((x - r.left) / r.width * S * 8, (y - r.top) / r.height * S * 8, d.orient);
}

function onMove(ev) {
  const d = activeDrag;
  if (!d) return;
  if (Math.abs(ev.clientX - d.x) > 4 || Math.abs(ev.clientY - d.y) > 4) d.moved = true;
  if (d.moved) d.ghost.style.opacity = '1';
  place(d, ev.clientX, ev.clientY);
  const sq = squareAt(d, ev.clientX, ev.clientY);
  if (sq !== d.over) {
    d.over = sq;
    const svg = d.host.querySelector('svg');
    if (svg) {
      const old = svg.querySelector('.drag-over');
      if (old) old.remove();
      if (sq && sq !== d.from) {
        const [x, y] = sqXY(sq, d.orient);
        const box = el('rect', {
          x: x + 3, y: y + 3, width: S - 6, height: S - 6, fill: 'none',
          stroke: '#ffffff', 'stroke-width': 7, 'stroke-opacity': 0.8, class: 'drag-over',
          'pointer-events': 'none',
        });
        svg.appendChild(box);
      }
    }
  }
  ev.preventDefault();
}

function onUp(ev) {
  const d = activeDrag;
  if (!d) return;
  const to = squareAt(d, ev.clientX, ev.clientY);
  const moved = d.moved;
  const o = d.o, from = d.from;
  endDrag(d);
  if (moved && to && to !== from) o.onSquare(to);
}

function onCancel() { endDrag(activeDrag); }

function endDrag(d) {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  if (!d) { activeDrag = null; return; }
  if (d.ghost && d.ghost.remove) d.ghost.remove();
  if (d.dim) d.dim.style.opacity = '';
  const svg = d.host.querySelector('svg');
  const box = svg && svg.querySelector('.drag-over');
  if (box) box.remove();
  activeDrag = null;
}

const ARROW_COLORS = {
  best: '#2fbf5f',
  punish: '#e04f4f',
  my: '#f0a030',
  hint: '#4a9eff',
  // 국면 읽기·위협
  pin: '#c586f0',
  discover: '#ffd93d',
  threat: '#e04f4f',
  mateThreat: '#ff2d55',
  // 엔진 라인 순위별(1등이 제일 진하다)
  line1: '#2fbf5f',
  line2: '#7fc96b',
  line3: '#d2c452',
  line4: '#d99a4e',
  line5: '#c96f6f',
  // 손으로 그린 화살표
  user: '#f6d650',
};

/* 화살표 굵기 — 폰에서 손가락으로 보기엔 옛 굵기(15)가 가늘다는 요구로 넣었다.
 * 굵어질수록 화살촉 배율(mk)은 낮춘다. 화살촉 크기 = mk × 선 굵기라서
 * 그대로 두면 촉만 커져 칸을 통째로 덮는다. */
export const ARROW_SIZES = {
  normal: { w: 15, thin: 8, mk: 3.4, num: 19, font: 24, back: 26 },
  big: { w: 23, thin: 12, mk: 2.7, num: 22, font: 27, back: 33 },
  huge: { w: 32, thin: 16, mk: 2.2, num: 26, font: 31, back: 41 },
};
export const ARROW_SIZE_KO = { normal: '보통', big: '크게', huge: '아주 크게' };
const DEFAULT_ARROW_SIZE = 'big';

/** 번호가 붙은 수순 화살표 (마지막에 그려 기물을 가리지 않게 반투명) */
function arrowLayer(arrows, orient, size) {
  const z = ARROW_SIZES[size] || ARROW_SIZES[DEFAULT_ARROW_SIZE];
  const g = el('g', { class: 'arrow-layer' });
  const defs = el('defs');
  for (const [k, c] of Object.entries(ARROW_COLORS)) {
    const mk = el('marker', {
      id: 'ah_' + k, viewBox: '0 0 10 10', refX: 6.2, refY: 5,
      markerWidth: z.mk, markerHeight: z.mk, orient: 'auto-start-reverse',
    });
    mk.appendChild(el('path', { d: 'M 0 1 L 8 5 L 0 9 z', fill: c }));
    defs.appendChild(mk);
  }
  g.appendChild(defs);

  let seq = 0;
  arrows.forEach((a) => {
    const color = a.color || ARROW_COLORS[a.kind] || ARROW_COLORS.best;
    const [fx, fy] = sqXY(a.f, orient);
    const [tx, ty] = sqXY(a.t, orient);

    // 출발=도착이면 칸 동그라미 (손으로 표시해 두는 용도)
    if (a.f === a.t) {
      g.appendChild(el('circle', {
        cx: fx + S / 2, cy: fy + S / 2, r: 44, fill: 'none',
        stroke: color, 'stroke-width': Math.round(z.w * 0.7), 'stroke-opacity': 0.85,
      }));
      return;
    }

    const x1 = fx + S / 2, y1 = fy + S / 2;
    let x2 = tx + S / 2, y2 = ty + S / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    // 화살촉이 칸 중앙을 덮지 않도록 살짝 당긴다.
    // 짧은 화살표(한 칸짜리)에서 굵기만큼 당기면 몸통이 사라지므로 길이에 비례해 묶는다.
    const back = Math.min(z.back, len * 0.3);
    x2 -= dx / len * back;
    y2 -= dy / len * back;
    g.appendChild(el('line', {
      x1, y1, x2, y2, stroke: color, 'stroke-width': a.thin ? z.thin : z.w, 'stroke-linecap': 'round',
      'stroke-opacity': a.thin ? 0.6 : 0.85,
      'stroke-dasharray': a.dash || null,
      'marker-end': `url(#ah_${ARROW_COLORS[a.kind] ? a.kind : 'best'})`,
    }));
    // 순서 번호 (number:false 면 안 붙인다 — 위협·핀처럼 순서가 없는 화살표)
    if (a.number === false) return;
    seq++;
    const label = a.label != null ? String(a.label) : String(seq);
    const mx = x1 + dx * 0.42, my = y1 + dy * 0.42;
    g.appendChild(el('circle', { cx: mx, cy: my, r: z.num, fill: '#15181d', 'fill-opacity': 0.92, stroke: color, 'stroke-width': 3 }));
    const t = el('text', {
      x: mx, y: my + z.font / 3, 'text-anchor': 'middle', 'font-size': z.font, 'font-weight': 800, fill: '#fff',
    });
    t.textContent = label;
    g.appendChild(t);
  });
  return g;
}

/** SAN 수순 → 화살표 배열 */
export function lineArrows(moves, kind) {
  return (moves || []).map((m) => ({ f: m.f, t: m.t, kind, san: m.san }));
}
