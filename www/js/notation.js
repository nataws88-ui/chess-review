/* 기보 표기 — 글자(SAN) ↔ 그림기물(피규린).
 * Chessis 의 "Figurine Notation" 이식. Nf3 → ♘f3 처럼 기물 글자를 그림으로 바꾼다.
 * 언어를 안 타는 표기라 한국어 화면에서 오히려 읽기 쉽다. */

const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
const FIG_B = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };

/** SAN → 피규린 표기. 'B' 는 비숍이지만 'b' 는 b열이므로 대문자만 바꾼다 */
export function figurine(san, black = false) {
  if (!san) return san;
  const t = black ? FIG_B : FIG;
  return String(san).replace(/^([KQRBN])/, (m) => t[m] || m)
    .replace(/=([QRBN])/, (m, p) => '=' + (t[p] || p));
}

const KO = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트' };

/** SAN → 한국어 읽기 ("Nf3" → "나이트 f3") — 소리내어 읽어 줄 때 */
export function sanKo(san) {
  if (!san) return '';
  if (san === 'O-O') return '킹사이드 캐슬링';
  if (san === 'O-O-O') return '퀸사이드 캐슬링';
  const m = /^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(=[QRBN])?([+#])?$/.exec(san);
  if (!m) return san;
  const piece = m[1] ? KO[m[1]] : '폰';
  const cap = m[3] ? ' 잡기 ' : ' ';
  const promo = m[5] ? ' ' + KO[m[5][1]] + ' 승격' : '';
  const chk = m[6] === '#' ? ' 체크메이트' : m[6] === '+' ? ' 체크' : '';
  return piece + cap + m[4] + promo + chk;
}
