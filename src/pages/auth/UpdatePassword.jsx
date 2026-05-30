import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import { niceError } from '../../lib/format'

export default function UpdatePassword() {
  const toast = useToast()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  // Supabase sets the session from the URL hash automatically
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User arrived via reset link — show the form
      }
    })
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Password updated! Redirecting…')
      setTimeout(() => nav('/'), 1200)
    } catch (err) {
      toast.error(niceError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-500 to-brand-700 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <Star size={30} className="fill-white text-white" />
          </div>
          <h1 className="text-2xl font-extrabold">Set New Password</h1>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900">
          <p className="text-sm text-slate-500">Choose a new password for your account.</p>
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-3.5 text-slate-400" />
            <input type="password" className="input pl-10" placeholder="New password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Updating…' : 'Update Password'}</button>
        </form>
      </div>
    </div>
  )
}
