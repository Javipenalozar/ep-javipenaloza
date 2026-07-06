(function () {
  const canvas = document.querySelector("#cosmos-bg canvas");
  const ctx = canvas.getContext("2d");
  let w, h, stars, nebulae, frame;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function init() {
    resize();
    stars = Array.from({ length: 220 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.4 + 0.3,
      a: Math.random(),
      speed: Math.random() * 0.0008 + 0.0003,
      phase: Math.random() * Math.PI * 2,
    }));

    nebulae = [
      { x: w * 0.2, y: h * 0.4, rx: 300, ry: 200, color: [124, 58, 237], a: 0.04, speed: 0.0002 },
      { x: w * 0.8, y: h * 0.2, rx: 250, ry: 180, color: [6, 182, 212], a: 0.03, speed: 0.00015 },
      { x: w * 0.6, y: h * 0.8, rx: 280, ry: 160, color: [37, 99, 235], a: 0.035, speed: 0.00025 },
    ];
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);

    for (const n of nebulae) {
      const drift = Math.sin(t * n.speed) * 30;
      const grad = ctx.createRadialGradient(
        n.x + drift, n.y, 0,
        n.x + drift, n.y, n.rx
      );
      const pulse = 0.7 + Math.sin(t * n.speed * 1.5) * 0.3;
      grad.addColorStop(0, `rgba(${n.color.join(",")}, ${n.a * pulse})`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(n.x + drift, n.y, n.rx, n.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of stars) {
      const twinkle = 0.4 + Math.sin(t * s.speed * 1000 + s.phase) * 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.a * twinkle})`;
      ctx.fill();
    }

    frame = requestAnimationFrame(draw);
  }

  window.addEventListener("resize", () => {
    cancelAnimationFrame(frame);
    init();
    frame = requestAnimationFrame(draw);
  });

  init();
  frame = requestAnimationFrame(draw);
})();
