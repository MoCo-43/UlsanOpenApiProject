import { ref, onMounted, onBeforeUnmount } from 'vue';

/**
 * /api/sensors를 주기적으로 호출하는 컴포저블.
 *
 * 이상탐지와 문장 생성은 서버에서 끝내고 여기서는 받아서 보여주기만 한다.
 * 탐지 이력을 서버 메모리에 두면 브라우저를 새로고침해도
 * Z-score 기준이 초기화되지 않기 때문이다.
 */
export function useSensors({ intervalMs = 60000, query = () => '' } = {}) {
  const data = ref(null);
  const loading = ref(true);
  const error = ref(null);
  let timer = null;

  async function load() {
    loading.value = true;
    try {
      const res = await fetch(`/api/sensors${query()}`);
      const json = await res.json();
      data.value = json;
      error.value =
        json.sources?.every((s) => !s.ok)
          ? '모든 데이터 출처에서 수집에 실패했습니다.'
          : null;
    } catch {
      error.value = '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    load();
    timer = setInterval(load, intervalMs);
  });

  onBeforeUnmount(() => clearInterval(timer));

  return { data, loading, error, load };
}

/** ISO 8601 → '2026-08-05 14:00:32' (KST 표시) */
export function formatKst(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}`;
}
