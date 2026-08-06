/**
 * 제출물 7번 '3D 모델 원본 또는 모델 파일' 생성 스크립트.
 *
 * 설비 형상을 Three.js 기본 지오메트리로 코드 생성하므로 외부 모델 파일이 없다.
 * 제출 규격이 GLB·GLTF·FBX·OBJ·BLEND 중 하나를 요구하므로,
 * 화면과 동일한 지오메트리를 구성해 glTF 2.0으로 내보낸다.
 *
 * Node에는 브라우저 API가 없어 GLTFExporter가 쓰는 FileReader만 최소 구현한다.
 *
 *   npm run model
 */
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { EQUIPMENTS } from '../server/lib/plant.js';

// GLTFExporter가 내부적으로 FileReader를 사용한다. 최소 기능만 구현.
globalThis.FileReader = class {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onload?.();
      this.onloadend?.();
    });
  }
};

const steel = (o = {}) =>
  new THREE.MeshStandardMaterial({ color: 0x2c4e5f, metalness: 0.55, roughness: 0.45, ...o });

function add(g, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], name) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (name) m.name = name;
  g.add(m);
  return m;
}

const BUILDERS = {
  tank(g) {
    add(g, new THREE.CylinderGeometry(1.5, 1.5, 3.2, 32), steel(), [0, 1.6, 0], [0, 0, 0], '저수조_본체');
    add(g, new THREE.CylinderGeometry(1.52, 1.52, 2.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a5f7a, transparent: true, opacity: 0.55, roughness: 0.1 }),
      [0, 1.2, 0], [0, 0, 0], '저수조_수위');
    add(g, new THREE.BoxGeometry(0.08, 3.2, 0.5), steel({ color: 0x4a6878 }), [1.55, 1.6, 0], [0, 0, 0], '점검사다리');
    add(g, new THREE.CylinderGeometry(1.6, 1.5, 0.25, 32), steel({ metalness: 0.4 }), [0, 3.3, 0], [0, 0, 0], '저수조_커버_상태표시');
  },
  pump(g) {
    add(g, new THREE.BoxGeometry(2.2, 0.3, 1.4), steel({ color: 0x22404f, roughness: 0.8 }), [0, 0.15, 0], [0, 0, 0], '펌프_베이스');
    add(g, new THREE.CylinderGeometry(0.45, 0.45, 1.1, 24), steel({ metalness: 0.6 }), [-0.55, 0.85, 0], [0, 0, Math.PI / 2], '전동기_상태표시');
    add(g, new THREE.SphereGeometry(0.55, 24, 16), steel({ metalness: 0.65 }), [0.7, 0.8, 0], [0, 0, 0], '임펠러_케이싱');
    add(g, new THREE.CylinderGeometry(0.25, 0.25, 0.9, 16), steel(), [0.7, 1.65, 0], [0, 0, 0], '토출구');
    add(g, new THREE.CylinderGeometry(0.09, 0.09, 1.3, 12), steel({ color: 0x8fb3c4, metalness: 0.9, roughness: 0.15 }), [0.7, 0.8, 0], [0, 0, Math.PI / 2], '회전축');
  },
  valve(g) {
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 2.4, 20), steel(), [0, 0.9, 0], [Math.PI / 2, 0, 0], '밸브_관로');
    add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.65, 20), steel(), [0, 0.9, 0], [0, 0, 0], '밸브_바디_상태표시');
    add(g, new THREE.BoxGeometry(0.55, 0.85, 0.55), steel({ color: 0x3a5c6d, roughness: 0.6 }), [0, 1.75, 0], [0, 0, 0], '액추에이터');
    add(g, new THREE.TorusGeometry(0.34, 0.06, 10, 28), steel({ color: 0x8fb3c4, metalness: 0.7 }), [0, 2.3, 0], [-Math.PI / 2, 0, 0], '핸들휠');
  },
  pipe(g) {
    add(g, new THREE.CylinderGeometry(0.32, 0.32, 5.4, 20), steel(), [0, 0, 0], [0, 0, Math.PI / 2], '관로_본체');
    add(g, new THREE.CylinderGeometry(0.44, 0.44, 0.7, 20), steel(), [0, 0, 0], [0, 0, 0], '유량계_상태표시');
    for (const x of [-1.8, 1.8]) add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20), steel({ color: 0x4a6878 }), [x, 0, 0], [0, 0, Math.PI / 2], '플랜지');
    for (const x of [-2.2, 2.2]) add(g, new THREE.BoxGeometry(0.16, 0.85, 0.16), steel({ color: 0x345466 }), [x, -0.4, 0], [0, 0, 0], '지지대');
  },
  filter(g) {
    add(g, new THREE.BoxGeometry(1.6, 2.6, 1.2), steel({ metalness: 0.45, roughness: 0.55 }), [0, 1.3, 0], [0, 0, 0], '여과설비_하우징');
    [0.7, 1.35, 2.0].forEach((y, i) =>
      add(g, new THREE.BoxGeometry(1.3, 0.42, 0.08), steel({ metalness: 0.3, roughness: 0.7 }), [0, y, 0.63], [0, 0, 0], `필터카트리지_${i + 1}_상태표시`));
    add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), steel({ color: 0x8fb3c4, metalness: 0.8 }), [0.55, 2.45, 0.62], [Math.PI / 2, 0, 0], '차압게이지');
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16), steel({ color: 0x3a5c6d }), [0, 2.85, 0], [0, 0, Math.PI / 2], '흡입덕트');
  },
};

const scene = new THREE.Scene();
scene.name = '울산_OO배수지_설비';

for (const eq of EQUIPMENTS) {
  const g = new THREE.Group();
  g.name = `${eq.id}_${eq.name.replace(/\s/g, '_')}`;
  g.position.set(...eq.position);
  BUILDERS[eq.kind](g);
  scene.add(g);
}

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, { binary: false });

await fs.mkdir('models', { recursive: true });
await fs.writeFile(
  'models/ulsan-reservoir-equipment.gltf',
  JSON.stringify(result, null, 2),
  'utf-8'
);

const meshes = [];
scene.traverse((o) => o.isMesh && meshes.push(o.name));
console.log('models/ulsan-reservoir-equipment.gltf 생성');
console.log(`  설비 ${EQUIPMENTS.length}종 · 메시 ${meshes.length}개`);
