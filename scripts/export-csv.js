/**
 * 2단계 제출물 '표준화 샘플 데이터 (JSON·CSV)' 중 CSV 생성.
 * samples/sensordata-normalized.json을 CSV로 변환한다.
 *
 *   npm run csv
 */
import fs from 'node:fs/promises';

const FIELDS = [
  'timestamp', 'sensorId', 'sensorName', 'sensorType', 'value',
  'unit', 'location', 'status', 'isAnomaly', 'source',
  'equipmentId', 'collectedAt', 'originCode', 'originValue',
];

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const raw = JSON.parse(await fs.readFile('samples/sensordata-normalized.json', 'utf-8'));

const rows = [FIELDS.join(',')];
for (const s of raw.sensors) rows.push(FIELDS.map((f) => esc(s[f])).join(','));
// Excel에서 한글이 깨지지 않도록 BOM을 붙인다.
await fs.writeFile('samples/sensordata-normalized.csv', '\uFEFF' + rows.join('\n') + '\n', 'utf-8');

const rj = ['sensorId,sensorName,originCode,originValue,reason,message'];
for (const r of raw.rejected ?? []) {
  rj.push([r.sensorId, r.sensorName, r.originCode, r.originValue, r.reason, r.message].map(esc).join(','));
}
await fs.writeFile('samples/rejected-readings.csv', '\uFEFF' + rj.join('\n') + '\n', 'utf-8');

console.log(`samples/sensordata-normalized.csv (${raw.sensors.length}행)`);
console.log(`samples/rejected-readings.csv (${(raw.rejected ?? []).length}행)`);
