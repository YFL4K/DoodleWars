/**
 * 主入口 — 可玩战斗 DEMO
 * 复用 Doodle District 渲染管线；新增玩家控制 / 武器 / 敌人 / 命中 / 波次 / 音频。
 */
import * as THREE from 'three';
import { DoodleRenderer, inkMaterial, INK } from './doodle-renderer.js';
import { Weapon, WEAPON_DEFS } from './weapons.js';
import { Enemy, ENEMY_DEFS } from './enemies.js';
import { HUD } from './hud.js';
import { audio } from './audio.js';

const canvas = document.getElementById('gameCanvas');
const doodle = new DoodleRenderer(canvas);
const camera = doodle.camera;
const scene = new THREE.Scene();
camera.position.set(0, 1.7, 0);

// ===== 环境（复用 v4 画风场景）=====
const matBlue = inkMaterial({ ink: INK.BLUE });
const matBlack = inkMaterial({ ink: INK.BLACK });
const matGround = inkMaterial({ ink: INK.BLUE, shadeScale: .22, shadeBias: .74 });
const matOrange = inkMaterial({ ink: INK.ORANGE, fill: true });

const dome = new THREE.Mesh(
  new THREE.SphereGeometry(70, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
  inkMaterial({ ink: INK.BLUE, side: THREE.BackSide, shadeScale: .7, shadeBias: .28 })
);
scene.add(dome);

function addBuilding(x, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, matBlue); m.position.set(x, h / 2, z); scene.add(m);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w * .5, .35, .8), i % 2 ? matBlack : matBlue);
    s.position.set(x + w / 2 + i * .6, .35 + i * .45, z + d / 2 + 1.2); scene.add(s);
  }
}
[[0, -18, 4, 6, 4], [-10, -12, 3, 4, 3], [9, -15, 3.5, 5, 3.5], [-14, -6, 2.5, 3, 2.5],
 [13, -8, 3, 4.5, 3], [0, 8, 5, 7, 5], [-8, 14, 3, 3.5, 3], [8, 16, 4, 5, 4],
 [-16, 2, 2.5, 4, 2.5], [16, 4, 3, 6, 3]].forEach(a => addBuilding(...a));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), matGround);
ground.rotation.x = -Math.PI / 2; scene.add(ground);

// 橙色廊桥 + 管道
(function bridge() {
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3, .12, 1.1), matOrange); deck.position.set(-3, 3.4, -13); scene.add(deck);
  for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(.06, .45, .06), matOrange); p.position.set(-3 + (i - 2) * .75, 3.68, -13); scene.add(p); }
})();
[[0.6, 3, -18, 5], [13.4, 2.4, -8, 4]].forEach(([x, y, z, h]) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, h, 12), matOrange); c.position.set(x, y, z); scene.add(c);
});

// ===== 玩家 =====
const player = {
  pos: new THREE.Vector3(0, 1.7, 0), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, hp: 100, maxHp: 100, grounded: true,
  speed: 0, walkPhase: 0, aim: false, alive: true,
};
const EYE = 1.7;

// ===== 武器 =====
const weaponKeys = ['rifle', 'shotgun', 'sniper', 'katana'];
const weapons = weaponKeys.map(k => new Weapon(k));
let curWeapon = 0;
weapons.forEach(w => camera.add(w.root));
function activeWeapon() { return weapons[curWeapon]; }

// ===== HUD =====
const hud = new HUD();

// ===== 敌人 / 弹丸 / 曳光 =====
const enemies = [];
const projectiles = [];   // 敌方弹丸
const tracers = [];       // 玩家曳光
const projMat = inkMaterial({ ink: INK.BLACK });
const projGeo = new THREE.SphereGeometry(.12, 6, 5);
const tracerMat = inkMaterial({ ink: INK.ORANGE });

// ===== 波次 =====
let wave = 0, waveTimer = 2, spawnQueue = [], aliveCount = 0;
const WAVES = [
  ['grunt', 'grunt', 'grunt'],
  ['grunt', 'grunt', 'rusher', 'rusher'],
  ['grunt', 'rusher', 'heavy', 'grunt'],
  ['rusher', 'rusher', 'sniper', 'grunt', 'bomber'],
  ['heavy', 'sniper', 'flyer', 'rusher', 'grunt', 'bomber'],
];
function startWave(n) {
  wave = n;
  const list = WAVES[(n - 1) % WAVES.length];
  spawnQueue = list.slice();
  if (n > WAVES.length) { // 循环加难：额外 grunt
    for (let i = 0; i < Math.min(n - WAVES.length, 6); i++) spawnQueue.push('grunt');
  }
  hud.message('WAVE ' + n, list.length + ' 敌人来袭');
  audio.wave();
}
function spawnEnemy(type) {
  const ang = Math.random() * Math.PI * 2, r = 28 + Math.random() * 14;
  const p = new THREE.Vector3(player.pos.x + Math.cos(ang) * r, 0, player.pos.z + Math.sin(ang) * r);
  const e = new Enemy(type, p);
  scene.add(e.group); enemies.push(e);
}

