import { useState } from 'react'
import { ShieldCheck, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { niceError } from '../lib/format'

// OTP via WhatsApp redirect — code only visible inside WhatsApp.
export default function PhoneVerify() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [phone, setPhone] = useState(profile?.phone || '')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (profile?.phone_verified) {
    return (
      <div className="card">
        <div className="mb-2 flex items-center gap-2">
          <MessageCircle size={18} className="text-emerald-500" />
          <h3 className="font-bold">WhatsApp Verification</h3>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10">
          <ShieldCheck size={18} /> +91 {profile.phone} — Verified ✅
        </div>
      </div>
    )
  }

  const openWhatsApp = (link) => {
    // Mobile: use intent scheme for direct app open; Desktop: WhatsApp Web
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (isMobile) {
      // Direct WhatsApp app via intent/universal link
      window.location.href = link.replace('https://wa.me/', 'whatsapp://send/?phone=').replace('?text=', '&text=')
    } else {
      // Desktop: open WhatsApp Web in new tab
      window.open(`https://web.whatsapp.com/send?phone=91${phone}&text=${link.split('text=')[1]}`, '_blank')
    }
  }

  const sendCode = async () => {
    if (!/^\d{10,13}$/.test(phone)) return toast.error('Enter a valid WhatsApp number.')
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('request_phone_otp', { p_phone: phone })
      if (error) throw error

      const otpCode = data.code
      const msg = `Your RewardReview verification code is: *${otpCode}*\n\nDo NOT share this code with anyone. Valid for ${data.expires_minutes} minutes.`
      const encodedMsg = encodeURIComponent(msg)
      const waLink = `https://wa.me/91${phone}?text=${encodedMsg}`

      setSent(true)
      toast.success('Redirecting to WhatsApp...')

      // Redirect immediately
      openWhatsApp(waLink)
    } catch (err) {
      toast.error(niceError(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('verify_phone_otp', { p_code: code })
      if (error) throw error
      toast.success('Phone verified! 🎉')
      refreshProfile()
    } catch (err) {
      toast.error(niceError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle size={18} className="text-emerald-500" />
        <h3 className="font-bold">WhatsApp Verification</h3>
      </div>
      <p className="text-sm text-slate-400">Verify your WhatsApp number to enable withdrawals.</p>

      <div className="flex gap-2">
        <span className="flex items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold dark:bg-slate-800">+91</span>
        <input className="input" placeholder="WhatsApp number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} />
      </div>

      {!sent ? (
        <button onClick={sendCode} disabled={busy} className="btn-primary w-full">{busy ? 'Sending…' : 'Send Code via WhatsApp'}</button>
      ) : (
        <>
          <p className="text-center text-xs text-slate-400">WhatsApp me code check karo aur neeche enter karo.</p>
          <input className="input text-center text-lg tracking-[0.4em]" placeholder="••••••" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={verify} disabled={busy || code.length < 6} className="btn-primary flex-1">{busy ? 'Verifying…' : 'Verify'}</button>
            <button onClick={() => { setSent(false); setCode('') }} className="btn-soft">Change</button>
          </div>
        </>
      )}
    </div>
  )
}
