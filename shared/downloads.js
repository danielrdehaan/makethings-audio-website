// /downloads: an installer per plugin the signed-in user has, from GET /api/plugin/latest (15-minute links into R2):
// version and date, what's new, a button per platform with the visitor's first, and the older versions. Each plugin is
// anchored at #<id>, because a plugin's Settings › Updates opens /downloads#<id>. A beta tester gets a newer beta.
import { calendarDate, DOWNLOAD_ICON, h, httpsOnly, pluginApi, renderNotes, requireSession } from './account.js'

const NAMES = { mac: 'Mac', win: 'Windows' }
const PLATFORMS = ['mac', 'win']
const LINK_LIFE_MS = 14 * 60 * 1000 // a little under the links' 15 minutes
/** What a product installs beyond its own name (plugins/products/<id>/product.json `plugins`). */
const INSTALLS = { modular: 'Modular, Modular FX and Modular MIDI' }
const ABOUT = { eq: '/plugins/eq/' }

const TRIAL_RULE = 'Trials are one per person and one per computer.'
const WHY_NOT = {
  ended: ['You don’t have a licence for the plugins right now. ', h('a', { href: '/plugins/' }, 'See the plans'), '.'],
  not_licensed: 'Your account doesn’t include the plugins. They aren’t on sale yet: for now they come with groups that have them switched on, or by invitation. Ask whoever runs your group if you should have them.',
  no_release: 'No installer has been published yet. Check back soon.',
  error: 'Couldn’t reach the download service. Try again in a moment.',
}

const root = document.getElementById('app')
const platform = /Windows/i.test(navigator.userAgent) ? 'win' : 'mac'
const other = platform === 'win' ? 'mac' : 'win'

await requireSession()
const loadedAt = Date.now()
try {
  const { status, data } = await pluginApi('latest?channel=beta')
  show(status, data)
} catch {
  say(WHY_NOT.error)
}

function say(what) {
  root.replaceChildren(h('p', { class: 'empty' }, what))
}

