// Neon Bay — the HUD: health, cash, wanted stars, speed, ammo, objective
// and timer as DOM, plus a live top-down minimap drawn on a 2D canvas.
// The minimap reads the same city constants as the 3D world, so the map
// and the streets always agree.

import { clamp, fmtMoney, fmtTime } from './util.js';
import { roadLines, blockCenters, BLOCK, ROAD, HALF, SPAN } from './city.js';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.moneyEl = document.getElementById('money');
    this.starsEl = document.getElementById('stars');
    this.speedEl = document.getElementById('speed');
    this.speedUnit = document.getElementById('speed-unit');
    this.ammoEl = document.getElementById('ammo');
    this.objectiveEl = document.getElementById('objective');
    this.timerEl = document.getElementById('timer');
    this.toastEl = document.getElementById('toast');
    this.damageEl = document.getElementById('damage');
    this.crosshair = document.getElementById('crosshair');
    this.dialogEl = document.getElementById('dialog');
    this.dialogText = document.getElementById('dialog-text');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this._toastT = 0;
    this._dialogT = 0;
    this._lastStars = -1;
  }

  toast(text, seconds = 4) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this._toastT = seconds;
  }

  dialog(text, seconds = 6) {
    this.dialogText.textContent = text;
    this.dialogEl.classList.add('show');
    this._dialogT = seconds;
  }

  hideDialog() {
    this._dialogT = 0;
    this.dialogEl.classList.remove('show');
  }

  flashDamage() {
    this.damageEl.classList.add('hit');
    setTimeout(() => this.damageEl.classList.remove('hit'), 180);
  }

  update(dt, s) {
    // s: { health, money, stars, speedKmh, inCar, ammo, reserve, reloading,
    //      objective, timer, showCrosshair }
    this.healthFill.style.width = clamp(s.health, 0, 100) + '%';
    this.healthFill.style.background = s.health > 50 ? '#2ecc71' : s.health > 25 ? '#f39c12' : '#e74c3c';
    this.healthText.textContent = Math.ceil(s.health);
    this.moneyEl.textContent = fmtMoney(s.money);
    if (s.stars !== this._lastStars) {
      this._lastStars = s.stars;
      this.starsEl.textContent = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);
      this.starsEl.classList.toggle('hot', s.stars > 0);
    }
    if (s.inCar) {
      this.speedEl.textContent = Math.round(Math.abs(s.speedKmh));
      this.speedUnit.textContent = 'km/h';
      this.speedEl.parentElement.classList.add('show');
    } else {
      this.speedEl.parentElement.classList.remove('show');
    }
    this.ammoEl.textContent = s.reloading ? 'RELOADING…' : `${s.ammo} / ${s.reserve}`;
    this.ammoEl.classList.toggle('low', s.ammo <= 3 && !s.reloading);
    this.objectiveEl.textContent = s.objective;
    if (s.timer > 0) {
      this.timerEl.textContent = fmtTime(s.timer);
      this.timerEl.classList.add('show');
      this.timerEl.classList.toggle('urgent', s.timer < 30);
    } else {
      this.timerEl.classList.remove('show');
    }
    this.crosshair.style.display = s.showCrosshair ? 'block' : 'none';
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.toastEl.classList.remove('show');
    }
    if (this._dialogT > 0) {
      this._dialogT -= dt;
      if (this._dialogT <= 0) this.dialogEl.classList.remove('show');
    }
  }

  drawMinimap(world) {
    // world: { playerX, playerZ, playerHeading, inCar, cars, peds, cops,
    //          target, nightness }
    const ctx = this.mapCtx;
    const S = this.map.width; // 200
    const scale = S / (SPAN + 130);
    const toMap = (x, z) => [(x + SPAN / 2 + 65) * scale, (z + SPAN / 2 + 65) * scale];
    ctx.clearRect(0, 0, S, S);
    // Sea and sand to the south.
    ctx.fillStyle = '#123a5c';
    ctx.fillRect(0, 0, S, S);
    const [bx0, by0] = toMap(-SPAN / 2 - 65, -SPAN / 2 - 65);
    ctx.fillStyle = '#3d4a55';
    ctx.fillRect(bx0, by0, (SPAN + 130) * scale, (SPAN + 130) * scale);
    // Sand strip.
    const [, sandY] = toMap(0, HALF);
    ctx.fillStyle = '#c9b183';
    ctx.fillRect(0, sandY, S, (SPAN / 2 + 65 - HALF) * scale + 4);
    // Blocks.
    ctx.fillStyle = '#20262e';
    for (const cx of blockCenters) {
      for (const cz of blockCenters) {
        const [x, y] = toMap(cx - BLOCK / 2, cz - BLOCK / 2);
        ctx.fillRect(x, y, BLOCK * scale, BLOCK * scale);
      }
    }
    // Roads.
    ctx.fillStyle = '#565e68';
    for (const line of roadLines) {
      const [x] = toMap(line - ROAD / 2, 0);
      ctx.fillRect(x, 0, ROAD * scale, S);
      const [, y] = toMap(0, line - ROAD / 2);
      ctx.fillRect(0, y, S, ROAD * scale);
    }
    // Docks slab.
    const [dx, dy] = toMap(HALF, -125);
    ctx.fillStyle = '#6a6f75';
    ctx.fillRect(dx, dy, 70 * scale, 190 * scale);
    // Pier.
    const [px, py] = toMap(-5, HALF);
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(px, py, 10 * scale, 92 * scale);
    // Mission marker: pulsing gold diamond.
    if (world.target) {
      const [tx, ty] = toMap(world.target.x, world.target.z);
      const pulse = 5 + Math.sin(performance.now() / 180) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(tx, ty - pulse);
      ctx.lineTo(tx + pulse, ty);
      ctx.lineTo(tx, ty + pulse);
      ctx.lineTo(tx - pulse, ty);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic (white), pedestrians (green), police (blue/red blink).
    ctx.fillStyle = '#e8e8e8';
    for (const c of world.cars) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.fillStyle = '#2ecc71';
    for (const p of world.peds) {
      if (p.dead) continue;
      const [x, y] = toMap(p.pos.x, p.pos.z);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    const blink = Math.floor(performance.now() / 350) % 2 === 0;
    ctx.fillStyle = blink ? '#ff2020' : '#2040ff';
    for (const c of world.cops) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, rotated to the heading.
    const [ux, uy] = toMap(world.playerX, world.playerZ);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(-world.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial';
    ctx.fillText('N', S - 14, 14);
  }
}
