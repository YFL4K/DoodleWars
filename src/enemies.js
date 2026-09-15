/**
 * 敌人系统 — 参数复刻自 Doodle District mr 表
 * 人形涂鸦身体（体/头/四肢/帽）用 G-buffer inkMaterial；AI 追击/射击/近战/受击/死亡。
 */
import * as THREE from 'three';
import { inkMaterial, INK } from './doodle-renderer.js';
import { audio } from './audio.js';

export const ENEMY_DEFS = {
  grunt:  { hp: 100, speed: 5.2, weapon: 'rifle',   range: 28, stop: 16, keep: 7, burst: 3, burstInt: .15, cool: [1.6, 2.6], dmg: 6,  spread: .055, pspeed: 36, score: 100,  scale: 1,    name: 'GRUNT',  hat: 'cap' },
  rusher: { hp: 70,  speed: 7.6, weapon: 'blade',   lunge: 2.9, reach: 3, standoff: 1.9, cool: [1, 1.5], dmg: 15, score: 120, scale: .95, name: 'RUSHER', hat: 'band' },
  heavy:  { hp: 320, speed: 3,   weapon: 'shotgun', range: 18, stop: 9, keep: 5, pellets: 7, cool: [2.4, 3.2], dmg: 5, spread: .13, pspeed: 32, score: 260, scale: 1.25, name: 'HEAVY', hat: 'helmet' },
  sniper: { hp: 60,  speed: 3.6, weapon: 'sniper',  range: 90, stop: 90, keep: 15, aimTime: 1.7, cool: [2.8, 3.8], dmg: 22, spread: .006, pspeed: 95, score: 180, scale: 1.05, name: 'SNIPER', hat: 'hood', stationary: true },
  bomber: { hp: 26,  speed: 6.5, weapon: 'bomb',    fuseRange: 3.4, fuse: 1.05, blast: 4.2, dmg: 24, score: 150, scale: .9, name: 'INK BOMB', ink: INK.BLACK },
  flyer:  { hp: 40,  speed: 6.2, weapon: 'dive',    dmg: 10, cool: [2.8, 4.2], score: 140, scale: 1.5, name: 'PAPER WASP', flying: true },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const BOX = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const SPH = (r, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); m.position.set(x, y, z); return m; };

export class Enemy {
  constructor(typeKey, pos, waveScale = 1) {
    const def = ENEMY_DEFS[typeKey];
    Object.assign(this, def);
    this.type = typeKey;
    this.maxHp = this.hp;
    this.ink = def.ink ?? INK.BLUE;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.state = 'spawn'; this.stateT = 0;
    this.fireT = rnd(def.cool ? def.cool[0] : 1, def.cool ? def.cool[1] : 2);
    this.burstLeft = 0; this.burstT = 0;
    this.aimT = 0;
    this.dead = false; this.deadT = 0;
    this.hitFlash = 0;
    this.walk = 0;
    this.mat = inkMaterial({ ink: this.ink });
    this.dark = inkMaterial({ ink: INK.BLACK });
    this.red = inkMaterial({ ink: INK.RED, fill: true });
    this.group = new THREE.Group();
    this.build();
    this.group.position.copy(this.pos);
    this.group.scale.setScalar(this.scale);
  }

