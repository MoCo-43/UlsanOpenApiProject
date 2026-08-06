/**
 * 울산 OO배수지(가상) 설비 구성 및 센서 매핑.
 *
 * ── 중요 ──────────────────────────────────────────────────────────
 * 공공 Open API는 배수지 내부 센서값을 제공하지 않는다.
 * 따라서 실제로 수집 가능한 기상·대기질 관측값을 설비 센서의
 * '대체 입력'으로 환산해 프로토타입을 구성한다.
 * 매핑 근거는 각 항목의 rationale에 기록했고 README와 화면에도 노출한다.
 *
 * 실제 현장 적용 시에는 이 파일의 매핑 계층만 SCADA 태그로 교체하면
 * 표준화·3D·이상탐지 로직은 전혀 손대지 않아도 된다. 이 분리가 설계의 핵심이다.
 * ─────────────────────────────────────────────────────────────────
 */

export const PLANT_NAME = '울산 OO배수지';
export const PLANT_REGION = '울산광역시';

/** @type {import('./types.js').Equipment[]} */
export const EQUIPMENTS = [
  {
    id: 'TANK-01',
    name: '정수 저수조',
    kind: 'tank',
    position: [-4.5, 0, 0],
    note: '유효용량 500㎥. 유입 후 배수 전 저류.',
  },
  {
    id: 'PUMP-01',
    name: '1호 가압펌프',
    kind: 'pump',
    position: [1.5, 0, -2.2],
    note: '입축 원심펌프. 배수 계통 송수 담당.',
  },
  {
    id: 'VALVE-01',
    name: '유출 제어밸브',
    kind: 'valve',
    position: [1.5, 0, 2.2],
    note: '전동 버터플라이 밸브. 유출 유량 조절.',
  },
  {
    id: 'PIPE-01',
    name: '유입 관로',
    kind: 'pipe',
    position: [-1.4, 0.6, 0],
    note: 'DN300 도복장 강관. 취수장에서 저수조로 송수.',
  },
  {
    id: 'FILTER-01',
    name: '전처리 여과설비',
    kind: 'filter',
    position: [5.2, 0, 0],
    note: '흡기 필터 및 약품주입 전단 여과.',
  },
];

export const EQUIPMENT_BY_ID = new Map(EQUIPMENTS.map((e) => [e.id, e]));

/**
 * @typedef {Object} SensorSpec
 * @property {string} originCode   원본 코드. 어댑터가 이 키로 매칭한다.
 * @property {string} sensorId
 * @property {string} equipmentId
 * @property {string} type
 * @property {string} label
 * @property {string} unit
 * @property {(raw:number)=>number} [transform]  원본값 → 설비 센서값 환산식
 * @property {{warnLow?:number,critLow?:number,warnHigh?:number,critHigh?:number}} thresholds
 * @property {string} rationale    매핑 채택 근거
 */

