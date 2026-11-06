// /signup: an email address and Cloudflare Turnstile's check, for POST /api/plugin/signup, which emails a link to /signup/finish/.
// The password is set there, so nothing here can make an account someone can sign in to without proving the address. Closed
// until sales open, and without a Turnstile site key in config.js.
import { PLUGIN_API, TURNSTILE_SITE_KEY } from './config.js'
import { h, sb } from './account.js'
import { loadTurnstile } from './turnstile.js'

const root = document.getElementById('app')
// A plan chosen on /buy before there was an account: the email's link comes back to it.
const plan = new URLSearchParams(location.search).get('plan')
const { data: existing } = await sb.auth.getSession()
if (existing.session) location.replace(plan ? `/buy/?plan=${encodeURIComponent(plan)}` : '/account/')
else if (await salesOpen()) form()
else closed()

async function salesOpen() {
  if (!TURNSTILE_SITE_KEY) return false
  try {
    const r = await fetch(`${PLUGIN_API}/sales-status`)
    return r.ok && (await r.json()).open === true
  } catch {
    return false
  }
}

function closed() {
  root.replaceChildren(
    h('h1', {}, 'Accounts are by invitation for now'),
    h('p', { class: 'lede' }, 'The plugins aren’t on sale yet. Have a look at what’s coming.'),
    h('p', { class: 'fine' }, h('a', { class: 'pill', href: '/plugins/', style: 'text-decoration:none' }, 'See the plugins')),
    h('p', { class: 'fine' }, 'Already have an account? ', h('a', { href: '/login/' }, 'Sign in'), '.'),
  )
}

function form() {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'submit', disabled: true }, 'Create account')
  const check = h('div', { class: 'bot-check' })
  let token = ''
  let widget = null
  const say = (text) => { msg.textContent = text; msg.hidden = false }
  const el = h('form', {
    onsubmit: async (e) => {
      e.preventDefault()
      if (!token) return
      msg.hidden = true; go.disabled = true
      const email = String(new FormData(el).get('email')).trim()
      try {
        const r = await fetch(`${PLUGIN_API}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, turnstileToken: token, ...(plan ? { plan } : {}) }),
        })
        if (r.ok) { sent(email); return }
        const { error } = await r.json().catch(() => ({}))
        if (error === 'closed') { closed(); return }
        say(error === 'invalid_request' ? 'That doesn’t look like an email address.'
          : error === 'rate_limited' ? 'That’s a lot of tries. Wait a minute and try again.'
          : error === 'bot_check_failed' ? 'The check didn’t pass. Try it again.'
          : 'Couldn’t create the account. Try again in a moment.')
      } catch {
        say('Couldn’t reach the sign-up service. Try again in a moment.')
      }
      // A Turnstile token works once, so another try needs a new one.
      token = ''
      if (widget !== null) window.turnstile?.reset(widget)
    },
  }, h('label', {}, 'Email', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, autofocus: true })), check, msg, go)
  root.replaceChildren(
    h('h1', {}, 'Create account'),
    h('p', { class: 'lede' }, 'We’ll email you a link to choose a password. Your 14-day trial starts the first time you sign in from a plugin, with no card needed.'),
    el,
    h('p', { class: 'fine' }, 'Already have an account? ', h('a', { href: plan ? `/login/?next=${encodeURIComponent(`/buy/?plan=${plan}`)}` : '/login/' }, 'Sign in'), '.'),
  )
  loadTurnstile().then((turnstile) => {
    widget = turnstile.render(check, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'dark',
      callback: (t) => { token = t; go.disabled = false },
      'expired-callback': () => { token = ''; go.disabled = true },
      'error-callback': () => { token = ''; go.disabled = true; say('The check couldn’t load. Refresh the page and try again.') },
    })
  }).catch(() => say('The check couldn’t load. Turn off anything blocking it, then refresh the page.'))
}

function sent(email) {
  root.replaceChildren(
    h('h1', {}, 'Check your email'),
    h('p', { class: 'lede' }, 'We sent a link to ', h('strong', {}, email), '. It works for 24 hours. Check your spam folder too.'),
    h('p', { class: 'fine' }, 'Nothing there? ', h('button', { class: 'link', type: 'button', onclick: () => form() }, 'Try again'), '.'),
  )
}
