// What the account pages share: the Supabase session on this site, the call to the plugin API, and small DOM helpers.
// The session lives in this site's own storage, so signing in here is separate from signing in on StemShare, and
// signing out here leaves StemShare signed in (scope: 'local').
import { PLUGIN_API, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js'

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: false },
})

/** Whether the Worker refuses a session without a second factor (its REQUIRE_MFA). If this can't be answered it's no: anyone with a
 *  factor is still asked for their code, and a refused call goes back to /login. */
export async function twoFactorRequired() {
  try {
    const r = await fetch(`${PLUGIN_API}/sales-status`)
    return r.ok && (await r.json()).mfaRequired === true
  } catch {
    return false
  }
}

/** What this session still owes before it can use the account: 'code' (it has a factor and hasn't used it), 'enroll' (it has none and
 *  one is required), or null. */
export async function twoFactorStep() {
  try {
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || data.currentLevel === 'aal2') return null
    if (data.nextLevel === 'aal2') return 'code'
  } catch {
    return null
  }
  return (await twoFactorRequired()) ? 'enroll' : null
}

/** The session, or on to /login with this page as where to come back to (hash included: a plugin opens /downloads#eq). The sign-in
 *  page also takes a session that still owes a code. */
export async function requireSession() {
  const { data } = await sb.auth.getSession()
  if (data.session && !(await twoFactorStep())) return data.session
  toLogin()
  return new Promise(() => {}) // the page is leaving: nothing after this should run
}

export function toLogin() {
  const here = location.pathname + location.search + location.hash
  location.replace(`/login/?next=${encodeURIComponent(here)}`)
}

/** A same-site path to go to after signing in; anything else (another site, `//host`, `/\host`) is the account page. */
export function safeNext(next) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/account/'
  try {
    const url = new URL(next, location.origin)
    return url.origin === location.origin ? url.pathname + url.search + url.hash : '/account/'
  } catch {
    return '/account/'
  }
}

/** Call the Worker's /api/plugin/<path> as the signed-in user. A refused session goes back to /login. */
export async function pluginApi(path, { method = 'GET', body } = {}) {
  const { data } = await sb.auth.getSession()
  if (!data.session) { toLogin(); return new Promise(() => {}) }
  const r = await fetch(`${PLUGIN_API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {})
    toLogin()
    return new Promise(() => {})
  }
  return { status: r.status, data: await r.json().catch(() => ({})) }
}

export async function signOut() {
  await sb.auth.signOut({ scope: 'local' }).catch(() => {})
  location.assign('/login/')
}

/** An element: props are attributes, `class`, or `on<event>` listeners; text always goes in as text, never as HTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false))
  return el
}

/** A link's address when it is https, otherwise null: addresses come from the API and only ever go in an href. */
export const httpsOnly = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : null)

/** "4 Nov 2026" from a timestamp, or '' for none. */
export function dateOf(iso) {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

/** A release's "YYYY-MM-DD" as a date. Parsed as a calendar date, so it never moves a day west of UTC. */
export function calendarDate(date) {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^)\s]+\))/

function inline(text) {
  return text.split(INLINE).filter(Boolean).map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return h('strong', {}, part.slice(2, -2))
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return h('code', {}, part.slice(1, -1))
    const link = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(part)
    if (link) return h('a', { href: link[2], rel: 'noopener' }, link[1])
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return h('em', {}, part.slice(1, -1))
    return part
  })
}

/** Release notes as written in a CHANGELOG: headings, bullets (wrapped over lines), paragraphs, bold, italics, code and
 *  https links. Everything else stays literal text: raw HTML in a note is shown, never parsed. */
export function renderNotes(markdown) {
  const out = []
  let list = null
  let open = null // the paragraph or bullet that a wrapped line continues
  for (const raw of String(markdown).split('\n')) {
    const line = raw.trim()
    if (!line) { list = null; open = null; continue }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (heading) {
      out.push(h('h4', {}, heading[1]))
      list = null; open = null
    } else if (bullet) {
      if (!list) { list = { items: [] }; out.push(list) }
      open = { text: bullet[1] }
      list.items.push(open)
    } else if (open) {
      open.text += ` ${line}`
    } else {
      open = { text: line }
      out.push(open)
    }
  }
  return out.map((b) => {
    if (b instanceof Node) return b
    if (b.items) return h('ul', {}, b.items.map((i) => h('li', {}, inline(i.text))))
    return h('p', {}, inline(b.text))
  })
}

export const DOWNLOAD_ICON = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M8 1.5v8.5m0 0L4.5 6.5M8 10l3.5-3.5M2 14.5h12')
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.7')
  path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round')
  svg.append(path)
  return svg
}
