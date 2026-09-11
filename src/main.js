/**
 * 主入口 — Three.js 场景 + 后处理 Shader + 第一人称视角 + HUD
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { createHatchingTextures, createDoodleShaderPass } from './postprocess.js';
import { HUD } from './hud.js';

// ===== 基础 =====
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
// 背景设为纸色（后处理会进一步叠加横线/装订线）
scene.background = new THREE.Color(0xf4f0e2);

const camera = new THREE.PerspectiveCamera(
  70, window.innerWidth / window.innerHeight, 0.1, 500
);
camera.position.set(0, 1.7, 5);

// ===== 光照（让几何体产生明暗，供排线阴影使用） =====
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(8, 14, 6);
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0xfff1df, 0.45); // 暖白补光（避免蓝紫光污染暖色保留通道）
fillLight.position.set(-6, 4, -4);
scene.add(fillLight);

// ===== 蓝墨水材质 =====
const inkMat = new THREE.MeshLambertMaterial({ color: 0x2c3a6e });
const inkMatLight = new THREE.MeshLambertMaterial({ color: 0x44518f });
const inkMatDark = new THREE.MeshLambertMaterial({ color: 0x1a2348 });

// ===== 环境：Geodesic Dome 穹顶 =====
const domeRadius = 60;
const dome = new THREE.Mesh(
  new THREE.IcosahedronGeometry(domeRadius, 2),
  new THREE.MeshBasicMaterial({ color: 0x3a4a8c, wireframe: true, transparent: true, opacity: 0.35 })
);
dome.position.y = 10;
scene.add(dome);

// ===== 环境：几何建筑群 =====
function addBuilding(x, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, inkMat);
  mesh.position.set(x, h / 2, z);
  scene.add(mesh);

  // 蓝墨水描边
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x1c2a5e })
  );
  edges.position.copy(mesh.position);
  scene.add(edges);

  // 外置楼梯（几何块堆叠）
  const stepN = 5;
  for (let i = 0; i < stepN; i++) {
    const sGeo = new THREE.BoxGeometry(w * 0.5, 0.35, 0.8);
    const step = new THREE.Mesh(sGeo, i % 2 ? inkMatDark : inkMatLight);
    step.position.set(x + w / 2 + i * 0.6, 0.35 + i * 0.45, z + d / 2 + 1.2);
    scene.add(step);
  }
  return mesh;
}

// 中央及四周的楼房
addBuilding(0, -18, 4, 6, 4);
addBuilding(-10, -12, 3, 4, 3);
addBuilding(9, -15, 3.5, 5, 3.5);
addBuilding(-14, -6, 2.5, 3, 2.5);
addBuilding(13, -8, 3, 4.5, 3);
addBuilding(0, 8, 5, 7, 5);
addBuilding(-8, 14, 3, 3.5, 3);
addBuilding(8, 16, 4, 5, 4);
addBuilding(-16, 2, 2.5, 4, 2.5);
addBuilding(16, 4, 3, 6, 3);

// 地面（一张大平面，颜色接近纸色 → shader 判定为背景，保持干净留白）
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: 0xf5f1e4 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

// ===== 环境：悬浮云朵 + 几何立体块 =====
function addCloud(x, y, z, scale) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xf7f3ea });
  const spheres = [
    [0, 0, 0, 1.0],
    [1.1, 0.2, 0.2, 0.7],
    [-1.0, 0.1, 0.0, 0.65],
    [0.3, 0.5, -0.1, 0.55],
  ];
  for (const [sx, sy, sz, sr] of spheres) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(sr, 10, 8), mat);
    s.position.set(sx, sy, sz);
    group.add(s);
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(sr, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x44518f, wireframe: true, transparent: true, opacity: 0.5 })
    );
    wire.position.copy(s.position);
    group.add(wire);
  }
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  scene.add(group);
  return group;
}
addCloud(-8, 12, -25, 1.4);
addCloud(12, 14, -30, 1.8);
addCloud(20, 9, -20, 1.2);
addCloud(-18, 10, -35, 1.6);

// 悬浮几何立体块
function addFloatingBlock(x, y, z, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  scene.add(m);
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x1c2a5e })
  );
  e.position.copy(m.position);
  scene.add(e);
  return m;
}
const floaters = [];
floaters.push(addFloatingBlock(-6, 7, -10, new THREE.TetrahedronGeometry(1.2), inkMatLight));
floaters.push(addFloatingBlock(7, 8, -14, new THREE.BoxGeometry(1.4, 1.4, 1.4), inkMat));
floaters.push(addFloatingBlock(15, 6, -8, new THREE.OctahedronGeometry(1.0), inkMatDark));
floaters.push(addFloatingBlock(-15, 9, -18, new THREE.TorusGeometry(1.1, 0.25, 8, 16), inkMat));

// ===== 彩笔高亮元素（验证橙/红暖色保留通道） =====
// 橙色廊桥（连接中央与左侧建筑）
function addBridge(x, y, z, len) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xf28c28 }); // 橙色彩笔
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 1.1), mat);
  deck.position.set(x, y, z);
  scene.add(deck);
  const deckE = new THREE.LineSegments(
    new THREE.EdgesGeometry(deck.geometry),
    new THREE.LineBasicMaterial({ color: 0x1c2a5e })
  );
  deckE.position.copy(deck.position);
  scene.add(deckE);
  // 桥栏杆（彩笔橙色 + 蓝墨描边）
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), mat);
    post.position.set(x + (i - 2) * (len / 4), y + 0.28, z);
    scene.add(post);
    const postE = new THREE.LineSegments(
      new THREE.EdgesGeometry(post.geometry),
      new THREE.LineBasicMaterial({ color: 0x1c2a5e })
    );
    postE.position.copy(post.position);
    scene.add(postE);
  }
}
addBridge(-3, 3.4, -13, 3.0);

// 橙色管道（建筑外墙彩笔装饰）
function addOrangePipe(x, y, z, h) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xf28c28 });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h, 10), mat);
  cyl.position.set(x, y, z);
  scene.add(cyl);
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(cyl.geometry),
    new THREE.LineBasicMaterial({ color: 0x1c2a5e })
  );
  e.position.copy(cyl.position);
  scene.add(e);
}
addOrangePipe(0.6, 3, -18, 5);    // 中央楼外墙
addOrangePipe(13.4, 2.4, -8, 4);  // 右侧楼外墙

// 红色「敌人」方块（远处漂浮，验证红色保留通道）
const enemyMat = new THREE.MeshLambertMaterial({ color: 0xd93025 });
floaters.push(addFloatingBlock(0, 1.0, -9, new THREE.BoxGeometry(0.9, 0.9, 0.9), enemyMat));

// ===== 第一人称武器（几何化步枪 + 方框瞄准镜） =====
const gun = new THREE.Group();

function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  gun.add(m);
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
    new THREE.LineBasicMaterial({ color: 0x141d45 })
  );
  e.position.copy(m.position);
  e.rotation.copy(m.rotation);
  gun.add(e);
  return m;
}

// 枪身（主体）
box(0.14, 0.16, 0.85, inkMat, 0.32, -0.30, -0.55);
// 枪管
box(0.06, 0.06, 0.5, inkMatDark, 0.32, -0.28, -1.15);
// 瞄准镜（方框）
const scopeGeo = new THREE.BoxGeometry(0.12, 0.12, 0.22);
const scope = new THREE.Mesh(scopeGeo, inkMatLight);
scope.position.set(0.32, -0.12, -0.7);
gun.add(scope);
const scopeWire = new THREE.LineSegments(
  new THREE.EdgesGeometry(scopeGeo),
  new THREE.LineBasicMaterial({ color: 0x141d45 })
);
scopeWire.position.copy(scope.position);
gun.add(scopeWire);
// 弹匣
box(0.08, 0.22, 0.14, inkMatDark, 0.32, -0.45, -0.5, 0.2);
// 握把
box(0.08, 0.2, 0.1, inkMat, 0.32, -0.48, -0.35, -0.3);
// 枪托
box(0.1, 0.14, 0.2, inkMatLight, 0.32, -0.3, -0.05);
// 准星（枪管前端小方框）
const frontPost = new THREE.Mesh(
  new THREE.BoxGeometry(0.03, 0.08, 0.03),
  new THREE.MeshBasicMaterial({ color: 0xe0492b }) // 少量橙红高亮
);
frontPost.position.set(0.32, -0.2, -1.4);
gun.add(frontPost);

// 枪身侧面的斜线剖面（用密集的细线模拟 hatching）
const hatchLines = new THREE.Group();
const hlGeo = new THREE.BoxGeometry(0.001, 0.15, 0.7);
for (let i = 0; i < 14; i++) {
  const l = new THREE.Mesh(
    hlGeo,
    new THREE.MeshBasicMaterial({ color: 0x141d45 })
  );
  l.position.set(0.32 + 0.075, -0.3, -0.85 + i * 0.05);
  l.rotation.z = -Math.PI / 5;
  hatchLines.add(l);
}
gun.add(hatchLines);

camera.add(gun);
scene.add(camera);

// ===== 后处理管线 =====
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const hatchTextures = createHatchingTextures();
const doodlePass = createDoodleShaderPass(hatchTextures);
composer.addPass(doodlePass);

// ===== 第一人称控制 =====
const keys = {};
let yaw = 0, pitch = 0;
let lookX = 0, lookY = 0;

document.addEventListener('click', () => {
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    // 锁定后重置鼠标增量，避免跳帧
  }
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  }
});
document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('contextmenu', (e) => e.preventDefault());

const velocity = new THREE.Vector3();
const moveSpeed = 6.0;

// ===== HUD =====
const hud = new HUD();
let ammo = 30;
let fireCooldown = 0;
let score = 0;

// ===== 主循环 =====
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // 相机朝向
  camera.rotation.set(0, 0, 0);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // 移动（WASD，相对相机朝向）
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

  const move = new THREE.Vector3();
  if (keys['KeyW'] || keys['ArrowUp']) move.add(forward);
  if (keys['KeyS'] || keys['ArrowDown']) move.sub(forward);
  if (keys['KeyD'] || keys['ArrowRight']) move.add(right);
  if (keys['KeyA'] || keys['ArrowLeft']) move.sub(right);
  if (move.length() > 0) move.normalize();

  velocity.lerp(move.multiplyScalar(moveSpeed), 0.15);
  camera.position.addScaledVector(velocity, dt);

  // 开火占位（减弹药，用于演示 Tally Marks）
  fireCooldown -= dt;
  if (keys['KeyF'] || keys['Mouse0'] === true) {
    // 左键用 pointerlock 外监听，这里用键盘 F 作为占位开火
  }
  if (keys['KeyF']) {
    if (fireCooldown <= 0 && ammo > 0) {
      ammo--;
      fireCooldown = 0.15;
      if (ammo <= 0) ammo = 30;
    }
  }

  // 悬浮物轻微浮动
  floaters.forEach((f, i) => {
    f.rotation.x += dt * 0.3;
    f.rotation.y += dt * 0.4;
    f.position.y += Math.sin(elapsed * 1.2 + i) * 0.002;
  });

  // 更新 shader uniforms
  doodlePass.uniforms.time.value = elapsed;
  doodlePass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);

  // 渲染
  composer.render();

  // HUD
  hud.setStats({ hp: 88, maxHp: 100, ammo, maxAmmo: 30, score: Math.floor(elapsed * 7), wave: 3 });
  hud.render();
}

// 左键开火（pointerlock 下 mousedown）
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === canvas && ammo > 0) {
    ammo--;
    if (ammo <= 0) ammo = 30;
  }
});

// ===== 响应式 =====
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// 启动
animate();
