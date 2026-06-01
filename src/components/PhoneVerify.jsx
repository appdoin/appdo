import { useState } from 'react'
import { ShieldCheck, MessageCircle, Send, AlertTriangle, Clock, Eye, EyeOff, Fingerprint } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { niceError } from '../lib/format'
import { generateFingerprint } from '../lib/fingerprint'

// In-App OTP Verification Flow:
// 1. User enters phone number
// 2. System runs fraud/device/blacklist checks
// 3. If passed → OTP code shown directly in app
// 4. User enters code → verified
// No WhatsApp sending needed!

export default function PhoneVerify() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [phone, setPhone] = useState(profile?.phone || '')
  const [code, setCode] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [showOtp, setShowOtp] = useState(false)
  const [step, setStep] = useState('input') // input | checking | reveal | verify
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (profile?.phone_verified) {
    return (
      <div className="card">
        <div className="mb-2 flex items-center gap-2">
          <MessageCircle size={18} className="text-emerald-500" />
          <h3 className="font-bold">Phone Verification</h3>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10">
          <ShieldCheck size={18} /> +91 {profile.phone} — Verified ✅
        </div>
      </div>
    )
  }

  const requestCode = async () => {
    const cleanPhone = phone.replace(/\D/g, '')
    if (!/^\d{10}$/.test(cleanPhone)) return toast.error('Enter a valid 10-digit number.')
    setError('')
    setBusy(true)
    setStep('checking')
    try {
      // Get device fingerprint for fraud check
      const deviceId = await generateFingerprint()

      const { data, error: rpcErr } = await supabase.rpc('request_phone_otp_v2', {
        p_phone: cleanPhone,
        p_device_id: deviceId,
      })

      if (rpcErr) {
        const msg = rpcErr.message || ''
        if (msg.includes('PHONE_ALREADY_USED')) {
          setError('This number is already verified on another account.')
        } else if (msg.includes('TOO_MANY_OTP_REQUESTS')) {
          setError('Too many requests. Please wait 1 hour.')
        } else if (msg.includes('FRAUD_DETECTED')) {
          setError('Verification failed. Security check did not pass. Contact support if this is an error.')
        } else if (msg.includes('PHONE_BLACKLISTED') || msg.includes('DEVICE_BLACKLISTED')) {
          setError('This phone/device has been blocked. Contact support.')
        } else if (msg.includes('ACCOUNT_BANNED')) {
          setError('Your account has been suspended.')
        } else {
          throw rpcErr
        }
        setStep('input')
        setBusy(false)
        return
      }

      // Fraud check passed — code received
      setOtpCode(data.code)
      setStep('reveal')
      toast.success('Security check passed! Your verification code is ready.')
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
        <Fingerprint size={18} className="text-emerald-500" />
        <h3 className="font-bold">Phone Verification</h3>
      </div>
      <p className="text-sm text-slate-400">Verify your phone number to enable withdrawals. Code will appear here after security check.</p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600 dark:bg-rose-500/10">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'input' || step === 'checking' ? (
        <>
          <div className="flex gap-2">
            <span className="flex items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold dark:bg-slate-800">+91</span>
            <input
              className="input"
              placeholder="10-digit phone number"
              value={phone}
              maxLength={10}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              disabled={step === 'checking'}
            />
          </div>
          <p className="text-[11px] text-slate-400">🔒 Your number will go through fraud & duplicate check before code is generated.</p>
          <button onClick={requestCode} disabled={busy || step === 'checking'} className="btn-primary w-full gap-2">
            <Fingerprint size={16} />
            {step === 'checking' ? 'Running security check…' : 'Get Verification Code'}
          </button>
        </>
      ) : step === 'reveal' ? (
        <>
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <p className="font-semibold mb-1">✅ Security check passed!</p>
            <p className="text-xs">Your verification code for <strong>+91 {phone}</strong>:</p>
          </div>

          {/* OTP Display */}
          <div className="relative rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 py-4 text-center dark:bg-brand-500/5 dark:border-brand-500/30">
            <p className="text-2xl font-extrabold tracking-[0.5em] text-brand-600">
              {showOtp ? otpCode : '••••••'}
            </p>
            <button
              onClick={() => setShowOtp(!showOtp)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-white p-1.5 shadow dark:bg-slate-800"
            >
              {showOtp ? <EyeOff size={16} className="text-slate-400" /> : <Eye size={16} className="text-brand-500" />}
            </button>
          </div>

          <p className="text-[11px] text-center text-slate-400">⏱️ Code expires in 10 minutes. Enter it below to verify.</p>

          <input
            className="input text-center text-lg tracking-[0.4em]"
            placeholder="Enter code here"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <div className="flex gap-2">
            <button onClick={verify} disabled={busy || code.length < 6} className="btn-primary flex-1">
              {busy ? 'Verifying…' : '✓ Verify'}
            </button>
            <button onClick={() => { setStep('input'); setCode(''); setOtpCode(''); setShowOtp(false); setError('') }} className="btn-soft">
              Change Number
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
