/* 퍼즐 꾸러미 합치기 + 주제 딱지 다시 붙이기.
 *   node tools/mergepuzzles.mjs <입력1.js> [입력2.js …] > 필요없음 — www/js/puzzledata.js 로 쓴다
 *
 * 여러 번 나눠 캔 꾸러미를 하나로 모으고, 같은 국면은 버리고,
 * 주제는 지금 puzzles.js 의 규칙으로 다시 매긴다(규칙이 나아지면 옛 딱지가 어긋나므로).
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { tagThemes, guessRating } = await import('../www/js/puzzles.js');
const { Chess } = await import('../www/js/lib/chess.js');

const inputs = process.argv.slice(2);
if (!inputs.length) { console.error('입력 파일을 주세요'); process.exit(1); }

const all = [];
for (const f of inputs) {
  const m = await import(pathToFileURL(resolve(f)).href);
  for (const p of m.PACK) all.push(p);
}

const seen = new Set();
const out = [];
let dropped = 0, retagged = 0;

for (const p of all) {
  const key = p.f.split(' ').slice(0, 4).join(' ');
  if (seen.has(key)) { dropped++; continue; }
  let ucis = p.m.split(' ');

  /* 메이트로 끝나지 않는 수순은 내 수 세 번까지만 남긴다.
   * 재료를 이미 벌어 놓은 뒤로도 계속 시키면 문제가 지루해지고,
   * 뒤로 갈수록 「이 수 하나뿐」이 아니게 되어 오답 판정이 억울해진다. */
  {
    const c0 = new Chess(p.f);
    let mated = false;
    for (const u of ucis) {
      try { c0.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined }); } catch (e) { break; }
    }
    mated = c0.isCheckmate();
    if (!mated && ucis.length > 6) ucis = ucis.slice(0, 6);      // 실수 1 + 내 수 3 + 응수 2
    if (ucis.length % 2 === 1) ucis = ucis.slice(0, ucis.length - 1);  // 내 수로 끝나게
  }

  // 끝까지 두어 보며 합법인지 확인하고, 메이트로 끝나는지 본다
  const c = new Chess(p.f);
  let okAll = true;
  for (const u of ucis) {
    let mv = null;
    try { mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined }); } catch (e) { mv = null; }
    if (!mv) { okAll = false; break; }
  }
  if (!okAll) { dropped++; continue; }

  const heroPlies = Math.ceil((ucis.length - 1) / 2);
  const mateIn = c.isCheckmate() ? heroPlies : null;
  const oldThemes = p.t.split(' ');
  const gain = oldThemes.includes('crushing') ? 600 : 300;
  const themes = tagThemes(p.f, ucis, mateIn, gain);
  if (themes.join(' ') !== p.t) retagged++;

  // 난이도도 지금 규칙으로 다시 매긴다 (수순을 잘라 냈으면 어차피 달라진다)
  const rating = guessRating(mateIn, gain, heroPlies, themes);
  seen.add(key);
  out.push({ ...p, r: rating, m: ucis.join(' '), t: themes.join(' ') });
}

/* 긴 메이트 문제의 꼬리에서 「한 수 메이트」를 뽑아 낸다.
 * 초보가 처음 푸는 문제가 한 수 메이트인데, 엔진끼리 두면 한 수 메이트를
 * 통째로 허용하는 일이 드물어 그냥 캐서는 거의 안 나온다.
 * 세 수 메이트의 마지막 대목은 그 자체로 완전한 한 수 메이트 문제다. */
const derived = [];
for (const p of out) {
  const ucis = p.m.split(' ');
  if (ucis.length < 4) continue;
  const c = new Chess(p.f);
  let ok2 = true;
  for (const u of ucis) {
    try { if (!c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined })) { ok2 = false; break; } } catch (e) { ok2 = false; break; }
  }
  if (!ok2 || !c.isCheckmate()) continue;

  // 마지막 두 수(상대 응수 + 내 마무리) 직전 국면
  const head = new Chess(p.f);
  for (const u of ucis.slice(0, ucis.length - 2)) {
    try { head.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined }); } catch (e) { ok2 = false; break; }
  }
  if (!ok2) continue;
  const fen = head.fen();
  const key = fen.split(' ').slice(0, 4).join(' ');
  if (seen.has(key)) continue;
  const tail = ucis.slice(ucis.length - 2);
  const themes = tagThemes(fen, tail, 1, 100000);
  seen.add(key);
  derived.push({ id: 'x', r: guessRating(1, 100000, 1, themes), f: fen, m: tail.join(' '), t: themes.join(' ') });
}
out.push(...derived);
console.log(`   꼬리에서 뽑은 한 수 메이트 ${derived.length}개`);

out.sort((a, b) => a.r - b.r);
out.forEach((p, i) => { p.id = 'p' + (i + 1).toString().padStart(4, '0'); });

const counts = new Map();
for (const p of out) for (const t of p.t.split(' ')) counts.set(t, (counts.get(t) || 0) + 1);

const body = out.map((p) =>
  `  { id: '${p.id}', r: ${p.r}, f: '${p.f}', m: '${p.m}', t: '${p.t}' },`).join('\n');

writeFileSync('www/js/puzzledata.js', `/* 기본 퍼즐 꾸러미 — tools/genpuzzles.mjs 로 캐고 tools/mergepuzzles.mjs 로 모은다.
 * 손으로 고치지 말 것.
 *
 * 스톡피시끼리 낮은 실력으로 둔 판에서 캔 실수 ${out.length}개.
 * 하나하나 「그 수 하나만 결정적으로 이긴다」를 깊이 16 · 후보 2개로 확인했고,
 * 저장 전에 수순을 끝까지 다시 두어 합법인지 검산했다.
 *   f=국면(상대가 실수하기 직전) · m=수순(첫 수는 상대의 실수, 그 다음부터 내가 푼다)
 *   r=짐작 난이도 · t=주제
 */

export const PACK = [
${body}
];

export function unpack(p) {
  return { id: p.id, fen: p.f, moves: p.m.split(' '), rating: p.r, themes: p.t.split(' '), src: 'pack' };
}

export const PACK_PUZZLES = PACK.map(unpack);
`, 'utf8');

console.log(`✅ ${all.length}개 중 ${out.length}개 저장 (겹치거나 깨진 것 ${dropped}개 버림, 주제 다시 매긴 것 ${retagged}개)`);
console.log('주제별:', [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
