<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * 3단계 3D 디지털 트윈.
 *
 * TresJS 같은 Vue 래퍼를 쓰지 않고 Three.js를 직접 제어한다.
 * 의존성이 하나 줄고, 씬 생성부터 정리까지 흐름이 한 파일에 드러나
 * 코드를 읽고 설명하기 쉽기 때문이다.
 *
 * 요구사항 대응
 *   회전·확대·축소 → OrbitControls (드래그 / 휠 / 우클릭 이동)
 *   객체 선택       → Raycaster로 클릭 지점의 메시를 찾아 설비 ID 역추적
 *   상태 시각 구분  → 본체 색 + 바닥 상태 링
 */

const props = defineProps({
  equipments: { type: Array, default: () => [] },
  statusMap: { type: Object, default: () => ({}) },
  selected: { type: String, default: null },
});

const emit = defineEmits(['select']);

/**
 * 제출물 7번 '3D 모델 원본 또는 모델 파일' 대응.
 *
 * 설비 형상을 외부 모델 파일 없이 Three.js 기본 지오메트리로 생성하므로
 * 모델 원본은 이 컴포넌트의 소스코드 자체다.
 * 다만 표준 포맷 파일도 함께 제출할 수 있도록 현재 씬을 glTF로 내보낸다.
 */
function exportGltf() {
  const exporter = new GLTFExporter();
  const target = new THREE.Group();
  for (const { group } of registry.values()) target.add(group.clone());

  exporter.parse(
    target,
    (result) => {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ulsan-reservoir-equipment.gltf';
      a.click();
      URL.revokeObjectURL(url);
    },
    (err) => console.error('glTF 내보내기 실패:', err),
    { binary: false }
  );
}

defineExpose({ exportGltf });

const STATUS_COLOR = {
  normal: 0x2fb96a,
  warning: 0xeaa010,
  danger: 0xe5484d,
  unknown: 0x5c7383,
};

const host = ref(null);

let renderer, scene, camera, controls, raycaster, frameId;
let resizeObserver;
// 설비 ID → { group, statusMeshes[], halo, spinner }
const registry = new Map();
const pointer = new THREE.Vector2();

onMounted(() => {
  init();
  buildEquipments();
  applyStatus();
  animate();
});

onBeforeUnmount(() => {
  // three.js는 GC가 GPU 리소스를 회수하지 않으므로 직접 정리한다.
  cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  host.value?.removeEventListener('click', onClick);
  controls?.dispose();
  scene?.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
  renderer?.dispose();
  if (renderer?.domElement && host.value?.contains(renderer.domElement)) {
    host.value.removeChild(renderer.domElement);
  }
});

watch(() => props.statusMap, applyStatus, { deep: true });
watch(() => props.selected, applySelection);
watch(
  () => props.equipments,
  () => {
    if (!scene) return;
    buildEquipments();
    applyStatus();
  }
);

