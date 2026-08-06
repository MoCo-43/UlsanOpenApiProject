<script setup>
import { ref, onMounted } from 'vue';
import AppNav from '../components/AppNav.vue';
import { formatKst } from '../composables/useSensors.js';

const SOURCES = [
  { id: 'kma', name: '기상청 초단기실황' },
  { id: 'airkorea', name: '에어코리아 대기오염정보' },
];

const KMA_LABEL = {
  T1H: { name: '기온', unit: '℃' },
  RN1: { name: '1시간 강수량', unit: 'mm' },
  REH: { name: '습도', unit: '%' },
  PTY: { name: '강수형태', unit: '코드' },
  WSD: { name: '풍속', unit: 'm/s' },
  VEC: { name: '풍향', unit: 'deg' },
  UUU: { name: '동서바람성분', unit: 'm/s' },
  VVV: { name: '남북바람성분', unit: 'm/s' },
};

const results = ref({});
const busy = ref(false);
const showRaw = ref({});

async function load() {
  busy.value = true;
  await Promise.all(
    SOURCES.map(async (s) => {
      try {
        const res = await fetch(`/api/raw/${s.id}`);
        results.value = { ...results.value, [s.id]: await res.json() };
      } catch {
        results.value = {
          ...results.value,
          [s.id]: {
            ok: false,
            source: { id: s.id, name: s.name, url: '' },
            collectedAt: new Date().toISOString(),
            elapsedMs: 0,
            error: '서버에 연결할 수 없습니다.',
          },
        };
      }
    })
  );
  busy.value = false;
}

onMounted(load);

const isMissing = (v) => ['-99', '-998', '-999'].includes(String(v));

function kmaItems(r) {
  return r?.raw?.response?.body?.items?.item ?? [];
}
function airItems(r) {
  return r?.raw?.response?.body?.items ?? [];
}
</script>

<template>
  <header class="masthead">
    <div>
      <p class="eyebrow">Stage 1 · Open API Ingestion</p>
      <h1>공공 Open API 원본 데이터 수집</h1>
    </div>
    <AppNav />
  </header>

  <div class="notice" style="margin-bottom: 16px">
    브라우저는 공공데이터포털을 직접 호출하지 않습니다. 모든 요청은
    <code>/api/raw/:source</code> Express 프록시를 거치며, 인증키는 서버
    환경변수에만 존재합니다. 개발자도구 Network 탭에서 인증키가 노출되지 않는 것을
    확인할 수 있습니다.
  </div>

  <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 16px">
    <button class="act" :disabled="busy" @click="load">
      {{ busy ? '호출 중…' : '전체 다시 호출' }}
    </button>
    <span class="stamp">대상 지역 · 울산광역시</span>
  </div>

  <div style="display: grid; gap: 16px">
    <section v-for="s in SOURCES" :key="s.id" class="panel">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px">
        <h2 class="panel-title" style="margin: 0">
          <span class="dot" :class="results[s.id]?.ok ? 's-normal' : 's-danger'" style="margin-right: 7px" />
          {{ s.name }}
        </h2>
        <button class="act" @click="showRaw[s.id] = !showRaw[s.id]">
          {{ showRaw[s.id] ? '원본 접기' : '원본 JSON 보기' }}
        </button>
      </div>

      <p v-if="!results[s.id]" class="stamp">호출 중…</p>

      <template v-else>
        <!-- 실패 -->
        <div v-if="!results[s.id].ok" class="alarm">
          <strong>수집 실패</strong>
          <div style="margin-top: 4px">{{ results[s.id].error }}</div>
          <div v-if="results[s.id].detail" class="stamp" style="margin-top: 6px">
            상세: {{ results[s.id].detail }}
          </div>
          <div class="stamp" style="margin-top: 6px">
            오류 유형 {{ results[s.id].errorKind }} · 소요 {{ results[s.id].elapsedMs }}ms · 재시도 2회 후 실패
          </div>
        </div>

        <!-- 기상청 -->
        <table v-else-if="s.id === 'kma'" class="grid">
          <thead>
            <tr>
              <th>코드</th><th>관측 항목</th>
              <th style="text-align: right">값</th>
              <th>단위</th><th>관측 시각</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in kmaItems(results[s.id])" :key="it.category">
              <td class="num">{{ it.category }}</td>
              <td>{{ KMA_LABEL[it.category]?.name ?? '—' }}</td>
              <td class="num" style="text-align: right" :style="isMissing(it.obsrValue) ? 'color: var(--warning)' : ''">
                {{ isMissing(it.obsrValue) ? `${it.obsrValue} (결측)` : it.obsrValue }}
              </td>
              <td class="stamp">{{ KMA_LABEL[it.category]?.unit ?? '' }}</td>
              <td class="stamp">
                {{ it.baseDate.slice(0,4) }}-{{ it.baseDate.slice(4,6) }}-{{ it.baseDate.slice(6,8) }}
                {{ it.baseTime.slice(0,2) }}:{{ it.baseTime.slice(2,4) }}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 에어코리아 -->
        <table v-else class="grid">
          <thead>
            <tr>
              <th>측정소</th>
              <th style="text-align: right">PM10</th>
              <th style="text-align: right">PM2.5</th>
              <th style="text-align: right">O₃</th>
              <th>측정 시각</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in airItems(results[s.id]).slice(0, 12)" :key="`${it.stationName}-${i}`">
              <td>{{ it.stationName }}</td>
              <td class="num" style="text-align: right">{{ it.pm10Value ?? '-' }}</td>
              <td class="num" style="text-align: right">{{ it.pm25Value ?? '-' }}</td>
              <td class="num" style="text-align: right">{{ it.o3Value ?? '-' }}</td>
              <td class="stamp">{{ it.dataTime }}</td>
            </tr>
          </tbody>
        </table>

        <!-- 출처와 호출 시각: 성공·실패 모두 표시 -->
        <div class="stamp" style="margin-top: 12px; border-top: 1px solid var(--rule-soft); padding-top: 10px">
          데이터 출처 · {{ results[s.id].source.name }}
          <template v-if="results[s.id].source.station">
            (대표 측정소: {{ results[s.id].source.station }})
          </template><br />
          출처 URL · {{ results[s.id].source.url || '-' }}<br />
          호출 시각 · {{ formatKst(results[s.id].collectedAt) }} (KST) · 응답 {{ results[s.id].elapsedMs }}ms
        </div>

        <pre v-if="showRaw[s.id]" class="raw" style="margin-top: 12px">{{ JSON.stringify(results[s.id].raw, null, 2) }}</pre>
      </template>
    </section>
  </div>
</template>
