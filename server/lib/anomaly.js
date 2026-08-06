import { SENSOR_SPECS, EQUIPMENT_BY_ID } from './plant.js';
import { ga, reul } from './korean.js';

/**
 * 4단계 이상탐지.
 *
 * 세 가지 방법을 독립적으로 적용하고 결과를 합친다.
 *   1) 임계값 판정  — 절대 기준. 표본 1개로 즉시 판단
 *   2) Z-score      — 관측 이력 대비 통계적 이탈. 표본 5개 이상
 *   3) 변화율       — 직전 값 대비 급변. 표본 2개 이상
 *
 * 공공 API는 단일 시점 스냅샷만 주므로 2·3을 쓰려면 이력이 필요하다.
 * 이력은 서버 메모리에 센서별 최근 30개까지 유지한다.
 */

const HISTORY_MAX = 30;

/** @type {Map<string, number[]>} sensorId → 최근 값 배열 (오래된 것부터) */
const history = new Map();

/**
 * 수집된 센서값을 이력에 누적한다.
 * 같은 관측시각이 반복 조회되면 이력이 오염되므로,
 * 직전 값과 동일하면 넣지 않는다.
 */
export function pushHistory(sensors) {
  for (const s of sensors) {
    if (typeof s.value !== 'number') continue;
    const arr = history.get(s.sensorId) ?? [];
    if (arr[arr.length - 1] !== s.value) arr.push(s.value);
    history.set(s.sensorId, arr.slice(-HISTORY_MAX));
  }
}

/** 화면에서 스파크라인 등에 쓸 수 있도록 이력을 내보낸다. */
export function historySnapshot() {
  return Object.fromEntries(history);
}

export function resetHistory() {
  history.clear();
}

const METHOD_ORDER = { threshold: 0, zscore: 1, rate_of_change: 2 };
const SEVERITY_ORDER = { danger: 0, warning: 1 };

/**
 * @typedef {Object} Finding
 * @property {string} sensorId
 * @property {'threshold'|'zscore'|'rate_of_change'} method
 * @property {'warning'|'danger'} severity
 * @property {string} evidence  판단 근거 (숫자로 검증 가능한 문장만)
 * @property {string} cause     추정 원인
 */

/**
 * @param {import('./types.js').SensorData[]} sensors
 * @returns {Finding[]}
 */
export function detect(sensors) {
  const findings = [];

  for (const s of sensors) {
    if (typeof s.value !== 'number') continue;

    const spec = SENSOR_SPECS.find((x) => x.sensorId === s.sensorId);
    if (!spec) continue;

    const past = history.get(s.sensorId) ?? [];

    // ── 1) 임계값 판정 ──────────────────────────────────
    if (s.status === 'warning' || s.status === 'danger') {
      const t = spec.thresholds;
      const isHigh =
        (t.critHigh !== undefined && s.value >= t.critHigh) ||
        (t.warnHigh !== undefined && s.value >= t.warnHigh);

      const bound = isHigh
        ? s.status === 'danger'
          ? t.critHigh
          : t.warnHigh
        : s.status === 'danger'
          ? t.critLow
          : t.warnLow;

      findings.push({
        sensorId: s.sensorId,
        method: 'threshold',
        severity: s.status,
        evidence: `측정값 ${s.value}${s.unit}${ga(s.unit)} ${
          s.status === 'danger' ? '위험' : '주의'
        } 기준 ${bound}${s.unit}${reul(s.unit)} ${isHigh ? '초과' : '미달'}했습니다.`,
        cause: causeOf(s, isHigh),
      });
    }

    // ── 2) Z-score ─────────────────────────────────────
    if (past.length >= 5) {
      const mean = avg(past);
      // 표준편차 하한: 값이 거의 변하지 않는 신호는 sd가 0에 수렴해
      // Z-score가 수십으로 폭주하고 정상 변동까지 이상으로 잡힌다.
      // 평균의 2% 또는 0.05 중 큰 값을 하한으로 둔다.
      const floor = Math.max(Math.abs(mean) * 0.02, 0.05);
      const sd = Math.max(stddev(past, mean), floor);
      const z = (s.value - mean) / sd;

      if (Math.abs(z) >= 2.5) {
        findings.push({
          sensorId: s.sensorId,
          method: 'zscore',
          severity: Math.abs(z) >= 3 ? 'danger' : 'warning',
          evidence: `최근 ${past.length}회 관측 평균 ${round(mean)}${s.unit}, 표준편차 ${round(sd, 2)} 대비 Z=${round(z, 2)}로 통계적 이탈 범위입니다.`,
          cause:
            z > 0
              ? '상승 추세가 평소 변동 폭을 벗어났습니다. 계통 부하 증가 또는 센서 드리프트가 의심됩니다.'
              : '하강 추세가 평소 변동 폭을 벗어났습니다. 계통 누수 또는 센서 단선이 의심됩니다.',
        });
      }
    }

    // ── 3) 변화율 ──────────────────────────────────────
    if (past.length >= 1) {
      const prev = past[past.length - 1];
      const ratio = prev !== 0 ? Math.abs((s.value - prev) / prev) : 0;

      if (ratio >= 0.25) {
        findings.push({
          sensorId: s.sensorId,
          method: 'rate_of_change',
          severity: ratio >= 0.4 ? 'danger' : 'warning',
          evidence: `직전 관측 ${round(prev)}${s.unit}에서 현재 ${round(s.value)}${s.unit}로 ${round(ratio * 100, 1)}% 급변했습니다.`,
          cause:
            '단시간 급변은 설비 상태 변화보다 계측 계통 이상일 가능성이 있습니다. 센서 배선과 신호 변환기를 우선 확인하십시오.',
        });
      }
    }
  }

  return findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      METHOD_ORDER[a.method] - METHOD_ORDER[b.method]
  );
}

