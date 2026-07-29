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
};

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
 * @param {object} o {orient, marks, theme, coords, onSquare, arrows, anim:{from,to}, check:'e1'}
 */
export function renderBoard(host, fen, o = {}) {
  const orient = o.orient === 'b' ? 'b' : 'w';
  const th = THEMES[o.theme] || THEMES.green;
  const marks = o.marks || {};
  const pieces = fenMap(fen);

  const svg = el('svg', {
    viewBox: `0 0 ${S * 8} ${S * 8}`,
    class: 'board-svg',
    xmlns: 'http://www.w3.org/2000/svg',
  });

  // ---- 칸 ----
  const gSq = el('g', { class: 'sq-layer' });
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sq = xyToSq(x * S, y * S, orient);
      const light = (x + y) % 2 === 0;
      gSq.appendChild(el('rect', {
        x: x * S, y: y * S, width: S, height: S,
        fill: light ? th.l : th.d,
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
  for (const [sq, types] of Object.entries(marks)) {
    const [x, y] = sqXY(sq, orient);
    for (const t of types) {
      if (t === 'hl') gMark.appendChild(el('rect', { x, y, width: S, height: S, fill: '#f6d650', 'fill-opacity': 0.42 }));
      else if (t === 'sel') gMark.appendChild(el('rect', { x, y, width: S, height: S, fill: '#f6d650', 'fill-opacity': 0.62 }));
      else if (t === 'good') gMark.appendChild(el('rect', { x, y, width: S, height: S, fill: '#48d17a', 'fill-opacity': 0.5 }));
      else if (t === 'bad') gMark.appendChild(el('rect', { x, y, width: S, height: S, fill: '#ef5b5b', 'fill-opacity': 0.5 }));
      else if (t === 'dot') gMark.appendChild(el('circle', { cx: x + S / 2, cy: y + S / 2, r: 15, fill: '#111', 'fill-opacity': 0.28 }));
      else if (t === 'cap') gMark.appendChild(el('circle', {
        cx: x + S / 2, cy: y + S / 2, r: 44, fill: 'none',
        stroke: '#111', 'stroke-opacity': 0.3, 'stroke-width': 10,
      }));
      else if (t === 'check') gMark.appendChild(el('circle', {
        cx: x + S / 2, cy: y + S / 2, r: 50, fill: 'url(#checkGlow)',
      }));
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
      use.setAttribute('transform', `translate(${fx},${fy})`);
      requestAnimationFrame(() => {
        use.classList.add('moving');
        requestAnimationFrame(() => use.setAttribute('transform', `translate(${x},${y})`));
      });
    }
    gP.appendChild(use);
  }
  svg.appendChild(gP);

  // ---- 화살표(수순) ----
  if (o.arrows && o.arrows.length) svg.appendChild(arrowLayer(o.arrows, orient));

  // ---- 입력 ----
  if (o.onSquare) {
    svg.style.cursor = 'pointer';
    svg.addEventListener('click', (ev) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width * S * 8;
      const py = (ev.clientY - r.top) / r.height * S * 8;
      const sq = xyToSq(px, py, orient);
      if (sq) o.onSquare(sq);
    });
  }

  host.innerHTML = '';
  host.appendChild(svg);
  return svg;
}

const ARROW_COLORS = {
  best: '#2fbf5f',
  punish: '#e04f4f',
  my: '#f0a030',
  hint: '#4a9eff',
};

/** 번호가 붙은 수순 화살표 (마지막에 그려 기물을 가리지 않게 반투명) */
function arrowLayer(arrows, orient) {
  const g = el('g', { class: 'arrow-layer' });
  const defs = el('defs');
  for (const [k, c] of Object.entries(ARROW_COLORS)) {
    const mk = el('marker', {
      id: 'ah_' + k, viewBox: '0 0 10 10', refX: 6.2, refY: 5,
      markerWidth: 3.4, markerHeight: 3.4, orient: 'auto-start-reverse',
    });
    mk.appendChild(el('path', { d: 'M 0 1 L 8 5 L 0 9 z', fill: c }));
    defs.appendChild(mk);
  }
  g.appendChild(defs);

  arrows.forEach((a, i) => {
    const color = ARROW_COLORS[a.kind] || ARROW_COLORS.best;
    const [fx, fy] = sqXY(a.f, orient);
    const [tx, ty] = sqXY(a.t, orient);
    const x1 = fx + S / 2, y1 = fy + S / 2;
    let x2 = tx + S / 2, y2 = ty + S / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    // 화살촉이 칸 중앙을 덮지 않도록 살짝 당긴다
    x2 -= dx / len * 26;
    y2 -= dy / len * 26;
    g.appendChild(el('line', {
      x1, y1, x2, y2, stroke: color, 'stroke-width': 15, 'stroke-linecap': 'round',
      'stroke-opacity': 0.85, 'marker-end': `url(#ah_${a.kind || 'best'})`,
    }));
    // 순서 번호
    const mx = x1 + dx * 0.42, my = y1 + dy * 0.42;
    g.appendChild(el('circle', { cx: mx, cy: my, r: 19, fill: '#15181d', 'fill-opacity': 0.92, stroke: color, 'stroke-width': 3 }));
    const t = el('text', {
      x: mx, y: my + 8, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 800, fill: '#fff',
    });
    t.textContent = String(i + 1);
    g.appendChild(t);
  });
  return g;
}

/** SAN 수순 → 화살표 배열 */
export function lineArrows(moves, kind) {
  return (moves || []).map((m) => ({ f: m.f, t: m.t, kind, san: m.san }));
}
