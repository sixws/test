'use strict';
/* ============ 输入：键盘 + 触屏虚拟摇杆 ============ */
const Input = {
  keys: Object.create(null),
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  dashQueued: false,
  pad: { dashPrev: false, dashEdge: false, confirmPrev: false, confirmEdge: false,
         pausePrev: false, pauseEdge: false, navPrevL: false, navLEdge: false,
         navPrevR: false, navREdge: false, navPrevU: false, navUEdge: false,
         navPrevD: false, navDEdge: false, mutePrev: false, muteEdge: false, x: 0, y: 0 },
  joyEl: null, stickEl: null,

  init(canvas) {
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQueued = true;
      }
      this.keys[e.code] = true;
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('gamepadconnected', () => {
      if (typeof AudioSys !== 'undefined') { AudioSys.init(); AudioSys.resume(); }
    });
    addEventListener('blur', () => { this.keys = Object.create(null); this.joy.active = false; });

    this.joyEl = document.getElementById('joystick');
    this.stickEl = document.getElementById('stick');
    const dashBtn = document.getElementById('dashBtn');

    const onStart = (e) => {
      document.body.classList.add('touch');
      if (typeof Game === 'undefined' || Game.state !== 'playing') return;
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.62 && !this.joy.active) {
          e.preventDefault();
          this.joy.active = true;
          this.joy.id = t.identifier;
          this.joy.ox = t.clientX;
          this.joy.oy = t.clientY;
          this.joy.x = 0; this.joy.y = 0;
          this.joyEl.style.display = 'block';
          this.joyEl.style.left = (t.clientX - 55) + 'px';
          this.joyEl.style.top = (t.clientY - 55) + 'px';
          this.stickEl.style.transform = 'translate(0px,0px)';
        }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (this.joy.active && t.identifier === this.joy.id) {
          e.preventDefault();
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const l = Math.hypot(dx, dy), max = 48;
          if (l > max) { dx = dx / l * max; dy = dy / l * max; }
          this.joy.x = dx / max;
          this.joy.y = dy / max;
          this.stickEl.style.transform = `translate(${dx}px,${dy}px)`;
        }
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (this.joy.active && t.identifier === this.joy.id) {
          this.joy.active = false;
          this.joy.x = 0; this.joy.y = 0;
          this.joyEl.style.display = 'none';
        }
      }
    };
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);

    dashBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.dashQueued = true;
    }, { passive: false });
    dashBtn.addEventListener('click', (e) => { e.preventDefault(); this.dashQueued = true; });
  },

  pollPad() {
    this.pad.x = 0; this.pad.y = 0;
    if (!navigator.getGamepads) return;
    let gp = null;
    for (const p of navigator.getGamepads()) {
      if (p && p.connected) { gp = p; break; }
    }
    if (!gp) {
      this.pad.dashPrev = false;
      this.pad.confirmPrev = false;
      this.pad.pausePrev = false;
      this.pad.navPrevL = false;
      this.pad.navPrevR = false;
      this.pad.navPrevU = false;
      this.pad.navPrevD = false;
      this.pad.mutePrev = false;
      return;
    }
    const DEAD = 0.18;
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    const l = Math.hypot(x, y);
    if (l > 0 && l < DEAD) { x = 0; y = 0; }
    if (l > 1) { x /= l; y /= l; }
    const b = gp.buttons;
    if (b[12] && b[12].pressed) y = -1;
    if (b[13] && b[13].pressed) y = 1;
    if (b[14] && b[14].pressed) x = -1;
    if (b[15] && b[15].pressed) x = 1;
    this.pad.x = x; this.pad.y = y;
    const dashNow = !!(b[5] && b[5].pressed);
    if (dashNow && !this.pad.dashPrev) this.pad.dashEdge = true;
    this.pad.dashPrev = dashNow;
    const navL = (b[14] && b[14].pressed) || x < -0.6;
    const navR = (b[15] && b[15].pressed) || x > 0.6;
    if (navL && !this.pad.navPrevL) this.pad.navLEdge = true;
    if (navR && !this.pad.navPrevR) this.pad.navREdge = true;
    this.pad.navPrevL = navL; this.pad.navPrevR = navR;
    const navU = (b[12] && b[12].pressed) || y < -0.6;
    const navD = (b[13] && b[13].pressed) || y > 0.6;
    if (navU && !this.pad.navPrevU) this.pad.navUEdge = true;
    if (navD && !this.pad.navPrevD) this.pad.navDEdge = true;
    this.pad.navPrevU = navU; this.pad.navPrevD = navD;
    const confirmNow = !!(b[0] && b[0].pressed);
    if (confirmNow && !this.pad.confirmPrev) this.pad.confirmEdge = true;
    this.pad.confirmPrev = confirmNow;
    const pauseNow = !!(b[9] && b[9].pressed);
    if (pauseNow && !this.pad.pausePrev) this.pad.pauseEdge = true;
    this.pad.pausePrev = pauseNow;
    const muteNow = !!(b[8] && b[8].pressed);
    if (muteNow && !this.pad.mutePrev) this.pad.muteEdge = true;
    this.pad.mutePrev = muteNow;
  },

  consumePadUI() {
    this.pollPad();
    const r = {
      confirm: this.pad.confirmEdge,
      pause: this.pad.pauseEdge,
      left: this.pad.navLEdge,
      right: this.pad.navREdge,
      up: this.pad.navUEdge,
      down: this.pad.navDEdge,
      mute: this.pad.muteEdge,
    };
    this.pad.confirmEdge = false; this.pad.pauseEdge = false;
    this.pad.navLEdge = false; this.pad.navREdge = false;
    this.pad.navUEdge = false; this.pad.navDEdge = false;
    this.pad.muteEdge = false;
    return r;
  },

  getMove() {
    this.pollPad();
    let x = 0, y = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) y -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) y += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    if (this.joy.active) { x = this.joy.x; y = this.joy.y; }
    x += this.pad.x; y += this.pad.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  },

  consumeDash() {
    const d = this.dashQueued || this.pad.dashEdge;
    this.dashQueued = false;
    this.pad.dashEdge = false;
    return d;
  },
};
