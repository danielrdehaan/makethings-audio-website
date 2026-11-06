// Two-factor with an authenticator app (TOTP, through Supabase): what the sign-in page and /account's settings share. Whether someone
// is asked is in account.js (twoFactorStep).
import { h, sb } from './account.js'

/** The verified factors on this account. Half-finished ones don't count. */
export async function verifiedFactors() {
  const { data, error } = await sb.auth.mfa.listFactors()
  if (error) throw error
  return data?.totp ?? []
}

/** Starts setup, clearing any setup someone abandoned first: Supabase refuses a second factor with the same name. */
export async function startEnrollment() {
  const { data: listed } = await sb.auth.mfa.listFactors()
  for (const f of listed?.all ?? []) {
    if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => {})
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

/** Checks a code against a factor. On success the session is at the higher level. Throws when it doesn't match. */
export async function verifyCode(factorId, code) {
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
  if (error) throw error
}

export async function removeFactor(factorId) {
  const { error } = await sb.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

export const codeField = () => h('label', {}, '6-digit code', h('input', {
  name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', required: true, maxlength: '6', pattern: '[0-9]{6}', placeholder: '123456',
}))

/** The QR code and the key to type instead. The QR only ever goes in an image, so nothing in it can run. supabase-js hands back the SVG
 *  inside an unescaped data: address, where a # would cut it off, so whatever comes is taken back to its markup and encoded properly. */
export function enrollmentGuide({ qr, secret }) {
  const svgAt = qr.indexOf('<svg')
  const src = svgAt >= 0 ? `data:image/svg+xml,${encodeURIComponent(qr.slice(svgAt))}` : qr
  return h('div', { class: 'mfa-guide' },
    h('p', { class: 'small muted' }, 'Scan this with an authenticator app, like Google Authenticator, 1Password or Authy, then enter the code it shows.'),
    /^data:image\//.test(src) && h('img', { class: 'mfa-qr', src, width: '180', height: '180', alt: 'QR code for your authenticator app' }),
    h('p', { class: 'small muted' }, 'Can’t scan it? Enter this key: ', h('code', { class: 'mfa-key' }, secret)))
}
