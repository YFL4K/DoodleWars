/**
 * HUD 渲染 — 手绘风
 *  - 中央红色准星（CSS）
 *  - 左下：斜线纹理宽 HP 血条 + 大字号子弹数（弹匣/备弹）
 *  - 右下：武器切换菜单（RIFLE/SHOTGUN/SNIPER/KATANA，静态高亮）
 */
export class HUD {
  constructor() {
    this.hpCanvas = document.getElementById('hpCanvas');
    this.hpCtx = this.hpCanvas.getContext('2d');
    this.hp = 100;
    this.maxHp = 100;
    this.ammo = 35;
    this.reserve = 175;
    this.score = 0;
    this.wave = 1;
  }

  setStats({ hp, maxHp, ammo, reserve, score, wave }) {
    if (hp !== undefined) this.hp = hp;
    if (maxHp !== undefined) this.maxHp = maxHp;
    if (ammo !== undefined) this.ammo = ammo;
    if (reserve !== undefined) this.reserve = reserve;
    if (score !== undefined) this.score = score;
    if (wave !== undefined) this.wave = wave;
  }

  render() {
    this._drawHP();
    document.getElementById('ammoClip').textContent = String(this.ammo).padStart(2, '0');
    document.getElementById('ammoReserve').textContent = String(this.reserve);
    document.getElementById('scoreVal').textContent = String(this.score).padStart(4, '0');
    document.getElementById('waveVal').textContent = String(this.wave).padStart(2, '0');
  }

  /**
   * 宽 HP 血条：蓝墨手绘边框 + 斜线纹理填充
   */
  _drawHP() {
    const ctx = this.hpCtx;
    const w = this.hpCanvas.width;
    const h = this.hpCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const x = 0, y = 4, bw = w - 4, bh = h - 8;
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));

    // 手绘边框
    ctx.strokeStyle = '#1c2a5e';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    this._doodleRect(ctx, x, y, bw, bh);

    // 斜线纹理填充（仅已损失血量的区域留白，当前血量区域用斜线）
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, (bw - 4) * ratio, bh - 4);
    ctx.clip();
    ctx.strokeStyle = '#1c2a5e';
    ctx.lineWidth = 1.5;
    const spacing = 6;
    for (let d = -bh; d < bw + bh; d += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + d, y + bh);
      ctx.lineTo(x + d + bh, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 手绘抖动矩形 */
  _doodleRect(ctx, x, y, w, h) {
    const j = () => (Math.random() - 0.5) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x + j(), y + j());
    ctx.lineTo(x + w + j(), y + j());
    ctx.lineTo(x + w + j(), y + h + j());
    ctx.lineTo(x + j(), y + h + j());
    ctx.closePath();
    ctx.stroke();
  }
}