// ===== 输入 =====
const keys = {};
let mouseDown = false, rightDown = false;
let prevMouseDown = false;
let audioStarted = false;
function ensureAudio() {
  if (audioStarted) return;
  audio.init(); audio.resume(); audio.startMusic(); audioStarted = true;
}
document.addEventListener('click', () => { ensureAudio(); canvas.requestPointerLock(); });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  }
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) rightDown = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightDown = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  const wi = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
  if (wi !== undefined) switchWeapon(wi);
  if (e.code === 'KeyR') activeWeapon().startReload();
  if (e.code === 'Space' && player.grounded) { player.vel.y = 6; player.grounded = false; }
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

function switchWeapon(i) {
  if (i === curWeapon) return;
  curWeapon = i;
  weapons.forEach((w, idx) => w.root.visible = idx === i);
  hud.setWeapon(i);
}
weapons.forEach((w, i) => w.root.visible = i === 0);

// ===== 命中检测 =====
const _ray = new THREE.Raycaster();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
function fireHitscan(w, shot) {
  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, camera.up).normalize();
  _up.crossVectors(_right, _fwd).normalize();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  for (let p = 0; p < shot.pellets; p++) {
    const dir = _fwd.clone();
    const sp = shot.spread;
    dir.addScaledVector(_right, (Math.random() - .5) * sp * 2);
    dir.addScaledVector(_up, (Math.random() - .5) * sp * 2);
    dir.normalize();
    // 最近敌人命中
    let best = null, bestT = shot.range, bestHead = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const bodyC = new THREE.Vector3(e.pos.x, e.pos.y + 1.1 * e.scale, e.pos.z);
      const headC = new THREE.Vector3(e.pos.x, e.pos.y + 1.75 * e.scale, e.pos.z);
      const bodyR = .7 * e.scale, headR = .32 * e.scale;
      const th = raySphere(origin, dir, headC, headR);
      const tb = raySphere(origin, dir, bodyC, bodyR);
      const t = Math.min(th > 0 ? th : 1e9, tb > 0 ? tb : 1e9);
      if (t > 0 && t < bestT) { bestT = t; best = e; bestHead = th > 0 && th <= tb; }
    }
    const end = origin.clone().addScaledVector(dir, best ? bestT : 120);
    addTracer(origin.clone().addScaledVector(_fwd, .5).addScaledVector(_right, .18).addScaledVector(_up, -.15), end);
    if (best) {
      let dmg = shot.damage * (bestHead ? shot.headMul : 1);
      if (shot.falloff) { const [f0, f1, mult] = shot.falloff; const k = THREE.MathUtils.clamp((bestT - f0) / (f1 - f0), 0, 1); dmg *= (1 - k * (1 - mult)); }
      const kd = dir.clone();
      best.takeDamage(dmg, kd, bestHead);
      hud.hitmarker(bestHead, best.dead);
      audio.hitmarker(bestHead);
      if (best.dead) {
        hud.killfeed(best.name, Math.round(shot.damage * (bestHead ? shot.headMul : 1)), bestHead);
        hud.addScore(best.score);
      }
    }
  }
}
function raySphere(o, d, c, r) {
  const oc = new THREE.Vector3().subVectors(o, c);
  const b = oc.dot(d), cc = oc.lengthSq() - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}
function fireMelee(w, shot) {
  camera.getWorldDirection(_fwd);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  for (const e of enemies) {
    if (e.dead) continue;
    const to = new THREE.Vector3().subVectors(new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z), origin);
    const dist = to.length();
    if (dist > shot.range) continue;
    to.normalize();
    if (to.dot(_fwd) < 0.5) continue; // 前方锥形
    e.takeDamage(shot.damage, to, false);
    audio.katanaHit();
    hud.hitmarker(false, e.dead);
    if (e.dead) { hud.killfeed(e.name, shot.damage, false); hud.addScore(e.score); }
  }
}
function addTracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf28c28 }));
  scene.add(line); tracers.push({ line, t: 0.06 });
}

// ===== 主循环 =====
const clock = new THREE.Clock();
let elapsed = 0, hurtFx = 0, flashFx = 0;

