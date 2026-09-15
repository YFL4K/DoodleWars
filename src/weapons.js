/**
 * 武器系统 — 参数复刻自 Doodle District zr 表
 * 枪模用 G-buffer inkMaterial 构建（与场景同画风），挂在相机右下角。
 */
import * as THREE from 'three';
import { inkMaterial, INK } from './doodle-renderer.js';
import { audio } from './audio.js';

// 武器参数（提取自参考源码）
export const WEAPON_DEFS = {
  rifle: {
    name: 'RIFLE', kind: 'rifle', hint: 'auto · put the red dot on them',
    magSize: 35, reserve: 175, maxReserve: 350, interval: 1 / 11,
    damage: 24, headMul: 2.6, pellets: 1,
    spread: .016, adsSpread: .0034, spreadKick: .009, spreadMax: .075, moveSpread: .0012,
    adsFov: 58, reloadDur: 1.45, reloadType: 'mag', auto: true,
    camKick: [.009, .0034], modelKick: [.25, .3, 2.4, -3.2, .9, 1.2], fovKick: 1.2,
    tracer: .02, flashScale: 1, sound: 'shot',
  },
  shotgun: {
    name: 'SHOTGUN', kind: 'shotgun', hint: 'pump · devastating up close',
    magSize: 6, reserve: 36, maxReserve: 72, interval: .78,
    damage: 19, headMul: 1.8, pellets: 10,
    spread: .062, adsSpread: .034, spreadKick: 0, spreadMax: .1, moveSpread: 6e-4,
    adsFov: 68, reloadDur: .45, reloadType: 'shells', auto: false, cycleDur: .45,
    falloff: [11, 32, .22], camKick: [.05, .012], modelKick: [.4, .6, 5, -9, 2, 3], fovKick: 4,
    tracer: .014, flashScale: 1.9, sound: 'shotgunFire',
  },
  sniper: {
    name: 'SNIPER', kind: 'sniper', hint: 'scoped bolt action · one shot, one erasure',
    magSize: 5, reserve: 25, maxReserve: 50, interval: .2,
    damage: 150, headMul: 3, pellets: 1,
    spread: .075, adsSpread: 4e-4, spreadKick: .05, spreadMax: .14, moveSpread: .004,
    adsFov: 20, scope: true, reloadDur: 2.1, reloadType: 'mag', auto: false, cycleDur: .85,
    camKick: [.055, .008], modelKick: [.25, .8, 4.5, -11, 1.2, 2], fovKick: 4.5,
    tracer: .03, flashScale: 1.7, sound: 'sniperFire',
  },
  katana: {
    name: 'KATANA', kind: 'katana', hint: 'slash · hold aim to block',
    magSize: 0, reserve: 0, maxReserve: 0, interval: .32,
    damage: 75, headMul: 1, pellets: 1, range: 3.2,
    spread: 0, adsSpread: 0, moveSpread: 0, adsFov: 65,
    reloadDur: 0, auto: false, slashDur: .27,
    camKick: [.02, .01], modelKick: [0, 0, 0, 0, 0, 0], fovKick: 0,
    sound: 'katanaSwing',
  },
};

const BOX = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
};

export class Weapon {
  constructor(key) {
    Object.assign(this, WEAPON_DEFS[key]);
    this.key = key;
    this.isMelee = this.kind === 'katana';
    this.mag = this.magSize;
    this.fireT = 0; this.reloading = false; this.reloadT = 0;
    this.spreadCur = this.spread;
    this.cycleT = 0;
    this.kickPos = new THREE.Vector3();
    this.kickRot = new THREE.Euler();
    this.slashT = 0;
    this.mat = inkMaterial({ ink: INK.BLUE });
    this.dark = inkMaterial({ ink: INK.BLACK });
    this.red = inkMaterial({ ink: INK.RED, fill: true });
    this.root = new THREE.Group();
    this.build();
  }

