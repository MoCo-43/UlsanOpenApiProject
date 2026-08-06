/**
 * 운영자용 문장을 자동 생성할 때 '수온이(가)' 같은 표기가 나오면
 * 제어실 게시 문서로 쓸 수 없다. 받침 유무를 판별해 조사를 확정한다.
 */

/** 마지막 글자에 받침이 있는지 판별 */
export function hasFinalConsonant(word) {
  const ch = String(word).trim().slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);

  // 한글 음절 영역: (코드 - 0xAC00) % 28 이 0이면 받침 없음
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;

  // 숫자는 읽는 소리 기준 (0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 → 받침 있음)
  if (ch >= '0' && ch <= '9') return ['0', '1', '3', '6', '7', '8'].includes(ch);

  // ℃, %, bar 등 단위 기호는 받침 없음으로 처리
  return false;
}

export const ga = (w) => (hasFinalConsonant(w) ? '이' : '가');
export const neun = (w) => (hasFinalConsonant(w) ? '은' : '는');
export const reul = (w) => (hasFinalConsonant(w) ? '을' : '를');

/** (으)로 — ㄹ 받침(종성 8)은 '로' */
export function ro(w) {
  const ch = String(w).trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? '로' : '으로';
  }
  return '로';
}
