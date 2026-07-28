'use strict';
/* ============ 启动 & 主循环 ============ */
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let last = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    World.resize(innerWidth, innerHeight);
  }

  function frame(t) {
    requestAnimationFrame(frame);
    let rdt = (t - last) / 1000;
    last = t;
    if (!(rdt > 0) || rdt > 0.05) rdt = 0.016;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Game.update(rdt);
    Game.render(ctx);
  }

  World.init();
  Input.init(canvas);
  UI.init();
  Game.init();
  resize();
  addEventListener('resize', resize);
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

  /* 无头冒烟测试钩子: index.html?autotest=1[&ticks=N] */
  if (location.search.includes('autotest')) {
    setTimeout(() => {
      try {
        const m = location.search.match(/ticks=(\d+)/);
        const SIM = m ? +m[1] : 14000;
        const god = !location.search.includes('mortal');
        Game.start();
        if (god) { player.maxHp = 1e9; player.hp = 1e9; }
        let ang = 0;
        Input.getMove = () => ({ x: Math.cos(ang), y: Math.sin(ang) });
        let restarted = false;
        for (let i = 0; i < SIM; i++) {
          if (i % 50 === 0) ang += U.rand(-1.6, 1.6);
          if (god && i % 240 === 0) Game.gainXP(60);
          Game.update(1 / 60);
          if (Game.state === 'levelup') UI.pickByIndex((Math.random() * 3) | 0);
          if (Game.state === 'over') {
            if (restarted) break;
            restarted = true;
            Game.start();
          }
          if (i % 120 === 0) Game.render(ctx);
        }
        Game.render(ctx);
        // 像素统计：验证画面非黑屏且色彩丰富
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0, bright = 0, colored = 0;
        for (let i = 0; i < img.length; i += 40) {
          const r = img[i], g = img[i + 1], b = img[i + 2];
          const mx = Math.max(r, g, b);
          if (mx > 20) lit++;
          if (mx > 150) bright++;
          if (Math.abs(r - b) > 40 || Math.abs(g - b) > 40 || Math.abs(r - g) > 40) colored++;
        }
        const tot = img.length / 40;
        console.log('PIXELS lit=' + (lit / tot * 100).toFixed(1) + '%' +
          ' bright=' + (bright / tot * 100).toFixed(1) + '%' +
          ' colored=' + (colored / tot * 100).toFixed(1) + '%');
        console.log('AUTOTEST OK time=' + Game.time.toFixed(1) +
          ' wave=' + Game.wave + ' state=' + Game.state +
          ' kills=' + Game.kills + ' score=' + Game.score +
          ' level=' + (player ? player.level : 0) +
          ' weapons=' + (player ? player.weapons.length : 0) +
          ' enemies=' + enemies.length +
          ' restarted=' + restarted);
      } catch (err) {
        console.error('AUTOTEST FAIL: ' + err.stack);
      }
    }, 500);
  }
})();
