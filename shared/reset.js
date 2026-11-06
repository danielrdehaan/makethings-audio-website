// /reset/?token_hash=…&type=recovery: where a password-reset email ends up, because StemShare's /reset-password forwards here. Opening
// the page spends nothing: mail scanners load links, so the one-shot token is used only when the person presses the button.
// Someone whose invitation link a scanner already used arrives here too, still needing a name and the terms, so they get those as well.
import { APP_URL, TERMS_VERSION } from './config.js'
import { h, sb } from './account.js'

const root = document.getElementById('app')
const params = new URLSearchParams(location.search)
const tokenHash = params.get('token_hash')?.trim() ?? ''
const MIN_PASSWORD = 8

if (!tokenHash || params.get('type') !== 'recovery') problem('That link isn’t complete. Open it from the email again, or ask for a new one.')
else confirmStep()

function problem(text) {
  root.replaceChildren(
    h('h1', {}, 'That link didn’t work'),
    h('p', { class: 'lede' }, text),
    h('p', { class: 'fine' }, h('a', { class: 'pill', href: '/login/', style: 'text-decoration:none' }, 'Ask for a new link')),
  )
}

function confirmStep() {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'button', onclick: async () => {
    go.disabled = true; msg.hidden = true
    try {
      // The link names the account; a session already on this browser isn't necessarily it.
      await sb.auth.signOut({ scope: 'local' }).catch(() => {})
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      if (error) {
        problem(error.code === 'otp_expired' || /expired/i.test(error.message ?? '') ? 'That link has expired or was already used.' : 'That link isn’t valid any more.')
        return
      }
      history.replaceState(null, '', location.pathname)
      const { data } = await sb.auth.getUser()
      passwordStep(data.user)
    } catch {
      msg.textContent = 'Couldn’t reach the sign-in service. Try again in a moment.'
      msg.hidden = false; go.disabled = false
    }
  } }, 'Continue')
  root.replaceChildren(
    h('h1', {}, 'Set a new password'),
    h('p', { class: 'lede' }, 'Continue to choose a new password. This link works once.'),
    h('p', { class: 'fine' }, go), msg,
  )
}

function passwordStep(user) {
  const setup = user?.user_metadata?.needs_setup === true
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'submit' }, 'Save password')
  const say = (text) => { msg.textContent = text; msg.hidden = false; go.disabled = false }
  const el = h('form', {
    onsubmit: async (e) => {
      e.preventDefault()
      msg.hidden = true; go.disabled = true
      const f = new FormData(el)
      const password = String(f.get('password'))
      if (password.length < MIN_PASSWORD) { say(`Use at least ${MIN_PASSWORD} characters.`); return }
      if (password !== String(f.get('confirm'))) { say('The passwords don’t match.'); return }
      const name = setup ? String(f.get('name')).trim() : ''
      try {
        const { error } = await sb.auth.updateUser(setup ? { password, data: { display_name: name, needs_setup: false } } : { password })
        if (error) { say(error.code === 'same_password' ? 'Choose a different password from the one you had.' : error.code === 'weak_password' ? 'Choose a harder password to guess.' : 'Couldn’t save your password. Try again.'); return }
        if (setup) {
          const { error: profileError } = await sb.from('profiles')
            .update({ display_name: name, terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })
            .eq('id', user.id)
          if (profileError) { say('Couldn’t save your details. Try again.'); return }
        }
        await finished()
      } catch {
        say('Couldn’t reach the sign-in service. Try again in a moment.')
      }
    },
  },
  setup && h('label', {}, 'Your name', h('input', { name: 'name', autocomplete: 'name', required: true, maxlength: '80', value: user?.user_metadata?.display_name ?? '' })),
  h('label', {}, 'New password', h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: String(MIN_PASSWORD) })),
  h('label', {}, 'Confirm password', h('input', { name: 'confirm', type: 'password', autocomplete: 'new-password', required: true })),
  setup && h('label', { class: 'check' }, h('input', { name: 'terms', type: 'checkbox', required: true }),
    h('span', {}, 'I agree to the ', h('a', { href: `${APP_URL}/terms`, target: '_blank', rel: 'noopener' }, 'Terms'), ' and ', h('a', { href: `${APP_URL}/privacy`, target: '_blank', rel: 'noopener' }, 'Privacy Policy'), '.')),
  msg, go)
  root.replaceChildren(h('h1', {}, setup ? 'Almost there' : 'Set a new password'), ...(setup ? [h('p', { class: 'lede' }, 'Add your name and choose a password.')] : []), el)
  el.querySelector('input')?.focus()
}

async function finished() {
  const { data } = await sb.rpc('my_stemshare_access').then((r) => r, () => ({ data: null }))
  root.replaceChildren(
    h('h1', {}, 'Password saved'),
    h('p', { class: 'lede' }, 'You’re signed in here. Use the new password everywhere you sign in.'),
    h('p', { class: 'fine' }, h('a', { class: 'pill', href: '/account/', style: 'text-decoration:none' }, 'Go to your account')),
    ...(data?.access === true ? [h('p', { class: 'fine' }, h('a', { href: APP_URL }, 'Open StemShare'))] : []),
  )
}
