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
  components.push(navigator.platform || '')

  // Hardware concurrency
  components.push(`${navigator.hardwareConcurrency || 0}`)

  // Max touch points
  components.push(`${navigator.maxTouchPoints || 0}`)

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

  // Generate SHA-256 hash
  const raw = components.join('|')
  const hash = await hashString(raw)
  return hash
}

async function hashString(str) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
