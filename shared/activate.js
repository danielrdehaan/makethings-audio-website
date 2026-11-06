// /activate?code=ABCD-EFGH: where a plugin's "Sign in to Make Things" lands, by way of stems.makethings.audio/activate, which is the
// address plugins open and forwards here. The plugin is waiting and polling; here the signed-in person sees which computer is
// asking and approves or denies it. At the limit of 3 computers they can deactivate one and approve again.
import { h, pluginApi, requireSession, sb } from './account.js'

const LIMIT = 3
const root = document.getElementById('app')
// The alphabet of src/lib/pluginUserCode.ts in the stem-share repo: 20 consonants, so a code never spells a word.
const CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/
const normalize = (input) => {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]/g, '')
  return input && String(input).length <= 32 && CODE.test(code) ? code : null
}
const shown = (code) => `${code.slice(0, 4)}-${code.slice(4)}`

const session = await requireSession()
const whoEl = document.getElementById('who')
if (whoEl) whoEl.textContent = session.user.email ?? ''

const code = normalize(new URLSearchParams(location.search).get('code'))
if (code) await look(code)
else enter()

function enter(message) {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: !message }, message ?? '')
  const form = h('form', {
    onsubmit: (e) => {
      e.preventDefault()
      const typed = normalize(new FormData(form).get('code'))
      if (typed) location.assign(`/activate/?code=${shown(typed)}`)
      else { msg.textContent = 'That isn’t a code. It looks like ABCD-EFGH.'; msg.hidden = false }
    },
  }, h('label', {}, 'Enter the code your plugin shows',
    h('input', { name: 'code', placeholder: 'ABCD-EFGH', maxlength: '9', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'characters', spellcheck: 'false', required: true, autofocus: true })), msg,
  h('button', { class: 'pill', type: 'submit' }, 'Continue'))
  root.replaceChildren(form)
}

function gone() {
  root.replaceChildren(
    h('p', { class: 'lede' }, 'This code has expired or has already been used.'),
    h('p', { class: 'fine' }, 'Codes last 10 minutes. In the plugin, choose ', h('strong', {}, 'Sign in to Make Things'), ' again for a new one.'),
  )
}

function failed(text) {
  root.replaceChildren(h('p', { class: 'msg err' }, text))
}

async function look(c) {
  root.replaceChildren(h('p', { class: 'muted', 'aria-live': 'polite' }, 'Looking up the code…'))
  const { data: preview, error } = await sb.rpc('plugin_preview_device_code', { p_user_code: c })
  if (error) { failed('Couldn’t look up that code. Try again in a moment.'); return }
  if (!preview) { gone(); return }
  if (preview.status === 'approved' && preview.mine) { approved(preview.machineName); return }
  if (preview.status !== 'pending') { gone(); return }
  ask(c, preview.machineName)
}

function asking(c, machineName) {
  return [
    h('p', { class: 'lede' }, 'A Make Things plugin on this computer is asking to use your account:'),
    h('p', { class: 'machine', 'data-machine-asking': true }, machineName),
    h('div', { class: 'device-code' },
      h('p', { class: 'device-code-label' }, 'Your plugin should show this code'),
      h('p', { class: 'device-code-value', 'data-code': true }, shown(c))),
    h('p', { class: 'fine', style: 'margin-top:0' }, 'Approve only if you just chose Sign in to Make Things in a plugin and it shows this same code.'),
  ]
}

function buttons(c, machineName, { blocked = false } = {}) {
  const msg = h('p', { class: 'msg err', role: 'alert', hidden: true, style: 'flex-basis:100%' })
  const decide = (approve) => async () => {
    yes.disabled = true; no.disabled = true; msg.hidden = true
    try {
      const { status, data } = await pluginApi('approve', { method: 'POST', body: { userCode: c, approve } })
      if (status === 200 && data.ok) { if (approve) approved(machineName); else denied(machineName); return }
      if (data.error === 'machine_limit') { atLimit(c, machineName, data.machines ?? []); return }
      if (data.error === 'expired' || data.error === 'already_decided') { gone(); return }
    } catch { /* the message below */ }
    msg.textContent = 'Something went wrong. Try again, or start signing in again from the plugin.'
    msg.hidden = false; yes.disabled = false; no.disabled = false
  }
  const yes = h('button', { class: 'pill', type: 'button', disabled: blocked, 'data-approve': true, onclick: decide(true) }, 'Approve')
  const no = h('button', { class: 'pill ghost', type: 'button', 'data-deny': true, onclick: decide(false) }, 'Deny')
  return h('div', { class: 'row-actions', style: 'margin-top:20px' }, yes, no, msg)
}

function ask(c, machineName) {
  root.replaceChildren(...asking(c, machineName), buttons(c, machineName))
}

function atLimit(c, machineName, machines) {
  const left = [...machines]
  const draw = () => {
    root.replaceChildren(
      ...asking(c, machineName),
      h('p', { class: 'msg err small', style: 'margin-top:18px' }, `You already have plugins signed in on ${LIMIT} computers, the most an account can have. Deactivate one to approve this one.`),
      h('ul', { class: 'rows', style: 'margin-top:14px' }, left.map((m) => {
        const go = h('button', { class: 'pill ghost small', type: 'button', onclick: async () => {
          go.disabled = true
          let done = false
          try { done = (await pluginApi('machines/revoke', { method: 'POST', body: { machineId: m.id } })).status === 200 } catch { /* below */ }
          if (done) { left.splice(left.indexOf(m), 1); draw() }
          else { go.disabled = false; failedRow.hidden = false }
        } }, 'Deactivate')
        const failedRow = h('p', { class: 'msg err small', role: 'alert', hidden: true, style: 'flex-basis:100%' }, 'Couldn’t deactivate it. Try again in a moment.')
        return h('li', { class: 'row', 'data-machine': m.id }, h('div', { class: 'row-main' }, h('h3', {}, m.name)), go, failedRow)
      })),
      buttons(c, machineName, { blocked: left.length >= LIMIT }),
    )
  }
  draw()
}

function approved(machineName) {
  root.replaceChildren(
    h('p', { class: 'lede', 'data-approved': true }, 'Approved. ', h('strong', {}, machineName), ' is signed in.'),
    h('p', { class: 'fine' }, 'Go back to your DAW. The plugin finishes signing in within a few seconds, and you can close this tab.'),
    h('p', { class: 'fine' }, h('a', { href: '/account/#computers' }, 'Your computers and licence')),
  )
}

function denied(machineName) {
  root.replaceChildren(
    h('p', { class: 'lede', 'data-denied': true }, 'Denied. ', h('strong', {}, machineName), ' wasn’t signed in.'),
    h('p', { class: 'fine' }, 'If you didn’t start this sign-in, there’s nothing else to do.'),
  )
}
