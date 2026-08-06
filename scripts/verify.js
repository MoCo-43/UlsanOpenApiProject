/**
 * 변환·검증·탐지·문장 생성 전 과정을 모의 응답으로 확인하는 스크립트.
 * 인증키 없이 실행할 수 있어 로직 변경 시 회귀 확인용으로 쓴다.
 *
 *   npm run verify
 */
import { kmaAdapter } from '../server/lib/adapters/kma.js';
import { airKoreaAdapter } from '../server/lib/adapters/airkorea.js';
import { validateSensorData, filterValid } from '../server/lib/types.js';
import { detect, pushHistory, resetHistory } from '../server/lib/anomaly.js';
import { buildReports } from '../server/lib/narrative.js';

const collectedAt = '2026-08-04T15:00:00+09:00';

// 결측(-99), 정상값, 극단값을 섞은 모의 기상청 응답
const kmaRaw = {
  response: {
    header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' },
    body: { items: { item: [
      { baseDate: '20260804', baseTime: '1400', category: 'T1H', obsrValue: '34.8' },
      { baseDate: '20260804', baseTime: '1400', category: 'REH', obsrValue: '92' },
      { baseDate: '20260804', baseTime: '1400', category: 'RN1', obsrValue: '-99' },
      { baseDate: '20260804', baseTime: '1400', category: 'WSD', obsrValue: '3.4' },
    ] } },
  },
};

// 중복 측정소, '-' 결측을 포함한 모의 에어코리아 응답
const airRaw = {
  response: {
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
    body: { items: [
      { stationName: '여천', dataTime: '2026-08-04 14:00', pm10Value: '-', pm25Value: '12' },
      { stationName: '여천', dataTime: '2026-08-04 14:00', pm10Value: '-', pm25Value: '12' },
      { stationName: '신정동', dataTime: '2026-08-04 14:00', pm10Value: '118', pm25Value: '55' },
    ] },
  },
};

console.log('━━━ 1. 변환 결과 ━━━');
const a = kmaAdapter.toSensorData(kmaRaw, collectedAt);
const b = airKoreaAdapter.toSensorData(airRaw, collectedAt);
const converted = [...a.sensors, ...b.sensors];
const rejected = [...a.rejected, ...b.rejected];
for (const s of converted) {
  console.log(
    `${s.originCode.padEnd(14)} ${String(s.originValue).padStart(5)} → ` +
    `${s.sensorId.padEnd(24)} ${String(s.value).padStart(7)}${s.unit.padEnd(5)} [${s.status}] isAnomaly=${s.isAnomaly}`
  );
}
console.log(`\n  제외 ${rejected.length}건 (결측·중복·범위이탈)`);
for (const r of rejected) console.log(`    ✗ ${r.sensorId.padEnd(24)} ${r.reason} — ${r.message}`);

console.log('\n━━━ 2. SensorData 규격 검증 (과제 지정 필드 10개) ━━━');
let violations = 0;
for (const s of converted) {
  const errs = validateSensorData(s);
  if (errs.length) { violations++; console.log(`  ✗ ${s.sensorId}: ${errs.join(', ')}`); }
}
console.log(violations === 0 ? `  ✓ ${converted.length}건 모두 규격 준수` : `  ${violations}건 위반`);

const sensors = filterValid(converted);

console.log('\n━━━ 3. 이상탐지 ━━━');
resetHistory();
// 이력을 쌓아 Z-score와 변화율 탐지가 동작하는 상황을 만든다.
for (const v of [51, 52, 51, 52, 53, 52]) {
  pushHistory([{ sensorId: 'PUMP-01-BEARING_TEMP', value: v }]);
}
for (const v of [45, 46, 45, 47, 46]) {
  pushHistory([{ sensorId: 'FILTER-01-LOAD', value: v }]);
}
const findings = detect(sensors);
console.log(`  탐지 ${findings.length}건`);
for (const f of findings) console.log(`  [${f.method}/${f.severity}] ${f.evidence}`);

console.log('\n━━━ 4. 운영자 보고 ━━━');
const reports = buildReports(sensors, findings);
for (const r of reports) {
  console.log(`\n■ ${r.headline}`);
  console.log(`  ${r.analysis}`);
  console.log('  권장 점검사항:');
  r.checklist.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
}
console.log('');
