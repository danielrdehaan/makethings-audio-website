// Cloudflare's bot check, loaded when a form needs it.
export function loadTurnstile() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) { resolve(window.turnstile); return }
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.onload = () => resolve(window.turnstile)
    s.onerror = reject
    document.head.append(s)
  })
}
