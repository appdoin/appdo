import { useEffect, useState } from 'react'
import { Copy, CheckCircle2, Users, IndianRupee, Gift, Share2, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useDataCache } from '../../context/DataCacheContext'
import { useToast } from '../../components/Toast'
import { rupee } from '../../lib/format'

export default function Referral() {
  const { session, profile, refreshProfile } = useAuth()
  const { fetchWithCache } = useDataCache()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [rewards, setRewards] = useState([])
  const [applyCode, setApplyCode] = useState('')
  const [hasReferrer, setHasReferrer] = useState(false)
  const [applying, setApplying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [settings, setSettings] = useState({ referral_enabled: true, referral_bonus: 10 })

  const referralCode = profile?.referral_code || ''
  const totalReferrals = profile?.total_referrals || 0
  const totalEarnings = profile?.total_earnings || 0
  const bonusAmount = settings.referral_bonus

  useEffect(() => {
    if (!session?.user || !profile) return
    setHasReferrer(!!profile.referred_by)
    ;(async () => {
      try {
        // Load settings
        const { data: sRows } = await supabase.from('settings').select('key,value').in('key', ['referral_enabled', 'referral_bonus'])
        const cfg = { referral_enabled: true, referral_bonus: 10 }
        sRows?.forEach((r) => {
          if (r.key === 'referral_enabled') cfg.referral_enabled = r.value === true || r.value === 'true'
          if (r.key === 'referral_bonus') cfg.referral_bonus = Number(r.value) || 10
        })
        setSettings(cfg)

        // Load referral rewards
        const cached = await fetchWithCache(
          `referrals_${session.user.id}`,
          async () => {
            const { data: refs } = await supabase
              .from('referral_rewards')
              .select('id, bonus_amount, status, created_at, referred:profiles!referral_rewards_referred_id_fkey(full_name, email)')
              .eq('referrer_id', session.user.id)
              .order('created_at', { ascending: false })
            return (refs || []).map((r) => ({ ...r, referred: Array.isArray(r.referred) ? r.referred[0] : r.referred }))
          },
          60_000,
        )
        setRewards(cached)
      } finally {
        setLoading(false)
      }
    })()
  }, [session, profile, fetchWithCache])

  const copyCode = () => {
    const link = `${window.location.origin}/signup?ref=${referralCode}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      toast.success('Referral link copied!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const shareCode = () => {
    const link = `${window.location.origin}/signup?ref=${referralCode}`
    if (navigator.share) {
      navigator.share({ title: 'Join App Review', text: `Use my referral code ${referralCode} and earn ₹${bonusAmount}!`, url: link })
    } else {
      copyCode()
    }
  }

  const handleApply = async () => {
    if (!applyCode.trim()) { toast.error('Enter a referral code'); return }
    setApplying(true)
    try {
      const { error } = await supabase.rpc('apply_referral', { p_referral_code: applyCode.trim().toUpperCase() })
      if (error) throw error
      toast.success("Referral applied! You'll get bonus on first approved review.")
      setHasReferrer(true)
      refreshProfile()
    } catch (err) {
      toast.error(err.message || 'Invalid code')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  if (!settings.referral_enabled) {
    return (
      <div className="card text-center py-10">
        <Gift size={28} className="mx-auto text-slate-400 mb-2" />
        <p className="font-bold text-sm">Referral program is paused</p>
        <p className="text-xs text-slate-400 mt-1">Check back later!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 p-4 text-white shadow-lg shadow-brand-500/20">
          <Users size={16} className="opacity-80 mb-1" />
          <p className="text-2xl font-extrabold">{totalReferrals}</p>
          <p className="text-[10px] opacity-80">Total Referrals</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 p-4 text-white shadow-lg shadow-emerald-500/20">
          <IndianRupee size={16} className="opacity-80 mb-1" />
          <p className="text-2xl font-extrabold">{rupee(totalEarnings)}</p>
          <p className="text-[10px] opacity-80">Referral Earnings</p>
        </div>
      </div>

      {/* Your Code */}
      <div className="card">
        <p className="text-sm font-bold flex items-center gap-2 mb-3">
          <Gift size={15} className="text-brand-500" /> Your Referral Code
        </p>
        <div className="mb-3 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/50 py-3 text-center text-xl font-extrabold tracking-widest text-brand-600 dark:bg-brand-500/5 dark:border-brand-500/30">
          {referralCode}
        </div>
        <div className="flex gap-2">
          <button onClick={copyCode} className="btn-soft flex-1 flex items-center justify-center gap-1.5">
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button onClick={shareCode} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white shadow active:scale-95">
            <Share2 size={14} /> Share
          </button>
        </div>

        {/* Social Share */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={() => {
              const msg = `🎉 App Review se paise kamao!\n\n✅ Apps download karo\n✅ Review do\n✅ Paise kamao!\n\n📲 Signup: ${window.location.origin}/signup?ref=${referralCode}\n\n🎁 Code: ${referralCode} — ₹${bonusAmount} bonus!`
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-bold text-white active:scale-95"
          >
            WhatsApp
          </button>
          <button
            onClick={() => {
              const msg = `🎉 App Review se paise kamao! Code: ${referralCode} — ₹${bonusAmount} bonus!`
              window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.origin + '/signup?ref=' + referralCode)}&text=${encodeURIComponent(msg)}`, '_blank')
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0088cc] px-3 py-2 text-xs font-bold text-white active:scale-95"
          >
            Telegram
          </button>
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-3">
          Earn ₹{bonusAmount} when your friend completes their first approved review!
        </p>
      </div>

      {/* Apply Code */}
      {!hasReferrer && (
        <div className="card">
          <p className="text-sm font-bold mb-2">Have a referral code?</p>
          <div className="flex gap-2">
            <input
              value={applyCode}
              onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              maxLength={8}
              className="input flex-1 text-center uppercase tracking-widest font-bold"
            />
            <button onClick={handleApply} disabled={applying} className="btn-primary px-4">
              {applying ? '…' : 'Apply'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <p className="text-sm font-bold mb-2">Your Referrals</p>
        {rewards.length === 0 ? (
          <div className="card text-center py-6 text-xs text-slate-400">
            No referrals yet — share your code!
          </div>
        ) : (
          <div className="space-y-2">
            {rewards.map((r) => (
              <div key={r.id} className="card flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold">{r.referred?.full_name || r.referred?.email || 'User'}</p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className={`text-xs font-bold ${r.status === 'credited' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {r.status === 'credited' ? `+₹${r.bonus_amount}` : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom back */}
      <button onClick={() => window.history.back()} className="btn-soft w-full py-2.5 text-sm">
        <ArrowLeft size={15} /> Go Back
      </button>
    </div>
  )
}
