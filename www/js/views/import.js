/* 경기 가져오기 — Chess.com / 붙여넣기 / 파일 / 공유받기 */

import { h, nav, screen, toast, progressBar, httpGet, pickFile, keepAwake, isApp, play, adBreak } from '../ui.js';
import { settings, setSetting, store } from '../store.js';
import { splitPgn, peek, analyzeAndSave, fingerprint, chessComUrl, invalidate } from '../games.js';
import { resultKo } from '../quizgen.js';

export async function view(app) {
  const st = await settings();
  const s = screen('경기 가져오기');
  app.appendChild(s.root);
  const b = s.body;

  // 공유(SEND)로 들어온 PGN이 있으면 바로 채운다
  let incoming = '';
  try {
    incoming = sessionStorage.getItem('incomingPgn') || '';
    sessionStorage.removeItem('incomingPgn');
  } catch (e) {}

  const listBox = h('div');
  const paste = h('textarea', {
    placeholder: '[Event "..."]\n1. e4 e5 2. Nf3 ...\n\n체스닷컴 → 게임 공유 → PGN 복사 후 붙여넣기\n(여러 판을 한꺼번에 붙여넣어도 됩니다)',
  });
  paste.value = incoming;

  // ---- 1. 체스닷컴 ----
  const userInput = h('input', { type: 'text', placeholder: '체스닷컴 아이디', value: st.myName || '' });
  const fetchBtn = h('button.btn.primary', { onclick: () => fetchChessCom() }, '최근 경기 불러오기');
  b.appendChild(h('div.card',
    h('h3', '♞ 체스닷컴에서 자동으로'),
    h('p.sub.mb', '아이디만 넣으면 최근 경기를 불러옵니다. 공개 API라 로그인은 필요 없습니다.'),
    h('div.row', { style: 'gap:8px' }, h('div', { style: 'flex:1' }, userInput)),
    h('div.mt', fetchBtn),
  ));

  // ---- 2. 붙여넣기 / 파일 ----
  b.appendChild(h('div.card',
    h('h3', '📋 PGN 직접 넣기'),
    h('p.sub.mb', incoming ? '공유받은 PGN이 채워졌습니다. 확인 후 추가하세요.' : '앱 목록에서 "체스 복기왕"으로 공유해도 여기로 들어옵니다.'),
    paste,
    h('div.btn-row.mt',
      h('button.btn.primary', { onclick: () => addFromText(paste.value) }, '이 PGN 추가'),
      isApp ? h('button.btn', { onclick: () => fromFile() }, '📁 파일에서') : null),
  ));

  b.appendChild(listBox);

  if (incoming) setTimeout(() => addFromText(incoming, true), 60);

  /* ---------------- 동작 ---------------- */

  async function fetchChessCom() {
    const user = userInput.value.trim();
    if (!user) return toast('아이디를 입력하세요');
    await setSetting('myName', user);
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<span class="spin"></span> 불러오는 중…';
    try {
      const now = new Date();
      let games = [];
      for (let back = 0; back < 3 && games.length < 12; back++) {
        const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
        try {
          const txt = await httpGet(chessComUrl(user, d.getFullYear(), d.getMonth() + 1));
          const j = JSON.parse(txt);
          games = (j.games || []).concat(games);
        } catch (e) { /* 그 달은 없을 수 있다 */ }
      }
      if (!games.length) throw new Error('경기를 찾지 못했습니다 (아이디를 확인하세요)');
      games.sort((a, b2) => (b2.end_time || 0) - (a.end_time || 0));
      showCandidates(games.slice(0, 20).map((g) => g.pgn).filter(Boolean), 'chess.com');
    } catch (e) {
      toast(String(e.message || e));
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = '최근 경기 불러오기';
    }
  }

  async function fromFile() {
    try {
      const f = await pickFile();
      if (/^\s*\{/.test(f.content)) return toast('백업 파일은 설정 → 데이터 이전에서 불러오세요');
      addFromText(f.content);
    } catch (e) { /* 취소 */ }
  }

  function addFromText(text, silent) {
    const parts = splitPgn(text);
    if (!parts.length) { if (!silent) toast('PGN을 찾지 못했습니다'); return; }
    showCandidates(parts, 'pgn');
  }

  async function showCandidates(pgns, source) {
    const existing = await store.allGames();
    const have = new Set(existing.map((g) => g.fp));
    const items = [];
    for (const p of pgns) {
      try {
        const info = peek(p);
        const fp = fingerprint(info.sans);
        items.push({ pgn: p, meta: info.meta, fp, dup: have.has(fp), plies: info.sans.length, sel: !have.has(fp) });
      } catch (e) { /* 못 읽는 판은 건너뛴다 */ }
    }
    if (!items.length) return toast('읽을 수 있는 경기가 없습니다');

    listBox.innerHTML = '';
    const newCount = items.filter((i) => !i.dup).length;
    const head = h('div.row.mb', h('h3', `가져올 경기 ${items.length}판`), h('div.spacer'),
      h('button.btn.sm.ghost', { onclick: () => { items.forEach((i) => { i.sel = !i.dup; }); paint(); } }, '새 경기만'));
    const rows = h('div');
    const go = h('button.btn.primary.wide.mt', { onclick: () => runAnalysis(items.filter((i) => i.sel), source) }, '분석 시작');
    listBox.appendChild(h('div.card', head, rows,
      h('p.dim.mt', `이미 있는 경기 ${items.length - newCount}판은 기본으로 빼두었습니다.`), go));

    function paint() {
      rows.innerHTML = '';
      for (const it of items) {
        const box = h('div.row', {
          style: 'padding:9px 0;border-bottom:1px solid var(--line)',
          onclick: () => { it.sel = !it.sel; paint(); },
        },
          h('div', { style: `width:22px;font-size:1.1rem;color:${it.sel ? 'var(--accent)' : 'var(--dim)'}` }, it.sel ? '☑' : '☐'),
          h('div', { style: 'flex:1;min-width:0' },
            h('div', { style: 'font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
              `${it.meta.white} vs ${it.meta.black}`),
            h('div.dim', `${it.meta.date || ''} · ${resultKo(it.meta.result)} · ${Math.ceil(it.plies / 2)}수`
              + (it.dup ? ' · 이미 있음' : ''))));
        rows.appendChild(box);
      }
      const n = items.filter((i) => i.sel).length;
      go.textContent = n ? `${n}판 분석 시작` : '선택된 경기 없음';
      go.disabled = !n;
    }
    paint();
    listBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function runAnalysis(items, source) {
    if (!items.length) return;
    if (!isApp) return toast('엔진 분석은 앱에서만 가능합니다');
    const st2 = await settings();
    const signal = { cancelled: false };
    const pb = progressBar();
    const cancel = h('button.btn.wide.mt', { onclick: () => { signal.cancelled = true; toast('취소하는 중…'); } }, '취소');
    const panel = h('div.card', h('h3', '🔎 엔진 분석중'),
      h('p.sub', '수마다 스톡피시가 최선수를 계산합니다. 화면을 꺼도 됩니다.'),
      pb.root, cancel);
    listBox.innerHTML = '';
    listBox.appendChild(panel);
    keepAwake(true);

    let done = 0, added = 0;
    const total = items.length;
    try {
      for (const it of items) {
        pb.set(done / total * 100, `${done + 1}/${total}판 — 준비중`);
        await analyzeAndSave(it.pgn, {
          source, signal, movetime: st2.movetime,
          onProgress: ({ phase, i, n }) => {
            const inner = n ? i / n : 0;
            const label = phase === 'scan' ? `${i}/${n}수 분석`
              : phase === 'deep' ? `실수 정밀 재검증 ${i}/${n}`
              : `명수 판정 ${i}/${n}`;
            const weight = phase === 'scan' ? 0.75 : phase === 'deep' ? 0.2 : 0.05;
            const base = phase === 'scan' ? 0 : phase === 'deep' ? 0.75 : 0.95;
            pb.set(((done + base + inner * weight) / total) * 100,
              `${done + 1}/${total}판 · ${it.meta.white} vs ${it.meta.black} — ${label}`);
          },
        });
        done++; added++;
        invalidate();
      }
      pb.set(100, '완료');
      play('win', st2.sound);
      toast(`${added}판 분석 완료`);
      nav('/');
      adBreak('analysis');   // 분석이 끝나 손을 놓은 순간 — 광고를 넣기에 가장 덜 방해되는 지점
    } catch (e) {
      if (signal.cancelled) {
        toast(added ? `${added}판까지 저장하고 중단했습니다` : '취소했습니다');
        if (added) nav('/');
      } else {
        panel.appendChild(h('div.card.err.mt', h('b', '분석 실패'), h('p.sub', String(e.message || e))));
      }
    } finally {
      keepAwake(false);
      cancel.remove();
    }
  }
}
