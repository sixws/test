'use strict';
/* ============ 输入：键盘 + 触屏虚拟摇杆 ============ */
const Input = {
  keys: Object.create(null),
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  dashQueued: false,
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

  getMove() {
    let x = 0, y = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) y -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) y += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    if (this.joy.active) { x = this.joy.x; y = this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  },

  consumeDash() {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  },
};
