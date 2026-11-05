// /account: what the signed-in user has and through what, the computers their plugins are signed in on, and billing.
// Reads go to Supabase under row-level security; deactivating a computer and billing go to the Worker (/api/plugin/*).
// A licence covers the user, not one computer: every signed-in computer is activated for all the user's plugins, and
// the server doesn't know which ones are installed there. The page says only that.
//
// Billing: no payment provider is connected yet (Paddle, docs/plugin-product-plan.md §4.4), so GET /api/plugin/billing
// answers empty lists today and the subscription and purchase rows below don't appear for anyone.
import { APP_URL } from './config.js'
import { dateOf, h, httpsOnly, pluginApi, requireSession, sb, signOut } from './account.js'

const MACHINE_LIMIT = 3
const root = document.getElementById('app')
const session = await requireSession()
document.getElementById('who').textContent = session.user.email ?? ''
document.getElementById('signOut').addEventListener('click', () => signOut())

const state = { sources: [], names: {}, machines: [], billing: null, billingFailed: false }
async function load() {
  const [sources, products, machines, billing] = await Promise.allSettled([
    sb.rpc('my_plugin_entitlements'),
    sb.from('plugin_products').select('id, name'),
    sb.from('plugin_machines').select('id, name, created_at, last_seen_at').eq('user_id', session.user.id).is('revoked_at', null),
    pluginApi('billing'),
  ])
  const rows = (r) => { if (r.status === 'rejected' || r.value.error) throw new Error('load'); return r.value.data ?? [] }
  try {
    state.sources = rows(sources)
    state.machines = rows(machines).sort((a, b) => (b.last_seen_at ?? b.created_at).localeCompare(a.last_seen_at ?? a.created_at))
    state.names = Object.fromEntries((products.status === 'fulfilled' ? products.value.data ?? [] : []).map((p) => [p.id, p.name]))
  } catch {
    root.replaceChildren(h('p', { class: 'msg err' }, 'Couldn’t load your account. Try again in a moment.'))
    return false
  }
  if (billing.status === 'fulfilled' && billing.value.status === 200) {
    state.billing = { subscriptions: listOf(billing.value.data.subscriptions), transactions: listOf(billing.value.data.transactions) }
  } else {
    state.billingFailed = true
  }
  return true
}

const listOf = (v) => (Array.isArray(v) ? v : [])
const nameOf = (id) => state.names[id] ?? id
const productIds = () => [...new Set(state.sources.map((s) => s.product_id))]

function render() {
  root.replaceChildren(pluginsSection(), computersSection(), subscriptionSection(), purchasesSection(), profileSection())
}

function section(id, title, right, ...body) {
  return h('section', { class: 'sect', id, 'aria-labelledby': `${id}-h` },
    h('div', { class: 'sect-head' }, h('h2', { id: `${id}-h`, tabindex: '-1' }, title), right),
    ...body)
}

// ── Plugins ──────────────────────────────────────────────────────────────────────────────────────

function describeSource(s) {
  const until = dateOf(s.ends_at)
  if (s.source === 'group') return `Through ${s.group_name ?? 'a group'}${until ? `, until ${until}` : ''}`
  if (s.source === 'grant') return until ? `Given to you until ${until}` : 'Given to you'
  if (s.source === 'subscription') return 'Through your subscription'
  if (s.source === 'trial') return until ? `Trial, until ${until}` : 'Trial'
  return until ? `Active until ${until}` : 'Active'
}

function pluginsSection() {
  const ids = productIds()
  return section('plugins', 'Your plugins', null,
    ids.length === 0
      ? h('p', { class: 'empty' }, 'Your account doesn’t include the plugins. They aren’t on sale yet: for now they come with groups that have them switched on, or by invitation. Ask whoever runs your group if you should have them.')
      : h('ul', { class: 'rows' }, ids.map((id) => h('li', { class: 'row', 'data-product': id },
        h('div', { class: 'row-main' }, h('h3', {}, nameOf(id)),
          state.sources.filter((s) => s.product_id === id).map((s) => h('p', { class: 'muted small' }, describeSource(s)))),
        h('a', { class: 'pill ghost small', href: `/downloads/#${encodeURIComponent(id)}` }, 'Download')))))
}

// ── Computers ────────────────────────────────────────────────────────────────────────────────────

function computersSection() {
  const m = state.machines
  const ids = productIds()
  return section('computers', 'Computers', h('span', { class: 'muted small', 'data-count': true }, `${m.length} of ${MACHINE_LIMIT} in use`),
    m.length === 0
      ? h('p', { class: 'empty' }, 'No computers yet. Open a Make Things plugin in your DAW and choose ', h('strong', {}, 'Sign in to Make Things'), `. You can sign in on up to ${MACHINE_LIMIT} computers.`)
      : [h('ul', { class: 'rows' }, m.map((c) => computerRow(c, ids))),
         h('p', { class: 'sect-note muted small' }, 'A signed-in computer is activated for all your plugins. Deactivating one signs its plugins out at their next licence check, and frees its place for another computer.')])
}

function computerRow(c, ids) {
  const seen = c.last_seen_at ? `Last seen ${dateOf(c.last_seen_at)}` : `Signed in ${dateOf(c.created_at)}`
  const row = h('li', { class: 'row', 'data-machine': c.id })
  const actions = h('div', { class: 'row-actions' }, h('button', { class: 'pill ghost small', type: 'button', onclick: () => askDeactivate(c, row) }, 'Deactivate'))
  row.append(
    h('div', { class: 'row-main' }, h('h3', {}, c.name), h('p', { class: 'muted small' }, seen),
      h('ul', { class: 'tags', 'aria-label': 'Activated plugins' },
        ids.length ? ids.map((id) => h('li', { class: 'tag ok' }, nameOf(id))) : h('li', { class: 'tag off' }, 'No plugins active'))),
    actions)
  return row
}

