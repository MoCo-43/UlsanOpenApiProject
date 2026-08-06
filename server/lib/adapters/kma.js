import { fetchJson, OpenApiError, serviceKey } from '../fetcher.js';
import { kmaBaseDateTime, kmaToIso } from '../time.js';
import { buildSensorData } from './base.js';

const ENDPOINT =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

/** 1단계 화면에서 원본 코드를 사람이 읽게 하기 위한 코드표 */
export const KMA_CATEGORY_LABEL = {
  T1H: { name: '기온', unit: '℃' },
  RN1: { name: '1시간 강수량', unit: 'mm' },
  REH: { name: '습도', unit: '%' },
  PTY: { name: '강수형태', unit: '코드' },
  WSD: { name: '풍속', unit: 'm/s' },
  VEC: { name: '풍향', unit: 'deg' },
  UUU: { name: '동서바람성분', unit: 'm/s' },
  VVV: { name: '남북바람성분', unit: 'm/s' },
};

/** 기상청 초단기실황 — 울산광역시 격자 (nx=102, ny=84) */
export const kmaAdapter = {
  id: 'KMA',
  name: '기상청 초단기실황',
  sourceUrl: 'https://www.data.go.kr/data/15084084/openapi.do',

  async fetchRaw() {
    const { baseDate, baseTime } = kmaBaseDateTime();

    // serviceKey는 반드시 '디코딩' 키를 넣어야 한다.
    // URLSearchParams가 인코딩을 수행하므로 인코딩 키를 넣으면 이중 인코딩된다.
    const params = new URLSearchParams({
      serviceKey: serviceKey(),
      pageNo: '1',
      numOfRows: '20',
      dataType: 'JSON',
      base_date: baseDate,
      base_time: baseTime,
      nx: process.env.KMA_NX ?? '102',
      ny: process.env.KMA_NY ?? '84',
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
    const items = raw?.response?.body?.items?.item ?? [];
    const readings = items.map((it) => ({
      code: it.category,
      rawValue: it.obsrValue,
      observedAt: kmaToIso(it.baseDate, it.baseTime),
    }));
    return buildSensorData(kmaAdapter, readings, collectedAt);
  },
};
