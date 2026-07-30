'use strict';
/* ============ 游戏主逻辑 ============ */
const Game = {
  state: 'menu',
  time: 0, elapsed: 0,
  wave: 1, score: 0, kills: 0,
  combo: 0, comboT: 0, maxCombo: 0,
  spawnT: 1, trauma: 0, flash: 0,
  hitstop: 0, timeScale: 1, overT: 0,
  boss: null, pendingLevels: 0,
  pickStreak: 0, pickT: 0,
  best: { score: 0, time: 0 },
  _hash: new Map(),
  CELL: 96,

  init() {
    try {
      const b = JSON.parse(localStorage.getItem('neonSurvivor.best') || 'null');
      if (b && typeof b.score === 'number') this.best = b;
    } catch (e) { /* ignore */ }
    UI.setBest(this.best.score);
    UI.showScreen('start');

    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        const m = AudioSys.toggleMute();
        if (this.state !== 'menu') UI.announce(m ? '已静音' : '声音开启');
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing' || this.state === 'paused') this.togglePause();
        return;
      }
      if (this.state === 'levelup') {
        if (e.code === 'Digit1' || e.code === 'Numpad1') UI.pickByIndex(0);
        if (e.code === 'Digit2' || e.code === 'Numpad2') UI.pickByIndex(1);
        if (e.code === 'Digit3' || e.code === 'Numpad3') UI.pickByIndex(2);
        return;
      }
      if (e.code === 'Enter') {
        AudioSys.init(); AudioSys.resume();
        if (this.state === 'menu' || this.state === 'over') this.start();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });
  },

  /* ---------- 流程 ---------- */
  start() {
    resetEntities();
    FX.clear();
    player = createPlayer();
    WeaponSys.add('blaster');
    this.state = 'playing';
    this.time = 0; this.wave = 1;
    this.score = 0; this.kills = 0;
    this.combo = 0; this.comboT = 0; this.maxCombo = 0;
    this.spawnT = 0.6; this.trauma = 0; this.flash = 0;
    this.hitstop = 0; this.timeScale = 1;
    this.boss = null; this.pendingLevels = 0;
    this.pickStreak = 0;
    AudioSys.intensity = 0;
    UI._cache = {};
    UI.weaponsDirty = true;
    UI.showScreen(null);
    World.snapCam(player.x, player.y);
    AudioSys.init();
    AudioSys.resume();
    AudioSys.startMusic();
    AudioSys.duck(0.3);
    UI.announce('第 1 波');
  },

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      UI.showScreen('pause');
      AudioSys.duck(0.08);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      UI.showScreen(null);
      AudioSys.duck(0.3);
    }
  },

  gameOver() {
    this.state = 'over';
    this.timeScale = 1;
    const isRecord = this.score > this.best.score;
    if (isRecord) {
      this.best = { score: this.score, time: this.time };
      try { localStorage.setItem('neonSurvivor.best', JSON.stringify(this.best)); } catch (e) { /* ignore */ }
    }
    UI.setBest(this.best.score);
    UI.showGameOver({
      time: this.time, wave: this.wave, level: player.level,
      kills: this.kills, maxCombo: this.maxCombo,
      score: this.score, best: this.best.score,
    }, isRecord);
  },

  /* ---------- 数值 ---------- */
  hpMul() { return 1 + (this.wave - 1) * 0.22 + this.time * 0.004; },
  dmgMulE() { return 1 + (this.wave - 1) * 0.05; },

  /* ---------- 主更新 ---------- */
  update(rdt) {
    this.elapsed += rdt;
    if (this.state === 'menu') {
      World.update(rdt, World.W / 2 + Math.sin(this.elapsed * 0.1) * 260, World.H / 2 + Math.cos(this.elapsed * 0.13) * 200);
      FX.update(rdt);
      return;
    }
    if (this.state === 'paused' || this.state === 'levelup' || this.state === 'over') return;

    let dt = rdt * this.timeScale;
    if (this.hitstop > 0) { this.hitstop -= rdt; dt *= 0.12; }

    if (this.state === 'dying') {
      this.timeScale = U.lerp(this.timeScale, 0.25, Math.min(1, rdt * 4));
      this.overT -= rdt;
      FX.update(dt);
      updateEBullets(dt);
      World.update(dt, player.x, player.y);
      this.trauma = Math.max(0, this.trauma - rdt * 1.2);
      this.flash = Math.max(0, this.flash - rdt * 2);
      if (this.overT <= 0) this.gameOver();
      return;
    }

    // playing
    this.time += dt;
    const newWave = Math.floor(this.time / 30) + 1;
    if (newWave !== this.wave) {
      this.wave = newWave;
      this.onWave();
    }
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    this.pickT -= dt;
    if (this.pickT <= 0) this.pickStreak = 0;
    this.flash = Math.max(0, this.flash - rdt * 2.4);
    this.trauma = Math.max(0, this.trauma - rdt * 1.7);

    this.director(dt);
    updatePlayer(dt);
    WeaponSys.update(dt);
    updateEnemies(dt);
    cleanupEnemies();

    updateBullets(dt);
    updateMissiles(dt);
    updateEBullets(dt);
    updateGems(dt);
    updatePickups(dt);
    this.collide(dt);
    FX.update(dt);
    World.update(dt, player.x, player.y);
    UI.updateHUD();

    if (this.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();
    // 在 update(rdt) 的逻辑末尾加上这行：
    this.trauma = Math.min(1.0, Math.max(0, this.trauma)); // 强制将震动强度锁死在 0 ~ 1.0 之间
  },

  onWave() {
    if (this.wave % 5 === 0) {
      this.spawnBoss();
    } else {
      UI.announce(`第 ${this.wave} 波`);
    }
  },

  /* ---------- 刷怪导演 ---------- */
  director(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const bossAlive = this.boss && !this.boss.dead;
    const interval = Math.max(0.32, 1.15 * Math.pow(0.93, this.wave - 1) - this.time * 0.0006);
    this.spawnT = interval * (bossAlive ? 1.9 : 1);
    if (enemies.length >= 240) return;
    const batch = 1 + Math.floor(this.wave / 3) + (this.time > 240 ? 1 : 0);
    for (let i = 0; i < batch; i++) this.spawnOne();
  },

  spawnOne() {
    const w = this.wave;
    const table = [{ v: 'chaser', w: Math.max(35, 100 - w * 6) }];
    if (w >= 2) table.push({ v: 'darter', w: 26 + w * 2 });
    if (w >= 3) table.push({ v: 'splitter', w: 20 });
    if (w >= 3) table.push({ v: 'shooter', w: 14 + w });
    if (w >= 4) table.push({ v: 'tank', w: 12 + w });
    const type = U.weightedPick(table);
    const pos = this.spawnPos();
    const elite = w >= 4 && Math.random() < Math.min(0.14, 0.04 + w * 0.008);
    spawnEnemy(type, pos.x, pos.y, elite, this.hpMul(), this.dmgMulE());
  },

  spawnPos() {
    const R = Math.hypot(World.vw, World.vh) / 2 + U.rand(70, 210);
    for (let i = 0; i < 6; i++) {
      const a = U.rand(TAU);
      const x = U.clamp(player.x + Math.cos(a) * R, 40, World.W - 40);
      const y = U.clamp(player.y + Math.sin(a) * R, 40, World.H - 40);
      if (Math.abs(x - World.camX) > World.vw / 2 + 30 || Math.abs(y - World.camY) > World.vh / 2 + 30) {
        return { x, y };
      }
    }
    return { x: U.rand(40, World.W - 40), y: U.rand(40, World.H - 40) };
  },

  spawnBoss() {
    UI.announce('⚠ 警告：虚空哨兵 逼近 ⚠', true);
    AudioSys.alarm();
    AudioSys.intensity = 1;
    const k = this.wave / 5;
    const a = U.rand(TAU);
    const x = U.clamp(player.x + Math.cos(a) * 620, 100, World.W - 100);
    const y = U.clamp(player.y + Math.sin(a) * 620, 100, World.H - 100);
    const e = spawnEnemy('boss', x, y, false, 1, 1);
    e.hp = e.maxHp = Math.round(1500 * k * (1 + (k - 1) * 0.55));
    e.dmg = 20 + 5 * k;
    e.spd = 62 + 4 * k;
    e.score = 1500 * k;
    this.boss = e;
    this.trauma += 0.4;
  },

  bossDown(e) {
    this.boss = null;
    AudioSys.intensity = 0;
    UI.announce('BOSS 击破！');
    AudioSys.explode(2);
    AudioSys.levelup();
    dropGems(e.x, e.y, 60);
    spawnPickup(e.x + 40, e.y, 'heart');
    spawnPickup(e.x - 40, e.y, 'nuke');
    for (let i = 0; i < 5; i++) {
      FX.explosion(e.x + U.rand(-60, 60), e.y + U.rand(-60, 60), U.pick(['#ff2ea6', '#ffd54d', '#7ef9ff']), 2);
    }
    FX.ring(e.x, e.y, '#ff2ea6', 320, 6);
    this.trauma += 1;
    this.flash = Math.max(this.flash, 0.5);
    this.hitstop = 0.12;
  },

  /* ---------- 空间哈希 ---------- */
  buildHash() {
    this._hash.clear();
    const C = this.CELL;
    for (const e of enemies) {
      if (e.dead) continue;
      const k = ((e.x / C) | 0) + ',' + ((e.y / C) | 0);
      let arr = this._hash.get(k);
      if (!arr) { arr = []; this._hash.set(k, arr); }
      arr.push(e);
    }
  },

  queryCircle(x, y, r, cb) {
    const C = this.CELL;
    const x0 = ((x - r) / C) | 0, x1 = ((x + r) / C) | 0;
    const y0 = ((y - r) / C) | 0, y1 = ((y + r) / C) | 0;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this._hash.get(cx + ',' + cy);
        if (!arr) continue;
        for (const e of arr) {
          if (e.dead) continue;
          const rr = r + e.r;
          if (U.dist2(x, y, e.x, e.y) <= rr * rr) {
            if (cb(e) === false) return;
          }
        }
      }
    }
  },

  /* ---------- 碰撞 ---------- */
  collide(dt) {
    this.buildHash();
    const p = player;

    // 敌人分离
    for (const e of enemies) {
      if (e.dead || e.boss) continue;
      this.queryCircle(e.x, e.y, e.r * 0.9, (o) => {
        if (o === e || o.boss) return;
        const d2 = U.dist2(e.x, e.y, o.x, o.y);
        const min = (e.r + o.r) * 0.82;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / d * 26;
          e.kx += (e.x - o.x) * push * dt;
          e.ky += (e.y - o.y) * push * dt;
        }
      });
    }

    // 玩家子弹 → 敌人
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let removed = false;
      this.queryCircle(b.x, b.y, b.r, (e) => {
        if (b.hit && b.hit.has(e)) return;
        if (!b.hit) b.hit = new Set();
        b.hit.add(e);
        this.damageEnemy(e, b.dmg, { kb: 90, ax: b.x - b.vx * 0.01, ay: b.y - b.vy * 0.01 });
        FX.sparks(b.x, b.y, '#ffe9a3', 3, 300);
        if (b.pierce > 0) {
          b.pierce--;
        } else {
          bullets[i] = bullets[bullets.length - 1];
          bullets.pop();
          removed = true;
        }
        return false;
      });
      if (removed) continue;
    }

    // 环刃 → 敌人
    for (const w of p.weapons) {
      if (w.key !== 'orbs') continue;
      const S = WeaponSys.stats(w);
      for (const o of WeaponSys.orbPositions(w)) {
        this.queryCircle(o.x, o.y, 14, (e) => {
          if (e.orbT > 0) return;
          e.orbT = 0.35;
          this.damageEnemy(e, S.dmg * p.dmgMul, { kb: 240, ax: p.x, ay: p.y });
          FX.sparks(o.x, o.y, '#a78bfa', 4, 320);
        });
      }
    }

    // 敌人 → 玩家
    if (p.alive) {
      this.queryCircle(p.x, p.y, 14, (e) => {
        if (p.iTime > 0) return false;
        this.hurtPlayer(e.dmg);
        const a = U.angleTo(e.x, e.y, p.x, p.y);
        p.vx += Math.cos(a) * 190;
        p.vy += Math.sin(a) * 190;
        if (!e.boss) {
          e.kx -= Math.cos(a) * 140;
          e.ky -= Math.sin(a) * 140;
        }
        return false;
      });

      // 敌方子弹 → 玩家
      for (let i = ebullets.length - 1; i >= 0; i--) {
        const b = ebullets[i];
        if (U.dist2(b.x, b.y, p.x, p.y) < (b.r + 12) * (b.r + 12)) {
          if (p.iTime <= 0) this.hurtPlayer(b.dmg);
          FX.burst(b.x, b.y, b.col, 5, 160, 4, 0.35);
          ebullets[i] = ebullets[ebullets.length - 1];
          ebullets.pop();
        }
      }
    }
  },

  /* ---------- 伤害 ---------- */
  damageEnemy(e, dmg, opts = {}) {
    if (e.dead) return;
    let crit = false;
    if (!opts.noCrit && Math.random() < player.critC) {
      dmg *= player.critM;
      crit = true;
    }
    e.hp -= dmg;
    e.flash = 0.08;
    if (!opts.silent || crit) FX.damage(e.x, e.y - e.r, dmg, crit);
    AudioSys.hit();
    if (opts.kb) {
      const a = U.angleTo(opts.ax !== undefined ? opts.ax : player.x, opts.ay !== undefined ? opts.ay : player.y, e.x, e.y);
      const kb = e.boss ? opts.kb * 0.04 : opts.kb;
      e.kx += Math.cos(a) * kb;
      e.ky += Math.sin(a) * kb;
    }
    if (e.hp <= 0) this.killEnemy(e);
  },

  areaDamage(x, y, r, dmg, kb = 0) {
    this.buildHash();
    this.queryCircle(x, y, r, (e) => {
      this.damageEnemy(e, dmg, { kb, ax: x, ay: y });
    });
  },

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.combo++;
    this.comboT = 3;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += Math.round(e.score * (1 + this.combo * 0.03));

    const big = e.boss ? 2 : (e.r >= 19 ? 1 : 0);
    FX.explosion(e.x, e.y, e.col, big);
    AudioSys.explode(big);
    this.trauma += e.boss ? 0.5 : (big ? 0.22 : 0.05);
    if (big) this.hitstop = Math.max(this.hitstop, 0.05);

    if (e.type === 'splitter') {
      for (let i = 0; i < 3; i++) {
        const a = U.rand(TAU);
        spawnEnemy('mini', e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16, false, this.hpMul(), this.dmgMulE());
      }
    }
    if (e.boss) {
      this.bossDown(e);
      return;
    }
    dropGems(e.x, e.y, e.xp);
    if (e.elite) {
      if (Math.random() < 0.4) spawnPickup(e.x, e.y, 'heart');
      else if (Math.random() < 0.35) spawnPickup(e.x, e.y, 'nuke');
    }
  },

  hurtPlayer(dmg) {
    const p = player;
    if (!p.alive || p.iTime > 0) return;
    p.hp -= dmg;
    p.iTime = 0.75;
    this.trauma += 0.45;
    this.flash = Math.max(this.flash, 0.22);
    AudioSys.hurt();
    FX.burst(p.x, p.y, '#ff4d6d', 12, 260, 5, 0.5);
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      this.state = 'dying';
      this.overT = 1.5;
      this.trauma = 1.2;
      this.flash = 0.7;
      FX.explosion(p.x, p.y, '#3df2ff', 2);
      FX.explosion(p.x, p.y, '#ffffff', 2);
      FX.ring(p.x, p.y, '#7ef9ff', 260, 5);
      AudioSys.explode(2);
      AudioSys.stopMusic();
    }
  },

  /* ---------- 武器触发 ---------- */
  novaBlast(S) {
    const p = player;
    FX.ring(p.x, p.y, '#5eead4', S.r, 5);
    FX.flashGlow(p.x, p.y, '#5eead4', S.r * 0.9);
    AudioSys.nova();
    this.trauma += 0.12;
    this.areaDamage(p.x, p.y, S.r, S.dmg * p.dmgMul, 340);
  },

  laserTick(w, S) {
    const p = player;
    const silent = Math.random() < 0.7;
    for (const e of enemies) {
      if (e.dead) continue;
      const d2max = (S.len + e.r) * (S.len + e.r);
      if (U.dist2(p.x, p.y, e.x, e.y) > d2max) continue;
      for (let i = 0; i < S.n; i++) {
        const a = w.rot + i / S.n * TAU;
        const x2 = p.x + Math.cos(a) * S.len;
        const y2 = p.y + Math.sin(a) * S.len;
        const hitR = e.r + 8;
        if (U.ptSegDist2(e.x, e.y, p.x, p.y, x2, y2) < hitR * hitR) {
          this.damageEnemy(e, S.dps * 0.1 * p.dmgMul, { silent, noCrit: false });
          if (!silent) FX.sparks(e.x, e.y, '#ff5ecf', 2, 240);
          break;
        }
      }
    }
  },

  /* ---------- 拾取 ---------- */
  collectGem(g) {
    this.pickStreak++;
    this.pickT = 0.9;
    AudioSys.pickup(this.pickStreak);
    FX.burst(g.x, g.y, GEM_TIERS[g.tier].col, 3, 120, 3, 0.3);
    this.gainXP(g.val);
  },

  gainXP(v) {
    const p = player;
    p.xp += v * p.xpMul;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpFor(p.level);
      this.pendingLevels++;
    }
  },

  applyPickup(type, x, y) {
    if (type === 'heart') {
      player.hp = Math.min(player.maxHp, player.hp + 30);
      AudioSys.heart();
      FX.burst(x, y, '#66ffa3', 14, 220, 5, 0.6);
      FX.ring(x, y, '#66ffa3', 60, 3);
    } else if (type === 'nuke') {
      AudioSys.nuke();
      this.flash = 0.55;
      this.trauma += 0.8;
      this.hitstop = 0.08;
      FX.ring(x, y, '#ffd54d', 420, 8);
      this.areaDamage(player.x, player.y, 1300, 260, 500);
      for (const b of ebullets) FX.burst(b.x, b.y, b.col, 2, 90, 3, 0.3);
      ebullets.length = 0;
    }
  },

  /* ---------- 升级流程 ---------- */
  openLevelUp() {
    this.pendingLevels--;
    this.state = 'levelup';
    AudioSys.levelup();
    AudioSys.duck(0.12);
    FX.ring(player.x, player.y, '#7ef9ff', 140, 4);
    UI.showUpgrades(rollUpgrades());
  },

  chooseUpgrade(opt) {
    applyUpgrade(opt);
    if (this.pendingLevels > 0) {
      this.pendingLevels--;
      UI.showUpgrades(rollUpgrades());
    } else {
      this.state = 'playing';
      UI.showScreen(null);
      AudioSys.duck(0.3);
    }
  },

  /* ---------- 渲染 ---------- */
  render(ctx) {
    const sx = this.trauma * this.trauma * 15 * U.rand(-1, 1);
    const sy = this.trauma * this.trauma * 15 * U.rand(-1, 1);

    World.drawBackdrop(ctx);

    ctx.save();
    ctx.translate(Math.round(World.vw / 2 - World.camX + sx), Math.round(World.vh / 2 - World.camY + sy));

    World.drawGrid(ctx);
    drawGems(ctx);
    drawPickups(ctx);
    drawEnemies(ctx);
    drawEBullets(ctx);
    if (player && this.state !== 'menu') {
      WeaponSys.draw(ctx);
      drawBullets(ctx);
      drawMissiles(ctx);
      drawPlayer(ctx);
    }
    FX.draw(ctx);

    ctx.restore();
  },
};
function cleanupEnemies() {
  for (let i = enemies.length - 1; i >= 0;) {
    if (enemies[i].dead) {
      enemies[i] = enemies[enemies.length - 1];
      enemies.pop();
    } else {
      i--;
    }
  }
}
