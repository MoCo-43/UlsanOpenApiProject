import { fetchJson, OpenApiError, serviceKey } from '../fetcher.js';
import { airKoreaToIso } from '../time.js';
import { buildSensorData, parseValue } from './base.js';

/**
 * 에어코리아 시도별 실시간 측정정보 — 울산.
 *
 * 엔드포인트 주의: 서비스명은 ArpltnInforInqireSvc이다.
 * 일부 예제 코드에 ArpltnInqirySvc로 표기된 경우가 있으나 존재하지 않는
 * 경로이며, 인증키가 정상이어도 NO_OPENAPI_SERVICE_ERROR(코드 12)가 반환된다.
 * 실제 호출로 확인해 확정했다.
 *
 * 이 API는 울산 내 여러 측정소를 한 번에 반환한다.
 * 배수지 1개소를 대상으로 하므로 대표값 1건을 선정해야 한다.
 * 평균을 쓰면 고장 측정소의 이상값에 끌려가므로
 * 'PM10 유효값을 가진 첫 측정소'를 대표로 채택했다.
 */

const ENDPOINT =
  'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty';

export const airKoreaAdapter = {
  id: 'AIRKOREA',
  name: '에어코리아 대기오염정보',
  sourceUrl: 'https://www.data.go.kr/data/15073861/openapi.do',

  async fetchRaw() {
    const params = new URLSearchParams({
      serviceKey: serviceKey(), // 디코딩 키. URLSearchParams가 인코딩을 담당한다.
      returnType: 'json',
      numOfRows: '30',
      pageNo: '1',
      sidoName: process.env.AIRKOREA_SIDO ?? '울산',
      ver: '1.0',
    });

    const json = await fetchJson(`${ENDPOINT}?${params}`, { timeoutMs: 5000, retries: 2 });

    const header = json?.response?.header;
    if (!header) throw new OpenApiError('format', '응답 구조가 예상과 다릅니다.');
    if (header.resultCode !== '00') {
      throw new OpenApiError('service', `${header.resultCode} ${header.resultMsg}`);
    }
    return json;
  },

  toSensorData(raw, collectedAt) {
    const items = raw?.response?.body?.items ?? [];

    // 중복 처리: 같은 측정소가 중복 수록되는 사례가 있어 먼저 제거한다.
    const unique = new Map();
    for (const it of items) {
      if (!unique.has(it.stationName)) unique.set(it.stationName, it);
    }

    const rep = pickStation([...unique.values()]);
    if (!rep) return { sensors: [], rejected: [] };

    const observedAt = airKoreaToIso(rep.dataTime ?? '');
    const readings = [
      { code: 'PM10', rawValue: rep.pm10Value ?? null, observedAt },
      { code: 'PM25', rawValue: rep.pm25Value ?? null, observedAt },
    ];
    return buildSensorData(airKoreaAdapter, readings, collectedAt);
  },
};

function pickStation(list) {
  return list.find((it) => parseValue(it.pm10Value) !== null) ?? list[0] ?? null;
}

/** 대표 측정소명을 1단계 화면에 노출하기 위한 헬퍼 */
export function representativeStation(raw) {
  const items = raw?.response?.body?.items ?? [];
  return pickStation(items)?.stationName ?? '-';
}
