/**
 * HUD — 复刻 Doodle District：DOM 驱动
 *  - 左上 SCORE / WAVE
 *  - 左下 HP 斜线血条（CSS 渐变）+ 大字号弹药 + Tally 打卡记数
 *  - 右下武器槽位（数字键切换 active）
 *  - 中央红色准星（CSS，KATANA 切换形态）
 */
export class HUD {
  constructor() {
    this.el = {
      score: document.getElementById('scoreVal'),
      wave: document.getElementById('waveVal'),
      clip: document.getElementById('ammoClip'),
      reserve: document.getElementById('ammoReserve'),
      hpFill: document.getElementById('hpFill'),
      health: document.querySelector('.health'),
      tally: document.getElementById('tally'),
      slots: [...document.querySelectorAll('.slot')],
      crosshair: document.getElementById('crosshair'),
    };
    this.hp = 100; this.maxHp = 100;
    this.ammo = 35; this.reserve = 175;
    this.score = 0; this.wave = 1;
    this.weapon = 0;
    this._lastTally = -1;
  }

  setStats({ hp, maxHp, ammo, reserve, score, wave }) {
    if (hp !== undefined) this.hp = hp;
    if (maxHp !== undefined) this.maxHp = maxHp;
    if (ammo !== undefined) this.ammo = ammo;
    if (reserve !== undefined) this.reserve = reserve;
    if (score !== undefined) this.score = score;
    if (wave !== undefined) this.wave = wave;
  }

  setWeapon(i) {
    this.weapon = i;
    this.el.slots.forEach((s, idx) => s.classList.toggle('active', idx === i));
    this.el.crosshair.classList.toggle('katana', i === 3);
  }

  render() {
    const e = this.el;
    e.score.textContent = String(this.score).padStart(4, '0');
    e.wave.textContent = String(this.wave).padStart(2, '0');
    e.clip.textContent = this.ammo;
    e.reserve.textContent = this.reserve;

    // HP 血条宽度 + 低血量红化
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    e.hpFill.style.width = (ratio * 100).toFixed(1) + '%';
    e.health.classList.toggle('low', ratio <= 0.3);

    // Tally 打卡记数（仅在弹药变化时重建，避免每帧抖动）
    if (this.ammo !== this._lastTally) {
      this._lastTally = this.ammo;
      const n = Math.min(this.ammo, 60);
      let html = '';
      for (let i = 0; i < n; i++) html += '<i></i>';
      e.tally.innerHTML = html;
    }
  }
}