/** @type {SensorSpec[]} */
export const SENSOR_SPECS = [
  {
    originCode: 'KMA:T1H',
    sensorId: 'TANK-01-WATER_TEMP',
    equipmentId: 'TANK-01',
    type: 'temperature',
    label: '저수조 수온',
    unit: '℃',
    transform: (t) => round(t * 0.55 + 8.5),
    thresholds: { critLow: 2, warnLow: 4, warnHigh: 22, critHigh: 25 },
    rationale:
      '외기온(T1H)에 수체 열관성 계수 0.55와 지중 기저온도 8.5℃를 적용. 동절기 동결(2℃)과 하절기 미생물 번식 우려(25℃)를 임계값으로 설정.',
  },
  {
    originCode: 'KMA:T1H',
    sensorId: 'PUMP-01-BEARING_TEMP',
    equipmentId: 'PUMP-01',
    type: 'temperature',
    label: '펌프 베어링 온도',
    unit: '℃',
    transform: (t) => round(t * 0.8 + 32),
    thresholds: { warnHigh: 55, critHigh: 65 },
    rationale:
      '베어링 온도를 외기온 상승분에 운전 발열을 더한 값으로 근사. 그리스 열화 시작(55℃)과 제조사 경보 기준(65℃)을 적용.',
  },
  {
    originCode: 'KMA:REH',
    sensorId: 'PUMP-01-ROOM_HUMIDITY',
    equipmentId: 'PUMP-01',
    type: 'humidity',
    label: '펌프실 습도',
    unit: '%',
    thresholds: { warnHigh: 80, critHigh: 90 },
    rationale:
      '펌프실이 외기 환기 구조이므로 외기 습도(REH)와 직결. 결로에 의한 전동기 절연저하 위험 구간을 80/90%로 설정.',
  },
  {
    originCode: 'KMA:RN1',
    sensorId: 'PIPE-01-INFLOW',
    equipmentId: 'PIPE-01',
    type: 'flow',
    label: '유입 유량',
    unit: '㎥/h',
    transform: (rain) => round(120 + rain * 18),
    thresholds: { critLow: 30, warnLow: 60, warnHigh: 200, critHigh: 240 },
    rationale:
      '1시간 강수량(RN1)을 유역 유입 증가 인자로 사용. 기저유량 120㎥/h에 강수 1mm당 18㎥/h 가산. 관로 설계유량 240㎥/h를 위험 기준으로 설정.',
  },
  {
    originCode: 'KMA:RN1',
    sensorId: 'TANK-01-LEVEL',
    equipmentId: 'TANK-01',
    type: 'level',
    label: '저수조 수위',
    unit: '%',
    transform: (rain) => Math.min(100, round(72 + rain * 4.5)),
    thresholds: { critLow: 25, warnLow: 40, warnHigh: 90, critHigh: 95 },
    rationale:
      '강수량 증가에 따른 유입량 증가로 수위가 상승하는 상황을 모사. 정상 운전 수위 72%를 기저로 저수위 경보(40%)와 월류 위험(95%)을 설정.',
  },
  {
    originCode: 'KMA:WSD',
    sensorId: 'VALVE-01-DIFF_PRESSURE',
    equipmentId: 'VALVE-01',
    type: 'pressure',
    label: '밸브 차압',
    unit: 'bar',
    transform: (w) => round(1.8 + w * 0.12, 2),
    thresholds: { critLow: 0.8, warnLow: 1.2, warnHigh: 3.0, critHigh: 3.5 },
    rationale:
      '실측 차압 센서가 없어 풍속(WSD)을 변동 인자로 사용한 시뮬레이션 값. 배수지 표준 운전압 1.8bar 기준, 수격 위험 3.5bar를 상한으로 설정. 7개 매핑 중 물리적 상관성이 가장 약한 항목으로, 실제 적용 시 최우선 교체 대상.',
  },
  {
    originCode: 'AIRKOREA:PM10',
    sensorId: 'FILTER-01-LOAD',
    equipmentId: 'FILTER-01',
    type: 'load',
    label: '여과설비 부하율',
    unit: '%',
    transform: (pm10) => Math.min(100, round(25 + pm10 * 0.6)),
    thresholds: { warnHigh: 70, critHigh: 85 },
    rationale:
      '대기 중 PM10 농도가 흡기 필터 폐색 속도에 직접 영향. 기저 부하 25%에 농도 계수 0.6 적용. 교체 권고(70%)와 즉시 교체(85%) 구간을 설정.',
  },
];

/** 원본 코드로 센서 사양들을 조회 (1:N — T1H는 2개 센서에 쓰인다) */
export function specsFor(originCode) {
  return SENSOR_SPECS.filter((s) => s.originCode === originCode);
}

/** 설비 위치 문자열 — SensorData.location에 사용 */
export function locationOf(equipmentId) {
  const eq = EQUIPMENT_BY_ID.get(equipmentId);
  return eq ? `${PLANT_NAME} · ${eq.name}` : PLANT_NAME;
}

/** 임계값 대비 상태 판정 */
export function judge(value, t) {
  if (value === null || Number.isNaN(value)) return 'unknown';
  if (t.critLow !== undefined && value <= t.critLow) return 'danger';
  if (t.critHigh !== undefined && value >= t.critHigh) return 'danger';
  if (t.warnLow !== undefined && value <= t.warnLow) return 'warning';
  if (t.warnHigh !== undefined && value >= t.warnHigh) return 'warning';
  return 'normal';
}

function round(n, d = 1) {
  return Math.round(n * 10 ** d) / 10 ** d;
}
