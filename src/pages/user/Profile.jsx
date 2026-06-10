import { useEffect, useState } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { User as UserIcon, Save, LogOut, Award, Shield, Gift, HelpCircle, Users, IndianRupee } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee } from '../../lib/format'

export default function Profile() {
  const { profile, refreshProfile, signOut, isAdmin } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [name, setName] = useState(profile?.full_name || '')
  const [upi, setUpi] = useState(profile?.upi_id || '')
  const [stats, setStats] = useState({ approved: 0, pending: 0, rejected: 0 })
  const [referralBonus, setReferralBonus] = useState(10)

  useEffect(() => {
    setName(profile?.full_name || '')
    setUpi(profile?.upi_id || '')
  }, [profile])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'referral_bonus').maybeSingle().then(({ data }) => {
      const n = Number(String(data?.value ?? '').replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n > 0) setReferralBonus(n)
    })
  }, [])

  useEffect(() => {
    supabase.from('reviews').select('status').then(({ data }) => {
      setStats({
        approved: (data ?? []).filter((r) => r.status === 'approved').length,
        pending: (data ?? []).filter((r) => r.status === 'pending').length,
        rejected: (data ?? []).filter((r) => r.status === 'rejected').length,
      })
    })
  }, [])

  const save = async () => {
    await supabase.from('profiles').update({ full_name: name, upi_id: upi }).eq('id', profile.id)
    refreshProfile()
    toast.success('Profile saved.')
  }

  return (
    <div className="space-y-4">
      {/* Profile card — Glass */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm shadow-brand-500/30"><UserIcon size={20} /></div>
          <div>
            <p className="text-sm font-bold">{profile?.full_name}</p>
            <p className="text-xs text-slate-400">{profile?.email}</p>
          </div>
        </div>
        <div className="glass-shine mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-500 via-brand-600 to-violet-600 p-3.5 text-white shadow-md shadow-brand-500/25">
          <div>
            <p className="text-[11px] font-medium text-white/70 uppercase tracking-wider">Wallet Balance</p>
            <p className="text-xl font-extrabold">{rupee(profile?.wallet_balance)}</p>
          </div>
          <button onClick={() => nav('/wallet')} className="rounded-xl bg-white/20 px-3.5 py-2 text-xs font-bold backdrop-blur-sm border border-white/10 transition hover:bg-white/30">Withdraw</button>
        </div>
      </div>

      {isAdmin && (
        <a href={import.meta.env.VITE_ADMIN_URL || 'http://localhost:5173'} target="_blank" rel="noopener noreferrer" className="card flex w-full items-center justify-between text-left">
          <span className="flex items-center gap-2 font-bold text-brand-600"><Shield size={18} /> Open Admin Panel</span>
          <span className="text-slate-400">→</span>
        </a>
      )}

      {/* Refer & Earn - Prominent Card */}
      <NavLink
        to="/referral"
        className="relative block overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-4 text-white shadow-lg shadow-violet-500/30"
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20">
              <Gift size={22} />
            </div>
            <div>
              <p className="text-base font-bold leading-tight">Refer &amp; Earn ₹{referralBonus}</p>
              <p className="text-xs text-white/85">Share your code & earn on every referral!</p>
            </div>
          </div>
          <span className="text-lg text-white/90">→</span>
        </div>
        <div className="relative mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] text-white/80"><Users size={12} /> Referrals</p>
            <p className="text-lg font-extrabold leading-none">{profile?.total_referrals || 0}</p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] text-white/80"><IndianRupee size={12} /> Earned</p>
            <p className="text-lg font-extrabold leading-none">{rupee(profile?.total_earnings || 0)}</p>
          </div>
        </div>
      </NavLink>

      {/* Help & Support */}
      <NavLink to="/help" className="card flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 font-bold text-brand-600"><HelpCircle size={18} /> Help & Support</span>
        <span className="text-slate-400">→</span>
      </NavLink>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="stat-card glass-shine"><p className="text-sm font-bold text-emerald-500">{rupee(profile?.total_earned)}</p><p className="text-[10px] text-slate-400">Earned</p></div>
        <div className="stat-card"><p className="text-sm font-bold text-brand-600">{stats.approved}</p><p className="text-[10px] text-slate-400">Approved</p></div>
        <div className="stat-card"><p className="text-sm font-bold text-amber-500">{stats.pending}</p><p className="text-[10px] text-slate-400">Pending</p></div>
        <div className="stat-card"><p className="text-sm font-bold text-rose-500">{stats.rejected}</p><p className="text-[10px] text-slate-400">Rejected</p></div>
      </div>

      {/* Badges */}
      <div className="card">
        <h3 className="mb-2 flex items-center gap-2 font-bold"><Award size={18} className="text-amber-500" /> Achievement Badges</h3>
        <div className="flex flex-wrap gap-2">
          {stats.approved >= 1 ? (
            <span className="badge bg-brand-50 text-brand-600 px-3 py-1.5 dark:bg-brand-500/10">⭐ First Review</span>
          ) : (
            <span className="text-sm text-slate-400">Complete a review to earn badges.</span>
          )}
        </div>
      </div>

      {/* Edit */}
      <div className="card space-y-3">
        <h3 className="font-bold">Edit Profile</h3>
        <div>
          <label className="text-sm text-slate-400">Full Name</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-slate-400">UPI ID</label>
          <input className="input mt-1" value={upi} onChange={(e) => setUpi(e.target.value)} />
        </div>
        <button onClick={save} className="btn-primary w-full"><Save size={16} /> Save Changes</button>
      </div>

      <button onClick={() => { signOut(); nav('/login') }} className="card flex w-full items-center justify-center gap-2 font-semibold text-rose-500">
        <LogOut size={18} /> Sign Out
      </button>
    </div>
  )
}
