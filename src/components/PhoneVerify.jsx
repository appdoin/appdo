import { useState, useRef } from 'react'
import { ShieldCheck, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { niceError } from '../lib/format'

// WhatsApp self-redirect OTP:
// 1. Server generates code → returns it
// 2. Browser opens wa.me link to user's OWN number with code in message
// 3. User sends msg to themselves → code visible in WhatsApp
// 4. User enters code → verified
// Security: anti-duplicate (device + phone + email) prevents abuse.

export default function PhoneVerify() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [phone, setPhone] = useState(profile?.phone || '')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const linkRef = useRef(null)

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

  const sendCode = async () => {
    if (!/^\d{10}$/.test(phone)) return toast.error('Enter a valid 10-digit number.')
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('request_phone_otp', { p_phone: phone })
      if (error) throw error

      // Build WhatsApp self-message link
      const msg = `🔐 RewardReview Verification\n\nYour code: *${data.code}*\n\nValid for ${data.expires_minutes} min.\n⚠️ Do NOT share this code.`
      const waUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`

      setSent(true)
      toast.success('Opening WhatsApp…')

      // Open WhatsApp via hidden <a> tag (avoids popup blocker)
      if (linkRef.current) {
        linkRef.current.href = waUrl
        linkRef.current.click()
      }
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
      {/* Hidden anchor for WhatsApp redirect */}
      <a ref={linkRef} href="#" target="_blank" rel="noopener noreferrer" className="hidden" aria-hidden="true" />

      <div className="flex items-center gap-2">
        <MessageCircle size={18} className="text-emerald-500" />
        <h3 className="font-bold">WhatsApp Verification</h3>
      </div>
      <p className="text-sm text-slate-400">Verify your WhatsApp number to enable withdrawals.</p>

      {!sent ? (
        <>
          <div className="flex gap-2">
            <span className="flex items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold dark:bg-slate-800">+91</span>
            <input
              className="input"
              placeholder="10-digit WhatsApp number"
              value={phone}
              maxLength={10}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button onClick={sendCode} disabled={busy} className="btn-primary w-full gap-2">
            <Send size={16} />
            {busy ? 'Sending…' : 'Send Code via WhatsApp'}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-500/10">
            <MessageCircle size={16} className="shrink-0" />
            <span>WhatsApp open hua hoga. Message send karo apne aap ko, phir code neeche enter karo.</span>
          </div>
          <input
            className="input text-center text-lg tracking-[0.4em]"
            placeholder="••••••"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <div className="flex gap-2">
            <button onClick={verify} disabled={busy || code.length < 6} className="btn-primary flex-1">
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button onClick={() => { setSent(false); setCode('') }} className="btn-soft">Change</button>
          </div>
        </>
      )}
    </div>
  )
}
