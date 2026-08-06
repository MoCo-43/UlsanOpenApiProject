<script setup>
const LINKS = [
  { to: '/', label: '3D 트윈', stage: '3·4단계' },
  { to: '/stage1', label: '원본 수집', stage: '1단계' },
  { to: '/stage2', label: '표준화', stage: '2단계' },
];
</script>

<template>
  <nav class="nav">
    <router-link
      v-for="l in LINKS"
      :key="l.to"
      :to="l.to"
      :data-active="$route.path === l.to"
    >
      {{ l.label }}
      <span style="opacity: 0.55; margin-left: 6px; font-size: 11px">{{ l.stage }}</span>
    </router-link>
  </nav>
</template>