function update(dt) {
  // 玩家朝向
  camera.rotation.order = 'YXZ';
  camera.rotation.set(player.pitch, player.yaw, 0);
  // 移动
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const move = new THREE.Vector3();
  if (keys['KeyW']) move.add(fwd);
  if (keys['KeyS']) move.sub(fwd);
  if (keys['KeyD']) move.add(right);
  if (keys['KeyA']) move.sub(right);
  if (move.lengthSq() > 0) move.normalize();
  const speed = (player.aim ? 3 : 6.5);
  player.vel.x = THREE.MathUtils.lerp(player.vel.x, move.x * speed, dt * 10);
  player.vel.z = THREE.MathUtils.lerp(player.vel.z, move.z * speed, dt * 10);
  player.vel.y -= 18 * dt; // 重力
  player.pos.addScaledVector(player.vel, dt);
  if (player.pos.y <= EYE) { player.pos.y = EYE; player.vel.y = 0; player.grounded = true; }
  camera.position.copy(player.pos);
  player.speed = Math.hypot(player.vel.x, player.vel.z);
  player.walkPhase += dt * player.speed * 2;
  player.aim = rightDown && !activeWeapon().isMelee;
  hud.setAim(player.aim);
  // ADS fov
  const w = activeWeapon();
  const targetFov = player.aim ? w.adsFov : 80;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();

  // 开火（左键按住 或 F 键；auto 连发，semi 每次按下触发一次）
  const fireHeld = mouseDown || !!keys['KeyF'];
  const wantFire = fireHeld && (w.auto || !prevMouseDown);
  prevMouseDown = fireHeld;
  const shot = wantFire ? w.tryFire({ aim: player.aim, speed: player.speed, grounded: player.grounded, walkPhase: player.walkPhase }) : null;
  if (shot) {
    if (shot.melee) fireMelee(w, shot); else fireHitscan(w, shot);
    // 相机后坐
    player.pitch += w.camKick[0]; player.yaw += (Math.random() - .5) * w.camKick[1];
  }
  w.update(dt, { aim: player.aim, speed: player.speed, grounded: player.grounded, walkPhase: player.walkPhase });

  // 波次
  aliveCount = enemies.filter(e => !e.dead).length;
  if (spawnQueue.length > 0) {
    waveTimer -= dt;
    if (waveTimer <= 0) { spawnEnemy(spawnQueue.shift()); waveTimer = 0.6; }
  } else if (aliveCount === 0 && player.alive) {
    waveTimer -= dt;
    if (waveTimer <= 0) { startWave(wave + 1); waveTimer = 1.2; }
  }

  // 敌人更新
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const res = e.update(dt, player.pos, 0, projectiles);
    for (const s of res.out) {
      if (s.type === 'proj') {
        const m = new THREE.Mesh(projGeo, projMat); m.position.copy(s.pos); scene.add(m);
        projectiles.push({ mesh: m, pos: s.pos.clone(), dir: s.dir.clone(), speed: s.speed, dmg: s.dmg, life: 3 });
      } else if (s.type === 'melee') {
        if (s.pos.distanceTo(player.pos) < 3) hurtPlayer(s.dmg);
      }
    }
    if (e.type === 'bomber' && e._exploded && !e._blastApplied) {
      e._blastApplied = true;
      if (e.pos.distanceTo(player.pos) < e.blast) hurtPlayer(e.dmg);
      flashFx = .3;
    }
    if (res.remove) { scene.remove(e.group); enemies.splice(i, 1); }
  }

  // 敌方弹丸
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.pos.addScaledVector(pr.dir, pr.speed * dt); pr.life -= dt;
    pr.mesh.position.copy(pr.pos);
    if (pr.pos.distanceTo(player.pos) < 1.1) { hurtPlayer(pr.dmg); removeProj(i); continue; }
    if (pr.life <= 0 || pr.pos.y < 0) removeProj(i);
  }
  // 曳光淡出
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= dt; if (tracers[i].t <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); } }

  // 受伤/闪光特效
  hurtFx = Math.max(0, hurtFx - dt * 2);
  flashFx = Math.max(0, flashFx - dt * 3);

  // 音频 listener
  audio.setListener({ x: player.pos.x, y: player.pos.y, z: player.pos.z },
    { x: right.x, y: 0, z: right.z });
  audio.setIntensity(THREE.MathUtils.clamp(aliveCount / 6, .3, 1));
}
function removeProj(i) { scene.remove(projectiles[i].mesh); projectiles.splice(i, 1); }
function hurtPlayer(dmg) {
  if (!player.alive) return;
  player.hp -= dmg; hurtFx = 1; audio.hurt();
  if (player.hp <= 0) { player.hp = 0; player.alive = false; hud.message('你被擦掉了', '按 R 重开本局'); }
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && !player.alive) { player.hp = 100; player.alive = true; hud.clear(); }
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  if (player.alive) update(dt);
  doodle.render(elapsed, scene, { hurt: hurtFx * 0.6, flash: flashFx, lowHp: player.hp < 30 ? 1 : 0 });
  const w = activeWeapon();
  hud.setStats({
    hp: player.hp, maxHp: player.maxHp,
    ammo: w.mag, reserve: w.reserve, reloading: w.reloading,
    score: hud.score, wave,
  });
  hud.render(dt);
  const dbg = document.getElementById('dbg');
  if (dbg) dbg.textContent = `E:${enemies.length} alive:${aliveCount} P:${projectiles.length} hp:${player.hp.toFixed(0)} q:${spawnQueue.length}`;
}
startWave(1);
animate();