  build() {
    const g = this.group;
    if (this.type === 'bomber') {
      // 墨弹：圆球 + 引信
      g.add(SPH(.5, this.mat, 0, .5, 0));
      g.add(BOX(.06, .3, .06, this.dark, 0, 1.05, 0));
      this.fuseDot = SPH(.09, this.red, 0, 1.2, 0); g.add(this.fuseDot);
      this.headMesh = g.children[0];
      return;
    }
    if (this.type === 'flyer') {
      // 纸蜂：身体 + 两翼
      g.add(BOX(.3, .3, .8, this.mat, 0, 0, 0));
      this.wingL = BOX(1.1, .04, .4, this.dark, -.7, .1, 0); g.add(this.wingL);
      this.wingR = BOX(1.1, .04, .4, this.dark, .7, .1, 0); g.add(this.wingR);
      g.add(SPH(.18, this.red, 0, 0, -.45)); // 头/眼
      this.headMesh = g.children[3];
      return;
    }
    // 人形：腿/身/头/手臂/帽
    const bw = this.type === 'heavy' ? 1.55 : this.type === 'sniper' ? .78 : this.type === 'rusher' ? .82 : 1;
    const hs = this.type === 'heavy' ? .88 : this.type === 'sniper' ? .92 : this.type === 'rusher' ? .95 : 1;
    const lr = this.type === 'heavy' ? .05 : .032;
    // 腿
    this.legL = BOX(.14 * bw, .7, .16, this.dark, -.16 * bw, .35, 0); g.add(this.legL);
    this.legR = BOX(.14 * bw, .7, .16, this.dark, .16 * bw, .35, 0); g.add(this.legR);
    // 身体
    g.add(BOX(.5 * bw, .8, .3, this.mat, 0, 1.15, 0));
    // 手臂（持武器侧）
    this.armL = BOX(.12, .6, .12, this.mat, -.32 * bw, 1.2, 0); g.add(this.armL);
    this.armR = BOX(.12, .5, .12, this.mat, .32 * bw, 1.25, -.1, -.9); g.add(this.armR);
    // 头
    const head = BOX(.34 * hs, .34 * hs, .34 * hs, this.mat, 0, 1.75, 0); g.add(head);
    this.headMesh = head;
    // 眼睛（红，判断朝向）
    g.add(SPH(.04, this.red, -.08 * hs, 1.78, -.18));
    g.add(SPH(.04, this.red, .08 * hs, 1.78, -.18));
    // 帽子
    if (this.hat === 'cap') g.add(BOX(.4 * hs, .08, .42 * hs, this.dark, 0, 1.96, -.02));
    else if (this.hat === 'band') g.add(BOX(.38 * hs, .06, .38 * hs, this.red, 0, 1.92, 0));
    else if (this.hat === 'helmet') { g.add(SPH(.24 * hs, this.dark, 0, 1.95, 0)); }
    else if (this.hat === 'hood') g.add(BOX(.42 * hs, .3, .44 * hs, this.dark, 0, 1.85, .02));
    // 武器（手持小方块）
    if (this.weapon === 'rifle' || this.weapon === 'sniper') g.add(BOX(.06, .06, .7, this.dark, .32 * bw, 1.15, -.4));
    else if (this.weapon === 'shotgun') g.add(BOX(.09, .09, .6, this.dark, .32 * bw, 1.15, -.35));
    else if (this.weapon === 'blade') g.add(BOX(.03, .04, .8, this.dark, .32 * bw, 1.2, -.45, .3));
  }

