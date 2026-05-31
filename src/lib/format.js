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
export function getDeviceId() {
  let id = localStorage.getItem('device_id')
  if (id) return id
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || '',
  ].join('|')
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i)
    hash |= 0
  }
  id = 'dev_' + Math.abs(hash).toString(36) + '_' + Math.random().toString(36).slice(2, 8)
  localStorage.setItem('device_id', id)
  return id
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
}

export function niceError(error) {
  if (!error) return 'Something went wrong.'
  const msg = error.message || String(error)
  for (const key of Object.keys(ERR)) {
    if (msg.includes(key)) return ERR[key]
  }
  return msg
}
