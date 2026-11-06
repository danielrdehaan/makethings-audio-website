// /account's own settings: name, email, password and deleting the account. The same account signs in to StemShare, so changing
// them here changes them there. What's about someone's life on StemShare (bio, badges, appearance, their data) stays on its /profile.
import { ACCOUNT_API, APP_URL } from './config.js'
import { h, sb } from './account.js'
import { codeField, enrollmentGuide, removeFactor, startEnrollment, verifiedFactors, verifyCode } from './mfa.js'

const MIN_PASSWORD = 8

// One row that shows a value and a button, and swaps to a form when the button is pressed.
// `action` can be a function, and no button when it gives nothing, for a row whose button depends on the state it's in. `form` can
// take a moment, as setting up two-factor does; if it fails, the row says `formProblem`.
function settingRow({ id, title, value, action, danger = false, form, formProblem }) {
  const li = h('li', { class: 'row', 'data-setting': id })
  const note = (text, tone = 'ok') => h('p', { class: `msg ${tone} small setting-note`, role: 'status' }, text)
  const show = (message, tone) => {
    const label = typeof action === 'function' ? action() : action
    li.replaceChildren(h('div', { class: 'row-main' }, h('h3', {}, title), h('p', { class: 'muted' }, value())))
    if (label) li.append(h('div', { class: 'row-actions' }, h('button', { class: `pill ghost small${danger ? ' danger-text' : ''}`, type: 'button', onclick: open }, label)))
    if (message) li.append(note(message, tone))
  }
  async function open(e) {
    e.currentTarget.disabled = true
    try {
      const el = await form({ done: show, cancel: () => show() })
      li.replaceChildren(el)
      el.querySelector('input')?.focus()
    } catch {
      show(formProblem, 'err')
    }
  }
  show()
  return li
}

// A form with an error line and Save and Cancel. `run` returns text to show as an error, or calls `done`.
function settingForm({ title, intro, fields, submit, submitClass = 'pill small', cancel, run }) {
  const msg = h('p', { class: 'msg err small', role: 'alert', hidden: true })
  const go = h('button', { class: submitClass, type: 'submit' }, submit)
  const el = h('form', {
    class: 'setting-form',
    onsubmit: async (e) => {
      e.preventDefault()
      msg.hidden = true; go.disabled = true
      let problem
      try {
        problem = await run(new FormData(el))
      } catch {
        problem = 'Couldn’t reach the account service. Try again in a moment.'
      }
      if (problem) { msg.textContent = problem; msg.hidden = false; go.disabled = false }
    },
  },
  h('h3', {}, title),
  intro && h('p', { class: 'muted small' }, intro),
  fields, msg,
  h('div', { class: 'row-actions' }, go, h('button', { class: 'pill ghost small', type: 'button', onclick: cancel }, 'Cancel')))
  return el
}

const field = (label, attrs) => h('label', {}, label, h('input', attrs))

// Asking for the password again proves it's the owner at the keyboard, not someone at a computer left signed in. That sign-in lowers
// the session to password-only, so an account with a second factor gives its code too. Returns what went wrong, or nothing.
async function reauthenticate(session, account, f, wrongPassword) {
  const { error } = await sb.auth.signInWithPassword({ email: session.user.email, password: String(f.get('current')) })
  if (error) return wrongPassword
  if (!account.twoFactor) return null
  try {
    const [factor] = await verifiedFactors()
    await verifyCode(factor.id, String(f.get('code')))
    return null
  } catch {
    return 'That code didn’t match. Check your authenticator app and try again.'
  }
}

function nameRow(session, account) {
  return settingRow({
    id: 'name', title: 'Name', action: 'Change', value: () => account.name || 'Not set',
    form: ({ done, cancel }) => settingForm({
      title: 'Name', submit: 'Save name', cancel,
      intro: account.stemshare ? 'Shown on your posts and comments on StemShare.' : null,
      fields: [field('Name', { name: 'name', autocomplete: 'name', required: true, maxlength: '80', value: account.name ?? '' })],
      run: async (f) => {
        const name = String(f.get('name')).trim()
        if (!name) return 'Enter a name.'
        const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', session.user.id)
        if (error) return 'Couldn’t save your name. Try again in a moment.'
        account.name = name
        done('Saved.')
      },
    }),
  })
}

function emailRow(session) {
  const current = () => session.user.email ?? ''
  return settingRow({
    id: 'email', title: 'Email', action: 'Change', value: current,
    form: ({ done, cancel }) => settingForm({
      title: 'Email', submit: 'Send confirmation', cancel,
      intro: `You sign in with this address. It stays ${current()} until you confirm the new one from your inbox.`,
      fields: [field('New email', { name: 'email', type: 'email', autocomplete: 'email', required: true })],
      run: async (f) => {
        const email = String(f.get('email')).trim()
        if (email.toLowerCase() === current().toLowerCase()) return 'That’s already your email.'
        const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: `${location.origin}/account/` })
        if (error) return error.status === 429 ? 'That’s a lot of tries. Wait a minute and try again.' : 'Couldn’t change your email to that address.'
        done(`Check ${email} for a link to confirm it. Check your spam folder too.`)
      },
    }),
  })
}

