import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Flame, Check, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'

export default function Home() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [apps, setApps] = useState([])
  const [reviewed, setReviewed] = useState({})
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [claim, setClaim] = useState({ claimedToday: false, day: 0 })
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: appsData } = await supabase.from('apps').select('*').eq('active', true).order('created_at', { ascending: false })
      setApps(appsData ?? [])

      const { data: revs } = await supabase.from('reviews').select('app_id,status')
      const map = {}
      ;(revs ?? []).forEach((r) => (map[r.app_id] = r.status))
      setReviewed(map)

      const { data: today } = await supabase
        .from('daily_claims')
        .select('day_number,claim_date')
        .order('claim_date', { ascending: false })
        .limit(1)
      const last = today?.[0]
      const todayStr = new Date().toISOString().slice(0, 10)
      setClaim({
        claimedToday: last?.claim_date === todayStr,
        day: last?.claim_date === todayStr ? last.day_number : 0,
      })
    })()
  }, [])

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(apps.map((a) => a.category).filter(Boolean)))],
    [apps],
  )

  const filtered = apps.filter(
    (a) =>
      (cat === 'All' || a.category === cat) &&
      a.name.toLowerCase().includes(q.toLowerCase()),
  )

  const potential = apps
    .filter((a) => !reviewed[a.id])
    .reduce((s, a) => s + Number(a.reward_amount), 0)

  const doClaim = async () => {
    setClaiming(true)
    try {
      const { data, error } = await supabase.rpc('claim_daily')
      if (error) throw error
      toast.success(`Claimed ${rupee(data.amount)}! 🔥`)
      setClaim({ claimedToday: true, day: data.day })
      refreshProfile()
    } catch (err) {
      toast.error(niceError(err))
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Daily claim */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-full ${claim.claimedToday ? 'bg-emerald-100 text-emerald-600' : 'bg-brand-100 text-brand-600'}`}>
              {claim.claimedToday ? <Check size={20} /> : <Flame size={20} />}
            </div>
            <div>
              <p className="font-bold">{claim.claimedToday ? 'Claimed Today!' : 'Daily Reward'}</p>
              <p className="flex items-center gap-1 text-xs text-slate-400">
                <Flame size={12} className="text-orange-400" /> {claim.day || 0} day streak
              </p>
            </div>
          </div>
          {!claim.claimedToday && (
            <button onClick={doClaim} disabled={claiming} className="btn-soft">
              {claiming ? '…' : 'Claim'}
            </button>
          )}
        </div>
        <div className="mt-3 flex justify-between gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div
              key={d}
              className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${
                d <= claim.day ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Balance / potential */}
      <div className="gradient-brand relative overflow-hidden rounded-2xl p-5 text-white shadow-lg shadow-brand-500/30 animate-slide-up">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-xl" />
        <div className="absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-white/5 blur-xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-sm text-white/80">Your Balance</p>
            <p className="mt-1 text-3xl font-extrabold">{rupee(profile?.wallet_balance)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/80">Potential Earnings</p>
            <p className="mt-1 text-2xl font-bold">{rupee(potential)}</p>
            <p className="text-xs text-white/70">From {apps.filter((a) => !reviewed[a.id]).length} available apps</p>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
              cat === c
                ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/40'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-3.5 text-slate-400" />
        <input className="input pl-10" placeholder="Search apps…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Apps */}
      <div className="space-y-3">
        {filtered.length === 0 && <p className="py-10 text-center text-slate-400">No apps found.</p>}
        {filtered.map((a, idx) => {
          const status = reviewed[a.id]
          return (
            <button
              key={a.id}
              onClick={() => nav(`/app/${a.id}`)}
              disabled={!!status}
              style={{ animationDelay: `${Math.min(idx * 50, 400)}ms` }}
              className="card-hover flex w-full animate-slide-up items-center gap-3 text-left disabled:opacity-60"
            >
              {a.icon_url ? (
                <img src={a.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-xl bg-brand-100 text-xl font-bold text-brand-600">
                  {a.name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{a.name}</p>
                <p className="truncate text-sm text-slate-400">{a.description}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <span>{a.slots_left} slots left</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{a.category}</span>
                  <span className="flex items-center gap-0.5"><Clock size={11} /> ~{a.est_time_min} min</span>
                  {a.two_step && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-600 dark:bg-violet-500/15">2-Step</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="badge bg-emerald-50 px-2.5 py-1 font-bold text-emerald-600 dark:bg-emerald-500/10">{rupee(a.reward_amount)}</span>
                {status ? (
                  <span className={`text-xs font-semibold capitalize ${status === 'approved' ? 'text-emerald-500' : status === 'rejected' ? 'text-rose-500' : 'text-amber-500'}`}>
                    {status}
                  </span>
                ) : (
                  <ChevronRight size={18} className="text-brand-500" />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
