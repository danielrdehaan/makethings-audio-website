// /login: email and password on the same accounts as StemShare. There is no sign-up (invitations only). A password
// reset opens on StemShare's /reset-password, the one page that finishes it.
import { APP_URL } from './config.js'
import { h, safeNext, sb } from './account.js'

const next = safeNext(new URLSearchParams(location.search).get('next'))
const root = document.getElementById('app')
const { data: existing } = await sb.auth.getSession()
if (existing.session) location.replace(next)
else signInForm('')

function field(label, attrs) {
  return h('label', {}, label, h('input', attrs))
}

function signInForm(email) {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'submit' }, 'Sign in')
  const emailField = field('Email', { name: 'email', type: 'email', autocomplete: 'username', required: true, value: email, autofocus: true })
  const passwordField = field('Password', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault()
      msg.hidden = true; go.disabled = true
      const f = new FormData(form)
      try {
        const { error } = await sb.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) })
        if (!error) { location.replace(next); return }
        msg.textContent = error.status === 400 ? 'That email and password don’t match.' : 'Couldn’t sign in. Try again in a moment.'
      } catch {
        msg.textContent = 'Couldn’t reach the sign-in service. Try again in a moment.'
      }
      msg.hidden = false; go.disabled = false
    },
  }, emailField, passwordField, msg, h('div', { class: 'form-foot' }, go,
    h('button', { class: 'link', type: 'button', onclick: () => resetForm(form.elements.email.value) }, 'Forgot password?')))
  root.replaceChildren(
    h('h1', {}, 'Sign in'),
    h('p', { class: 'lede' }, 'Download your plugins and manage your computers.'),
    form,
    h('p', { class: 'fine' }, 'Use the same email and password as StemShare. Accounts are by invitation for now.'),
  )
}

function resetForm(email) {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'submit' }, 'Email me a reset link')
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault()
      msg.hidden = true; go.disabled = true
      const address = String(new FormData(form).get('email')).trim()
      try {
        const { error } = await sb.auth.resetPasswordForEmail(address, { redirectTo: `${APP_URL}/reset-password` })
        if (!error) { resetSent(address); return }
      } catch { /* the message below */ }
      msg.textContent = 'Couldn’t send the email. Try again in a moment.'
      msg.hidden = false; go.disabled = false
    },
  }, field('Email', { name: 'email', type: 'email', autocomplete: 'username', required: true, value: email, autofocus: true }), msg,
  h('div', { class: 'form-foot' }, go, h('button', { class: 'link', type: 'button', onclick: () => signInForm(form.elements.email.value) }, 'Back to sign in')))
  root.replaceChildren(h('h1', {}, 'Reset password'), form)
}

function resetSent(address) {
  root.replaceChildren(
    h('h1', {}, 'Check your email'),
    h('p', { class: 'lede' }, 'If there’s an account for ', h('strong', {}, address), ', a reset link is on its way. Check your spam folder too.'),
    h('p', { class: 'fine' }, 'The link opens on StemShare. Once you’ve set a new password, come back here and sign in.'),
    h('p', { class: 'fine' }, h('button', { class: 'link', type: 'button', onclick: () => signInForm(address) }, 'Back to sign in')),
  )
}
