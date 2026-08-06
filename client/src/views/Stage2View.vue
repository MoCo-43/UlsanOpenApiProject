<script setup>
import { ref, computed, onMounted } from 'vue';
import AppNav from '../components/AppNav.vue';
import { useSensors, formatKst } from '../composables/useSensors.js';

// 이 화면은 자동 갱신이 불필요하므로 주기를 길게 둔다.
const { data, loading, load } = useSensors({ intervalMs: 300000 });

const meta = ref({ equipments: [], specs: [] });
const showJson = ref(false);

onMounted(async () => {
  const res = await fetch('/api/sensors/meta');
  meta.value = await res.json();
});

const sensors = computed(() => data.value?.sensors ?? []);
const sources = computed(() => data.value?.sources ?? []);

const QUALITY_LABEL = {
  ok: '정상',
  missing: '결측',
  out_of_range: '범위이탈',
  duplicated: '중복',
};

function equipmentName(id) {
  return meta.value.equipments.find((e) => e.id === id)?.name ?? id;
}
</script>

<template>
  <header class="masthead">
    <div>
      <p class="eyebrow">Stage 2 · Normalization</p>
      <h1>SensorData 표준화</h1>
    </div>
    <AppNav />
  </header>

  <div class="notice" style="margin-bottom: 16px">
    서로 다른 두 API의 응답을 단일 <code>SensorData</code> 구조로 변환합니다.
    기상청은 <code>baseDate</code>/<code>baseTime</code>을, 에어코리아는
    <code>dataTime</code>을 각각 다른 형식으로 반환하므로 모두 ISO 8601(KST
    오프셋 포함)로 통일했습니다. 결측 표기도 기상청 <code>-99</code>,
    에어코리아 <code>"-"</code>로 달라 한 곳에서 통합 판정합니다.
  </div>

  <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap">
    <button class="act" :disabled="loading" @click="load">
      {{ loading ? '변환 중…' : '다시 변환' }}
    </button>
    <button class="act" @click="showJson = !showJson">
      {{ showJson ? 'JSON 접기' : '변환 결과 JSON' }}
    </button>
    <span class="stamp">
      수집 시각 {{ formatKst(data?.collectedAt) }} · 센서 {{ sensors.length }}건
    </span>
  </div>

  <!-- 출처별 수집 결과 -->
  <section class="panel" style="margin-bottom: 16px">
    <h2 class="panel-title">출처별 수집 결과</h2>
    <table class="grid">
      <thead>
        <tr><th>출처</th><th>상태</th><th>비고</th><th style="text-align: right">응답시간</th></tr>
      </thead>
      <tbody>
        <tr v-for="s in sources" :key="s.id">
          <td>{{ s.name }}</td>
          <td>
            <span class="dot" :class="s.ok ? 's-normal' : 's-danger'" style="margin-right: 6px" />
            {{ s.ok ? '성공' : '실패' }}
          </td>
          <td :style="s.ok ? '' : 'color: var(--danger)'">{{ s.message }}</td>
          <td class="num" style="text-align: right">{{ s.elapsedMs }}ms</td>
        </tr>
      </tbody>
    </table>
    <p class="stamp" style="margin-top: 10px">
      한 출처가 실패해도 나머지 출처의 값은 정상 제공됩니다. 부분 실패를 전체
      오류로 처리하지 않는 것이 운영 화면의 요구사항입니다.
    </p>
  </section>

  <!-- 변환 대조표 -->
  <section class="panel" style="margin-bottom: 16px">
    <h2 class="panel-title">원본 → SensorData 변환 대조</h2>
    <div style="overflow-x: auto">
      <table class="grid">
        <thead>
          <tr>
            <th>원본 코드</th>
            <th style="text-align: right">원본값</th>
            <th></th>
            <th>sensorId</th>
            <th>설비</th>
            <th>항목</th>
            <th style="text-align: right">표준값</th>
            <th>isAnomaly</th>
            <th>상태</th>
            <th>관측 시각 (ISO 8601)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sensors" :key="s.sensorId">
            <td class="num" style="font-size: 11.5px">{{ s.originCode }}</td>
            <td class="num" style="text-align: right">{{ s.originValue ?? '—' }}</td>
            <td style="color: var(--ink-faint)">→</td>
            <td class="num" style="font-size: 11.5px">{{ s.sensorId }}</td>
            <td style="white-space: nowrap">{{ equipmentName(s.equipmentId) }}</td>
            <td style="white-space: nowrap">{{ s.sensorName }}</td>
            <td class="num" style="text-align: right; white-space: nowrap">
              {{ s.value ?? '—' }}
              <span style="color: var(--ink-faint)">{{ s.unit }}</span>
            </td>
            <td class="num" style="font-size: 12px">{{ s.isAnomaly }}</td>
            <td><span class="dot" :class="`s-${s.status}`" /></td>
            <td class="stamp" style="white-space: nowrap">{{ s.timestamp }}</td>
          </tr>
          <tr v-if="sensors.length === 0">
            <td colspan="10" class="stamp">변환된 데이터가 없습니다.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- 제외된 데이터 -->
  <section class="panel" style="margin-bottom: 16px">
    <h2 class="panel-title">
      제외된 데이터 ({{ (data?.rejected ?? []).length }})
    </h2>
    <p class="stamp" style="margin-bottom: 10px">
      과제 규격상 <code>value</code>가 <code>number</code>(널 불가)이므로,
      결측·중복·범위이탈 데이터는 SensorData 배열에 넣지 않고 사유와 함께 분리해
      보고합니다. 규격을 지키면서 결측·중복·오류 응답 처리 요구사항도 충족하는 방식입니다.
    </p>
    <table class="grid">
      <thead>
        <tr><th>센서</th><th>원본 코드</th><th style="text-align:right">원본값</th><th>사유</th><th>설명</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in data?.rejected ?? []" :key="r.sensorId + r.reason">
          <td>{{ r.sensorName }}</td>
          <td class="num" style="font-size:11.5px">{{ r.originCode }}</td>
          <td class="num" style="text-align:right">{{ r.originValue ?? '—' }}</td>
          <td style="color: var(--warning)">{{ QUALITY_LABEL[r.reason] }}</td>
          <td class="stamp">{{ r.message }}</td>
        </tr>
        <tr v-if="(data?.rejected ?? []).length === 0">
          <td colspan="5" class="stamp">제외된 데이터가 없습니다. 전 항목 정상 변환되었습니다.</td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- 매핑 근거 -->
  <section class="panel" style="margin-bottom: 16px">
    <h2 class="panel-title">매핑 및 임계값 근거</h2>
    <p class="stamp" style="margin-bottom: 12px">
      공공 Open API는 배수지 내부 센서값을 제공하지 않으므로, 수집 가능한
      기상·대기질 관측값을 설비 센서의 대체 입력으로 환산했습니다. 실제 현장
      적용 시 이 매핑 계층만 SCADA 태그로 교체하면 상위 로직은 변경이 필요
      없습니다.
    </p>
    <div style="display: grid; gap: 12px">
      <div
        v-for="spec in meta.specs"
        :key="spec.sensorId"
        style="border-left: 2px solid var(--rule); padding-left: 12px"
      >
        <div style="font-size: 13px; margin-bottom: 3px">
          <span class="num" style="color: var(--signal-bright)">{{ spec.originCode }}</span>
          <span style="color: var(--ink-faint); margin: 0 6px">→</span>
          {{ equipmentName(spec.equipmentId) }} · {{ spec.label }}
        </div>
        <p style="font-size: 12px; line-height: 1.7; color: var(--ink-dim); margin: 0 0 4px">
          {{ spec.rationale }}
        </p>
        <p class="stamp">
          임계값 · 위험↓ {{ spec.thresholds.critLow ?? '—' }} /
          주의↓ {{ spec.thresholds.warnLow ?? '—' }} /
          주의↑ {{ spec.thresholds.warnHigh ?? '—' }} /
          위험↑ {{ spec.thresholds.critHigh ?? '—' }} ({{ spec.unit }})
        </p>
      </div>
    </div>
  </section>

  <section v-if="showJson" class="panel">
    <h2 class="panel-title">GET /api/sensors 응답</h2>
    <pre class="raw">{{ JSON.stringify(data, null, 2) }}</pre>
  </section>
</template>
