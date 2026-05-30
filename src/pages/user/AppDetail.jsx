import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ExternalLink, Timer, ImagePlus, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'

export default function AppDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { session } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)

  const [app, setApp] = useState(null)
  const [opened, setOpened] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('apps').select('*').eq('id', id).single().then(({ data }) => {
      setApp(data)
      setText(data?.review_template || '')
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

  const openStore = () => {
    setOpened(true)
    setSeconds(0)
    if (app?.play_store_url) window.open(app.play_store_url, '_blank', 'noopener')
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async () => {
    if (!file) return toast.error('Please upload your review screenshot.')
    setBusy(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${session.user.id}/${id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('proofs').upload(path, file)
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)

      const { error } = await supabase.rpc('submit_review', {
        p_app_id: id,
        p_review_text: text,
        p_screenshot_url: pub.publicUrl,
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
            'Click "Open in Play Store" & download the app',
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
      <div className="card space-y-3">
        <div>
          <label className="text-sm font-semibold">Review Text (optional)</label>
          <textarea className="input mt-1 min-h-[90px] resize-none" placeholder="Write or paste your review text here…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-slate-400 dark:border-slate-700"
        >
          {preview ? (
            <img src={preview} alt="preview" className="max-h-48 rounded-lg" />
          ) : (
            <>
              <ImagePlus size={28} />
              <span className="text-sm font-medium">Upload Review Screenshot</span>
            </>
          )}
        </button>

        <button onClick={submit} disabled={!ready || busy} className="btn-primary w-full">
          {busy ? 'Submitting…' : 'Submit Proof'}
        </button>
      </div>
    </div>
  )
}
