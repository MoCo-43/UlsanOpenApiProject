import { Router } from "express";
import { ADAPTERS } from "../lib/adapters/index.js";
import { OpenApiError } from "../lib/fetcher.js";
import { isoNowKst } from "../lib/time.js";
import { filterValid } from "../lib/types.js";
import { detect, pushHistory, historySnapshot } from "../lib/anomaly.js";
import { buildReports } from "../lib/narrative.js";
import {
  EQUIPMENTS,
  SENSOR_SPECS,
  PLANT_NAME,
  PLANT_REGION,
} from "../lib/plant.js";
import { applyScenario, SCENARIOS } from "../lib/scenario.js";

const router = Router();

/**
 * 2·3·4단계 통합 응답.
 *
 * 설계 판단: 한 출처가 실패해도 전체를 오류로 떨구지 않는다.
 * 기상청이 죽어도 에어코리아 값으로 화면 일부는 살아 있어야
 * 운영 화면으로서 의미가 있기 때문이다.
 * 실패 내역은 sources[]에 담아 화면에서 명시적으로 표시한다.
 *
 * 쿼리 파라미터 scenario=<id> 를 주면 4단계 이상 상황을 재현한다.
 * 실제 API 값을 그대로 쓰되 지정 센서의 값만 덮어쓰며,
 * 응답의 scenario 필드에 재현 중임을 명시한다.
 */
router.get("/", async (req, res) => {
  const collectedAt = isoNowKst();

  const results = await Promise.all(
    ADAPTERS.map(async (adapter) => {
      const startedAt = Date.now();
      try {
        const raw = await adapter.fetchRaw();
        const { sensors, rejected } = adapter.toSensorData(raw, collectedAt);
        // SensorData 규격을 런타임 검증한다. 위반 건은 걸러내고 로그에 남긴다.
        const valid = filterValid(sensors);
        return {
          sensors: valid,
          rejected,
          meta: {
            id: adapter.id,
            name: adapter.name,
            ok: true,
            message: `센서 ${valid.length}건 수집${rejected.length ? `, ${rejected.length}건 제외` : ""}`,
            elapsedMs: Date.now() - startedAt,
          },
        };
      } catch (err) {
        const e =
          err instanceof OpenApiError
            ? err
            : new OpenApiError("network", String(err));
        return {
          sensors: [],
          rejected: [],
          meta: {
            id: adapter.id,
            name: adapter.name,
            ok: false,
            message: e.userMessage,
            elapsedMs: Date.now() - startedAt,
          },
        };
      }
    }),
  );

  let sensors = results.flatMap((r) => r.sensors);
  const rejected = results.flatMap((r) => r.rejected);

  // 이상 상황 재현 시나리오 (4단계 평가용)
  const scenarioId = String(req.query.scenario ?? "").trim();
  const scenario = scenarioId ? applyScenario(sensors, scenarioId) : null;
  if (scenario) sensors = scenario.sensors;

  pushHistory(sensors);
  const findings = detect(sensors);
  const reports = buildReports(sensors, findings);

  res.status(results.every((r) => !r.meta.ok) ? 502 : 200).json({
    plant: { name: PLANT_NAME, region: PLANT_REGION },
    collectedAt,
    sensors,
    rejected,
    findings,
    reports,
    sources: results.map((r) => r.meta),
    history: historySnapshot(),
    scenario: scenario
      ? { id: scenario.id, name: scenario.name, note: scenario.note }
      : null,
  });
});

/** 설비 목록, 센서 사양(매핑 근거·임계값), 재현 시나리오 목록 */
router.get("/meta", (_req, res) => {
  res.json({
    plant: { name: PLANT_NAME, region: PLANT_REGION },
    equipments: EQUIPMENTS,
    scenarios: SCENARIOS.map(({ id, name, note }) => ({ id, name, note })),
    specs: SENSOR_SPECS.map((s) => ({
      originCode: s.originCode,
      sensorId: s.sensorId,
      equipmentId: s.equipmentId,
      label: s.label,
      sensorType: s.type,
      unit: s.unit,
      thresholds: s.thresholds,
      rationale: s.rationale,
    })),
  });
});

export default router;
