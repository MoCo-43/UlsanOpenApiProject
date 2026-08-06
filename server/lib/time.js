/**
 * 배포 환경(Render, Railway 등)은 대부분 UTC로 동작
 * 기상청 API는 KST 기준 base_date/base_time을 요구하므로
 * 서버 로컬시각을 그대로 쓰면 9시간이 어긋나 조회가 실패
 * 따라서 time.js에서는 KST를 명시적으로 계산
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

/** 현재 시각을 KST 기준으로 계산한 Date (UTC 필드에 KST 값이 담긴다) */
export function nowKst() {
  return new Date(Date.now() + KST_OFFSET_MS);
}

/**
 * 기상청 초단기실황 base_date / base_time 계산.
 * 매시 30분에 생성되어 40분부터 제공되므로, 40분 이전이면 한 시간 전을 사용
 */
export function kmaBaseDateTime() {
  const t = nowKst();
  if (t.getUTCMinutes() < 40) t.setUTCHours(t.getUTCHours() - 1);
  return {
    baseDate: `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`,
    baseTime: `${pad(t.getUTCHours())}00`,
  };
}

/** '20260805' + '1400' → '2026-08-05T14:00:00+09:00' */
export function kmaToIso(baseDate, baseTime) {
  return `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-${baseDate.slice(6, 8)}T${baseTime.slice(0, 2)}:${baseTime.slice(2, 4)}:00+09:00`;
}

/** '2026-08-05 14:00' → '2026-08-05T14:00:00+09:00' (에어코리아 형식) */
export function airKoreaToIso(dataTime) {
  const m = String(dataTime)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return isoNowKst();
  const [, y, mo, d, hh, mi] = m;
  // 에어코리아는 자정을 '24:00'으로 표기하는 경우가 있어 다음 날 00:00으로 보정
  if (hh === "24") {
    const next = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + 1));
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:${mi}:00+09:00`;
  }
  return `${y}-${mo}-${d}T${hh}:${mi}:00+09:00`;
}

/** 현재 시각을 KST 오프셋이 붙은 ISO 8601 문자열로 반환 */
export function isoNowKst() {
  const t = nowKst();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+09:00`;
}
