/**
 * 主入口 — 复刻 Doodle District 渲染管线
 * 物体用 inkMaterial（G-buffer ShaderMaterial），DoodleRenderer 两遍渲染出画风。
 * 无需 Three.js 光照 / wireframe / EdgesGeometry —— 排线与描边由后处理统一生成。
 */
import * as THREE from 'three';
import { DoodleRenderer, inkMaterial, INK } from './doodle-renderer.js';
import { HUD } from './hud.js';

const canvas = document.getElementById('gameCanvas');
const doodle = new DoodleRenderer(canvas);
const camera = doodle.camera;
camera.position.set(0, 1.8, 7);

const scene = new THREE.Scene();

// ===== 共享墨色材质 =====
const matBlue   = inkMaterial({ ink: INK.BLUE });
const matBlack  = inkMaterial({ ink: INK.BLACK });
const matGround = inkMaterial({ ink: INK.BLUE, shadeScale: 0.22, shadeBias: 0.74 }); // 地面偏亮留白
const matOrange = inkMaterial({ ink: INK.ORANGE, fill: true });  // 彩笔橙（实心高亮）
const matRed    = inkMaterial({ ink: INK.RED, fill: true });     // 彩笔红（敌人）

// ===== 天空穹顶：巨大半球内壁（经纬弧线由边缘检测生成） =====
const dome = new THREE.Mesh(
  new THREE.SphereGeometry(70, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
  inkMaterial({ ink: INK.BLUE, side: THREE.BackSide, shadeScale: 0.7, shadeBias: 0.28 })
);
scene.add(dome);

// ===== 建筑 =====
function addBuilding(x, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, matBlue);
  mesh.position.set(x, h / 2, z);
  scene.add(mesh);
  // 外置楼梯（几何块堆叠）
  for (let i = 0; i < 5; i++) {
    const sGeo = new THREE.BoxGeometry(w * 0.5, 0.35, 0.8);
    const step = new THREE.Mesh(sGeo, i % 2 ? matBlack : matBlue);
    step.position.set(x + w / 2 + i * 0.6, 0.35 + i * 0.45, z + d / 2 + 1.2);
    scene.add(step);
  }
  return mesh;
}
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

// ===== 地面 =====
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), matGround);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

// ===== 悬浮云朵 =====
function addCloud(x, y, z, scale) {
  const group = new THREE.Group();
  const spheres = [[0,0,0,1.0],[1.1,0.2,0.2,0.7],[-1.0,0.1,0.0,0.65],[0.3,0.5,-0.1,0.55]];
  for (const [sx, sy, sz, sr] of spheres) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(sr, 12, 10), matBlue);
    s.position.set(sx, sy, sz);
    group.add(s);
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

// ===== 悬浮几何立体块 =====
function addFloatingBlock(x, y, z, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}
const floaters = [];
floaters.push(addFloatingBlock(-6, 7, -10, new THREE.TetrahedronGeometry(1.2), matBlue));
floaters.push(addFloatingBlock(7, 8, -14, new THREE.BoxGeometry(1.4, 1.4, 1.4), matBlue));
floaters.push(addFloatingBlock(15, 6, -8, new THREE.OctahedronGeometry(1.0), matBlack));
floaters.push(addFloatingBlock(-15, 9, -18, new THREE.TorusGeometry(1.1, 0.25, 10, 20), matBlue));

// ===== 彩笔高亮（橙/红实心） =====
function addBridge(x, y, z, len) {
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 1.1), matOrange);
  deck.position.set(x, y, z);
  scene.add(deck);
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), matOrange);
    post.position.set(x + (i - 2) * (len / 4), y + 0.28, z);
    scene.add(post);
  }
}
addBridge(-3, 3.4, -13, 3.0);

function addOrangePipe(x, y, z, h) {
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h, 12), matOrange);
  cyl.position.set(x, y, z);
  scene.add(cyl);
}
addOrangePipe(0.6, 3, -18, 5);
addOrangePipe(13.4, 2.4, -8, 4);

// 红色敌人方块
const enemy = addFloatingBlock(0, 1.0, -9, new THREE.BoxGeometry(0.9, 0.9, 0.9), matRed);
floaters.push(enemy);

// ===== 第一人称武器（G-buffer 材质，随相机） =====
const gun = new THREE.Group();
function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  gun.add(m);
  return m;
}
box(0.14, 0.16, 0.85, matBlue, 0.32, -0.30, -0.55);      // 枪身
box(0.06, 0.06, 0.5, matBlack, 0.32, -0.28, -1.15);      // 枪管
box(0.12, 0.12, 0.22, matBlue, 0.32, -0.12, -0.7);       // 瞄准镜（方框）
box(0.08, 0.22, 0.14, matBlack, 0.32, -0.45, -0.5, 0.2); // 弹匣
box(0.08, 0.2, 0.1, matBlue, 0.32, -0.48, -0.35, -0.3);  // 握把
box(0.1, 0.14, 0.2, matBlue, 0.32, -0.3, -0.05);         // 枪托
box(0.03, 0.06, 0.03, matRed, 0.32, -0.22, -1.4);        // 准星（红）
gun.scale.setScalar(0.55);
gun.position.set(0.45, -0.42, 0.1);
camera.add(gun);

// ===== 控制 =====
const keys = {};
let yaw = 0, pitch = 0;
document.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  }
});
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  // 数字键 1-4 切换武器
  const wi = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
  if (wi !== undefined) hud.setWeapon(wi);
});
document.addEventListener('keyup', (e) => keys[e.code] = false);
document.addEventListener('contextmenu', (e) => e.preventDefault());

const velocity = new THREE.Vector3();
const moveSpeed = 6.0;

// ===== HUD =====
const hud = new HUD();
let ammo = 35, reserve = 175, fireCooldown = 0;

// ===== 主循环 =====
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, yaw, 0);

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

  fireCooldown -= dt;
  if (keys['KeyF'] && fireCooldown <= 0 && ammo > 0) {
    ammo--; fireCooldown = 0.15;
    if (ammo <= 0) ammo = 35;
  }

  floaters.forEach((f, i) => {
    f.rotation.x += dt * 0.3;
    f.rotation.y += dt * 0.4;
    f.position.y += Math.sin(elapsed * 1.2 + i) * 0.002;
  });

  doodle.render(elapsed, scene);

  hud.setStats({
    hp: 88, maxHp: 100, ammo, reserve,
    score: Math.floor(elapsed * 7), wave: 3,
  });
  hud.render();
}

document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === canvas && ammo > 0) {
    ammo--;
    if (ammo <= 0) ammo = 35;
  }
});

animate();
