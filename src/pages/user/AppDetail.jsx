import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ExternalLink, Timer, ImagePlus, ArrowLeft, CheckCircle2, Clock, ImageIcon, Camera } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'
import { generateFingerprint, detectSuspiciousEnv } from '../../lib/fingerprint'

export default function AppDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { session } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const cameraRef = useRef(null)

  const [app, setApp] = useState(null)
  const [opened, setOpened] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  // Two-step state
  const [installation, setInstallation] = useState(null)
  const [markingInstall, setMarkingInstall] = useState(false)
  // Fraud tracking: page open time
  const pageOpenTime = useRef(Date.now())

  useEffect(() => {
    supabase.from('apps').select('*').eq('id', id).single().then(({ data }) => {
      setApp(data)
      setText(data?.review_template || '')
    })
    // Check if user has already marked installation (for two-step)
    supabase.from('app_installations').select('*').eq('app_id', id).maybeSingle().then(({ data }) => {
      setInstallation(data)
    })
  }, [id])

  // countdown timer after opening play store
  useEffect(() => {
    if (!opened || !app) return
    if (seconds >= app.wait_seconds) return
    const t = setTimeout(() => setSeconds((s) => s + 1), 1000)
    return () => clearTimeout(t)
  }, [opened, seconds, app])

  const ready = opened && app && seconds >= app.wait_seconds
  const remaining = app ? Math.max(0, app.wait_seconds - seconds) : 0

  // Two-step: check if 24h passed since installation
  const twoStepReady = (() => {
    if (!app?.two_step) return true // not two-step, always ready
    if (!installation) return false // hasn't marked installation yet
    const elapsed = Date.now() - new Date(installation.installed_at).getTime()
    return elapsed >= 24 * 60 * 60 * 1000 // 24 hours
  })()

  const hoursLeft = (() => {
    if (!app?.two_step || !installation) return 0
    const elapsed = Date.now() - new Date(installation.installed_at).getTime()
    const remaining = 24 * 60 * 60 * 1000 - elapsed
    return Math.max(0, Math.ceil(remaining / (60 * 60 * 1000)))
  })()

  const openStore = () => {
    setOpened(true)
    setSeconds(0)
    if (app?.play_store_url) window.open(app.play_store_url, '_blank', 'noopener')
  }

  const markInstalled = async () => {
    setMarkingInstall(true)
    try {
      const { data, error } = await supabase.from('app_installations').upsert({
        user_id: session.user.id,
        app_id: id,
        installed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,app_id' }).select().single()
      if (error) throw error
      setInstallation(data)
      toast.success("Great! Come back after 24 hours to submit your review.")
    } catch (err) {
      toast.error(niceError(err))
    } finally {
      setMarkingInstall(false)
    }
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Image too large. Max 5MB allowed.')
      return
    }
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(f.type)) {
      toast.error('Only JPG, PNG or WEBP images allowed.')
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async () => {
    if (!file) return toast.error('Please upload your review screenshot.')
    if (app?.two_step && !twoStepReady) return toast.error(`Please wait ${hoursLeft}h before submitting.`)
    setBusy(true)
    try {
      // Check for suspicious environment
      const envFlags = detectSuspiciousEnv()
      if (envFlags.includes('emulator_detected')) {
        toast.error('Emulators are not allowed. Use a real device.')
        setBusy(false)
        return
      }

      const ext = file.name.split('.').pop()
      const path = `${session.user.id}/${id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('proofs').upload(path, file)
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)

      // Generate device fingerprint for anti-fraud
      let fingerprint = null
      try { fingerprint = await generateFingerprint() } catch {}

      // Calculate time spent on page
      const timeSpent = Math.round((Date.now() - pageOpenTime.current) / 1000)

      const { error } = await supabase.rpc('submit_review', {
        p_app_id: id,
        p_review_text: text,
        p_screenshot_url: pub.publicUrl,
        p_device_fingerprint: fingerprint,
        p_time_spent_seconds: timeSpent,
        p_opened_store: opened,
      })
      if (error) throw error
      toast.success('Proof submitted! Reward credited after approval.')
      nav('/history')
    } catch (err) {
      toast.error(niceError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!app) return <p className="py-10 text-center text-slate-400">Loading…</p>

  return (
    <div className="space-y-4">
      <button onClick={() => nav(-1)} className="flex items-center gap-1 text-sm font-medium text-slate-500">
        <ArrowLeft size={16} /> Back
      </button>

      {/* App header */}
      <div className="card">
        <div className="flex items-center gap-3">
          {app.icon_url ? (
            <img src={app.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-brand-100 text-xl font-bold text-brand-600">{app.name[0]}</div>
          )}
          <div className="flex-1">
            <p className="font-bold">{app.name}</p>
            <p className="text-sm text-slate-400">Earn {rupee(app.reward_amount)} for reviewing</p>
          </div>
          <span className="badge bg-emerald-50 text-emerald-600 px-2.5 py-1 dark:bg-emerald-500/10">{rupee(app.reward_amount)}</span>
        </div>
        <button onClick={openStore} className="btn-primary mt-4 w-full">
          <ExternalLink size={18} /> Open in Play Store
        </button>
      </div>

      {/* Two-Step Review section */}
      {app.two_step && (
        <div className="card border-2 border-amber-200 dark:border-amber-500/30">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600">
              <Clock size={20} />
            </div>
            <div className="flex-1 text-center">
              <p className="text-lg font-bold">Two-Step Review</p>
              <p className="mt-1 text-sm text-slate-500">
                This app requires you to <strong>install and use it first</strong>, then come back after <strong>24 hours</strong> to submit your review.
              </p>
              {!installation ? (
                <button onClick={markInstalled} disabled={markingInstall} className="btn-primary mt-3">
                  ✅ I've Installed the App
                </button>
              ) : !twoStepReady ? (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-600 dark:bg-amber-500/10">
                  ⏳ Come back in ~{hoursLeft} hour{hoursLeft !== 1 ? 's' : ''} to submit your review
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10">
                  ✅ 24h passed! You can now submit your review below.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timer / status */}
      <div className="card">
        <h3 className="mb-2 font-bold">Submit Proof</h3>
        {!opened ? (
          <div className="rounded-xl bg-brand-50 p-3 text-center text-sm text-brand-600 dark:bg-brand-500/10">
            <Timer size={16} className="mx-auto mb-1" />
            Click "Open in Play Store" above to start the timer
            <p className="text-xs text-brand-400">You need to wait {app.wait_seconds}s after opening the app</p>
          </div>
        ) : ready ? (
          <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10">
            <CheckCircle2 size={16} className="mx-auto mb-1" /> You can now submit your review proof
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 p-3 text-center text-sm font-semibold text-amber-600 dark:bg-amber-500/10">
            <Timer size={16} className="mx-auto mb-1" /> Please wait {remaining}s…
          </div>
        )}

        {/* Steps */}
        <ol className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
          <p className="text-center font-bold text-brand-600">STEPS TO SUBMIT REVIEW</p>
          {[
            'Click "Open in Play Store" button above & download the app',
            `Open the app for ${app.wait_seconds} seconds after installation`,
            'Go back to Play Store and give 5 Star Rating with positive comment',
            'Take screenshot of your 5-star review and submit here',
            `Done! ${rupee(app.reward_amount)} will be credited after verification`,
          ].map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 4 ? 'bg-emerald-500 text-white' : 'bg-brand-100 text-brand-600'}`}>{i + 1}</span>
              <span className={i === 4 ? 'text-emerald-600' : ''}>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Review text + screenshot */}
      <div className="card space-y-3 animate-slide-up">
        <div>
          <label className="text-sm font-semibold">Review Text (optional)</label>
          {app.review_template && (
            <button
              type="button"
              onClick={() => setText(app.review_template)}
              className="mt-1.5 mb-1 block max-w-full truncate rounded-full bg-brand-50 px-3 py-1 text-left text-xs font-medium text-brand-600 transition hover:bg-brand-100 active:scale-95 dark:bg-brand-500/10 dark:text-brand-300"
              title="Tap to use suggested review"
            >
              💡 {app.review_template.slice(0, 40)}{app.review_template.length > 40 ? '…' : ''}
            </button>
          )}
          <textarea className="input mt-1 min-h-[90px] resize-none" placeholder="Write or paste your review text here…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFile} />

        <div className="rounded-xl border-2 border-dashed border-slate-300 p-5 text-center dark:border-slate-700">
          {preview ? (
            <div className="space-y-3 animate-pop">
              <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-lg shadow-sm" />
              <button onClick={() => { setFile(null); setPreview(null) }} className="text-xs font-semibold text-rose-500">Remove & re-upload</button>
            </div>
          ) : (
            <>
              <ImagePlus size={30} className="mx-auto text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-500">Upload Review Screenshot</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-soft px-4 py-2 text-sm">
                  <ImageIcon size={16} /> Gallery
                </button>
                <button type="button" onClick={() => cameraRef.current?.click()} className="btn-soft px-4 py-2 text-sm">
                  <Camera size={16} /> Camera
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Max 5MB • JPG, PNG</p>
            </>
          )}
        </div>

        <button onClick={submit} disabled={!ready || busy || (app.two_step && !twoStepReady)} className="btn-primary w-full">
          {busy ? 'Submitting…' : 'Submit Proof'}
        </button>
      </div>

      {/* Bottom back button */}
      <button onClick={() => nav(-1)} className="btn-soft w-full py-2.5 text-sm">
        <ArrowLeft size={15} /> Go Back
      </button>
    </div>
  )
}