  takeDamage(dmg, dir, crit) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 0.1;
    // 击退
    this.vel.addScaledVector(dir, crit ? 4 : 2.5 / (this.scale * (this.type === 'heavy' ? 3 : 1)));
    if (this.hp <= 0) this.die();
    else { audio.hitEnemy(this.pos); if (crit) audio.headshot(this.pos); }
  }

  die() {
    this.dead = true; this.state = 'dead'; this.deadT = 0;
    audio.enemyDie(this.pos);
    if (this.type === 'bomber') this.explode();
  }

  explode() {
    audio.explosion(this.pos);
    this._exploded = true;
  }

  /**
   * AI 更新。返回需要生成的敌方弹丸数组。
   */
  update(dt, playerPos, groundY, spawnProjectiles) {
    this.stateT += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const out = [];
    if (this.dead) {
      this.deadT += dt;
      this.group.rotation.x = Math.min(Math.PI / 2, this.deadT * 3);
      this.group.position.y = groundY - this.deadT * .5;
      return { out, remove: this.deadT > 1.2 };
    }

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos); toPlayer.y = 0;
    const dist = toPlayer.length();
    const dir = toPlayer.clone().normalize();
    // 朝向玩家
    this.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;

    if (this.state === 'spawn') {
      if (this.stateT > 0.5) this.state = 'hunt';
      return { out, remove: false };
    }

    // 移动
    const stop = this.stop ?? this.reach ?? 3;
    let move = new THREE.Vector3();
    if (this.type === 'flyer') {
      // 俯冲：绕圈 + 接近
      const orbit = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(2);
      move.copy(dir).multiplyScalar(this.speed).add(orbit);
      this.pos.y = THREE.MathUtils.lerp(this.pos.y, playerPos.y + 2.5 + Math.sin(this.stateT * 2) * .5, dt * 2);
      if (this.wingL) { this.wingL.rotation.z = Math.sin(this.stateT * 20) * .5; this.wingR.rotation.z = -Math.sin(this.stateT * 20) * .5; }
      if (dist < 2.5 && this.fireT <= 0) { this.fireT = rnd(...this.cool); out.push({ type: 'melee', pos: this.pos.clone(), dmg: this.dmg }); }
    } else if (this.type === 'bomber') {
      move.copy(dir).multiplyScalar(this.speed);
      if (dist < this.fuseRange) {
        this.fuseT = (this.fuseT || this.fuse) - dt;
        if (this.fuseDot) this.fuseDot.scale.setScalar(1 + Math.sin(this.stateT * 30) * .3);
        if (this.fuseT <= 0) { this.die(); }
      }
    } else if (this.weapon === 'blade') {
      // rusher：接近 + 突进斩
      if (dist > this.standoff) move.copy(dir).multiplyScalar(this.speed);
      if (dist < this.reach && this.fireT <= 0) { this.fireT = rnd(...this.cool); out.push({ type: 'melee', pos: this.pos.clone(), dmg: this.dmg }); }
    } else {
      // 远程：保持距离 + 射击（朝玩家身体中心瞄准）
      if (!this.stationary) {
        if (dist > this.keep) move.copy(dir).multiplyScalar(this.speed);
        else if (dist < this.keep * .6) move.copy(dir).multiplyScalar(-this.speed * .6);
      }
      const muzzle = new THREE.Vector3(this.pos.x, this.pos.y + 1.2 * this.scale, this.pos.z);
      const aim3 = new THREE.Vector3().subVectors(playerPos, muzzle).normalize();
      this.updateShooting(dt, aim3, out);
    }

    // 应用移动 + 重力（非飞行）
    this.vel.x = THREE.MathUtils.lerp(this.vel.x, move.x, dt * 6);
    this.vel.z = THREE.MathUtils.lerp(this.vel.z, move.z, dt * 6);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (this.type !== 'flyer' && this.type !== 'bomber') {
      this.pos.y = groundY;
      // 走路摆动
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.walk += dt * sp * 2;
      if (this.legL) { this.legL.rotation.x = Math.sin(this.walk) * .5; this.legR.rotation.x = -Math.sin(this.walk) * .5; }
    } else if (this.type === 'bomber') {
      this.pos.y = groundY + Math.abs(Math.sin(this.stateT * 8)) * .2;
    }
    this.group.position.copy(this.pos);
    this.fireT -= dt;
    return { out, remove: false };
  }

  updateShooting(dt, dir, out) {
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = this.burstInt || .15; this.burstLeft--;
        this.emitShot(dir, out);
      }
    } else if (this.fireT <= 0) {
      if (this.aimTime) {
        this.aimT += dt;
        if (this.aimT >= this.aimTime) { this.aimT = 0; this.fireT = rnd(...this.cool); this.emitShot(dir, out); }
      } else {
        this.fireT = rnd(...this.cool);
        this.burstLeft = this.burst || 1; this.burstT = 0;
      }
    }
  }

  emitShot(dir, out) {
    const origin = this.pos.clone(); origin.y += 1.2 * this.scale;
    const d = dir.clone();
    const sp = this.spread || 0;
    d.x += rnd(-sp, sp); d.y += rnd(-sp, sp) - .02; d.z += rnd(-sp, sp);
    d.normalize();
    const pellets = this.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const dd = pellets > 1 ? d.clone().add(new THREE.Vector3(rnd(-.05, .05), rnd(-.05, .05), rnd(-.05, .05))).normalize() : d;
      out.push({ type: 'proj', pos: origin, dir: dd, speed: this.pspeed || 30, dmg: this.dmg });
    }
    audio.enemyShot(this.pos);
  }
}
