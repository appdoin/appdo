import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ExternalLink, Timer, ImagePlus, ArrowLeft, CheckCircle2, Clock, ImageIcon, Camera, MessageSquare, Copy, Check, Sparkles, Loader } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'
import { generateFingerprint, detectSuspiciousEnv } from '../../lib/fingerprint'
import { generateReviewComment } from '../../lib/groqService'

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
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  // Two-step state
  const [installation, setInstallation] = useState(null)
  const [markingInstall, setMarkingInstall] = useState(false)
  // AI Review comment state
  const [assignedComment, setAssignedComment] = useState(null)
  const [assignedStars, setAssignedStars] = useState(5)
  const [commentLoading, setCommentLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  // Fraud tracking: page open time
  const pageOpenTime = useRef(Date.now())

  useEffect(() => {
    supabase.from('apps').select('*').eq('id', id).single().then(({ data }) => {
      // If this is an install task, redirect to the correct page
      if (data?.task_type === 'install') {
        nav(`/install-task/${id}`, { replace: true })
        return
      }
      setApp(data)
      setAssignedStars(data?.required_stars || 5)
    })
    // Check if user has already marked installation (for two-step)
    supabase.from('app_installations').select('*').eq('app_id', id).maybeSingle().then(({ data }) => {
      setInstallation(data)
    })
    // Fetch AI-generated review comment for this user
    loadAiComment()
  }, [id])

  const loadAiComment = async () => {
    setCommentLoading(true)
    try {
      const { data } = await supabase
        .from('user_review_comments')
        .select('comment, stars')
        .eq('app_id', id)
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (data?.comment) {
        setAssignedComment(data.comment)
        setAssignedStars(data.stars || 5)
      } else {
        // No pre-generated comment — generate one on-the-fly
        await generateOnTheFly()
      }
    } catch (err) {
      console.error('Failed to load AI comment:', err)
      await generateOnTheFly()
    } finally {
      setCommentLoading(false)
    }
  }

  const generateOnTheFly = async () => {
    try {
      // Wait for app data to be available
      const { data: appData } = await supabase.from('apps').select('name, description, category, required_stars, review_language').eq('id', id).single()
      if (!appData) return

      // Fetch the 15 most recent comments for this app to pass as an avoid list (ensures high uniqueness)
      const { data: recentComments } = await supabase
        .from('user_review_comments')
        .select('comment')
        .eq('app_id', id)
        .order('created_at', { ascending: false })
        .limit(15)

      const existingComments = (recentComments ?? []).map((c) => c.comment)

      const comment = await generateReviewComment({
        name: appData.name,
        description: appData.description,
        category: appData.category,
        language: appData.review_language || 'hinglish',
        comment_length: appData.comment_length || 'short',
      }, existingComments)

      const stars = appData.required_stars || 5

      // Save to DB for future reference
      await supabase.from('user_review_comments').upsert({
        user_id: session.user.id,
        app_id: id,
        comment,
        stars,
      }, { onConflict: 'user_id,app_id' })

      setAssignedComment(comment)
      setAssignedStars(stars)
    } catch (err) {
      console.error('On-the-fly generation failed:', err)
      // Fallback — let user know
      toast.error('Could not generate review comment. Please try again.')
    }
  }

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

  const copyComment = async () => {
    if (!assignedComment) return
    try {
      await navigator.clipboard.writeText(assignedComment)
      setCopied(true)
      toast.success('Comment copied! Paste it in Play Store.')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = assignedComment
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      toast.success('Comment copied!')
      setTimeout(() => setCopied(false), 3000)
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
    if (!assignedComment) return toast.error('No review comment assigned. Please wait or refresh.')
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
        p_review_text: assignedComment,
        p_screenshot_url: pub.publicUrl,
        p_device_fingerprint: fingerprint,
        p_time_spent_seconds: timeSpent,
        p_opened_store: opened,
        p_assigned_comment: assignedComment,
        p_assigned_stars: assignedStars,
      })
      if (error) throw error
      toast.success('Proof submitted! Reward will be added to your wallet after approval.')
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
            `Copy the review comment below and paste it in Play Store with ${assignedStars} Star Rating`,
            'Take screenshot of your review and submit here',
            `Done! ${rupee(app.reward_amount)} will be added to your wallet after verification`,
          ].map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 4 ? 'bg-emerald-500 text-white' : 'bg-brand-100 text-brand-600'}`}>{i + 1}</span>
              <span className={i === 4 ? 'text-emerald-600' : ''}>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Admin Comment (if any) */}
      {app.admin_comment && (
        <div className="card border-l-4 border-l-violet-400">
          <div className="flex items-start gap-2">
            <MessageSquare size={16} className="mt-0.5 shrink-0 text-violet-500" />
            <div>
              <p className="text-xs font-bold text-violet-600 dark:text-violet-400">Note from Admin</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{app.admin_comment}</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Generated Review Comment — THE KEY FEATURE */}
      <div className="card border border-violet-400/40 bg-gradient-to-br from-violet-500/10 to-purple-500/10 backdrop-blur-md dark:border-violet-500/20 dark:from-violet-500/5 dark:to-purple-500/5">
        <div className="flex items-center gap-2 mb-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500 text-white">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-violet-700 dark:text-violet-300">Your Review Comment</p>
            <p className="text-[10px] text-violet-500">Copy this exact comment and paste it in Play Store</p>
          </div>
        </div>

        {commentLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-violet-500">
            <Loader size={18} className="animate-spin" />
            <span className="text-sm font-medium">Generating your unique review...</span>
          </div>
        ) : assignedComment ? (
          <div className="space-y-3">
            {/* Comment text */}
            <div className="rounded-xl bg-white/60 p-3 shadow-inner border border-white/40 dark:bg-slate-800/40 dark:border-white/5 backdrop-blur-sm">
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 select-all">{assignedComment}</p>
            </div>

            {/* Star rating display */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Required Rating:</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={`text-lg ${s <= assignedStars ? 'text-amber-400' : 'text-slate-300'}`}>★</span>
                ))}
              </div>
              <span className="text-xs font-bold text-amber-600">{assignedStars} Stars</span>
            </div>

            {/* Copy button */}
            <button
              onClick={copyComment}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-sm transition active:scale-[0.98] ${
                copied
                  ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                  : 'bg-violet-500 text-white shadow-violet-500/30 hover:bg-violet-600'
              }`}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Copied! Now paste in Play Store' : 'Copy Review Comment'}
            </button>

            {/* Warning */}
            <div className="rounded-xl bg-rose-50 p-2.5 text-center dark:bg-rose-500/10">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400">⚠️ Important</p>
              <p className="mt-0.5 text-[11px] text-rose-500">
                Paste this EXACT comment in Play Store. Your screenshot will be AI-verified. If the comment doesn't match, you won't receive payment.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-violet-500">Failed to generate comment</p>
            <button onClick={generateOnTheFly} className="btn-soft mt-2 text-xs">Retry</button>
          </div>
        )}
      </div>

      {/* Screenshot Upload */}
      <div className="card space-y-3 animate-slide-up">
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
              <p className="mt-1 text-[11px] text-slate-400">Screenshot must show your review with the exact comment and {assignedStars} star rating</p>
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

        <button onClick={submit} disabled={!ready || busy || (app.two_step && !twoStepReady) || !assignedComment} className="btn-primary w-full">
          {busy ? 'Submitting…' : 'Submit Proof'}
        </button>

        <p className="mt-2 text-center text-[11px] text-slate-400">
          💰 Reward will be added to your wallet. You can withdraw once you reach the minimum limit.
        </p>
      </div>

      {/* Bottom back button */}
      <button onClick={() => nav(-1)} className="btn-soft w-full py-2.5 text-sm">
        <ArrowLeft size={15} /> Go Back
      </button>
    </div>
  )
}
