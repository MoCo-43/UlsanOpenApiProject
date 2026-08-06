import { Router } from 'express';
import { ADAPTER_BY_ID } from '../lib/adapters/index.js';
import { OpenApiError } from '../lib/fetcher.js';
import { isoNowKst } from '../lib/time.js';
import { representativeStation } from '../lib/adapters/airkorea.js';

const router = Router();

/**
 * 1단계 서버 프록시.
 * 인증키는 이 서버 프로세스 안에서만 사용되고 응답에는 절대 포함되지 않는다.
 * 브라우저 개발자도구 Network 탭에서 키가 노출되지 않는 것을 확인할 수 있다.
 */
router.get('/:source', async (req, res) => {
  const adapter = ADAPTER_BY_ID.get(String(req.params.source).toLowerCase());

  if (!adapter) {
    return res.status(404).json({
      ok: false,
      error: `알 수 없는 데이터 출처입니다: ${req.params.source}`,
      available: [...ADAPTER_BY_ID.keys()],
    });
  }

  const startedAt = Date.now();
  const collectedAt = isoNowKst();

  try {
    const raw = await adapter.fetchRaw();
    res.json({
      ok: true,
      source: {
        id: adapter.id,
        name: adapter.name,
        url: adapter.sourceUrl,
        ...(adapter.id === 'AIRKOREA' ? { station: representativeStation(raw) } : {}),
      },
      collectedAt,
      elapsedMs: Date.now() - startedAt,
      raw,
    });
  } catch (err) {
    const e = err instanceof OpenApiError ? err : new OpenApiError('network', String(err));
    console.error(`[${adapter.id}] 수집 실패:`, e.kind, e.message, e.detail ?? '');

    // 실패해도 출처와 호출 시각은 반드시 함께 반환한다.
    res.status(502).json({
      ok: false,
      source: { id: adapter.id, name: adapter.name, url: adapter.sourceUrl },
      collectedAt,
      elapsedMs: Date.now() - startedAt,
      error: e.userMessage,
      errorKind: e.kind,
      detail: e.detail ?? e.message,
    });
  }
});

export default router;