function show(status, data) {
  const products = status === 200 && data.products && typeof data.products === 'object'
    ? Object.entries(data.products).map(([id, p]) => productOf(id, p)).filter(Boolean)
    : []
  if (!products.length) {
    say(status === 200 || data.error === 'no_release' ? WHY_NOT.no_release
      : data.error === 'not_licensed' ? (data.salesOpen === true ? WHY_NOT.ended : WHY_NOT.not_licensed)
      : WHY_NOT.error)
    return
  }
  root.replaceChildren(...[
    data.trialAvailable === true && h('p', { class: 'trial-note', 'data-trial-note': true },
      h('strong', {}, 'Your 14-day trial is ready. '), `It starts the first time you sign in from a plugin, with no card needed. ${TRIAL_RULE}`),
    ...products.map(productCard),
    h('section', { class: 'sect' },
      h('h3', {}, 'After installing'),
      h('p', { class: 'sect-note', style: 'margin-top:6px' }, 'Open a plugin in your DAW and choose ', h('strong', {}, 'Sign in to Make Things'), '. You can sign in on up to 3 computers, and manage them on ', h('a', { href: '/account/#computers' }, 'your account'), '.')),
  ].filter(Boolean))
  // The cards arrived after the page, so the browser's own jump to #<id> found nothing.
  if (location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start' })
  // A link left open past its life answers with an error from storage: load fresh ones instead of following it.
  root.addEventListener('click', (e) => {
    if (e.target.closest?.('a[data-installer]') && Date.now() - loadedAt > LINK_LIFE_MS) { e.preventDefault(); location.reload() }
  })
}

/** A release as the Worker answers it, keeping only installers with an https link; an older Worker has no `platforms`,
 *  and its `url` is the Mac installer. */
function releaseOf(r) {
  if (!r || typeof r !== 'object' || typeof r.version !== 'string' || !r.version) return null
  const platforms = {}
  const given = r.platforms && typeof r.platforms === 'object' ? r.platforms : { mac: { url: r.url, minOS: r.minMacOS, archs: r.archs } }
  for (const p of PLATFORMS) if (httpsOnly(given[p]?.url)) platforms[p] = given[p]
  return { version: r.version, date: r.date ?? null, notes: typeof r.notes === 'string' ? r.notes : '', platforms }
}

function productOf(id, p) {
  const release = releaseOf(p)
  if (!release) return null
  return { ...release, id, name: typeof p.name === 'string' && p.name ? p.name : id, beta: p.channel === 'beta',
    history: Array.isArray(p.history) ? p.history.map(releaseOf).filter(Boolean) : [] }
}

function describeArchs(archs) {
  if (!Array.isArray(archs) || !archs.length) return 'Apple Silicon and Intel'
  return [archs.includes('arm64') && 'Apple Silicon', archs.includes('x86_64') && 'Intel'].filter(Boolean).join(' and ') || archs.join(', ')
}

function describe(p, d) {
  if (p === 'win') return 'VST3 for Windows 10 and 11 (64-bit)'
  return `AU and VST3 for Mac: ${describeArchs(d.archs)}${d.minOS ? ` · macOS ${d.minOS} or later` : ''}`
}

function option(name, p, version, d, primary) {
  return h('div', { class: 'option', 'data-platform': p },
    h('a', { class: primary ? 'pill' : 'pill ghost', href: d.url, 'data-installer': true }, DOWNLOAD_ICON(), `Download ${name} ${version} for ${NAMES[p]}`),
    h('p', {}, describe(p, d)),
    d.unsigned && h('p', { class: 'warn' }, 'Windows may warn that it’s an unrecognised app: choose More info, then Run anyway.'))
}

function productCard(p) {
  const newest = [p, ...p.history].find((r) => r.platforms[platform]) ?? null
  const theirs = p.platforms[other] ?? null
  const date = calendarDate(p.date)
  return h('section', { class: 'sect product', id: p.id, 'data-product': p.id },
    h('div', { class: 'product-head' }, h('h2', {}, p.name), p.beta && h('span', { class: 'tag beta', title: 'You’re a beta tester: this is the newest beta' }, 'Beta')),
    h('p', { class: 'meta' }, [`Version ${p.version}`, date, INSTALLS[p.id]].filter(Boolean).join(' · '),
      ABOUT[p.id] && [' · ', h('a', { href: ABOUT[p.id] }, 'About this plugin')]),
    newest && newest.version !== p.version && h('p', { class: 'small', style: 'margin:12px 0 0' }, `${p.name} ${p.version} isn’t available for ${NAMES[platform]} yet. The newest for ${NAMES[platform]} is ${newest.version}.`),
    !newest && h('p', { class: 'small', style: 'margin:12px 0 0' }, `${p.name} isn’t available for ${NAMES[platform]} yet.`),
    h('div', { class: 'options' },
      newest && option(p.name, platform, newest.version, newest.platforms[platform], true),
      theirs && option(p.name, other, p.version, theirs, !newest)),
    p.notes.trim() && h('div', { class: 'notes' }, h('h3', {}, 'What’s new'), renderNotes(p.notes)),
    p.history.length > 0 && h('details', {},
      h('summary', {}, p.history.length === 1 ? '1 older version' : `${p.history.length} older versions`),
      h('ul', { class: 'old' }, p.history.map((r) => h('li', {},
        h('div', { class: 'old-head' }, h('strong', {}, r.version), calendarDate(r.date) && h('span', { class: 'muted' }, calendarDate(r.date)),
          PLATFORMS.filter((x) => r.platforms[x]).map((x) => h('a', { href: r.platforms[x].url, 'data-installer': true }, `Download for ${NAMES[x]}`))),
        r.notes.trim() && h('div', { class: 'notes', style: 'margin-top:6px' }, renderNotes(r.notes)))))))
}
