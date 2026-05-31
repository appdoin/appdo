import { useState } from 'react'
import { ShieldCheck, MessageCircle, Send, AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { niceError } from '../lib/format'

// Admin-based WhatsApp OTP flow:
// 1. User enters phone number → Edge Function stores OTP in DB
// 2. Admin sees request in admin panel with OTP code
// 3. Admin clicks "Send OTP" → opens wa.me link, sends manually
// 4. User receives code on WhatsApp, enters it here
// 5. Code verified via RPC → phone linked to account

export default function PhoneVerify() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [phone, setPhone] = useState(profile?.phone || '')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('input') // input | sending | waiting | verify
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    const cleanPhone = phone.replace(/\D/g, '')
    if (!/^\d{10}$/.test(cleanPhone)) return toast.error('Enter a valid 10-digit number.')
    setError('')
    setBusy(true)
    setStep('sending')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-whatsapp-otp', {
        body: { phone: cleanPhone },
      })

      if (fnErr) throw fnErr
      if (data?.error) {
        if (data.error.includes('PHONE_ALREADY_USED')) {
          setError('This number is already verified on another account.')
          setStep('input')
          setBusy(false)
          return
        }
        if (data.error.includes('TOO_MANY_OTP_REQUESTS')) {
          setError('Too many requests. Please wait 1 hour before trying again.')
          setStep('input')
          setBusy(false)
          return
        }
        throw new Error(data.error)
      }

      setStep('verify')
      toast.success('Request submitted! Admin will send code to your WhatsApp shortly.')
    } catch (err) {
      setError(niceError(err))
      setStep('input')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setError('')
    try {
      const { error: verErr } = await supabase.rpc('verify_phone_otp', { p_code: code })
      if (verErr) throw verErr
      toast.success('Phone verified! 🎉')
      refreshProfile()
    } catch (err) {
      setError(niceError(err))
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
      <p className="text-sm text-slate-400">Verify your WhatsApp number to enable withdrawals. Admin will send a code to your WhatsApp.</p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600 dark:bg-rose-500/10">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'input' || step === 'sending' ? (
        <>
          <div className="flex gap-2">
            <span className="flex items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold dark:bg-slate-800">+91</span>
            <input
              className="input"
              placeholder="10-digit WhatsApp number"
              value={phone}
              maxLength={10}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              disabled={step === 'sending'}
            />
          </div>
          <p className="text-[11px] text-slate-400">⚠️ Enter YOUR WhatsApp number only. Admin will send code directly to this number.</p>
          <button onClick={sendCode} disabled={busy || step === 'sending'} className="btn-primary w-full gap-2">
            <Send size={16} />
            {step === 'sending' ? 'Submitting…' : 'Request Verification'}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <Clock size={16} className="shrink-0" />
            <span>Waiting for admin to send code to <strong>+91 {phone}</strong>. Check your WhatsApp.</span>
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
            <button onClick={() => { setStep('input'); setCode(''); setError('') }} className="btn-soft">Change</button>
          </div>
          <button onClick={sendCode} disabled={busy} className="text-xs font-medium text-brand-600 underline">
            Resend request
          </button>
        </>
      )}
    </div>
  )
}
