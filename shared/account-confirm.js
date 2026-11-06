// /account/confirm/?token_hash=…&type=email_change: where the email-change email lands. Opening the page spends nothing: mail scanners
// load links, so the one-shot token is used only when the person presses the button. Needs the Supabase email template to link here.
import { h, sb } from './account.js'

const root = document.getElementById('app')
const params = new URLSearchParams(location.search)
const tokenHash = params.get('token_hash')?.trim() ?? ''

function done(title, text) {
  root.replaceChildren(
    h('h1', {}, title),
    h('p', { class: 'lede' }, text),
    h('p', { class: 'fine' }, h('a', { class: 'pill', href: '/account/', style: 'text-decoration:none' }, 'Go to your account')),
  )
}

if (!tokenHash || params.get('type') !== 'email_change') {
  done('That link didn’t work', 'That link isn’t complete. Open it from the email again.')
} else {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true })
  const go = h('button', { class: 'pill', type: 'button', onclick: async () => {
    go.disabled = true; msg.hidden = true
    try {
      const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email_change' })
      if (error) {
        done('That link didn’t work', error.code === 'otp_expired' || /expired/i.test(error.message ?? '') ? 'That link has expired or was already used. You can change your email again from your account.' : 'That link isn’t valid any more. You can change your email again from your account.')
        return
      }
      history.replaceState(null, '', location.pathname)
      // With both addresses asked to confirm, the first link leaves the change waiting on the second.
      if (data.session && data.user?.email && !data.user.new_email) done('Email changed', `You now sign in with ${data.user.email}.`)
      else done('One more step', 'That’s confirmed. Now open the link we sent to your other address to finish.')
    } catch {
      msg.textContent = 'Couldn’t reach the sign-in service. Try again in a moment.'
      msg.hidden = false; go.disabled = false
    }
  } }, 'Confirm my email')
  root.replaceChildren(
    h('h1', {}, 'Confirm your email'),
    h('p', { class: 'lede' }, 'Press the button to confirm this address for your account.'),
    h('p', { class: 'fine' }, go), msg,
  )
}
