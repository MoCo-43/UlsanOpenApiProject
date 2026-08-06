/**
 * 제출물 8번 '샘플 데이터 또는 API 응답 예시' 생성 스크립트.
 *
 * 인증키가 설정돼 있으면 실제 응답을 samples/ 에 저장한다.
 * 표준화 결과(SensorData)도 함께 저장해 변환 전후를 대조할 수 있게 한다.
 *
 *   npm run samples
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import { ADAPTERS } from '../server/lib/adapters/index.js';
import { isoNowKst } from '../server/lib/time.js';

const OUT = 'samples';
await fs.mkdir(OUT, { recursive: true });

const collectedAt = isoNowKst();
const allSensors = [];
const allRejected = [];

for (const adapter of ADAPTERS) {
  const file = `${OUT}/${adapter.id.toLowerCase()}-raw.json`;
  try {
    const raw = await adapter.fetchRaw();
    await fs.writeFile(
      file,
      JSON.stringify({ source: adapter.name, sourceUrl: adapter.sourceUrl, collectedAt, raw }, null, 2),
      'utf-8'
    );
    console.log(`✓ ${file}`);

    const { sensors, rejected } = adapter.toSensorData(raw, collectedAt);
    allSensors.push(...sensors);
    allRejected.push(...rejected);
  } catch (err) {
    console.error(`✗ ${adapter.name}: ${err.userMessage ?? err.message}`);
    console.error('  인증키를 .env에 설정한 뒤 다시 실행하세요.');
  }
}

if (allSensors.length) {
  await fs.writeFile(
    `${OUT}/sensordata-normalized.json`,
    JSON.stringify({ collectedAt, sensors: allSensors, rejected: allRejected }, null, 2),
    'utf-8'
  );
  console.log(`✓ ${OUT}/sensordata-normalized.json (센서 ${allSensors.length}건, 제외 ${allRejected.length}건)`);
}
