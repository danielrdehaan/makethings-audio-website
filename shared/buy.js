// /buy: the plans, priced by Paddle for the visitor's country (tax and currency included), and Paddle's checkout. Closed until sales
// are open and shared/config.js has a client-side token. Buying needs an account, because the checkout carries its id: the webhook
// (POST /api/plugin/webhook) reads it to know who bought what. /signup and /login come back here with ?plan=.
import { PADDLE_ENV, PADDLE_JS, PADDLE_TOKEN, PLANS, PLUGIN_API } from './config.js'
import { h, pluginApi, sb, toLogin, twoFactorStep } from './account.js'

const root = document.getElementById('app')
const plans = PLANS.filter((p) => p.priceId)
const chosen = new URLSearchParams(location.search).get('plan')

if (!(await salesOpen()) || !PADDLE_TOKEN || plans.length === 0) closed()
else await open()

async function salesOpen() {
  try {
    const r = await fetch(`${PLUGIN_API}/sales-status`)
    return r.ok && (await r.json()).open === true
  } catch {
    return false
  }
}

function closed() {
  document.querySelector('h1').textContent = 'Coming soon'
  root.replaceChildren(
    h('p', { class: 'lede' }, 'The plugins aren’t on sale yet.'),
    h('p', { class: 'fine' }, h('a', { class: 'pill', href: '/plugins/', style: 'text-decoration:none' }, 'See what’s coming')),
  )
}

function loadPaddle() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PADDLE_JS
    s.onload = () => resolve(window.Paddle)
    s.onerror = reject
    document.head.append(s)
  })
}

// Whether tax sits on top of the price depends on the buyer's country: Paddle adds it in the US and Canada, and it's already inside
// the price in the UK, the EU and Japan. It's on top when the subtotal is still the listed price. "Including tax" is the fallback
// because the total always does include it.
function priceLine(line, every) {
  const total = line.formattedTotals?.total ?? ''
  if (!(Number(line.totals?.tax) > 0)) return [`${total}${every}`]
  const listed = line.price?.unitPrice
  const onTop = listed && line.totals.subtotal === listed.amount && line.formattedTotals?.subtotal
  return onTop
    ? [`${line.formattedTotals.subtotal}${every} `, h('span', { class: 'plan-tax' }, 'plus tax')]
    : [`${total}${every} `, h('span', { class: 'plan-tax' }, 'including tax')]
}

async function open() {
  let paddle
  try {
    paddle = await loadPaddle()
    // Sandbox only: Paddle's default is production, and this must come before anything else it's asked.
    if (PADDLE_ENV !== 'live') paddle.Environment.set('sandbox')
    paddle.Initialize({ token: PADDLE_TOKEN })
  } catch {
    root.replaceChildren(h('p', { class: 'msg err' }, 'Checkout couldn’t load. Turn off anything blocking it, then refresh the page.'))
    return
  }
  const { data } = await sb.auth.getSession()
  const session = data.session
  // Someone signed in who still owes a code: past sign-in first, so they come back here finished.
  if (session && await twoFactorStep()) { toLogin(); return }
  // Someone signed in: who's buying, and whether they already subscribe.
  let customerId = null, subscribed = false
  if (session) {
    try {
      const { status, data: billing } = await pluginApi('billing')
      if (status === 200) {
        customerId = billing.customerId ?? null
        subscribed = (billing.subscriptions ?? []).some((s) => ['active', 'trialing', 'past_due', 'paused'].includes(s.status))
      }
    } catch { /* they can still buy: the webhook goes by the account id */ }
  }
  const buy = (plan) => {
    if (!session) { location.assign(`/signup/?plan=${encodeURIComponent(plan.id)}`); return }
    paddle.Checkout.open({
      items: [{ priceId: plan.priceId, quantity: 1 }],
      // One or the other, by Paddle's rule. The same customer keeps one portal and one payment history.
      customer: customerId ? { id: customerId } : { email: session.user.email },
      customData: { user_id: session.user.id },
      settings: { displayMode: 'overlay', theme: 'dark', allowLogout: false, successUrl: `${location.origin}/account/?purchased=1&since=${Date.now()}` },
    })
  }
  const priceEls = new Map()
  const card = (plan) => {
    const price = h('p', { class: 'plan-price', 'aria-live': 'polite' }, '…')
    priceEls.set(plan.priceId, price)
    const already = plan.kind === 'subscription' && subscribed
    return h('li', { class: 'plan', 'data-plan': plan.id },
      h('h3', {}, plan.name),
      price,
      plan.note && h('p', { class: 'muted small' }, plan.note),
      already
        ? h('a', { class: 'pill ghost', href: '/account/#subscription' }, 'You’re subscribed')
        : h('button', { class: 'pill', type: 'button', onclick: () => buy(plan) }, plan.kind === 'subscription' ? 'Subscribe' : 'Buy'))
  }
  const of = (kind) => plans.filter((p) => p.kind === kind)
  root.replaceChildren(
    ...(of('subscription').length > 0 ? [h('section', { class: 'sect' }, h('h2', {}, 'Every plugin'), h('ul', { class: 'plans' }, of('subscription').map(card)))] : []),
    ...(of('purchase').length > 0 ? [h('section', { class: 'sect' }, h('h2', {}, 'One plugin, to keep'), h('ul', { class: 'plans' }, of('purchase').map(card)))] : []),
    h('section', { class: 'sect' }, h('p', { class: 'msg muted small' }, 'Try first: a 14-day trial comes with a new account, with no card needed. Payments are handled by Paddle, our merchant of record, which takes care of tax and receipts.',
      !session && [' Already have an account? ', h('a', { href: `/login/?next=${encodeURIComponent(`/buy/${location.search}`)}` }, 'Sign in'), '.'])),
  )
  // Paddle's own figures for this visitor. A price that doesn't come back says so rather than showing a wrong one.
  try {
    const preview = await paddle.PricePreview({ items: plans.map((p) => ({ priceId: p.priceId, quantity: 1 })) })
    for (const line of preview?.data?.details?.lineItems ?? []) {
      const el = priceEls.get(line.price?.id)
      if (!el) continue
      const cycle = line.price?.billingCycle
      const every = cycle?.frequency === 1 && cycle.interval === 'month' ? ' a month' : cycle?.frequency === 1 && cycle.interval === 'year' ? ' a year' : ''
      el.replaceChildren(...priceLine(line, every))
    }
  } catch { /* the check below */ }
  for (const el of priceEls.values()) if (el.textContent === '…') el.textContent = 'Price shown at checkout'
  // Back from signing up or signing in with a plan already chosen.
  const plan = chosen && session ? plans.find((p) => p.id === chosen) : null
  if (plan && !(plan.kind === 'subscription' && subscribed)) buy(plan)
}
