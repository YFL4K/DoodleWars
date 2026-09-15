/**
 * HUD — 复刻 Doodle District：DOM 驱动 + 战斗反馈
 *  SCORE/WAVE · 大字号弹药+Tally · 斜线血条 · 红准星 · 武器槽 · hitmarker · killfeed · message · 狙击镜
 */
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      score: document.getElementById('scoreVal'),
      wave: document.getElementById('waveVal'),
      clip: document.getElementById('ammoClip'),
      reserve: document.getElementById('ammoReserve'),
      ammo: document.querySelector('.ammo'),
      hpFill: document.getElementById('hpFill'),
      health: document.querySelector('.health'),
      tally: document.getElementById('tally'),
      slots: [...document.querySelectorAll('.slot')],
      crosshair: document.getElementById('crosshair'),
      hitmarker: document.getElementById('hitmarker'),
      killfeed: document.getElementById('killfeed'),
      msgMain: document.getElementById('msgMain'),
      msgSub: document.getElementById('msgSub'),
      scope: document.getElementById('scope'),
    };
    this.hp = 100; this.maxHp = 100;
    this.ammo = 35; this.reserve = 175;
    this.score = 0; this.wave = 1;
    this.weapon = 0; this.reloading = false;
    this._lastTally = -1;
    this._msgT = 0;
  }

  setStats({ hp, maxHp, ammo, reserve, score, wave, reloading }) {
    if (hp !== undefined) this.hp = hp;
    if (maxHp !== undefined) this.maxHp = maxHp;
    if (ammo !== undefined) this.ammo = ammo;
    if (reserve !== undefined) this.reserve = reserve;
    if (score !== undefined) this.score = score;
    if (wave !== undefined) this.wave = wave;
    if (reloading !== undefined) this.reloading = reloading;
  }

  addScore(n) { this.score += n; }

  setWeapon(i) {
    this.weapon = i;
    this.el.slots.forEach((s, idx) => s.classList.toggle('active', idx === i));
    this.el.crosshair.classList.toggle('katana', i === 3);
    this.el.scope.classList.toggle('on', i === 2 && this._aim);
  }

  setAim(on) { this._aim = on; this.el.scope.classList.toggle('on', on && this.weapon === 2); }

  hitmarker(crit, kill) {
    const h = this.el.hitmarker;
    h.classList.toggle('crit', !!crit);
    h.classList.toggle('kill', !!kill);
    h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
  }

  killfeed(name, dmg, head) {
    const div = document.createElement('div');
    div.innerHTML = `${head ? '<span class="pts">✕ 爆头</span> ' : ''}擦掉 ${name} <span class="pts">+${Math.round(dmg)}</span>`;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 2600);
  }

  message(main, sub = '') {
    this.el.msgMain.textContent = main;
    this.el.msgSub.textContent = sub;
    this.el.msgMain.classList.remove('show'); void this.el.msgMain.offsetWidth; this.el.msgMain.classList.add('show');
    this._msgT = 2.4;
  }

  clear() {
    this.el.killfeed.innerHTML = '';
    this.el.msgMain.classList.remove('show');
  }

  render(dt = 0.016) {
    const e = this.el;
    e.score.textContent = String(this.score).padStart(4, '0');
    e.wave.textContent = String(this.wave).padStart(2, '0');
    e.clip.textContent = this.reloading ? '—' : this.ammo;
    e.reserve.textContent = this.reserve;
    e.ammo.classList.toggle('reloading', this.reloading);

    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    e.hpFill.style.width = (ratio * 100).toFixed(1) + '%';
    e.health.classList.toggle('low', ratio <= 0.3);

    if (this._lastTally !== this.ammo) {
      this._lastTally = this.ammo;
      const n = Math.min(this.ammo, 60);
      let html = ''; for (let i = 0; i < n; i++) html += '<i></i>';
      e.tally.innerHTML = html;
    }
    if (this._msgT > 0) {
      this._msgT -= dt;
      if (this._msgT <= 0) e.msgMain.classList.remove('show');
    }
  }
}
