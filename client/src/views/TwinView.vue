<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue';
import AppNav from '../components/AppNav.vue';

// Three.js는 번들의 대부분을 차지한다. 3D 화면에서만 필요하므로
// 비동기 컴포넌트로 분리해 1·2단계 화면에서는 내려받지 않도록 한다.
const TwinScene = defineAsyncComponent(() => import('../components/TwinScene.vue'));
import { useSensors, formatKst } from '../composables/useSensors.js';

const sceneRef = ref(null);
const scenario = ref('');
const { data, loading, error, load } = useSensors({
  intervalMs: 60000,
  query: () => (scenario.value ? `?scenario=${scenario.value}` : ''),
});

function changeScenario(id) {
  scenario.value = id;
  load();
}

const selected = ref(null);
const meta = ref({ equipments: [], specs: [], plant: {} });

onMounted(async () => {
  const res = await fetch('/api/sensors/meta');
  meta.value = await res.json();
});

const sensors = computed(() => data.value?.sensors ?? []);
const reports = computed(() => data.value?.reports ?? []);
const sources = computed(() => data.value?.sources ?? []);

const RANK = { danger: 3, warning: 2, normal: 1, unknown: 0 };

/** 설비별 대표 상태 = 소속 센서 중 가장 심각한 상태 */
const statusMap = computed(() => {
  const map = {};
  for (const eq of meta.value.equipments) map[eq.id] = 'unknown';
  for (const s of sensors.value) {
    if (RANK[s.status] > RANK[map[s.equipmentId] ?? 'unknown']) {
      map[s.equipmentId] = s.status;
    }
  }
  return map;
});

const counts = computed(() => {
  const c = { danger: 0, warning: 0, normal: 0, unknown: 0 };
  for (const eq of meta.value.equipments) c[statusMap.value[eq.id]]++;
  return c;
});

const selectedEq = computed(() =>
  meta.value.equipments.find((e) => e.id === selected.value) ?? null
);

const selectedSensors = computed(() =>
  sensors.value.filter((s) => s.equipmentId === selected.value)
);

function sensorFor(sensorId) {
  return sensors.value.find((s) => s.sensorId === sensorId) ?? null;
}

function equipmentName(id) {
  return meta.value.equipments.find((e) => e.id === id)?.name ?? id;
}

