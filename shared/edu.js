// /edu: the education request form, for POST /api/plugin/edu-request. The answer is the same for every address, because the page is
// public and a different one would reveal who is in a class. Someone signed in is told right away if a group already gives them plugins,
// which reveals nothing, since it's their own account. Without a Turnstile site key in config.js it offers the email address instead.
import { PLUGIN_API, TURNSTILE_SITE_KEY } from './config.js'
import { h, sb } from './account.js'
import { loadTurnstile } from './turnstile.js'

const root = document.getElementById('app')
const heading = root.querySelector('h2')

showAlready()
if (TURNSTILE_SITE_KEY) form()
else emailInstead()

async function showAlready() {
  const { data } = await sb.auth.getSession()
  if (!data.session) return
  const { data: rows, error } = await sb.rpc('my_plugin_entitlements')
  if (error) return // only a courtesy: the form below still works
  const groups = [...new Set((rows ?? []).filter((s) => s.source === 'group').map((s) => s.group_name ?? 'a group'))]
  if (!groups.length) return
  document.getElementById('already').replaceChildren(
    h('div', { class: 'edu-already' },
      h('h2', {}, 'You already have plugins'),
      h('p', {}, `They come through ${groups.join(', ')}, for as long as you’re a member, so you don’t need a discount.`),
      h('a', { class: 'pill', href: '/account/', style: 'text-decoration:none' }, 'Download and manage them')),
  )
}

function emailInstead() {
  root.replaceChildren(heading, h('p', {}, 'Email ', h('a', { href: 'mailto:support@makethings.audio' }, 'support@makethings.audio'), ' with your name and your school. Use your school email if you have one.'))
}

function choice(value, label, checked) {
  return h('label', { class: 'check' }, h('input', { type: 'radio', name: 'kind', value, required: true, checked }), h('span', {}, label))
}

function form() {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'submit', disabled: true }, 'Send request')
  const check = h('div', { class: 'bot-check' })
  let token = ''
  let widget = null
  const say = (text) => { msg.textContent = text; msg.hidden = false }
  const el = h('form', {
    onsubmit: async (e) => {
      e.preventDefault()
      if (!token) return
      msg.hidden = true; go.disabled = true
      const f = new FormData(el)
      const email = String(f.get('email')).trim()
      try {
        const r = await fetch(`${PLUGIN_API}/edu-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: f.get('firstName'), lastName: f.get('lastName'), email, school: f.get('school'), kind: f.get('kind'), details: f.get('details'), turnstileToken: token }),
        })
        if (r.ok) { sent(email); return }
        const { error } = await r.json().catch(() => ({}))
        say(error === 'invalid_request' ? 'Check your name, email and school, then try again.'
          : error === 'rate_limited' ? 'That’s a lot of tries. Wait a minute and try again.'
          : error === 'bot_check_failed' ? 'The check didn’t pass. Try it again.'
          : 'Couldn’t send your request. Try again in a moment, or email support@makethings.audio.')
      } catch {
        say('Couldn’t send your request. Try again in a moment, or email support@makethings.audio.')
      }
      // A Turnstile token works once, so another try needs a new one.
      token = ''
      if (widget !== null) window.turnstile?.reset(widget)
    },
  },
    h('div', { class: 'edu-names' },
      h('label', {}, 'First name', h('input', { name: 'firstName', autocomplete: 'given-name', maxlength: 80, required: true })),
      h('label', {}, 'Last name', h('input', { name: 'lastName', autocomplete: 'family-name', maxlength: 80, required: true }))),
    h('label', {}, 'Email', h('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: 254, required: true }), h('span', { class: 'muted small' }, 'Use your school email if you have one.')),
    h('label', {}, 'School', h('input', { name: 'school', autocomplete: 'organization', maxlength: 160, required: true })),
    h('fieldset', { class: 'edu-kind' }, h('legend', {}, 'What are you asking for?'), choice('discount', '50% off for me', true), choice('class', 'Access for a class', false)),
    h('label', {}, 'Anything else? (optional)', h('textarea', { name: 'details', rows: 3, maxlength: 2000 })),
    check, msg, go)
  root.replaceChildren(heading, el)
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
  heading.textContent = 'Thanks. Check your email.'
  root.replaceChildren(heading, h('p', {}, 'We’ll answer at ', h('strong', {}, email), ', usually within a few days. Check your spam folder too.'))
  root.scrollIntoView({ block: 'nearest' })
}
