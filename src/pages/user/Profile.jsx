import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User as UserIcon, Save, LogOut, Award, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import PhoneVerify from '../../components/PhoneVerify'
import { rupee } from '../../lib/format'

export default function Profile() {
  const { profile, refreshProfile, signOut, isAdmin } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [name, setName] = useState(profile?.full_name || '')
  const [upi, setUpi] = useState(profile?.upi_id || '')
  const [stats, setStats] = useState({ approved: 0, pending: 0, rejected: 0 })

  useEffect(() => {
    setName(profile?.full_name || '')
    setUpi(profile?.upi_id || '')
  }, [profile])

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
      {/* Profile card */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-brand-500 text-white"><UserIcon size={26} /></div>
          <div>
            <p className="text-lg font-bold">{profile?.full_name}</p>
            <p className="text-sm text-slate-400">{profile?.email}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 p-4 text-white">
          <div>
            <p className="text-xs text-white/80">Wallet Balance</p>
            <p className="text-2xl font-extrabold">{rupee(profile?.wallet_balance)}</p>
          </div>
          <button onClick={() => nav('/wallet')} className="rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold">Withdraw</button>
        </div>
      </div>

      {isAdmin && (
        <a href="/admin" className="card flex w-full items-center justify-between text-left">
          <span className="flex items-center gap-2 font-bold text-brand-600"><Shield size={18} /> Open Admin Panel</span>
          <span className="text-slate-400">→</span>
        </a>
      )}

      <PhoneVerify />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="stat-card"><p className="text-lg font-bold text-emerald-500">{rupee(profile?.total_earned)}</p><p className="text-xs text-slate-400">Earned</p></div>
        <div className="stat-card"><p className="text-lg font-bold text-brand-600">{stats.approved}</p><p className="text-xs text-slate-400">Approved</p></div>
        <div className="stat-card"><p className="text-lg font-bold text-amber-500">{stats.pending}</p><p className="text-xs text-slate-400">Pending</p></div>
        <div className="stat-card"><p className="text-lg font-bold text-rose-500">{stats.rejected}</p><p className="text-xs text-slate-400">Rejected</p></div>
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
