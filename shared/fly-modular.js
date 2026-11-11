// The flights between /plugins' Modular card and the Modular page, both played whole on /plugins, so a page load can only
// show before or after the motion, never as a pause in it. A copy of the Modular window (its first frame, the card's
// picture) moves on the same camera and perspective as the Modular page's own window, while everything else on /plugins
// rides that camera too: it grows about the card's centre and is carried with it.
//  - In (flyToModular): from the card to the Modular page's first pose, then that page opens with the window already there
//    (plugins/modular, "Arriving from the Modular card").
//  - Back (startModularBack + flyFromModular): the Modular page fades to its bare window and leaves its camera here
//    (sessionStorage 'mt-modular-back'); this page draws the window there before it first paints, then flies it onto the
//    card while the page comes back in around it. The browser's back button leaves the same hand-off.
(() => {
  const W0 = 1000, H0 = 625, PIC = '/plugins/media/modular/hero.jpg';
  const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const ease = (q) => (q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2);
  const camCss = (c, z) => 'translate3d(' + (c.sx - c.cx * z).toFixed(2) + 'px,' + (c.sy - c.cy * z).toFixed(2) + 'px,0) rotateX(' + c.rot.toFixed(2) + 'deg) scale(' + z.toFixed(4) + ')';
  // The Modular page's stage, as a fixed layer: same perspective, same window.
  function overlay(src) {
    const persp = document.createElement('div');
    persp.setAttribute('aria-hidden', 'true');
    persp.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;perspective:1800px;perspective-origin:50% 40%';
    const world = document.createElement('div');
    world.style.cssText = 'position:absolute;left:0;top:0;width:' + W0 + 'px;height:' + H0 + 'px;transform-origin:0 0;border-radius:6px;background:#111416;box-shadow:0 0 0 1px #2c3337,0 40px 130px -30px rgba(0,0,0,.9);overflow:hidden;will-change:transform';
    const pic = document.createElement('img');
    pic.src = src; pic.alt = ''; pic.decoding = 'sync';
    pic.style.cssText = 'display:block;width:100%;height:100%;max-width:none;object-fit:cover;object-position:50% 0';
    world.appendChild(pic); persp.appendChild(world);
    return { persp, world };
  }
  // The card's pose: it shows the top of the window at its full width, so the window sits there flat, cropped the same.
  const cardPose = (r) => { const c = W0 * r.height / r.width; return { cam: { cx: W0 / 2, cy: c / 2, sx: r.left + r.width / 2, sy: r.top + r.height / 2, lz: Math.log(r.width / W0), rot: 0 }, clip: Math.max(0, H0 - c) }; };
  // One flight between the card's pose A (x = 0) and a camera C (x = 1), with the page's other parts riding the camera.
  function flight(world, art, others, fadeOnly, C) {
    const { cam: A, clip } = cardPose(art.getBoundingClientRect());
    for (const el of others) { const t = el.style.transform; el.style.transform = 'none'; const b = el.getBoundingClientRect(); el.style.transform = t; el.style.transformOrigin = (A.sx - b.left).toFixed(1) + 'px ' + (A.sy - b.top).toFixed(1) + 'px'; el.style.transition = 'none'; }
    return function frame(x, base, fadeBase) {
      const lerp = (a, b) => a + (b - a) * x, z = Math.exp(lerp(A.lz, C.lz));
      const cx = lerp(A.cx, C.cx), cy = lerp(A.cy, C.cy), sx = lerp(A.sx, C.sx), sy = lerp(A.sy, C.sy);
      world.style.transform = camCss({ cx, cy, sx, sy, rot: lerp(A.rot, C.rot) }, z);
      world.style.clipPath = clip > 0 && x < 1 ? 'inset(0 0 ' + (clip * (1 - x)).toFixed(1) + 'px 0 round 6px)' : '';
      const zr = z / Math.exp(A.lz), tx = sx + (A.cx - cx) * z - A.sx, ty = sy + (A.cy - cy) * z - A.sy, away = 1 - smooth(x / .55);
      others.forEach((el, i) => { el.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + zr.toFixed(4) + ')'; el.style.opacity = (base[i] * away).toFixed(3); });
      fadeOnly.forEach((el, i) => { el.style.opacity = (fadeBase[i] * away).toFixed(3); });
    };
  }
  const restore = (els) => { for (const el of els) { el.style.transform = ''; el.style.opacity = ''; el.style.transition = ''; } };

  window.flyToModular = function ({ art, href, others, fadeOnly = [], from, top }) {
    const vw = innerWidth, vh = innerHeight, r = art.getBoundingClientRect();
    // The Modular page's first pose for this window: plugins/modular, layout(), the 'hero' beat's camera.
    const wide = vw / vh >= 1.2 && vw >= 860;
    const sx0 = vw * (wide ? .06 : .03), sx1 = vw * (wide ? .94 : .97), sy0 = vh * .62, sy1 = vh * 1.5;
    const zC = Math.min((sx1 - sx0) / W0, (sy1 - sy0) / H0);
    const C = { cx: W0 / 2, cy: H0 / 2, sx: (sx0 + sx1) / 2, sy: sy0 + H0 * zC / 2, lz: Math.log(zC), rot: 22 };
    const { persp, world } = overlay(art.querySelector('img').currentSrc || PIC);
    document.body.appendChild(persp);
    const base = others.map((el) => +getComputedStyle(el).opacity), fadeBase = fadeOnly.map((el) => +getComputedStyle(el).opacity);
    const frame = flight(world, art, others, fadeOnly, C);
    frame(0, base, fadeBase);
    art.style.visibility = 'hidden';
    const t0 = performance.now(), ms = 1250;
    const tick = (now) => {
      const q = Math.min(1, (now - t0) / ms);
      frame(ease(q), base, fadeBase);
      if (q < 1) { requestAnimationFrame(tick); return; }
      try { localStorage.setItem('mt-fly-modular', JSON.stringify({ landed: true, x: r.left, y: r.top, w: r.width, h: r.height, vw, vh, top, from, t: Date.now() })); } catch { /* the page opens as it is */ }
      location.href = href;
    };
    requestAnimationFrame(tick);
    // Back here from the browser's page cache, still as it was when the window left: the way back. The Modular page's
    // camera can reach this page a few frames late (another process wrote it), so it's waited for briefly; without it the
    // window flies back from that page's first pose, where this flight left it.
    addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      let tries = 0;
      const go = () => {
        if (!window.startModularBack(++tries < 10 ? null : C)) { if (tries < 10) { requestAnimationFrame(go); return; } persp.remove(); art.style.visibility = ''; restore([...others, ...fadeOnly]); return; }
        persp.remove();
        window.flyFromModular({ art, others });
      };
      go();
    }, { once: true });
  };

  // The way back. Where the card sits on /plugins, for this window size, is remembered by /plugins (rememberCard), so the
  // flight can start the moment its window is drawn, before the rest of the page has loaded; the page's parts join it when
  // they exist (flyFromModular), at the point the flight has reached.
  const CARD = 'mt-modular-cardrect';
  window.rememberModularCard = function (art) {
    const r = art.getBoundingClientRect();
    if (!r.width || scrollY > 4) return;
    try { sessionStorage.setItem(CARD, JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight })); } catch { /* fine */ }
  };
  const BACK_MS = 1150;
  function frameBack(b, x) {
    const A = b.A.cam, C = b.cam, lerp = (u, v) => u + (v - u) * x, z = Math.exp(lerp(A.lz, C.lz));
    const cx = lerp(A.cx, C.cx), cy = lerp(A.cy, C.cy), sx = lerp(A.sx, C.sx), sy = lerp(A.sy, C.sy);
    b.world.style.transform = camCss({ cx, cy, sx, sy, rot: lerp(A.rot, C.rot) }, z);
    b.world.style.clipPath = b.A.clip > 0 && x < 1 ? 'inset(0 0 ' + (b.A.clip * (1 - x)).toFixed(1) + 'px 0 round 6px)' : '';
    const zr = z / Math.exp(A.lz), tx = sx + (A.cx - cx) * z - A.sx, ty = sy + (A.cy - cy) * z - A.sy, away = 1 - smooth(x / .55);
    for (const el of b.others) { el.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + zr.toFixed(4) + ')'; el.style.opacity = away.toFixed(3); }
  }
  function runBack(b) {
    b.t0 = performance.now();
    const tick = (now) => {
      // Moving from its first frame (the Modular page has just faded to this window, so a slow start would read as a
      // pause), and coming to rest on the card.
      const q = Math.min(1, (now - b.t0) / BACK_MS);
      b.x = 1 - (.4 * (1 - Math.pow(1 - q, 3)) + .6 * ease(q));
      frameBack(b, b.x);
      // Landed: the card takes over from the copy (once the page is there to show it).
      if (b.x > 0 || !b.art) { requestAnimationFrame(tick); return; }
      b.persp.remove(); b.art.style.visibility = '';
      restore(b.others);
      window.__modularBack = null;
    };
    requestAnimationFrame(tick);
  }

  // Called from /plugins' <head>: if the Modular page just left its camera, draw its window there now, before this page
  // first paints, hide the page's parts (html.fly-in), and start the flight if the card's place is known.
  window.startModularBack = function (cam) {
    let h = null, card = null;
    try { h = cam ? { cam, vw: innerWidth, vh: innerHeight, t: Date.now() } : JSON.parse(sessionStorage.getItem('mt-modular-back') || 'null'); sessionStorage.removeItem('mt-modular-back'); card = JSON.parse(sessionStorage.getItem(CARD) || 'null'); } catch { return false; }
    if (!h || !h.cam || Date.now() - h.t > 6000 || h.vw !== innerWidth || Math.abs(h.vh - innerHeight) > 2) return false;
    if (/\/plugins\/eq\/?$/.test(location.pathname) || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const { persp, world } = overlay(PIC);
    world.style.transform = camCss(h.cam, Math.exp(h.cam.lz));
    (document.body || document.documentElement).appendChild(persp);
    document.documentElement.classList.add('fly-in');
    const b = window.__modularBack = { cam: h.cam, persp, world, A: null, others: [], art: null, x: 1 };
    if (card && card.vw === innerWidth && Math.abs(card.vh - innerHeight) < 3) { b.A = cardPose(card); runBack(b); }
    return true;
  };

  // From /plugins' own script, once the page is there: the card's real place, and the page's parts, which ride the camera
  // in from wherever the flight has got to.
  window.flyFromModular = function ({ art, others }) {
    const b = window.__modularBack;
    if (!b || b.art) return false;
    if (b.persp.parentNode !== document.body) document.body.appendChild(b.persp);
    b.art = art; art.style.visibility = 'hidden';
    b.A = cardPose(art.getBoundingClientRect());
    for (const el of others) { const t = el.style.transform; el.style.transform = 'none'; const r = el.getBoundingClientRect(); el.style.transform = t; el.style.transformOrigin = (b.A.cam.sx - r.left).toFixed(1) + 'px ' + (b.A.cam.sy - r.top).toFixed(1) + 'px'; el.style.transition = 'none'; }
    b.others = others;
    frameBack(b, b.x);
    document.documentElement.classList.remove('fly-in');
    if (b.t0 === undefined) runBack(b);
    return true;
  };
})();