/** 설비·센서별 추정 원인. [저하 시, 상승 시] */
function causeOf(s, isHigh) {
  const table = {
    'TANK-01-WATER_TEMP': [
      '수온 저하는 외기온 급락에 따른 표층 냉각이 주 원인입니다. 동결 시 배관 파손 위험이 있습니다.',
      '수온 상승은 외기온 상승과 체류시간 증가가 겹칠 때 발생합니다. 잔류염소 소모가 빨라져 수질 저하로 이어집니다.',
    ],
    'TANK-01-LEVEL': [
      '유입량 감소 또는 유출 과다로 저수위가 형성되었습니다. 펌프 공회전 위험이 있습니다.',
      '강우에 따른 유입 증가로 수위가 상승했습니다. 월류 및 넘침 위험이 있습니다.',
    ],
    'PUMP-01-ROOM_HUMIDITY': [
      '습도가 비정상적으로 낮습니다. 습도계 오류 가능성이 있습니다.',
      '외기 습도 상승으로 펌프실 결로가 우려됩니다. 전동기 절연저항 저하로 이어질 수 있습니다.',
    ],
    'PUMP-01-BEARING_TEMP': [
      '베어링 온도 저하는 펌프 정지 상태이거나 온도센서 단선일 수 있습니다.',
      '베어링 온도 상승은 윤활유 부족, 축 정렬 불량, 과부하 운전 중 하나에서 비롯됩니다.',
    ],
    'PIPE-01-INFLOW': [
      '유입 유량 감소는 상류 취수 중단이나 관로 폐색을 시사합니다.',
      '강우로 인한 유입 급증입니다. 관로 설계유량 초과 시 수격 위험이 있습니다.',
    ],
    'VALVE-01-DIFF_PRESSURE': [
      '차압 저하는 밸브 개도 과다 또는 상류 압력 부족을 의미합니다.',
      '차압 상승은 밸브 폐색이나 하류 저항 증가에서 발생합니다. 수격 위험이 있습니다.',
    ],
    'FILTER-01-LOAD': [
      '여과 부하가 비정상적으로 낮습니다. 필터 미장착 또는 우회 유로가 의심됩니다.',
      '대기 중 미세먼지 농도 상승으로 흡기 필터 폐색이 진행 중입니다.',
    ],
  };

  const pair = table[s.sensorId];
  if (!pair) {
    const name = EQUIPMENT_BY_ID.get(s.equipmentId)?.name ?? s.equipmentId;
    return `${name}의 ${s.sensorName}${ga(s.sensorName)} 정상 범위를 벗어났습니다.`;
  }
  return isHigh ? pair[1] : pair[0];
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const stddev = (a, mean) =>
  Math.sqrt(a.reduce((acc, v) => acc + (v - mean) ** 2, 0) / a.length);
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