function askDeactivate(c, row) {
  row.querySelector('.confirm')?.remove()
  const msg = h('p', { class: 'msg err small', role: 'alert', hidden: true, style: 'flex-basis:100%' })
  const yes = h('button', { class: 'pill danger small', type: 'button', onclick: async () => {
    yes.disabled = true; no.disabled = true; msg.hidden = true
    let ok = false
    try { ok = (await pluginApi('machines/revoke', { method: 'POST', body: { machineId: c.id } })).status === 200 } catch { /* the message below */ }
    if (ok) {
      state.machines = state.machines.filter((x) => x.id !== c.id)
      const next = computersSection()
      document.getElementById('computers').replaceWith(next)
      next.querySelector('h2').focus({ preventScroll: true })
      return
    }
    msg.textContent = 'Couldn’t deactivate it. Try again in a moment.'
    msg.hidden = false; yes.disabled = false; no.disabled = false
  } }, 'Deactivate')
  const no = h('button', { class: 'pill ghost small', type: 'button', onclick: () => box.remove() }, 'Keep it')
  const box = h('div', { class: 'confirm' }, h('p', { class: 'small' }, 'Sign out the plugins on ', h('strong', {}, c.name), '? They stop working there at their next licence check.'), yes, no, msg)
  row.append(box)
  no.focus()
}

// ── Subscription ─────────────────────────────────────────────────────────────────────────────────

function money(amount, currency) {
  const n = Number(amount)
  if (!Number.isFinite(n) || typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) return ''
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n) } catch { return '' }
}

const STATUS = {
  active: ['Active', 'ok'], trialing: ['Trial', 'ok'], past_due: ['Payment overdue', 'warn'], paused: ['Paused', 'warn'], canceled: ['Cancelled', 'off'],
}

function subscriptionSection() {
  const subs = state.billing?.subscriptions ?? []
  return section('subscription', 'Subscription', null,
    state.billingFailed ? h('p', { class: 'msg err' }, 'Couldn’t load your subscription. Try again in a moment.')
    : subs.length ? h('ul', { class: 'rows' }, subs.map(subscriptionRow))
    : h('p', { class: 'empty' }, state.sources.length
      ? 'You don’t have a subscription. Your plugins come through the access above, so there’s nothing to renew or cancel.'
      : 'You don’t have a subscription. Subscriptions aren’t on sale yet.'))
}

function subscriptionRow(s) {
  const [label, tone] = STATUS[s.status] ?? [String(s.status ?? ''), 'off']
  const price = money(s.price?.amount, s.price?.currency)
  const every = s.price?.interval === 'year' ? 'a year' : s.price?.interval === 'month' ? 'a month' : ''
  const when = s.endsAt ? `Ends ${dateOf(s.endsAt)}` : s.renewsAt ? `Renews ${dateOf(s.renewsAt)}` : ''
  const links = s.links ?? {}
  const act = (url, text, ghost = true) => httpsOnly(url) && h('a', { class: ghost ? 'pill ghost small' : 'pill small', href: url, rel: 'noopener' }, text)
  return h('li', { class: 'row', 'data-subscription': s.id ?? '' },
    h('div', { class: 'row-main' },
      h('div', { class: 'product-head' }, h('h3', {}, s.name ?? 'Subscription'), label && h('span', { class: `tag ${tone}` }, label)),
      h('p', { class: 'muted small' }, [[price, every].filter(Boolean).join(' '), when].filter(Boolean).join(' · '))),
    h('div', { class: 'row-actions' },
      act(links.renew, 'Renew', false),
      act(links.updatePayment, 'Update payment method', s.status !== 'past_due'),
      act(links.cancel, 'Cancel subscription')))
}

// ── Purchases ────────────────────────────────────────────────────────────────────────────────────

function purchasesSection() {
  const list = state.billing?.transactions ?? []
  return section('purchases', 'Purchases', null,
    state.billingFailed ? h('p', { class: 'msg err' }, 'Couldn’t load your purchases. Try again in a moment.')
    : list.length === 0 ? h('p', { class: 'empty' }, 'No purchases yet. Your receipts will be here when there are some.')
    : h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Date', 'Item', 'Amount', 'Receipt'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, list.map((t) => h('tr', { 'data-transaction': t.id ?? '' },
        h('td', { class: 'muted' }, dateOf(t.date)),
        h('td', {}, t.description ?? 'Purchase', t.status === 'refunded' && h('span', { class: 'tag off', style: 'margin-left:8px' }, 'Refunded')),
        h('td', {}, money(t.amount, t.currency)),
        h('td', {}, httpsOnly(t.receiptUrl) ? h('a', { href: t.receiptUrl, rel: 'noopener' }, 'Receipt') : '—'))))))
}

function profileSection() {
  return h('section', { class: 'sect' }, h('p', { class: 'msg muted small' },
    'Your name, password and account settings are on ', h('a', { href: `${APP_URL}/profile` }, 'StemShare'), '.'))
}

// Last: load and render read the constants above, which a top-level await before their lines would leave unset.
if (await load()) render()
if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
