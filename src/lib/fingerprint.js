// Advanced device fingerprint generator for anti-fraud
// Combines multiple browser signals into a unique SHA-256 hash

export async function generateFingerprint() {
  const components = []

  // Screen info
  components.push(`${screen.width}x${screen.height}`)
  components.push(`${screen.colorDepth}`)
  components.push(`${window.devicePixelRatio || 1}`)

  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '')

  // Language
  components.push(navigator.language || '')

  // Platform
  components.push(navigator.platform || navigator.userAgentData?.platform || '')

  // Hardware concurrency
  components.push(`${navigator.hardwareConcurrency || 0}`)

  // Max touch points
  components.push(`${navigator.maxTouchPoints || 0}`)

  // Device memory (Chrome)
  components.push(`${navigator.deviceMemory || 0}`)

  // Canvas fingerprint
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 50
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillStyle = '#f60'
      ctx.fillRect(125, 1, 62, 20)
      ctx.fillStyle = '#069'
      ctx.fillText('ReviewApp\u{1f512}', 2, 15)
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
      ctx.fillText('ReviewApp\u{1f512}', 4, 17)
      components.push(canvas.toDataURL().slice(-50))
    }
  } catch {
    components.push('no-canvas')
  }

  // WebGL
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) {
        components.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '')
        components.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
      }
    }
  } catch {
    components.push('no-webgl')
  }

  // Audio fingerprint (lightweight)
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)()
    components.push(`${ac.sampleRate}`)
    ac.close()
  } catch {
    components.push('no-audio')
  }

  // Generate SHA-256 hash
  const raw = components.join('|')
  const hash = await hashString(raw)
  return hash
}

// Cross-browser-stable HARDWARE id.
//
// Unlike generateFingerprint() (which mixes in browser-engine-specific
// signals like userAgent, canvas, webgl, audio & language that differ
// between Chrome/Firefox/etc. on the SAME phone), this uses only signals
// that stay the same across different browsers on the same physical device.
// It is intentionally lower-entropy so it can catch "same device, different
// browser" attempts to verify a second phone number.
//
// Trade-off: two different people with the exact same device model + screen
// + timezone can collide. That's why the server treats a hardware-id clash
// as blockable but admins can whitelist a user to override false positives.
export async function generateHardwareId() {
  const c = []
  c.push(`${screen.width}x${screen.height}`)
  c.push(`${screen.colorDepth}`)
  c.push(`${window.devicePixelRatio || 1}`)
  c.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
  c.push(`${navigator.hardwareConcurrency || 0}`)
  c.push(`${navigator.maxTouchPoints || 0}`)
  // Platform without browser name/version noise.
  c.push((navigator.userAgentData?.platform || navigator.platform || '').toLowerCase())
  return 'hw_' + (await hashString(c.join('|')))
}

// Get metadata for registration
export function getDeviceMetadata() {
  return {
    userAgent: navigator.userAgent?.slice(0, 200) || '',
    screenRes: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    touchPoints: navigator.maxTouchPoints || 0,
    platform: navigator.platform || navigator.userAgentData?.platform || '',
    memory: navigator.deviceMemory || null,
    cores: navigator.hardwareConcurrency || null,
  }
}

// Detect suspicious environment (emulators, automation tools)
export function detectSuspiciousEnv() {
  const flags = []

  // Check for headless browser / automation
  if (navigator.webdriver) flags.push('webdriver_detected')
  if (window._phantom || window.__nightmare) flags.push('automation_tool')

  // Check for emulator signals
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('bluestacks') || ua.includes('nox') || ua.includes('memu') || ua.includes('ldplayer')) {
    flags.push('emulator_detected')
  }

  // Screen size anomalies (desktop pretending to be mobile)
  if (navigator.maxTouchPoints > 0 && screen.width > 1920) {
    flags.push('desktop_spoofing_mobile')
  }

  // Unrealistic hardware
  if (navigator.hardwareConcurrency > 32) flags.push('unusual_hardware')

  return flags
}

async function hashString(str) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