  build() {
    const g = this.root;
    if (this.kind === 'rifle') {
      g.add(BOX(.14, .16, .85, this.mat, 0, -.30, -.55));
      g.add(BOX(.06, .06, .55, this.dark, 0, -.28, -1.15));
      g.add(BOX(.12, .12, .22, this.mat, 0, -.12, -.7));      // 方框瞄准镜
      g.add(BOX(.08, .22, .14, this.dark, 0, -.45, -.5, .2)); // 弹匣
      g.add(BOX(.08, .2, .1, this.mat, 0, -.48, -.35, -.3));  // 握把
      g.add(BOX(.1, .14, .2, this.mat, 0, -.3, -.05));        // 枪托
      g.add(BOX(.03, .06, .03, this.red, 0, -.22, -1.4));     // 准星红点
    } else if (this.kind === 'shotgun') {
      g.add(BOX(.16, .18, .9, this.mat, 0, -.32, -.6));
      g.add(BOX(.09, .09, .7, this.dark, 0, -.28, -1.2));     // 粗枪管
      g.add(BOX(.12, .1, .24, this.dark, 0, -.4, -.95));      // 泵动护木
      g.add(BOX(.1, .16, .2, this.mat, 0, -.3, -.05));
      g.add(BOX(.09, .18, .1, this.mat, 0, -.46, -.4, -.3));
    } else if (this.kind === 'sniper') {
      g.add(BOX(.1, .14, .7, this.mat, 0, -.3, -.5));
      g.add(BOX(.045, .045, 1.1, this.dark, 0, -.28, -1.4));  // 长枪管
      g.add(BOX(.1, .1, .34, this.mat, 0, -.1, -.62));        // 大瞄准镜
      g.add(BOX(.05, .05, .34, this.dark, 0, -.1, -.62));
      g.add(BOX(.08, .2, .12, this.dark, 0, -.44, -.45, .15));
      g.add(BOX(.1, .16, .24, this.mat, 0, -.3, -.02));
    } else if (this.kind === 'katana') {
      g.add(BOX(.02, .04, 1.0, this.mat, 0, -.28, -1.0, .1)); // 刀身
      g.add(BOX(.02, .02, .12, this.dark, 0, -.24, -.52));    // 刀尖
      g.add(BOX(.16, .03, .04, this.dark, 0, -.28, -.48));    // 护手
      g.add(BOX(.04, .04, .28, this.mat, 0, -.3, -.34));      // 刀柄
    }
    // 定位到右下角（不挡中央视野）
    g.scale.setScalar(this.kind === 'sniper' ? .62 : .6);
    g.position.set(.42, -.02, .05);
    this.basePos = g.position.clone();
    this.baseRot = new THREE.Euler(0, 0, 0);
    // 枪口闪光（flash）
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), this.red);
    this.flash.position.set(0, -.28, this.kind === 'sniper' ? -1.95 : -1.45);
    this.flash.visible = false;
    g.add(this.flash);
  }

  get canFire() {
    return !this.reloading && this.fireT <= 0 && this.cycleT <= 0 &&
      (this.isMelee || this.mag > 0);
  }

  startReload() {
    if (this.isMelee || this.reloading || this.mag >= this.magSize || this.reserve <= 0) return;
    this.reloading = true; this.reloadT = 0;
    if (this.reloadType === 'shells') audio.shell(); else audio.reload();
  }

  /** 返回本次开火的弹道信息（供 main 做命中） */
  tryFire(state) {
    if (!this.canFire) {
      if (!this.isMelee && this.mag <= 0 && !this.reloading) { audio.empty(); this.startReload(); }
      return null;
    }
    this.fireT = this.interval;
    if (!this.isMelee) this.mag--;
    this.flash.visible = !this.isMelee;
    this.flashT = 0.05;
    // 后坐：模型踢 + 相机 kick
    const [mx, my, mz, rx, ry, rz] = this.modelKick;
    this.kickPos.set(rnd(-mx, mx) * .01, my * .01, -mz * .01);
    this.kickRot.set(rx * .01, rnd(-ry, ry) * .01, rz * .01);
    this.spreadCur = Math.min(this.spreadMax, this.spreadCur + this.spreadKick);
    if (this.cycleDur) this.cycleT = this.cycleDur;
    // 音效
    if (this.isMelee) { audio.katanaSwing(); this.slashT = this.slashDur; }
    else audio[this.sound]();
    // 弹道（世界方向由 main 用相机 + spread 计算）
    const pellets = this.pellets;
    const spread = state.aim ? this.adsSpread : this.spreadCur;
    return { pellets, spread, damage: this.damage, headMul: this.headMul, falloff: this.falloff, melee: this.isMelee, range: this.range || 120, kind: this.kind };
  }

  update(dt, state) {
    this.fireT -= dt;
    this.cycleT -= dt;
    if (this.slashT > 0) this.slashT -= dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadType === 'shells') {
        // 逐发装填
        if (this.reloadT >= this.reloadDur) {
          this.reloadT = 0; this.mag++; this.reserve--;
          audio.shell();
          if (this.mag >= this.magSize || this.reserve <= 0) this.reloading = false;
        }
      } else {
        if (this.reloadT >= this.reloadDur) {
          const need = this.magSize - this.mag, take = Math.min(need, this.reserve);
          this.mag += take; this.reserve -= take; this.reloading = false;
        }
      }
    }
    // spread 恢复
    const target = state.aim ? this.adsSpread : this.spread;
    const mov = Math.min(state.speed || 0, 24) * this.moveSpread + (state.grounded ? 0 : .01);
    this.spreadCur += (target + mov - this.spreadCur) * Math.min(1, 7 * dt);
    // 枪模位置回正 + 走路摆动
    this.kickPos.lerp(new THREE.Vector3(0, 0, 0), Math.min(1, 10 * dt));
    this.kickRot.x *= (1 - Math.min(1, 10 * dt));
    const bob = Math.sin(state.walkPhase || 0) * .008 * (state.speed > 0.5 ? 1 : 0);
    this.root.position.set(
      this.basePos.x + this.kickPos.x,
      this.basePos.y + this.kickPos.y + bob,
      this.basePos.z + this.kickPos.z
    );
    this.root.rotation.set(this.kickRot.x, this.kickRot.y, this.kickRot.z);
    // ADS：向中心收 + 缩小
    const ads = state.aim ? 1 : 0;
    this.root.position.x += (this.isMelee ? -.18 : -.16) * ads;
    this.root.position.y += .12 * ads;
    this.root.scale.setScalar((this.kind === 'sniper' ? .62 : .6) * (1 - ads * .15));
    // 武士刀挥砍动画
    if (this.isMelee && this.slashT > 0) {
      const p = 1 - this.slashT / this.slashDur;
      this.root.rotation.z = Math.sin(p * Math.PI) * 1.4;
      this.root.rotation.y = Math.sin(p * Math.PI) * .6;
    }
  }
}
const rnd = (a, b) => a + Math.random() * (b - a);
