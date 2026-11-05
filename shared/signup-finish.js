// /signup/finish/?token_hash=…&type=invite: where the sign-up email lands. Opening the page spends nothing: mail scanners load
// links, so the one-shot token is used only when the person presses the button. Then the account gets its name and password,
// and agrees to the terms (the same writes as StemShare's /accept-invite).
import { APP_URL, TERMS_VERSION } from './config.js'
import { h, sb } from './account.js'

const root = document.getElementById('app')
const params = new URLSearchParams(location.search)
const tokenHash = params.get('token_hash')?.trim() ?? ''
const type = params.get('type')?.trim() ?? ''
const plan = /^[a-z0-9-]{1,30}$/.test(params.get('plan') ?? '') ? params.get('plan') : null

if (!tokenHash || type !== 'invite') problem('That link isn’t complete. Open it from the email again, or start over.')
else form()

function problem(text) {
  root.replaceChildren(
    h('h1', {}, 'That link didn’t work'),
    h('p', { class: 'lede' }, text),
    h('p', { class: 'fine' }, h('a', { class: 'pill', href: '/signup/', style: 'text-decoration:none' }, 'Send a new link')),
    h('p', { class: 'fine' }, 'Already finished? ', h('a', { href: '/login/' }, 'Sign in'), '.'),
  )
}

function form() {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'submit' }, 'Finish signing up')
  let verified = false
  const say = (text) => { msg.textContent = text; msg.hidden = false; go.disabled = false }
  const el = h('form', {
    onsubmit: async (e) => {
      e.preventDefault()
      msg.hidden = true; go.disabled = true
      const f = new FormData(el)
      const name = String(f.get('name')).trim()
      const password = String(f.get('password'))
      if (password.length < 8) { say('Use at least 8 characters.'); return }
      try {
        // Once the token is spent it can't be used again, so a retry after a later failure goes straight to the password.
        if (!verified) {
          const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type })
          if (error) {
            problem(error.code === 'otp_expired' || /expired/i.test(error.message ?? '') ? 'That link has expired or was already used.' : 'That link isn’t valid any more.')
            return
          }
          verified = true
          history.replaceState(null, '', location.pathname)
        }
        const { error: passwordError } = await sb.auth.updateUser({ password, data: { display_name: name, needs_setup: false } })
        if (passwordError) { say(passwordError.code === 'weak_password' ? 'Choose a harder password to guess.' : 'Couldn’t save your password. Try again.'); return }
        const { data } = await sb.auth.getUser()
        const { error: profileError } = await sb.from('profiles')
          .update({ display_name: name, terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })
          .eq('id', data.user.id)
        if (profileError) { say('Couldn’t save your details. Try again.'); return }
        location.replace(plan ? `/buy/?plan=${plan}` : '/downloads/')
      } catch {
        say('Couldn’t reach the sign-in service. Try again in a moment.')
      }
    },
  },
  h('label', {}, 'Your name', h('input', { name: 'name', autocomplete: 'name', required: true, maxlength: '80', autofocus: true })),
  h('label', {}, 'Choose a password', h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: '8' })),
  h('label', { class: 'check' }, h('input', { name: 'terms', type: 'checkbox', required: true }),
    h('span', {}, 'I agree to the ', h('a', { href: `${APP_URL}/terms`, target: '_blank', rel: 'noopener' }, 'Terms'), ' and ', h('a', { href: `${APP_URL}/privacy`, target: '_blank', rel: 'noopener' }, 'Privacy Policy'), '.')),
  msg, go)
  root.replaceChildren(h('h1', {}, 'Almost there'), h('p', { class: 'lede' }, 'Add your name and choose a password.'), el)
}
