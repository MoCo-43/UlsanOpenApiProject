import { judge, specsFor, locationOf } from '../plant.js';

/**
 * 2단계 '변환 로직의 재사용 가능한 구조'.
 *
 * 새 Open API를 추가할 때는 아래 형태의 객체 하나만 만들면 된다.
 *   { id, name, sourceUrl, fetchRaw(), toSensorData(raw, collectedAt) }
 * 라우트, 3D 화면, 이상탐지 로직은 전혀 손대지 않는다.
 *
 * 어댑터는 API마다 다른 '읽어오기'와 '항목 추출'만 담당하고,
 * 결측 판정·단위 환산·상태 판정처럼 규칙이 갈리면 안 되는 부분은
 * 아래 buildSensorData()가 전담한다.
 *
 * 과제 규격상 SensorData.value는 number(널 불가)이므로
 * 결측·중복·범위이탈 데이터는 SensorData에 넣지 않고
 * rejected 배열로 분리해 사유와 함께 반환한다.
 */

/**
 * @typedef {Object} Reading
 * @property {string} code        접두사 없는 코드. 예: 'T1H'
 * @property {string|null} rawValue
 * @property {string} observedAt  ISO 8601
 */

/**
 * @param {{id:string,name:string,sourceUrl:string}} adapter
 * @param {Reading[]} readings
 * @param {string} collectedAt
 * @returns {{sensors: import('../types.js').SensorData[], rejected: import('../types.js').RejectedReading[]}}
 */
export function buildSensorData(adapter, readings, collectedAt) {
  const sensors = [];
  const rejected = [];
  const seen = new Set();

  for (const r of readings) {
    const originCode = `${adapter.id}:${r.code}`;

    for (const spec of specsFor(originCode)) {
      const base = {
        sensorId: spec.sensorId,
        sensorName: spec.label,
        originCode,
        originValue: r.rawValue,
      };

      // 중복 처리: 같은 sensorId가 두 번 오면 첫 값만 채택한다.
      if (seen.has(spec.sensorId)) {
        rejected.push({
          ...base,
          reason: 'duplicated',
          message: '동일 센서 ID가 중복 수신되어 최초 값만 채택했습니다.',
        });
        continue;
      }
      seen.add(spec.sensorId);

      // 결측 처리
      const parsed = parseValue(r.rawValue);
      if (parsed === null) {
        rejected.push({
          ...base,
          reason: 'missing',
          message: `결측 코드 또는 빈 값이 수신되었습니다 (원본: ${r.rawValue ?? 'null'}).`,
        });
        continue;
      }

      // 범위이탈 처리
      const value = spec.transform ? spec.transform(parsed) : parsed;
      if (!Number.isFinite(value)) {
        rejected.push({
          ...base,
          reason: 'out_of_range',
          message: '환산 결과가 유한한 수가 아니어서 제외했습니다.',
        });
        continue;
      }

      const status = judge(value, spec.thresholds);

      sensors.push({
        // ── 과제 지정 필수 필드 10개 ──
        timestamp: r.observedAt,
        sensorId: spec.sensorId,
        sensorName: spec.label,
        sensorType: spec.type,
        value,
        unit: spec.unit,
        location: locationOf(spec.equipmentId),
        status,
        isAnomaly: status !== 'normal',
        source: adapter.name,
        // ── 확장 필드 (추적성·3D 연동) ──
        equipmentId: spec.equipmentId,
        collectedAt,
        sourceUrl: adapter.sourceUrl,
        originCode,
        originValue: r.rawValue,
      });
    }
  }

  return { sensors, rejected };
}

/**
 * 결측 판정을 한 곳에 모은다.
 * 기상청은 -99 / -998 / -999, 에어코리아는 '-' 또는 빈 문자열로 결측을 표기한다.
 * 어댑터마다 따로 판정하면 규칙이 갈리므로 여기서만 처리한다.
 */
export function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim();
  if (t === '' || t === '-' || t === 'null') return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  if (n === -99 || n === -998 || n === -999) return null;
  return n;
}
