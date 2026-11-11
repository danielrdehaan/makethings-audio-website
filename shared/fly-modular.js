// The flight into the Modular page, played whole by the page it starts on (/plugins' Modular card, home's Modular door), as
// the EQ's is: a copy of the Modular window leaves the card and lands exactly in the Modular page's first pose, on the
// same camera and curve as the EQ's flight, while everything else on the page rides that camera out of view. Only then
// does the Modular page open, with the window already where it landed (plugins/modular, "Arriving from the Modular card"),
// so its load can only show once the motion is over, never as a pause in it.
window.flyToModular = function ({ art, href, others, fadeOnly = [], from, top }) {
  const vw = innerWidth, vh = innerHeight, r = art.getBoundingClientRect(), W0 = 1000, H0 = 625;
  // The Modular page's first pose for this window: plugins/modular, layout(), the 'hero' beat's camera.
  const wide = vw / vh >= 1.2 && vw >= 860;
  const sx0 = vw * (wide ? .06 : .03), sx1 = vw * (wide ? .94 : .97), sy0 = vh * .62, sy1 = vh * 1.5;
  const zC = Math.min((sx1 - sx0) / W0, (sy1 - sy0) / H0);
  const C = { cx: W0 / 2, cy: H0 / 2, sx: (sx0 + sx1) / 2, sy: sy0 + H0 * zC / 2, lz: Math.log(zC), rot: 22 };
  // The card shows the top of the window at its full width: the window starts there, flat, cropped the same.
  const c = W0 * r.height / r.width, clip0 = Math.max(0, H0 - c);
  const A = { cx: W0 / 2, cy: c / 2, sx: r.left + r.width / 2, sy: r.top + r.height / 2, lz: Math.log(r.width / W0), rot: 0 };

  const persp = document.createElement('div');
  persp.setAttribute('aria-hidden', 'true');
  persp.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;perspective:1800px;perspective-origin:50% 40%';
  const world = document.createElement('div');
  world.style.cssText = 'position:absolute;left:0;top:0;width:' + W0 + 'px;height:' + H0 + 'px;transform-origin:0 0;border-radius:6px;background:#111416;box-shadow:0 0 0 1px #2c3337,0 40px 130px -30px rgba(0,0,0,.9);overflow:hidden;will-change:transform';
  const pic = art.querySelector('img').cloneNode();
  pic.removeAttribute('loading');
  pic.style.cssText = 'display:block;width:100%;height:100%;max-width:none;object-fit:cover;object-position:50% 0';
  world.appendChild(pic); persp.appendChild(world); document.body.appendChild(persp);

  // Everything else is on the card's plane, so it rides the same camera: it grows about the card's centre and is carried
  // with it. Origins are measured untransformed.
  for (const el of others) { const t = el.style.transform; el.style.transform = 'none'; const b = el.getBoundingClientRect(); el.style.transform = t; el.style.transformOrigin = (A.sx - b.left).toFixed(1) + 'px ' + (A.sy - b.top).toFixed(1) + 'px'; el.style.transition = 'none'; }
  const base = others.map((el) => +getComputedStyle(el).opacity);
  const fadeBase = fadeOnly.map((el) => +getComputedStyle(el).opacity);
  const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const ease = (q) => (q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2);
  function frame(x) {
    const lerp = (a, b) => a + (b - a) * x, z = Math.exp(lerp(A.lz, C.lz));
    const cx = lerp(A.cx, C.cx), cy = lerp(A.cy, C.cy), sx = lerp(A.sx, C.sx), sy = lerp(A.sy, C.sy);
    world.style.transform = 'translate3d(' + (sx - cx * z).toFixed(2) + 'px,' + (sy - cy * z).toFixed(2) + 'px,0) rotateX(' + lerp(A.rot, C.rot).toFixed(2) + 'deg) scale(' + z.toFixed(4) + ')';
    world.style.clipPath = clip0 > 0 && x < 1 ? 'inset(0 0 ' + (clip0 * (1 - x)).toFixed(1) + 'px 0 round 6px)' : '';
    const zr = z / Math.exp(A.lz), tx = sx + (A.cx - cx) * z - A.sx, ty = sy + (A.cy - cy) * z - A.sy, away = 1 - smooth(x / .55);
    others.forEach((el, i) => { el.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + zr.toFixed(4) + ')'; el.style.opacity = (base[i] * away).toFixed(3); });
    fadeOnly.forEach((el, i) => { el.style.opacity = (fadeBase[i] * away).toFixed(3); });
  }
  frame(0);
  art.style.visibility = 'hidden';
  const t0 = performance.now(), ms = 1250;
  const tick = (now) => {
    const q = Math.min(1, (now - t0) / ms);
    frame(ease(q));
    if (q < 1) { requestAnimationFrame(tick); return; }
    try { localStorage.setItem('mt-fly-modular', JSON.stringify({ landed: true, x: r.left, y: r.top, w: r.width, h: r.height, vw, vh, top, from, t: Date.now() })); } catch { /* the page opens as it is */ }
    location.href = href;
  };
  requestAnimationFrame(tick);
  // Back here from the browser's page cache: the page as it was.
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    persp.remove(); art.style.visibility = '';
    for (const el of [...others, ...fadeOnly]) { el.style.transform = ''; el.style.opacity = ''; el.style.transition = ''; }
  }, { once: true });
};
