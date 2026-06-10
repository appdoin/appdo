import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ExternalLink, ArrowLeft, CheckCircle2, ImageIcon, Camera, ImagePlus, Download, MessageSquare } from 'lucide-react'
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
  const [busy, setBusy] = useState(false)

  // Single screenshot (Play Store)
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

  const openStore = () => {
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
    if (!file) return toast.error('Please upload a Play Store screenshot.')
    setBusy(true)
    try {
      // Upload screenshot
      const ext = file.name.split('.').pop()
      const path = `${session.user.id}/${id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('proofs').upload(path, file)
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)
      const screenshotUrl = pub.publicUrl

      // Submit — pass same URL for both fields
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
        <ol className="space-y-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 p-4 text-sm dark:bg-cyan-500/5 dark:border-cyan-500/10 backdrop-blur-sm">
          <p className="text-center font-bold text-cyan-600">HOW TO COMPLETE THIS TASK</p>
          {[
            'Click the "Download from Play Store" button above',
            'Install the app from Play Store',
            'Take a screenshot of the Play Store page showing the app is installed',
            'Upload the screenshot below and submit',
            `Done! ${rupee(app.reward_amount)} will be added to your wallet after verification`,
          ].map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 4 ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-white'}`}>{i + 1}</span>
              <span className={i === 4 ? 'font-semibold text-emerald-600' : ''}>{s}</span>
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

      {/* Single Screenshot Upload — Play Store screenshot */}
      <div className="card space-y-3 animate-slide-up">
        <h3 className="font-bold">📱 Play Store Screenshot</h3>
        <p className="text-xs text-slate-400">Upload a screenshot from Play Store showing the app is installed (showing "Open" or "Uninstall" button)</p>

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
              <p className="mt-1.5 text-sm font-semibold text-slate-500">Play Store screenshot</p>
              <p className="text-[11px] text-slate-400">Show the app page with "Open" or "Uninstall" visible</p>
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

        <button onClick={submit} disabled={busy || !file} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-cyan-500/30 transition hover:bg-cyan-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
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
