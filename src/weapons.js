/**
 * 武器系统 — CS 系外观 + 玩法参数
 * 五把武器：PISTOL / SMG / SHOTGUN / SNIPER / KATANA
 * 枪模用 G-buffer inkMaterial 构建（与场景同画风），挂在相机右下角。
 */
import * as THREE from 'three';
import { inkMaterial, INK } from './doodle-renderer.js';
import { audio } from './audio.js';

// 武器参数（手感参考 CS 系：手枪点射 / 冲锋枪泼洒 / 喷子一击 / 狙一枪）
export const WEAPON_DEFS = {
  pistol: {
    name: 'PISTOL', kind: 'pistol', hint: 'semi · aim small, hit big',
    magSize: 20, reserve: 80, maxReserve: 160, interval: .15,
    damage: 26, headMul: 3.2, pellets: 1,
    spread: .022, adsSpread: .006, spreadKick: .012, spreadMax: .09, moveSpread: .0015,
    adsFov: 62, reloadDur: 1.25, reloadType: 'mag', auto: false,
    camKick: [.016, .005], modelKick: [.3, .45, 2.2, -2.6, .8, 1], fovKick: 1.6,
    tracer: .02, flashScale: 1, sound: 'pistolFire',
    baseScale: .55, adsOff: [-.11, .105], muzzle: [0, -.255, -.78],
  },
  smg: {
    name: 'SMG', kind: 'smg', hint: 'auto · walk the wall of ink',
    magSize: 30, reserve: 150, maxReserve: 300, interval: 1 / 13,
    damage: 18, headMul: 2.2, pellets: 1,
    spread: .03, adsSpread: .009, spreadKick: .009, spreadMax: .105, moveSpread: .0012,
    adsFov: 60, reloadDur: 1.5, reloadType: 'mag', auto: true,
    camKick: [.011, .006], modelKick: [.25, .3, 2.4, -3.2, .9, 1.2], fovKick: 1.1,
    tracer: .02, flashScale: 1.1, sound: 'smgFire',
    baseScale: .6, adsOff: [-.15, .115], muzzle: [0, -.3, -1.24],
  },
  shotgun: {
    name: 'SHOTGUN', kind: 'shotgun', hint: 'pump · devastating up close',
    magSize: 6, reserve: 36, maxReserve: 72, interval: .85,
    damage: 19, headMul: 1.8, pellets: 10,
    spread: .062, adsSpread: .034, spreadKick: 0, spreadMax: .1, moveSpread: 6e-4,
    adsFov: 68, reloadDur: .45, reloadType: 'shells', auto: false, cycleDur: .45,
    falloff: [11, 32, .22], camKick: [.05, .012], modelKick: [.4, .6, 5, -9, 2, 3], fovKick: 4,
    tracer: .014, flashScale: 1.9, sound: 'shotgunFire',
    baseScale: .6, adsOff: [-.16, .12], muzzle: [0, -.27, -1.5],
  },
  sniper: {
    name: 'SNIPER', kind: 'sniper', hint: 'scoped bolt action · one shot, one erasure',
    magSize: 5, reserve: 25, maxReserve: 50, interval: .2,
    damage: 150, headMul: 3, pellets: 1,
    spread: .075, adsSpread: 4e-4, spreadKick: .05, spreadMax: .14, moveSpread: .004,
    adsFov: 20, scope: true, reloadDur: 2.1, reloadType: 'mag', auto: false, cycleDur: .9,
    camKick: [.055, .008], modelKick: [.25, .8, 4.5, -11, 1.2, 2], fovKick: 4.5,
    tracer: .03, flashScale: 1.7, sound: 'sniperFire',
    baseScale: .64, adsOff: [-.17, .13], muzzle: [0, -.29, -2.02],
  },
  katana: {
    name: 'KATANA', kind: 'katana', hint: 'slash · hold aim to block',
    magSize: 0, reserve: 0, maxReserve: 0, interval: .32,
    damage: 75, headMul: 1, pellets: 1, range: 3.2,
    spread: 0, adsSpread: 0, moveSpread: 0, adsFov: 65,
    reloadDur: 0, auto: false, slashDur: .27,
    camKick: [.02, .01], modelKick: [0, 0, 0, 0, 0, 0], fovKick: 0,
    sound: 'katanaSwing',
    baseScale: .6, adsOff: [-.18, .12], muzzle: [0, 0, 0],
  },
};

