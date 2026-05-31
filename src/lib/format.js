// Currency, dates, device fingerprint, error mapping helpers

export const rupee = (n) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const formatDate = (d) =>
  new Date(d).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

// Lightweight device fingerprint (stable per browser/device).
// Persists across localStorage clears using multiple storage fallbacks.
export function getDeviceId() {
  const STORAGE_KEY = 'device_id'
  const COOKIE_KEY = 'rr_did'

  // Try localStorage first
  let id = localStorage.getItem(STORAGE_KEY)
  if (id) {
    // Also persist to cookie for redundancy
    setCookie(COOKIE_KEY, id, 365)
    return id
  }

  // Try cookie fallback (survives "Clear Site Data" in some browsers)
  id = getCookie(COOKIE_KEY)
  if (id) {
    localStorage.setItem(STORAGE_KEY, id)
    return id
  }

  // Try sessionStorage (survives within same tab)
  id = sessionStorage.getItem(STORAGE_KEY)
  if (id) {
    localStorage.setItem(STORAGE_KEY, id)
    setCookie(COOKIE_KEY, id, 365)
    return id
  }

  // Generate new device ID using hardware signals for extra entropy
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || '',
    navigator.maxTouchPoints || 0,
    navigator.deviceMemory || '',
  ].join('|')
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i)
    hash |= 0
  }
  id = 'dev_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36)

  // Persist everywhere
  localStorage.setItem(STORAGE_KEY, id)
  sessionStorage.setItem(STORAGE_KEY, id)
  setCookie(COOKIE_KEY, id, 365)
  return id
}

function setCookie(name, value, days) {
  const d = new Date()
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

// Friendly messages for backend error codes
const ERR = {
  DEVICE_ALREADY_REGISTERED: 'An account already exists on this device.',
  PHONE_ALREADY_USED: 'This phone number is already linked to another account.',
  ALREADY_REVIEWED: 'You have already reviewed this app.',
  NO_SLOTS_LEFT: 'No slots left for this app.',
  ALREADY_SPUN_TODAY: 'You already spun today. Come back tomorrow!',
  ALREADY_CLAIMED_TODAY: 'Already claimed today. Come back tomorrow!',
  PHONE_NOT_VERIFIED: 'Verify your WhatsApp number before withdrawing.',
  BELOW_MIN_WITHDRAWAL: 'Amount is below the minimum withdrawal.',
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance.',
  OTP_EXPIRED: 'Code expired. Request a new one.',
  INVALID_CODE: 'Incorrect code. Try again.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Request a new code.',
  NO_OTP_REQUESTED: 'Request a code first.',
  UPI_REQUIRED: 'Please set your UPI ID first.',
  REVIEW_BLOCKED_FRAUD: 'Review blocked. Your account has been flagged for suspicious activity.',
  ACCOUNT_BANNED: 'Your account has been suspended. Contact support.',
  TOO_MANY_OTP_REQUESTS: 'Too many OTP requests. Wait 1 hour and try again.',
}

export function niceError(error) {
  if (!error) return 'Something went wrong.'
  const msg = error.message || String(error)
  for (const key of Object.keys(ERR)) {
    if (msg.includes(key)) return ERR[key]
  }
  return msg
}
