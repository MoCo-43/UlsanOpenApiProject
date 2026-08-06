import { EQUIPMENT_BY_ID } from './plant.js';
import { ga, ro } from './korean.js';

/**
 * 4단계 '운영자용 분석 문장 자동 생성' + '권장 점검사항 제시'.
 *
 * LLM 대신 규칙 기반 템플릿을 채택한 이유
 *   1. 동일 입력에 동일 출력이 보장되어 시연과 검증이 가능하다
 *   2. 근거 숫자가 문장에 그대로 반영되므로 환각이 발생하지 않는다
 *   3. 외부 API 지연 없이 즉시 생성된다
 *
 * 상용 확장 시에는 이 문장을 LLM 프롬프트의 근거 블록으로 넘기는 방식이 적합하다.
 * 즉 LLM에 판단을 맡기지 않고 표현만 맡긴다.
 */

const METHOD_LABEL = {
  threshold: '임계값 판정',
  zscore: '통계적 이탈(Z-score)',
  rate_of_change: '변화율 감시',
};

/**
 * @typedef {Object} OperatorReport
 * @property {string} equipmentId
 * @property {string} equipmentName
 * @property {'warning'|'danger'} severity
 * @property {string} headline    경보 목록용 한 줄 요약
 * @property {string} analysis    서술형 분석 (상황 → 원인 → 종합)
 * @property {string[]} evidence  판단 근거 목록
 * @property {string[]} methods   적용된 탐지 방법
 * @property {string[]} checklist 권장 점검사항
 */

/**
 * @param {import('./types.js').SensorData[]} sensors
 * @param {import('./anomaly.js').Finding[]} findings
 * @returns {OperatorReport[]}
 */
export function buildReports(sensors, findings) {
  const byId = new Map(sensors.map((s) => [s.sensorId, s]));

  // 설비 단위로 묶는다. 운영자는 센서가 아니라 설비 단위로 조치하기 때문이다.
  const grouped = new Map();
  for (const f of findings) {
    const s = byId.get(f.sensorId);
    if (!s) continue;
    const list = grouped.get(s.equipmentId) ?? [];
    list.push(f);
    grouped.set(s.equipmentId, list);
  }

  const reports = [];

  for (const [equipmentId, list] of grouped) {
    const equipmentName = EQUIPMENT_BY_ID.get(equipmentId)?.name ?? equipmentId;
    const severity = list.some((f) => f.severity === 'danger') ? 'danger' : 'warning';
    const primary = list[0];
    const ps = byId.get(primary.sensorId);
    const methods = [...new Set(list.map((f) => f.method))];
    const level = severity === 'danger' ? '위험' : '주의';

    const analysis = [
      `${equipmentName}의 ${ps.sensorName}${ga(ps.sensorName)} ${ps.value}${ps.unit}${ro(ps.unit)} ${level} 상태입니다.`,
      primary.cause,
      list.length > 1
        ? `동일 설비에서 ${list.length}건의 이상이 동시에 탐지되었습니다. 단일 센서 오류보다 설비 상태 변화일 가능성이 높습니다.`
        : `적용된 탐지 방법은 ${methods.map((m) => METHOD_LABEL[m]).join(', ')}입니다.`,
    ].join(' ');

    reports.push({
      equipmentId,
      equipmentName,
      severity,
      headline: `${equipmentName} — ${ps.sensorName} ${ps.value}${ps.unit} ${level}`,
      analysis,
      evidence: list.map((f) => `[${METHOD_LABEL[f.method]}] ${f.evidence}`),
      methods,
      checklist: checklistFor(primary.sensorId, methods),
      observedAt: ps.observedAt,
      collectedAt: ps.collectedAt,
    });
  }

  const order = { danger: 0, warning: 1 };
  return reports.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** 센서별 점검 항목. 상수도 시설 일반 점검 절차를 기준으로 작성. */
function checklistFor(sensorId, methods) {
  const base = {
    'TANK-01-WATER_TEMP': [
      '저수조 잔류염소 농도 측정 (기준 0.1mg/L 이상 유지)',
      '체류시간 확인 및 필요 시 배수 조작으로 회전율 상향',
      '수온계 설치 위치의 직사광 노출 여부 확인',
    ],
    'TANK-01-LEVEL': [
      '유입·유출 밸브 개도 상태 확인',
      '월류관 및 배수관 폐색 여부 육안 점검',
      '수위계 부이 고착 여부 확인',
    ],
    'PUMP-01-ROOM_HUMIDITY': [
      '펌프실 환기팬 작동 상태 확인',
      '전동기 절연저항 측정 (기준 1MΩ 이상)',
      '제어반 내부 결로 및 부식 흔적 육안 점검',
    ],
    'PUMP-01-BEARING_TEMP': [
      '베어링 그리스 주입 상태 및 최종 주입일 확인',
      '펌프-전동기 축 정렬(얼라인먼트) 점검',
      '흡입측 스트레이너 차압 확인 (공동현상 여부)',
      '운전전류 측정 후 정격 대비 비교',
    ],
    'PIPE-01-INFLOW': [
      '상류 취수장 송수 상태 확인',
      '유량계 영점 및 신호선 접속 상태 점검',
      '관로 이토밸브·공기밸브 작동 상태 확인',
    ],
    'VALVE-01-DIFF_PRESSURE': [
      '밸브 개도 지시값과 실제 개도 일치 여부 확인',
      '액추에이터 토크 및 리미트 스위치 점검',
      '상·하류 압력계 병행 측정으로 차압 교차 검증',
    ],
    'FILTER-01-LOAD': [
      '흡기 필터 차압 게이지 확인 후 필요 시 교체',
      '필터 하우징 실링 상태 및 우회 누기 점검',
      '차기 교체 주기 일정 재산정',
    ],
  };

  const items = [...(base[sensorId] ?? ['해당 설비 운전일지 확인 및 현장 순회 점검'])];

  // 계측 계통 이상이 의심되는 탐지 방법이 포함되면 공통 항목을 덧붙인다.
  if (methods.includes('rate_of_change')) {
    items.push('계측 신호선 접속 상태 및 변환기 출력 확인 (급변 이력 있음)');
  }
  if (methods.includes('zscore')) {
    items.push('센서 교정 이력 확인 및 드리프트 여부 판단 (통계적 이탈 이력 있음)');
  }

  return items;
}
