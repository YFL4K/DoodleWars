/**
 * HUD 渲染 — 手绘风血条 + Tally Marks 弹药计数
 */
export class HUD {
  constructor() {
    this.hpCanvas = document.getElementById('hpCanvas');
    this.ammoCanvas = document.getElementById('ammoCanvas');
    this.hpCtx = this.hpCanvas.getContext('2d');
    this.ammoCtx = this.ammoCanvas.getContext('2d');
    this.hp = 100;
    this.maxHp = 100;
    this.ammo = 30;
    this.maxAmmo = 30;
    this.score = 0;
    this.wave = 1;
  }

  setStats({ hp, maxHp, ammo, maxAmmo, score, wave }) {
    if (hp !== undefined) this.hp = hp;
    if (maxHp !== undefined) this.maxHp = maxHp;
    if (ammo !== undefined) this.ammo = ammo;
    if (maxAmmo !== undefined) this.maxAmmo = maxAmmo;
    if (score !== undefined) this.score = score;
    if (wave !== undefined) this.wave = wave;
  }

  render() {
    this._drawHP();
    this._drawAmmo();
    document.getElementById('scoreVal').textContent = String(this.score).padStart(4, '0');
    document.getElementById('waveVal').textContent = String(this.wave).padStart(2, '0');
  }

  /**
   * 血条：蓝墨水边框 + 斜线排线填充
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

    // 斜线排线填充
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, (bw - 4) * ratio, bh - 4);
    ctx.clip();
    ctx.strokeStyle = '#1c2a5e';
    ctx.lineWidth = 1.5;
    const spacing = 5;
    for (let d = -bh; d < bw + bh; d += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + d, y + bh);
      ctx.lineTo(x + d + bh, y);
      ctx.stroke();
    }
    ctx.restore();

    // 血条旁的红线（少量橙红高亮）
    ctx.strokeStyle = '#e0492b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + bw + 6, y);
    ctx.lineTo(x + bw + 6, y + bh);
    ctx.stroke();
  }

  /**
   * 弹药：打卡记数符号（Tally Marks）
   * 每 5 发画一组「正」字记号（4 竖 + 1 斜杠）
   */
  _drawAmmo() {
    const ctx = this.ammoCtx;
    const w = this.ammoCanvas.width;
    const h = this.ammoCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const startX = 4, startY = h - 10;
    const groupW = 34;   // 每组记号宽度
    const lineH = 22;    // 竖线高度
    const lineSpacing = 7;

    let x = startX;
    let y = startY;
    let count = 0;

    ctx.strokeStyle = '#1c2a5e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < this.ammo; i++) {
      const inGroup = i % 5; // 0-4
      if (inGroup === 0 && i > 0) {
        // 新一组，换列
        x += groupW;
        count = 0;
      }
      const lx = x + count * lineSpacing;
      if (inGroup < 4) {
        // 竖线（带抖动）
        this._doodleLine(ctx, lx, y, lx, y - lineH);
      } else {
        // 第 5 个：斜杠划过前面 4 条竖线
        const gx = x;
        this._doodleLine(ctx, gx, y, gx + lineSpacing * 4, y - lineH);
      }
      count++;
    }

    // 数字（右下角小字）
    ctx.fillStyle = '#1c2a5e';
    ctx.font = '14px "Architects Daughter", cursive';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${this.ammo}`, w - 2, h - 2);
  }

  /** 手绘抖动线条 */
  _doodleLine(ctx, x1, y1, x2, y2) {
    const j = () => (Math.random() - 0.5) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x1 + j(), y1 + j());
    ctx.lineTo(x2 + j(), y2 + j());
    ctx.stroke();
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