const BOX = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
};
// 沿 Z 轴的圆柱（枪管/护木/瞄准镜筒）
const CYL = (r, len, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.position.set(x, y, z); m.rotation.x = Math.PI / 2;
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
    const M = this.mat, D = this.dark, R = this.red;
    if (this.kind === 'pistol') {
      // —— CS 手枪（Glock 轮廓）：套筒 + 下挂底把 + 后倾握把 + 扳机护圈
      g.add(BOX(.09, .1, .5, M, 0, -.255, -.45));          // 套筒
      g.add(BOX(.08, .06, .32, M, 0, -.335, -.35));        // 底把
      g.add(BOX(.08, .26, .12, D, 0, -.47, -.18, .2));     // 握把（后倾）
      g.add(BOX(.05, .09, .015, D, 0, -.36, -.26));        // 护圈前柱
      g.add(BOX(.05, .015, .14, D, 0, -.405, -.33));       // 护圈底板
      g.add(CYL(.032, .08, D, 0, -.255, -.71));            // 枪口
      g.add(BOX(.012, .028, .016, D, 0, -.185, -.66));     // 准星
      g.add(BOX(.05, .028, .016, D, 0, -.183, -.26));      // 照门
      g.add(BOX(.03, .06, .03, D, 0, -.31, -.08, .3));     // 击锤
    } else if (this.kind === 'smg') {
      // —— CS 冲锋枪（MP5 轮廓）：机匣 + 短管 + 弯弹匣 + 前后握把 + 抵肩托
      g.add(BOX(.1, .13, .62, M, 0, -.3, -.52));           // 机匣
      g.add(BOX(.06, .03, .4, D, 0, -.22, -.55));          // 顶部导轨
      g.add(CYL(.04, .36, D, 0, -.3, -.98));               // 枪管护套
      g.add(CYL(.045, .06, D, 0, -.3, -1.18));             // 消焰器
      g.add(BOX(.05, .06, .02, D, 0, -.22, -.9));          // 准星环
      g.add(BOX(.07, .26, .1, D, 0, -.52, -.4));           // 弹匣直段
      g.add(BOX(.07, .14, .09, D, 0, -.63, -.33, .4));     // 弹匣弯段
      g.add(BOX(.07, .2, .09, M, 0, -.48, -.18, .18));     // 握把
      g.add(BOX(.08, .08, .18, M, 0, -.36, -.72));         // 前护木
      g.add(BOX(.07, .1, .3, M, 0, -.31, .1));             // 枪托
      g.add(BOX(.07, .2, .05, D, 0, -.4, .24));            // 托底板
      g.add(BOX(.02, .02, .1, D, .055, -.24, -.75));       // 拉机柄
    } else if (this.kind === 'shotgun') {
      // —— CS 喷子（泵动霰弹）：粗管 + 管状弹仓 + 泵把 + 木托
      g.add(BOX(.12, .15, .5, M, 0, -.33, -.42));          // 机匣
      g.add(CYL(.038, .95, D, 0, -.27, -.98));             // 枪管
      g.add(CYL(.03, .85, D, 0, -.355, -.92));             // 管状弹仓
      g.add(BOX(.02, .02, .9, D, 0, -.225, -.95));         // 顶部肋条
      g.add(BOX(.1, .09, .24, M, 0, -.36, -.8));           // 泵动护木
      g.add(BOX(.03, .05, .14, D, 0, -.44, -.72));         // 操作杆
      g.add(BOX(.1, .15, .34, M, 0, -.35, -.04));          // 枪托
      g.add(BOX(.08, .06, .2, M, 0, -.44, .1, .25));       // 托踵
      g.add(BOX(.012, .025, .012, R, 0, -.2, -1.4));       // 前准星珠
    } else if (this.kind === 'sniper') {
      // —— CS 大狙（AWP 轮廓）：细长重管 + 制退器 + 大镜 + 枪栓 + 拇指孔托 + 脚架
      g.add(BOX(.1, .13, .6, M, 0, -.3, -.5));             // 机匣
      g.add(CYL(.03, 1.2, D, 0, -.29, -1.3));              // 重枪管
      g.add(CYL(.045, .12, D, 0, -.29, -1.94));            // 制退器
      g.add(CYL(.06, .44, D, 0, -.13, -.58));              // 瞄准镜筒
      g.add(CYL(.065, .05, D, 0, -.13, -.35));             // 目镜
      g.add(CYL(.068, .05, D, 0, -.13, -.8));              // 物镜
      g.add(BOX(.012, .012, .012, R, 0, -.13, -.345));     // 分划板红点
      g.add(BOX(.015, .08, .02, D, .03, -.2, -.45));       // 镜环 A
      g.add(BOX(.015, .08, .02, D, .03, -.2, -.7));        // 镜环 B
      g.add(BOX(.09, .15, .5, M, 0, -.3, .12));            // 枪托
      g.add(BOX(.07, .05, .25, D, 0, -.2, .2));            // 贴腮板
      g.add(BOX(.07, .12, .14, D, 0, -.44, -.35));         // 弹匣
      g.add(BOX(.02, .02, .14, D, .07, -.24, -.28));       // 枪栓柄
      g.add(BOX(.035, .035, .035, D, .1, -.24, -.3));      // 栓钮
      g.add(BOX(.015, .3, .015, D, .06, -.48, -1.5, .45)); // 脚架左腿
      g.add(BOX(.015, .3, .015, D, -.06, -.48, -1.5, .45)); // 脚架右腿
    } else if (this.kind === 'katana') {
      // —— 武士刀：微弯双段刀身 + 鎺 + 鍔 + 缠柄
      g.add(BOX(.022, .04, .75, M, 0, -.28, -.95, .05));   // 刀身
      g.add(BOX(.018, .032, .3, M, 0, -.262, -1.32, .14)); // 刀尖段
      g.add(BOX(.03, .05, .06, D, 0, -.285, -.55));        // 鎺金
      g.add(BOX(.15, .025, .03, D, 0, -.29, -.52));        // 鍔
      g.add(BOX(.035, .035, .3, D, 0, -.3, -.37));         // 柄
      g.add(BOX(.042, .012, .29, M, 0, -.298, -.37));      // 缠绳
      g.add(BOX(.04, .04, .03, D, 0, -.3, -.21));          // 头
    }
    // 定位到右下角（不挡中央视野）
    g.scale.setScalar(this.baseScale);
    g.position.set(.42, -.02, .05);
    this.basePos = g.position.clone();
    this.baseRot = new THREE.Euler(0, 0, 0);
    // 枪口闪光（flash）
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), R);
    this.flash.position.set(...this.muzzle);
    this.flash.scale.setScalar(this.flashScale);
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
    this.root.position.x += this.adsOff[0] * ads;
    this.root.position.y += this.adsOff[1] * ads;
    this.root.scale.setScalar(this.baseScale * (1 - ads * .12));
    // 武士刀挥砍动画
    if (this.isMelee && this.slashT > 0) {
      const p = 1 - this.slashT / this.slashDur;
      this.root.rotation.z = Math.sin(p * Math.PI) * 1.4;
      this.root.rotation.y = Math.sin(p * Math.PI) * .6;
    }
  }
}
const rnd = (a, b) => a + Math.random() * (b - a);
