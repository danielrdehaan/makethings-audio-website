// The "Join the waitlist" button on /plugins, the EQ page and the Modular page: on screen all the time. It sits in the
// header's place for it (#wlSlot) while the header is there, stays at the top once the header has scrolled away, and moves
// up into the tour bar (#bar) while the bar is out, which leaves it room (--wl-room). Its size never changes.
(() => {
  const pill = document.getElementById('wlPill'), slot = document.getElementById('wlSlot'), bar = document.getElementById('bar');
  if (!pill || !slot) return;
  const root = document.documentElement;
  let width = -1, room = -1;
  const frame = () => {
    const pw = pill.offsetWidth, ph = pill.offsetHeight;
    if (pw !== width) { width = pw; root.style.setProperty('--wl-w', pw + 'px'); }
    const s = slot.getBoundingClientRect();
    const head = Math.max(10, s.top + (s.height - ph) / 2);
    // How far the bar is out: its opacity, as the page's own render sets it, and how much of it is still on screen (it
    // scrolls away with the window at the end of the tour, and the button goes back to the top on its own).
    let on = bar && bar.offsetParent !== null ? Math.min(1, Math.max(0, parseFloat(bar.style.opacity) || 0)) : 0, top = head;
    if (on > 0) {
      const b = bar.getBoundingClientRect();
      on *= Math.min(1, Math.max(0, b.bottom / b.height));
      top = head + (Math.max(b.top, 0) + (b.height - ph) / 2 - head) * on;
    }
    const left = s.right - pw;
    pill.style.transform = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)';
    const r = Math.max(20, Math.round(innerWidth - left + 14));
    if (r !== room) { room = r; root.style.setProperty('--wl-room', r + 'px'); }
    pill.classList.add('placed');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
