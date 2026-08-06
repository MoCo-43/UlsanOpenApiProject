/**
 * 과제에서 지정한 SensorData 인터페이스
 *
 *   interface SensorData {
 *     timestamp: string;
 *     sensorId: string;
 *     sensorName: string;
 *     sensorType: string;
 *     value: number;
 *     unit: string;
 *     location: string;
 *     status: "normal" | "warning" | "danger";
 *     isAnomaly: boolean;
 *     source: string;
 *   }
 * TS대신 JS로 사용.
 *   1) JSDoc @typedef      — 에디터 자동완성과 타입 힌트
 *   2) validateSensorData() — 런타임에 필드 존재와 타입을 실제로 검증
 * 어댑터가 규격을 어기면 화면에 도달하기 전에 서버에서 걸러진다.
 *
 * value가 number(NULL 불가)로 지정되어 있으므로, 결측·중복·범위이탈 데이터는
 * SensorData 배열에 넣지 않고 rejected 배열로 분리해 사유와 함께 보고.
 * 규격을 지키면서 '결측·중복·오류 응답 처리' 요구사항도 충족하는 방식.
 */

/** @typedef {'normal'|'warning'|'danger'} SensorStatus */
/** @typedef {'ok'|'missing'|'out_of_range'|'duplicated'} RejectReason */

/**
 * @typedef {Object} SensorData
 * -- 과제 지정 필수 필드 (10개) --
 * @property {string}       timestamp   관측 시각 (ISO 8601, KST 오프셋 포함)
 * @property {string}       sensorId    센서 고유 ID. 예: 'TANK-01-WATER_TEMP'
 * @property {string}       sensorName  센서 표시명. 예: '저수조 수온'
 * @property {string}       sensorType  계측 항목 종류. 예: 'temperature'
 * @property {number}       value       표준 단위로 환산된 값
 * @property {string}       unit        단위. 예: '℃'
 * @property {string}       location    설치 위치. 예: '울산 OO배수지 · 정수 저수조'
 * @property {SensorStatus} status      임계값 판정 결과
 * @property {boolean}      isAnomaly   이상 여부
 * @property {string}       source      데이터 출처. 예: '기상청 초단기실황'
 *
 * -- 확장 필드 (과제 규격 외, 추적성·3D 연동을 위해 추가) --
 * @property {string}      equipmentId  소속 설비 ID. 3D 객체와 연결되는 키
 * @property {string}      collectedAt  서버가 API를 호출한 시각 (1단계 요구사항)
 * @property {string}      sourceUrl    출처 API 문서 URL
 * @property {string}      originCode   변환 전 원본 코드. 예: 'KMA:T1H'
 * @property {string|null} originValue  변환 전 원본 값(문자열)
 */

/**
 * @typedef {Object} RejectedReading
 * @property {string} sensorId
 * @property {string} sensorName
 * @property {string} originCode
 * @property {string|null} originValue
 * @property {RejectReason} reason
 * @property {string} message
 */

/** 과제가 지정한 필수 필드와 타입 */
const REQUIRED = {
  timestamp: "string",
  sensorId: "string",
  sensorName: "string",
  sensorType: "string",
  value: "number",
  unit: "string",
  location: "string",
  status: "string",
  isAnomaly: "boolean",
  source: "string",
};

const STATUSES = ["normal", "warning", "danger"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;

/**
 * SensorData 구조를 런타임에 검증
 * @param {unknown} d
 * @returns {string[]} 위반 사항 목록. 비어 있으면 규격 준수.
 */
export function validateSensorData(d) {
  const errors = [];
  if (typeof d !== "object" || d === null) return ["객체가 아닙니다."];

  for (const [key, type] of Object.entries(REQUIRED)) {
    if (!(key in d)) {
      errors.push(`필수 필드 누락: ${key}`);
    } else if (typeof d[key] !== type) {
      errors.push(`${key}의 타입이 ${type}이 아닙니다: ${typeof d[key]}`);
    }
  }

  if (
    "value" in d &&
    typeof d.value === "number" &&
    !Number.isFinite(d.value)
  ) {
    errors.push("value가 유한한 수가 아닙니다.");
  }
  if ("status" in d && !STATUSES.includes(d.status)) {
    errors.push(
      `status는 normal|warning|danger 중 하나여야 합니다: ${d.status}`,
    );
  }
  // 타임스탬프 일관성: 두 API의 형식이 달라도 여기서는 반드시 ISO 8601 형식 준수
  if ("timestamp" in d && !ISO_RE.test(String(d.timestamp))) {
    errors.push(`timestamp가 ISO 8601 형식이 아닙니다: ${d.timestamp}`);
  }
  // status와 isAnomaly의 모순 보정
  if ("status" in d && "isAnomaly" in d) {
    const shouldBeAnomaly = d.status !== "normal";
    if (d.isAnomaly !== shouldBeAnomaly) {
      errors.push(
        `status(${d.status})와 isAnomaly(${d.isAnomaly})가 일치하지 않습니다.`,
      );
    }
  }

  return errors;
}

/**
 * 검증을 통과한 것만 반환하고 위반 건은 로그에 기록.
 * 잘못된 한 건에 전체 응답이 죽지 않도록 대응
 */
export function filterValid(list) {
  const ok = [];
  for (const d of list) {
    const errors = validateSensorData(d);
    if (errors.length === 0) {
      ok.push(d);
    } else {
      console.warn(
        `[SensorData 규격 위반] ${d?.sensorId ?? "(id 없음)"}: ${errors.join(", ")}`,
      );
    }
  }
  return ok;
}
