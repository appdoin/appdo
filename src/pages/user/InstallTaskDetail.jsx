import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ExternalLink, Timer, ArrowLeft, CheckCircle2, ImageIcon, Camera, ImagePlus, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'

export default function InstallTaskDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { session } = useAuth()
  const toast = useToast()

  const fileRef = useRef(null)
  const cameraRef = useRef(null)

  const [app, setApp] = useState(null)
  const [opened, setOpened] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)

  // Single screenshot (inside app)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    supabase.from('apps').select('*').eq('id', id).single().then(({ data }) => {
      // If this is a review task, redirect to review page
      if (data && data.task_type !== 'install') {
        nav(`/app/${id}`, { replace: true })
        return
      }
      setApp(data)
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
    if (!file) return toast.error('Please upload screenshot of the app.')
    setBusy(true)
    try {
      // Upload screenshot
      const ext = file.name.split('.').pop()
      const path = `${session.user.id}/${id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('proofs').upload(path, file)
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)
      const screenshotUrl = pub.publicUrl

      // Submit — pass same URL for both fields (outside is not needed)
      const { error } = await supabase.rpc('submit_install_task', {
        p_app_id: id,
        p_screenshot_inside: screenshotUrl,
        p_screenshot_outside: screenshotUrl,
      })
      if (error) throw error
      toast.success('Screenshot submitted! Reward will be added to your wallet after verification.')
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

      {/* App header — Install themed */}
      <div className="card border-l-4 border-l-cyan-500">
        <div className="flex items-center gap-3">
          {app.icon_url ? (
            <img src={app.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-cyan-100 text-xl font-bold text-cyan-600">{app.name[0]}</div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-bold">{app.name}</p>
              <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-600 dark:bg-cyan-500/15">📲 Install Task</span>
            </div>
            <p className="text-sm text-slate-400">Install this app and earn {rupee(app.reward_amount)} in your wallet</p>
          </div>
          <span className="badge bg-cyan-50 text-cyan-600 px-2.5 py-1 text-base font-bold dark:bg-cyan-500/10">{rupee(app.reward_amount)}</span>
        </div>
        <button onClick={openStore} className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-cyan-500/30 transition hover:bg-cyan-600 active:scale-[0.98] flex items-center justify-center gap-2">
          <Download size={18} /> Download from Play Store
        </button>
      </div>

      {/* Steps — Install specific */}
      <div className="card">
        <ol className="space-y-3 rounded-xl bg-cyan-50/50 p-4 text-sm dark:bg-cyan-500/5">
          <p className="text-center font-bold text-cyan-600">HOW TO COMPLETE THIS TASK</p>
          {[
            'Click the "Download from Play Store" button above',
            'Install and open the app',
            `Use the app for at least ${app.wait_seconds} seconds`,
            'Take a full screenshot inside the app (do not crop)',
            `Done! ${rupee(app.reward_amount)} will be added to your wallet after verification`,
          ].map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 4 ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-white'}`}>{i + 1}</span>
              <span className={i === 4 ? 'font-semibold text-emerald-600' : ''}>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Timer / status */}
      <div className="card">
        <h3 className="mb-2 font-bold text-cyan-600">📲 Submit Install Proof</h3>
        {!opened ? (
          <div className="rounded-xl bg-cyan-50 p-3 text-center text-sm text-cyan-600 dark:bg-cyan-500/10">
            <Timer size={16} className="mx-auto mb-1" />
            Click "Download from Play Store" button above first
            <p className="text-xs text-cyan-400">You'll need to wait {app.wait_seconds} seconds after installing the app</p>
          </div>
        ) : ready ? (
          <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10">
            <CheckCircle2 size={16} className="mx-auto mb-1" /> You can now submit your screenshot!
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 p-3 text-center dark:bg-amber-500/10">
            <Timer size={22} className="mx-auto mb-1 text-amber-500" />
            <p className="text-lg font-bold text-amber-600">{remaining}s</p>
            <p className="text-xs text-amber-500">Use the app while waiting. Upload screenshot when timer ends.</p>
          </div>
        )}
      </div>

      {/* Admin instructions (if any) */}
      {app.review_template && (
        <div className="card">
          <h3 className="mb-2 text-sm font-bold text-cyan-600">📋 Admin Instructions</h3>
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">{app.review_template}</p>
        </div>
      )}

      {/* Single Screenshot Upload */}
      <div className="card space-y-3 animate-slide-up">
        <h3 className="font-bold">📱 App Screenshot</h3>
        <p className="text-xs text-slate-400">Upload a full screenshot from inside the app (do not crop)</p>

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFile} />

        <div className="rounded-xl border-2 border-dashed border-cyan-300 p-4 text-center dark:border-cyan-700">
          {preview ? (
            <div className="space-y-3 animate-pop">
              <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-lg shadow-sm" />
              <button onClick={() => { setFile(null); setPreview(null) }} className="text-xs font-semibold text-rose-500">Remove and upload again</button>
            </div>
          ) : (
            <>
              <ImagePlus size={30} className="mx-auto text-cyan-400" />
              <p className="mt-1.5 text-sm font-semibold text-slate-500">Screenshot from inside the app</p>
              <p className="text-[11px] text-slate-400">Full screenshot, do not crop</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-soft px-4 py-2 text-xs">
                  <ImageIcon size={14} /> Gallery
                </button>
                <button type="button" onClick={() => cameraRef.current?.click()} className="btn-soft px-4 py-2 text-xs">
                  <Camera size={14} /> Camera
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Max 5MB • JPG, PNG, WEBP</p>
            </>
          )}
        </div>

        <button onClick={submit} disabled={!ready || busy || !file} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-cyan-500/30 transition hover:bg-cyan-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? 'Submitting…' : '📲 Submit Screenshot'}
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