/** 이력 배열을 스파크라인 polyline 좌표로 변환 */
function sparkPoints(sensorId) {
  const arr = data.value?.history?.[sensorId] ?? [];
  if (arr.length < 2) return '';
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const span = max - min || 1;
  return arr
    .map((v, i) => {
      const x = (i / (arr.length - 1)) * 100;
      const y = 24 - ((v - min) / span) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
</script>

<template>
  <header class="masthead">
    <div>
      <p class="eyebrow">{{ meta.plant?.region ?? '울산광역시' }} · 3D Digital Twin Prototype</p>
      <h1>{{ meta.plant?.name ?? '배수지' }} 원격 감시</h1>
    </div>
    <AppNav />
  </header>

  <!-- 상태 요약 스트립 -->
  <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px">
    <span class="chip"><span class="dot s-danger" />위험 <span class="num">{{ counts.danger }}</span></span>
    <span class="chip"><span class="dot s-warning" />주의 <span class="num">{{ counts.warning }}</span></span>
    <span class="chip"><span class="dot s-normal" />정상 <span class="num">{{ counts.normal }}</span></span>
    <span class="chip"><span class="dot s-unknown" />미수신 <span class="num">{{ counts.unknown }}</span></span>
    <div style="flex: 1" />
    <span class="stamp">
      최종 수집 {{ formatKst(data?.collectedAt) }} · 60초마다 자동 갱신
    </span>
    <button class="act" :disabled="loading" @click="load">
      {{ loading ? '수집 중…' : '지금 갱신' }}
    </button>
  </div>

  <!-- 4단계: 이상 상황 재현 시나리오 -->
  <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 14px">
    <span class="eyebrow" style="margin: 0 4px 0 0">이상 상황 재현</span>
    <button
      class="act"
      :style="scenario === '' ? 'border-color: var(--signal); color: var(--signal-bright)' : ''"
      @click="changeScenario('')"
    >
      실시간
    </button>
    <button
      v-for="sc in meta.scenarios ?? []"
      :key="sc.id"
      class="act"
      :style="scenario === sc.id ? 'border-color: var(--signal); color: var(--signal-bright)' : ''"
      @click="changeScenario(sc.id)"
    >
      {{ sc.name }}
    </button>
  </div>

  <div v-if="data?.scenario" class="notice" style="margin-bottom: 14px">
    <strong>재현 모드 · {{ data.scenario.name }}</strong> — {{ data.scenario.note }}<br />
    실제 API 호출은 그대로 수행하며, 지정 센서의 값만 덮어씁니다.
    임계값과 탐지 로직, 문장 생성은 운영과 동일하게 동작합니다.
  </div>

  <div v-if="error" class="alarm" style="margin-bottom: 14px">
    {{ error }}
    <div style="margin-top: 6px; font-size: 12px; color: var(--ink-dim)">
      서버 로그와 .env의 DATA_GO_KR_SERVICE_KEY 설정을 확인하세요.
    </div>
  </div>

  <div class="split">
    <div>
      <TwinScene
        ref="sceneRef"
        :equipments="meta.equipments"
        :status-map="statusMap"
        :selected="selected"
        @select="(id) => (selected = id)"
      />
      <div style="display: flex; justify-content: flex-end; margin-top: 8px">
        <button class="act" @click="sceneRef?.exportGltf?.()">
          3D 모델 glTF로 내보내기
        </button>
      </div>
    </div>

    <aside class="stack">
      <!-- 선택 설비 -->
      <section class="panel">
        <h2 class="panel-title">선택 설비</h2>

        <p v-if="!selectedEq" style="margin: 0; font-size: 13px; color: var(--ink-dim)">
          3D 화면에서 설비를 클릭하면 이름과 센서값이 표시됩니다.
        </p>

        <template v-else>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px">
            <span class="dot" :class="`s-${statusMap[selectedEq.id]}`" />
            <strong style="font-size: 15px">{{ selectedEq.name }}</strong>
            <span class="stamp">{{ selectedEq.id }}</span>
          </div>
          <p style="margin: 0 0 12px; font-size: 12px; color: var(--ink-dim)">
            {{ selectedEq.note }}
          </p>

          <p v-if="selectedSensors.length === 0" class="stamp">
            수신된 센서값이 없습니다.
          </p>
          <table v-else class="grid">
            <tbody>
              <tr v-for="s in selectedSensors" :key="s.sensorId">
                <td style="width: 18px"><span class="dot" :class="`s-${s.status}`" /></td>
                <td>{{ s.sensorName }}</td>
                <td class="num" style="text-align: right; white-space: nowrap">
                  {{ s.value ?? '—' }}
                  <span style="color: var(--ink-faint); margin-left: 3px">{{ s.unit }}</span>
                </td>
              </tr>
            </tbody>
          </table>

          <p v-if="selectedSensors[0]" class="stamp" style="margin-top: 10px">
            출처 {{ selectedSensors[0].source }}<br />
            관측 {{ formatKst(selectedSensors[0].timestamp) }}
          </p>
        </template>
      </section>

      <!-- 4단계 이상징후 분석 -->
      <section class="panel">
        <h2 class="panel-title">
          이상징후 분석<span v-if="reports.length"> ({{ reports.length }})</span>
        </h2>

        <p v-if="reports.length === 0" style="margin: 0; font-size: 13px; color: var(--ink-dim)">
          현재 탐지된 이상징후가 없습니다. 전 설비 정상 범위입니다.
        </p>

        <div v-else style="display: grid; gap: 14px">
          <article
            v-for="r in reports"
            :key="r.equipmentId"
            class="report"
            :data-severity="r.severity"
            @click="selected = r.equipmentId"
          >
            <h3>{{ r.headline }}</h3>
            <p class="analysis">{{ r.analysis }}</p>

            <p class="eyebrow" style="margin: 0 0 4px">판단 근거</p>
            <ul>
              <li v-for="(e, i) in r.evidence" :key="i">{{ e }}</li>
            </ul>

            <p class="eyebrow" style="margin: 10px 0 4px">권장 점검사항</p>
            <ol>
              <li v-for="(c, i) in r.checklist" :key="i">{{ c }}</li>
            </ol>
          </article>
        </div>
      </section>

      <!-- 데이터 출처 -->
      <section class="panel">
        <h2 class="panel-title">데이터 출처</h2>
        <div style="display: grid; gap: 8px">
          <div v-for="s in sources" :key="s.id" style="display: flex; gap: 8px; align-items: flex-start">
            <span class="dot" :class="s.ok ? 's-normal' : 's-danger'" style="margin-top: 5px" />
            <div style="font-size: 12.5px; line-height: 1.6">
              <div>{{ s.name }}</div>
              <div class="stamp">{{ s.message }} · {{ s.elapsedMs }}ms</div>
            </div>
          </div>
          <p v-if="sources.length === 0" class="stamp">수집 대기 중…</p>
        </div>
        <p class="stamp" style="margin-top: 10px; border-top: 1px solid var(--rule-soft); padding-top: 8px">
          센서값은 공공 기상·대기질 관측값을 배수지 설비 센서로 환산한
          프로토타입 값입니다. 환산 근거는 표준화 화면에서 확인할 수 있습니다.
        </p>
      </section>
    </aside>
  </div>

  <!-- 전 계통 계측값 -->
  <section class="panel" style="margin-top: 14px">
    <h2 class="panel-title">전 계통 계측값 ({{ sensors.length }})</h2>
    <div class="gauge-grid">
      <button
        v-for="spec in meta.specs"
        :key="spec.sensorId"
        class="gauge"
        :data-selected="selected === spec.equipmentId"
        @click="selected = spec.equipmentId"
      >
        <span class="stamp" style="font-size: 10px">{{ equipmentName(spec.equipmentId) }}</span>
        <span style="font-size: 12px; color: var(--ink-dim)">{{ spec.label }}</span>
        <span class="num" style="font-size: 20px; line-height: 1.2">
          {{ sensorFor(spec.sensorId)?.value ?? '—' }}
          <span style="font-size: 11px; color: var(--ink-faint); margin-left: 3px">{{ spec.unit }}</span>
        </span>
        <svg v-if="sparkPoints(spec.sensorId)" class="spark" viewBox="0 0 100 26" preserveAspectRatio="none">
          <polyline
            :points="sparkPoints(spec.sensorId)"
            fill="none"
            stroke="var(--signal)"
            stroke-width="1.2"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <span class="dot" :class="`s-${sensorFor(spec.sensorId)?.status ?? 'unknown'}`" />
      </button>
    </div>
  </section>
</template>