function init() {
  const el = host.value;
  const w = el.clientWidth || 800;
  const h = el.clientHeight || 600;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07131a);
  scene.fog = new THREE.Fog(0x07131a, 24, 46);

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
  camera.position.set(11, 8, 12);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.target.set(0, 1, 0);

  // 조명
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -16;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x4a90b8, 0.5);
  fill.position.set(-8, 6, -6);
  scene.add(fill);

  // 부지 바닥
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 44),
    new THREE.MeshStandardMaterial({ color: 0x0b1d26, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(40, 40, 0x1f4a5e, 0x16323f);
  grid.position.y = 0.01;
  scene.add(grid);

  raycaster = new THREE.Raycaster();
  host.value.addEventListener('click', onClick);

  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(el);
}

function onResize() {
  const el = host.value;
  if (!el || !renderer) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

/** 클릭 지점에서 광선을 쏴 맞은 메시의 설비 ID를 찾는다. */
function onClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(
    [...registry.values()].map((r) => r.group),
    true
  );

  if (hits.length === 0) {
    emit('select', null); // 빈 공간 클릭 시 선택 해제
    return;
  }

  // 맞은 메시에서 부모를 거슬러 올라가며 설비 ID를 찾는다.
  let node = hits[0].object;
  while (node && !node.userData.equipmentId) node = node.parent;
  emit('select', node?.userData.equipmentId ?? null);
}

function buildEquipments() {
  // 기존 설비 제거
  for (const { group } of registry.values()) scene.remove(group);
  registry.clear();

  for (const eq of props.equipments) {
    const group = new THREE.Group();
    group.position.set(...eq.position);
    group.userData.equipmentId = eq.id;

    // 바닥 상태 링 — 본체가 가려져도 상태를 읽을 수 있게 한다.
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0x5c7383,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    group.add(halo);

    // 선택 표시 링
    const selectRing = new THREE.Mesh(
      new THREE.RingGeometry(2.05, 2.2, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    selectRing.rotation.x = -Math.PI / 2;
    selectRing.position.y = 0.04;
    selectRing.visible = false;
    group.add(selectRing);

    const built = BUILDERS[eq.kind](group);

    scene.add(group);
    registry.set(eq.id, {
      group,
      halo,
      selectRing,
      statusMeshes: built.statusMeshes,
      spinner: built.spinner ?? null,
    });
  }
}

function applyStatus() {
  for (const [id, r] of registry) {
    const status = props.statusMap[id] ?? 'unknown';
    const color = STATUS_COLOR[status];
    r.halo.material.color.setHex(color);
    r.halo.userData.status = status;
    for (const m of r.statusMeshes) m.material.color.setHex(color);
  }
}

function applySelection() {
  for (const [id, r] of registry) {
    r.selectRing.visible = props.selected === id;
  }
}

function animate() {
  frameId = requestAnimationFrame(animate);
  const t = performance.now() / 1000;

  for (const r of registry.values()) {
    // 위험 상태만 링을 맥동시켜 시선을 유도한다.
    const status = r.halo.userData.status;
    r.halo.material.opacity =
      status === 'danger'
        ? 0.35 + Math.sin(t * 4) * 0.3
        : status === 'warning'
          ? 0.4
          : 0.22;
    // 펌프 축 회전 — 가동 중임을 표현
    if (r.spinner) r.spinner.rotation.y += 0.05;
  }

  controls.update();
  renderer.render(scene, camera);
}

/* ── 설비 형상 ──────────────────────────────────────────
   외부 3D 모델 파일 없이 기본 지오메트리 조합으로 구성했다.
   프로토타입 단계에서 형상 정확도보다 식별 가능성을 우선했다.
   statusMeshes에 담긴 메시가 상태색으로 칠해진다.
   ────────────────────────────────────────────────────── */

const steel = (opts = {}) =>
  new THREE.MeshStandardMaterial({
    color: 0x2c4e5f,
    metalness: 0.55,
    roughness: 0.45,
    ...opts,
  });

function add(group, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const BUILDERS = {
  tank(g) {
    add(g, new THREE.CylinderGeometry(1.5, 1.5, 3.2, 32), steel(), [0, 1.6, 0]);
    // 내부 수위 표현
    add(
      g,
      new THREE.CylinderGeometry(1.52, 1.52, 2.2, 32),
      new THREE.MeshStandardMaterial({
        color: 0x1a5f7a,
        transparent: true,
        opacity: 0.55,
        roughness: 0.1,
      }),
      [0, 1.2, 0]
    );
    add(g, new THREE.BoxGeometry(0.08, 3.2, 0.5), steel({ color: 0x4a6878 }), [1.55, 1.6, 0]);
    const cover = add(
      g,
      new THREE.CylinderGeometry(1.6, 1.5, 0.25, 32),
      steel({ metalness: 0.4 }),
      [0, 3.3, 0]
    );
    return { statusMeshes: [cover] };
  },

  pump(g) {
    add(g, new THREE.BoxGeometry(2.2, 0.3, 1.4), steel({ color: 0x22404f, roughness: 0.8 }), [0, 0.15, 0]);
    const motor = add(
      g,
      new THREE.CylinderGeometry(0.45, 0.45, 1.1, 24),
      steel({ metalness: 0.6 }),
      [-0.55, 0.85, 0],
      [0, 0, Math.PI / 2]
    );
    add(g, new THREE.SphereGeometry(0.55, 24, 16), steel({ metalness: 0.65 }), [0.7, 0.8, 0]);
    add(g, new THREE.CylinderGeometry(0.25, 0.25, 0.9, 16), steel(), [0.7, 1.65, 0]);

    // 회전 축
    const spinner = new THREE.Group();
    spinner.position.set(0.7, 0.8, 0);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.3, 12),
      steel({ color: 0x8fb3c4, metalness: 0.9, roughness: 0.15 })
    );
    shaft.rotation.z = Math.PI / 2;
    spinner.add(shaft);
    g.add(spinner);

    return { statusMeshes: [motor], spinner };
  },

  valve(g) {
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 2.4, 20), steel(), [0, 0.9, 0], [Math.PI / 2, 0, 0]);
    const body = add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.65, 20), steel(), [0, 0.9, 0]);
    add(g, new THREE.BoxGeometry(0.55, 0.85, 0.55), steel({ color: 0x3a5c6d, roughness: 0.6 }), [0, 1.75, 0]);
    add(
      g,
      new THREE.TorusGeometry(0.34, 0.06, 10, 28),
      steel({ color: 0x8fb3c4, metalness: 0.7 }),
      [0, 2.3, 0],
      [-Math.PI / 2, 0, 0]
    );
    return { statusMeshes: [body] };
  },

  pipe(g) {
    add(g, new THREE.CylinderGeometry(0.32, 0.32, 5.4, 20), steel(), [0, 0, 0], [0, 0, Math.PI / 2]);
    const meter = add(g, new THREE.CylinderGeometry(0.44, 0.44, 0.7, 20), steel(), [0, 0, 0]);
    for (const x of [-1.8, 1.8]) {
      add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20), steel({ color: 0x4a6878 }), [x, 0, 0], [0, 0, Math.PI / 2]);
    }
    for (const x of [-2.2, 2.2]) {
      add(g, new THREE.BoxGeometry(0.16, 0.85, 0.16), steel({ color: 0x345466 }), [x, -0.4, 0]);
    }
    return { statusMeshes: [meter] };
  },

  filter(g) {
    add(g, new THREE.BoxGeometry(1.6, 2.6, 1.2), steel({ metalness: 0.45, roughness: 0.55 }), [0, 1.3, 0]);
    const cartridges = [0.7, 1.35, 2.0].map((y) =>
      add(g, new THREE.BoxGeometry(1.3, 0.42, 0.08), steel({ metalness: 0.3, roughness: 0.7 }), [0, y, 0.63])
    );
    add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), steel({ color: 0x8fb3c4, metalness: 0.8 }), [0.55, 2.45, 0.62], [Math.PI / 2, 0, 0]);
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16), steel({ color: 0x3a5c6d }), [0, 2.85, 0], [0, 0, Math.PI / 2]);
    return { statusMeshes: cartridges };
  },
};
</script>

<template>
  <div ref="host" class="viewport">
    <span class="stamp viewport-hint">
      드래그 회전 · 휠 확대/축소 · 우클릭 드래그 이동 · 설비 클릭 시 상세
    </span>
  </div>
</template>
