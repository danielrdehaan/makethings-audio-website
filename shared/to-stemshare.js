// The way into StemShare from the home page. StemShare is another site, so the browser's page transition (index.html's
// @view-transition, which carries the Plugins and Scripts cards) can't reach it. Instead the StemShare card's title flies
// up to where StemShare's landing puts its name, which is exactly where this page's mark is (same header, same type:
// stem-share's src/pages/landing.css, .lp-nav), while the rest of the page fades; StemShare then opens with its name
// already there. Back from StemShare (the browser's page cache), the title flies back down onto its card as the page
// comes back.
(() => {
  const card = document.querySelector('a.door.stemshare');
  const mark = document.querySelector('header .mark .dot');
  if (!card || !mark) return;
  const title = card.querySelector('h2');
  const page = [...document.querySelectorAll('body > .wrap, body > footer')];
  const MS = 850;
  const ease = (q) => (q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2);
  const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const textRect = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  let flight = null;

  // A copy of the title over the page, and the move that takes its text onto the mark's: scaled to the mark's size about
  // its top-left corner, left edges together, centred on the mark's line. A title off the screen just lets the page fade.
  function build() {
    const e = title.getBoundingClientRect(), t = textRect(title), m = textRect(mark);
    if (!t.width || t.bottom < 0 || t.top > innerHeight) return { copy: null };
    const cs = getComputedStyle(title), fs = parseFloat(cs.fontSize);
    const k = parseFloat(getComputedStyle(mark).fontSize) / fs;
    const copy = document.createElement('div');
    copy.setAttribute('aria-hidden', 'true');
    copy.textContent = title.textContent;
    copy.style.cssText = 'position:fixed;margin:0;white-space:nowrap;transform-origin:0 0;z-index:50;pointer-events:none;will-change:transform';
    Object.assign(copy.style, { left: e.left + 'px', top: e.top + 'px', font: cs.font, letterSpacing: cs.letterSpacing, color: cs.color });
    const dx = m.left - (e.left + (t.left - e.left) * k);
    // StemShare opens at its top, so the name goes where the mark is with this page scrolled to its top too.
    const dy = m.top + scrollY + (m.height - t.height * k) / 2 - (e.top + (t.top - e.top) * k);
    // StemShare's name is set a touch tighter than the card titles (-.035em against -.03em).
    const ls0 = parseFloat(cs.letterSpacing) / fs || -.03;
    return { copy, k, dx, dy, fs, ls0 };
  }
  function frame(f, x) {
    if (f.copy) {
      const z = 1 + (f.k - 1) * x;
      f.copy.style.transform = 'translate3d(' + (f.dx * x).toFixed(2) + 'px,' + (f.dy * x).toFixed(2) + 'px,0) scale(' + z.toFixed(4) + ')';
      f.copy.style.letterSpacing = ((f.ls0 + (-.035 - f.ls0) * x) * f.fs).toFixed(3) + 'px';
    }
    const o = (1 - smooth(x / .55)).toFixed(3);
    for (const el of page) el.style.opacity = o;
  }
  function run(f, dir, done) {
    const t0 = performance.now();
    const tick = (now) => {
      const q = Math.min(1, (now - t0) / MS), x = dir > 0 ? ease(q) : 1 - ease(q);
      frame(f, x);
      if (q < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  }
  function restore() {
    if (!flight) return;
    flight.copy?.remove();
    title.style.visibility = '';
    for (const el of page) el.style.opacity = '';
    flight = null;
  }

  for (const a of document.querySelectorAll('a[href^="https://stems.makethings.audio"]')) {
    a.addEventListener('click', (ev) => {
      if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || flight) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      ev.preventDefault();
      flight = build();
      if (flight.copy) { document.body.appendChild(flight.copy); title.style.visibility = 'hidden'; frame(flight, 0); }
      run(flight, 1, () => { location.href = a.href; });
    });
  }
  // Back from StemShare, this page as it was left: the title flies home.
  addEventListener('pageshow', (ev) => {
    if (!flight) return;
    if (!ev.persisted || !flight.copy) { restore(); return; }
    run(flight, -1, restore);
  });
})();
