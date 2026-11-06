// The "hear when they're on sale" form on /plugins, for POST /api/plugin/launch-list. The page shows the email address until this runs,
// and keeps showing it without a Turnstile site key in config.js. It doesn't import account.js: this page doesn't load Supabase.
import { PLUGIN_API, TURNSTILE_SITE_KEY } from './config.js'
import { loadTurnstile } from './turnstile.js'

const form = document.getElementById('notifyForm')
const fallback = document.getElementById('notifyMail')
// The EQ page is this same document, and shows none of this.
if (form && TURNSTILE_SITE_KEY && document.documentElement.classList.contains('list')) {
  const go = form.querySelector('button')
  const msg = form.querySelector('.notify-msg')
  const check = document.getElementById('notifyCheck')
  let token = ''
  let widget = null
  const say = (text) => { msg.textContent = text; msg.hidden = false }
  form.hidden = false
  fallback.hidden = true
  loadTurnstile().then((turnstile) => {
    widget = turnstile.render(check, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'dark',
      callback: (t) => { token = t; go.disabled = false },
      'expired-callback': () => { token = ''; go.disabled = true },
      'error-callback': () => { token = ''; go.disabled = true; fallback.hidden = false },
    })
  }).catch(() => { fallback.hidden = false })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!token) return
    msg.hidden = true; go.disabled = true
    const email = String(new FormData(form).get('email')).trim()
    try {
      const r = await fetch(`${PLUGIN_API}/launch-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken: token }),
      })
      if (r.ok) {
        const done = document.createElement('p')
        done.className = 'notify-done'
        done.textContent = 'You’re on the list. We’ll email you when they’re on sale.'
        form.replaceWith(done)
        return
      }
      const { error } = await r.json().catch(() => ({}))
      say(error === 'invalid_request' ? 'That doesn’t look like an email address.'
        : error === 'rate_limited' ? 'That’s a lot of tries. Wait a minute and try again.'
        : error === 'bot_check_failed' ? 'The check didn’t pass. Try it again.'
        : 'Couldn’t add you. Try again in a moment.')
    } catch {
      say('Couldn’t add you. Try again in a moment.')
    }
    // A Turnstile token works once, so another try needs a new one.
    token = ''
    if (widget !== null) window.turnstile?.reset(widget)
  })
}
