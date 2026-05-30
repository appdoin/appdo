import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, Mail, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import { niceError } from '../../lib/format'

export default function ResetPassword() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/update-password',
      })
      if (error) throw error
      setSent(true)
      toast.success('Password reset link sent to your email.')
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
          <h1 className="text-2xl font-extrabold">RewardReview</h1>
        </div>

        <div className="space-y-4 rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900">
          <h2 className="text-lg font-bold">Reset Password</h2>
          {sent ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Check your email for the reset link. If you were invited as admin, use that link to set your password and access the admin panel.</p>
              <Link to="/login" className="btn-primary block w-full text-center">Back to Login</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-sm text-slate-500">Enter your email and we'll send a password reset link.</p>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-3.5 text-slate-400" />
                <input type="email" className="input pl-10" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button disabled={busy} className="btn-primary w-full">{busy ? 'Sending…' : 'Send Reset Link'}</button>
            </form>
          )}
          <Link to="/login" className="flex items-center gap-1 text-sm font-medium text-brand-600"><ArrowLeft size={14} /> Back to login</Link>
        </div>
      </div>
    </div>
  )
}
