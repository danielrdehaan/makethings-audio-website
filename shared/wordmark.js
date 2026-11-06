// The animated makethings.audio in the header of the home and Scripts pages.
// One font at a time, and only the five letters it has to draw. Each is fetched before its turn, so a slow one never leaves a gap.
const fonts = ['Pacifico', 'Permanent Marker', 'Bungee', 'Caveat', 'Lobster', 'Righteous', 'Satisfy', 'Fredoka', 'Abril Fatface', 'Press Start 2P', 'Sacramento', 'Concert One', 'Silkscreen', 'Comfortaa', 'Rubik Mono One', 'Playfair Display', 'Monoton', 'Russo One', 'Indie Flower', 'Bangers', 'Bungee Shade', 'Rubik Burned', 'Rubik Vinyl', 'Rubik Wet Paint', 'Rubik Glitch', 'Rubik Puddles', 'Rubik Spray Paint', 'Rubik Storm', 'Rubik Distressed', 'Rubik Maze', 'Creepster', 'Fascinate', 'Faster One', 'Rammetto One', 'Shrikhand', 'Orbitron', 'Audiowide', 'Bungee Inline', 'Megrim', 'Poiret One', 'Wallpoet', 'Notable', 'Vast Shadow', 'Londrina Solid', 'Londrina Outline', 'Londrina Shadow', 'Honk', 'Bagel Fat One', 'Moo Lah Lah', 'Nabla', 'Tiny5', 'Pixelify Sans', 'Jersey 10', 'Jersey 25', 'Kalnia', 'Jacquard 12', 'Micro 5', 'Foldit', 'Climate Crisis', 'Kablammo'];
const rot = document.getElementById('rot');
const fetched = new Map();
function fetchFont(name) {
  if (!fetched.has(name)) fetched.set(name, new Promise((done) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + name.replace(/ /g, '+') + '&text=audio&display=block';
    link.onload = () => document.fonts.load('1em "' + name + '"', 'audio').then((faces) => done(faces.length > 0), () => done(false));
    link.onerror = () => done(false);
    document.head.appendChild(link);
    setTimeout(() => done(false), 4000);
  }));
  return fetched.get(name);
}
let lastHue = -1;
// Light enough to read on the dark page, and never close to the colour before.
function nextColor() {
  let h;
  do { h = Math.floor(Math.random() * 360); } while (lastHue >= 0 && Math.min(Math.abs(h - lastHue), 360 - Math.abs(h - lastHue)) < 60);
  lastHue = h;
  return 'hsl(' + h + ',' + (65 + Math.floor(Math.random() * 25)) + '%,' + (62 + Math.floor(Math.random() * 12)) + '%)';
}
let at = -1, busy = false;
async function cycle() {
  if (busy || document.hidden) return;
  busy = true;
  try {
    // A font that doesn't arrive is skipped.
    let next = at, ok = false;
    for (let tries = 0; tries < 5 && !ok; tries++) { next = (next + 1) % fonts.length; ok = await fetchFont(fonts[next]); }
    if (!ok) return;
    const current = rot.querySelector('span:not(.out)');
    rot.style.width = current.getBoundingClientRect().width + 'px';
    const span = document.createElement('span');
    span.textContent = 'audio';
    span.style.fontFamily = "'" + fonts[next] + "', cursive";
    span.style.color = nextColor();
    span.className = 'waiting';
    rot.appendChild(span);
    // The widest fonts shrink to the room left before the links.
    const room = document.querySelector('nav').getBoundingClientRect().left - 20 - rot.getBoundingClientRect().left;
    const wide = span.getBoundingClientRect().width;
    if (wide > room) span.style.fontSize = (room / wide) + 'em';
    const width = span.getBoundingClientRect().width;
    rot.offsetHeight;
    current.className = 'out';
    span.className = '';
    rot.style.width = width + 'px';
    setTimeout(() => current.remove(), 400);
    at = next;
    fetchFont(fonts[(at + 1) % fonts.length]);
  } finally { busy = false; }
}
const timer = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : (fetchFont(fonts[0]), setInterval(cycle, 2200));
