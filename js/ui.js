'use strict';
/* ============ DOM UI ============ */
const UI = {
  els: {},
  weaponsDirty: true,
  _cache: {},
  _lastCombo: 0,
  _curOpts: null,
  _cursor: 0,

  init() {
    const ids = [
      'hud', 'hp-fill', 'hp-text', 'xp-fill', 'level-num', 'wave-label', 'timer',
      'boss-bar', 'boss-fill', 'score', 'combo', 'weapons-row', 'announce', 'flash',
      'screen-start', 'screen-levelup', 'screen-over', 'screen-pause',
      'best-score', 'cards',
      'stat-time', 'stat-wave', 'stat-level', 'stat-kills', 'stat-combo', 'stat-score', 'stat-best',
      'record-badge',
      'btn-start', 'btn-retry', 'btn-resume', 'btn-restart',
    ];
    for (const id of ids) this.els[id] = document.getElementById(id);

    const bindTap = (el, fn) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        AudioSys.init();
        AudioSys.resume();
        AudioSys.uiClick();
        fn();
      });
    };
    bindTap(this.els['btn-start'], () => Game.start());
    bindTap(this.els['btn-retry'], () => Game.start());
    bindTap(this.els['btn-resume'], () => Game.togglePause());
    bindTap(this.els['btn-restart'], () => Game.start());
  },

  showScreen(name) {
    const map = {
      start: 'screen-start', levelup: 'screen-levelup',
      over: 'screen-over', pause: 'screen-pause',
    };
    for (const k in map) {
      this.els[map[k]].classList.toggle('hidden', k !== name);
    }
    this.els.hud.classList.toggle('hidden', !(name === null || name === 'levelup' || name === 'pause'));
  },

  set(id, txt) {
    if (this._cache[id] === txt) return;
    this._cache[id] = txt;
    this.els[id].textContent = txt;
  },

  updateHUD() {
    const p = player;
    if (!p) return;
    const hpFrac = U.clamp(p.hp / p.maxHp, 0, 1);
    const hpW = Math.round(hpFrac * 1000) / 10 + '%';
    if (this._cache.hpW !== hpW) {
      this._cache.hpW = hpW;
      this.els['hp-fill'].style.width = hpW;
    }
    this.set('hp-text', `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`);
    const xpW = Math.round(U.clamp(p.xp / p.xpNext, 0, 1) * 1000) / 10 + '%';
    if (this._cache.xpW !== xpW) {
      this._cache.xpW = xpW;
      this.els['xp-fill'].style.width = xpW;
    }
    this.set('level-num', String(p.level));
    this.set('wave-label', 'WAVE ' + Game.wave);
    this.set('timer', U.fmtTime(Game.time));
    this.set('score', String(Game.score));

    const comboEl = this.els.combo;
    if (Game.combo >= 3) {
      comboEl.classList.remove('hidden');
      this.set('combo', `连击 ×${Game.combo}`);
      if (Game.combo !== this._lastCombo) {
        comboEl.classList.remove('pop');
        void comboEl.offsetWidth;
        comboEl.classList.add('pop');
      }
    } else {
      comboEl.classList.add('hidden');
    }
    this._lastCombo = Game.combo;

    // Boss 血条
    const boss = Game.boss;
    if (boss && !boss.dead) {
      this.els['boss-bar'].classList.remove('hidden');
      const bw = Math.round(U.clamp(boss.hp / boss.maxHp, 0, 1) * 1000) / 10 + '%';
      if (this._cache.bossW !== bw) {
        this._cache.bossW = bw;
        this.els['boss-fill'].style.width = bw;
      }
    } else {
      this.els['boss-bar'].classList.add('hidden');
    }

    if (this.weaponsDirty) {
      this.weaponsDirty = false;
      this.rebuildWeaponsRow();
    }

    this.els.flash.style.opacity = Game.flash.toFixed(3);
  },

  rebuildWeaponsRow() {
    const row = this.els['weapons-row'];
    row.innerHTML = '';
    for (const w of player.weapons) {
      const D = WEAPONS[w.key];
      const slot = document.createElement('div');
      slot.className = 'wslot' + (w.lv >= D.max ? ' maxed' : '');
      slot.style.setProperty('--wcol', D.col);
      slot.innerHTML = D.icon + `<span class="wlv">${w.lv >= D.max ? 'MAX' : 'Lv' + w.lv}</span>`;
      row.appendChild(slot);
    }
  },

  announce(txt, danger = false) {
    const el = this.els.announce;
    el.textContent = txt;
    el.classList.toggle('danger', danger);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },

  showUpgrades(opts) {
    this._curOpts = opts;
    this._cursor = 0;
    const wrap = this.els.cards;
    wrap.innerHTML = '';
    opts.forEach((opt, i) => {
      const m = upgradeCardMeta(opt);
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--col', m.col);
      card.innerHTML =
        `<div class="card-key">${i + 1}</div>` +
        `<div class="card-icon">${m.icon}</div>` +
        `<div class="card-name">${m.name}</div>` +
        `<div class="card-tag">${m.tag}</div>` +
        `<div class="card-desc">${m.desc}</div>`;
      card.addEventListener('click', () => {
        AudioSys.uiClick();
        Game.chooseUpgrade(opt);
      });
      wrap.appendChild(card);
    });
    this.highlightCards();
    this.showScreen('levelup');
  },

  pickByIndex(i) {
    if (this._curOpts && this._curOpts[i]) {
      AudioSys.uiClick();
      Game.chooseUpgrade(this._curOpts[i]);
    }
  },

  moveCursor(d) {
    if (!this._curOpts || !this._curOpts.length) return;
    this._cursor = (this._cursor + d + this._curOpts.length) % this._curOpts.length;
    this.highlightCards();
    AudioSys.uiClick();
  },

  highlightCards() {
    const cards = this.els.cards.children;
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('selected', i === this._cursor);
    }
  },

  pickCursor() {
    if (this._curOpts && this._curOpts[this._cursor]) {
      AudioSys.uiClick();
      Game.chooseUpgrade(this._curOpts[this._cursor]);
    }
  },

  showGameOver(stats, isRecord) {
    this.set('stat-time', U.fmtTime(stats.time));
    this.set('stat-wave', String(stats.wave));
    this.set('stat-level', String(stats.level));
    this.set('stat-kills', String(stats.kills));
    this.set('stat-combo', '×' + stats.maxCombo);
    this.set('stat-score', String(stats.score));
    this.set('stat-best', String(stats.best));
    this.els['record-badge'].classList.toggle('hidden', !isRecord);
    this.showScreen('over');
  },

  setBest(score) {
    this.set('best-score', String(score));
  },
};
