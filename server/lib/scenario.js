import { judge, SENSOR_SPECS } from './plant.js';

/**
 * 4단계 제출 결과물: '이상 상황 재현 시나리오 및 결과 화면'.
 *
 * 실제 울산 기상은 대부분 정상 범위라 평가 시점에 경보 화면을 못 볼 수 있다.
 * 임계값을 임시로 낮춰 촬영하는 방법은 판정 기준 자체가 바뀌어
 * 근거 문장의 숫자가 실제 운전 기준과 달라지므로 채택하지 않았다.
 *
 * 대신 실제 API 값을 그대로 가져오되 지정한 센서의 값만 덮어써
 * 임계값·탐지 로직·문장 생성은 운영과 완전히 동일하게 동작시킨다.
 * 재현 중임은 응답의 scenario 필드와 화면 배너로 명시한다.
 *
 * 사용: GET /api/sensors?scenario=heatwave
 */

export const SCENARIOS = [
  {
    id: 'heatwave',
    name: '혹서기 수온 상승',
    note: '외기온 급등으로 저수조 수온과 펌프 베어링 온도가 동반 상승한 상황',
    overrides: {
      'TANK-01-WATER_TEMP': 27.6,
      'PUMP-01-BEARING_TEMP': 61.2,
      'PUMP-01-ROOM_HUMIDITY': 92,
    },
  },
  {
    id: 'heavy_rain',
    name: '집중호우 유입 급증',
    note: '단시간 강우로 유입 유량과 저수조 수위가 동시에 상승한 상황',
    overrides: {
      'PIPE-01-INFLOW': 252,
      'TANK-01-LEVEL': 96.5,
      'VALVE-01-DIFF_PRESSURE': 3.62,
    },
  },
  {
    id: 'dust_storm',
    name: '고농도 미세먼지',
    note: '대기 중 PM10 급증으로 흡기 필터 폐색이 진행된 상황',
    overrides: {
      'FILTER-01-LOAD': 93.4,
    },
  },
  {
    id: 'low_water',
    name: '저수위 경보',
    note: '상류 취수 중단으로 유입이 끊기고 저수위가 형성된 상황',
    overrides: {
      'PIPE-01-INFLOW': 24,
      'TANK-01-LEVEL': 22,
    },
  },
];

const BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

/**
 * 시나리오를 적용해 센서값을 덮어쓴다.
 * 상태 판정은 실제 임계값으로 다시 계산하므로 탐지 로직은 그대로 동작한다.
 *
 * @param {import('./types.js').SensorData[]} sensors
 * @param {string} scenarioId
 * @returns {{id:string,name:string,note:string,sensors:import('./types.js').SensorData[]}|null}
 */
export function applyScenario(sensors, scenarioId) {
  const sc = BY_ID.get(scenarioId);
  if (!sc) return null;

  const patched = sensors.map((s) => {
    const value = sc.overrides[s.sensorId];
    if (value === undefined) return s;

    const spec = SENSOR_SPECS.find((x) => x.sensorId === s.sensorId);
    const status = judge(value, spec?.thresholds ?? {});

    return {
      ...s,
      value,
      status,
      isAnomaly: status !== 'normal',
      // 재현 값임을 데이터 자체에도 남긴다.
      originValue: `${s.originValue} (시나리오 재현)`,
    };
  });

  return { id: sc.id, name: sc.name, note: sc.note, sensors: patched };
}