function twoFactorRow(account) {
  const setUp = ({ done, cancel }) => startEnrollment().then((enrollment) => settingForm({
    title: 'Two-factor authentication', submit: 'Turn on', cancel,
    fields: [enrollmentGuide(enrollment), codeField()],
    run: async (f) => {
      try {
        await verifyCode(enrollment.factorId, String(f.get('code')))
      } catch {
        return 'That code didn’t match. Check your authenticator app and try again.'
      }
      account.twoFactor = true
      done('Two-factor is on. You’ll enter a code from your authenticator app when you sign in.')
    },
  }))
  const remove = ({ done, cancel }) => settingForm({
    title: 'Remove two-factor', submit: 'Remove two-factor', submitClass: 'pill small danger', cancel,
    intro: 'Enter a code from your authenticator app to confirm it’s you. After this, signing in only needs your password.',
    fields: [codeField()],
    run: async (f) => {
      const factors = await verifiedFactors()
      try {
        await verifyCode(factors[0].id, String(f.get('code')))
      } catch {
        return 'That code didn’t match. Check your authenticator app and try again.'
      }
      for (const factor of factors) await removeFactor(factor.id)
      account.twoFactor = false
      done('Two-factor is off.')
    },
  })
  return settingRow({
    id: 'two-factor', title: 'Two-factor authentication',
    formProblem: 'Two-factor isn’t available right now. Try again in a moment.',
    value: () => (account.twoFactor ? 'On. You enter a code from your authenticator app when you sign in.' : 'Off. Add a second step at sign-in with an authenticator app.'),
    // Where it's required, it can't be taken off. It can't be off here either, because the page needs it to open.
    action: () => (account.twoFactor ? (account.twoFactorRequired ? null : 'Remove') : 'Set up'),
    form: (handlers) => (account.twoFactor ? remove(handlers) : setUp(handlers)),
  })
}

function passwordRow(session, account) {
  return settingRow({
    id: 'password', title: 'Password', action: 'Change', value: () => '••••••••',
    form: ({ done, cancel }) => settingForm({
      title: 'Password', submit: 'Change password', cancel,
      fields: [
        field('Current password', { name: 'current', type: 'password', autocomplete: 'current-password', required: true }),
        field('New password', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: String(MIN_PASSWORD) }),
        field('Confirm new password', { name: 'confirm', type: 'password', autocomplete: 'new-password', required: true }),
        account.twoFactor && codeField(),
      ],
      run: async (f) => {
        const password = String(f.get('password'))
        if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
        if (password !== String(f.get('confirm'))) return 'The new passwords don’t match.'
        const wrong = await reauthenticate(session, account, f, 'Your current password isn’t right.')
        if (wrong) return wrong
        const { error } = await sb.auth.updateUser({ password })
        if (error) return error.code === 'same_password' ? 'Choose a different password from the one you have.' : error.code === 'weak_password' ? 'Choose a harder password to guess.' : 'Couldn’t change your password. Try again.'
        done(`Password changed. Use the new one everywhere you sign in${account.stemshare ? ', including StemShare' : ''}.`)
      },
    }),
  })
}

function stemshareRow() {
  return h('li', { class: 'row', 'data-setting': 'stemshare' },
    h('div', { class: 'row-main' }, h('h3', {}, 'StemShare'),
      h('p', { class: 'muted' }, 'Your bio, badges, groups and appearance are on your StemShare profile.')),
    h('div', { class: 'row-actions' }, h('a', { class: 'pill ghost small', href: `${APP_URL}/profile?edit`, style: 'text-decoration:none' }, 'Open StemShare')))
}

function deleteRow(session, account, onDeleted) {
  return settingRow({
    id: 'delete', title: 'Delete account', action: 'Delete account', danger: true,
    value: () => 'Removes your account and everything on it, for good.',
    form: ({ cancel }) => settingForm({
      title: 'Delete account', submit: 'Delete my account', submitClass: 'pill small danger', cancel,
      intro: null,
      fields: [
        h('ul', { class: 'setting-list' },
          h('li', {}, 'Your plugin licences and computers, including anything you bought.'),
          h('li', {}, 'A subscription is cancelled first, so it can’t keep charging.'),
          account.stemshare && h('li', {}, 'All your StemShare work: versions, files, comments and your place in your groups.')),
        account.stemshare && h('p', { class: 'small muted' }, 'Want a copy of your StemShare work? ', h('a', { href: `${APP_URL}/profile?edit` }, 'Export your data'), ' first.'),
        h('p', { class: 'small' }, h('strong', {}, 'This can’t be undone.')),
        field('Password', { name: 'current', type: 'password', autocomplete: 'current-password', required: true }),
        account.twoFactor && codeField(),
        field('Type DELETE to confirm', { name: 'confirm', autocomplete: 'off', required: true }),
      ],
      run: async (f) => {
        if (String(f.get('confirm')).trim() !== 'DELETE') return 'Type DELETE to confirm.'
        const wrong = await reauthenticate(session, account, f, 'That password isn’t right.')
        if (wrong) return wrong
        const { data } = await sb.auth.getSession()
        const r = await fetch(`${ACCOUNT_API}/delete`, { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token}` } })
        if (r.status === 409) return 'We couldn’t cancel your subscription, so your account wasn’t deleted and nothing was removed. Try again in a moment.'
        if (!r.ok) return 'Couldn’t delete your account. Try again in a moment.'
        await sb.auth.signOut({ scope: 'local' }).catch(() => {})
        onDeleted()
      },
    }),
  })
}

/** The rows, in the `section` the page gives them. `account` is `{ name, stemshare, twoFactor, twoFactorRequired }`. */
export function accountRows(session, account, onDeleted) {
  return h('ul', { class: 'rows' },
    nameRow(session, account), emailRow(session), passwordRow(session, account), twoFactorRow(account),
    account.stemshare && stemshareRow(),
    deleteRow(session, account, onDeleted))
}
