// /login: email and password on the same accounts as StemShare. A password-reset email opens on StemShare's /reset-password, the
// address Supabase's email template has, which forwards to /reset/ here.
import { APP_URL, PLUGIN_API, TURNSTILE_SITE_KEY } from './config.js'
import { h, safeNext, sb, twoFactorStep } from './account.js'
import { codeField, enrollmentGuide, startEnrollment, verifiedFactors, verifyCode } from './mfa.js'

const next = safeNext(new URLSearchParams(location.search).get('next'))
const root = document.getElementById('app')
const { data: existing } = await sb.auth.getSession()
if (existing.session) await signedIn()
else signInForm('')

// Past the password: on to where they were going, once they've given whatever second step is owed.
async function signedIn() {
  const step = await twoFactorStep()
  if (step === 'code') await codeStep()
  else if (step === 'enroll') await enrollStep()
  else location.replace(next)
}

// A function, not a const: the top-level await above runs before a const on a later line exists.
function otherAccount() {
  return h('p', { class: 'fine' }, h('button', { class: 'link', type: 'button', onclick: async () => {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {})
    signInForm('')
  } }, 'Use a different account'))
}

function secondStepForm(factorId, label) {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'submit' }, label)
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault()
      msg.hidden = true; go.disabled = true
      try {
        await verifyCode(factorId, String(new FormData(form).get('code')))
        location.replace(next)
      } catch {
        msg.textContent = 'That code didn’t match. Check your authenticator app and try again.'
        msg.hidden = false; go.disabled = false
      }
    },
  }, codeField(), msg, go)
  return form
}

async function codeStep() {
  try {
    const [factor] = await verifiedFactors()
    const form = secondStepForm(factor.id, 'Verify')
    root.replaceChildren(h('h1', {}, 'Enter your code'), h('p', { class: 'lede' }, 'Enter the 6-digit code from your authenticator app.'), form, otherAccount())
    form.querySelector('input').focus()
  } catch {
    secondStepProblem()
  }
}

async function enrollStep() {
  try {
    const enrollment = await startEnrollment()
    const form = secondStepForm(enrollment.factorId, 'Confirm and continue')
    root.replaceChildren(h('h1', {}, 'Set up two-factor'), h('p', { class: 'lede' }, 'Your account needs a second step at sign-in.'), enrollmentGuide(enrollment), form, otherAccount())
    form.querySelector('input').focus()
  } catch {
    secondStepProblem()
  }
}

function secondStepProblem() {
  root.replaceChildren(h('h1', {}, 'That didn’t work'), h('p', { class: 'lede' }, 'We couldn’t start two-factor sign-in. Try again in a moment.'), otherAccount())
}

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
        if (!error) { await signedIn(); return }
        msg.textContent = error.status === 400 ? 'That email and password don’t match.' : 'Couldn’t sign in. Try again in a moment.'
      } catch {
        msg.textContent = 'Couldn’t reach the sign-in service. Try again in a moment.'
      }
      msg.hidden = false; go.disabled = false
    },
  }, emailField, passwordField, msg, h('div', { class: 'form-foot' }, go,
    h('button', { class: 'link', type: 'button', onclick: () => resetForm(form.elements.email.value) }, 'Forgot password?')))
  const invite = h('p', { class: 'fine' }, 'Use the same email and password as StemShare. Accounts are by invitation for now.')
  root.replaceChildren(
    h('h1', {}, 'Sign in'),
    h('p', { class: 'lede' }, 'Download your plugins and manage your computers.'),
    form,
    invite,
  )
  // Offer sign-up only once sales are open; until then this line stands, including if the answer doesn't come.
  if (TURNSTILE_SITE_KEY) {
    fetch(`${PLUGIN_API}/sales-status`).then((r) => (r.ok ? r.json() : null)).then((status) => {
      if (status?.open === true) invite.replaceChildren('New here? ', h('a', { href: '/signup/' }, 'Create an account'), '. Use the same email and password as StemShare if you have one.')
    }).catch(() => {})
  }
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
    h('p', { class: 'fine' }, h('button', { class: 'link', type: 'button', onclick: () => signInForm(address) }, 'Back to sign in')),
  )
}
