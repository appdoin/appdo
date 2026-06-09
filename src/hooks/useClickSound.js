/**
 * Subtle click/tap sound using Web Audio API.
 * No audio files needed — pure synthesis.
 */

let audioCtx = null

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

/**
 * Play a short, subtle "pop" click sound.
 * ~30ms, soft sine wave with quick decay.
 */
export function playClick() {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.03)

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.05)
  } catch {
    // silently fail — audio not available
  }
}

/**
 * Play a spin tick sound — short percussive "tick".
 */
export function playTick() {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.015)

    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.03)
  } catch {
    // silently fail
  }
}

/**
 * Play a winning jingle — ascending notes.
 */
export function playWinJingle() {
  try {
    const ctx = getCtx()
    const notes = [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
    const noteLen = 0.12
    const gap = 0.08

    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * (noteLen + gap)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0.1, start)
      gain.gain.setValueAtTime(0.1, start + noteLen * 0.7)
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(start)
      osc.stop(start + noteLen + 0.01)
    })
  } catch {
    // silently fail
  }
}

/**
 * Start a continuous spin ticking sound that decelerates.
 * Returns a cleanup function to stop it.
 * @param {number} durationMs — total spin duration in ms
 */
export function startSpinTicking(durationMs = 4000) {
  const startTime = Date.now()
  let running = true
  let tickCount = 0

  const tick = () => {
    if (!running) return
    const elapsed = Date.now() - startTime
    if (elapsed >= durationMs) return

    playTick()
    tickCount++

    // Interval increases as spin slows down (starts fast, ends slow)
    const progress = elapsed / durationMs // 0→1
    // Start at 50ms interval, end at 350ms
    const interval = 50 + progress * progress * 300

    setTimeout(tick, interval)
  }

  tick()

  return () => {
    running = false
  }
}
