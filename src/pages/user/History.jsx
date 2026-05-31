import { useEffect, useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { rupee, formatDate } from '../../lib/format'

const TABS = ['All', 'Pending', 'Approved', 'Rejected']

export default function History() {
  const [reviews, setReviews] = useState([])
  const [tab, setTab] = useState('All')

  useEffect(() => {
    supabase
      .from('reviews')
      .select('*, apps(name, icon_url)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setReviews(data ?? []))
  }, [])

  const stats = useMemo(() => {
    const earned = reviews.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.reward_amount), 0)
    return {
      earned,
      done: reviews.length,
      pending: reviews.filter((r) => r.status === 'pending').length,
      rejected: reviews.filter((r) => r.status === 'rejected').length,
    }
  }, [reviews])

  const filtered = tab === 'All' ? reviews : reviews.filter((r) => r.status === tab.toLowerCase())

  const statusColor = (s) =>
    s === 'approved' ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
    : s === 'rejected' ? 'text-rose-500 bg-rose-50 dark:bg-rose-500/10'
    : 'text-amber-500 bg-amber-50 dark:bg-amber-500/10'

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="stat-card"><p className="text-sm font-bold text-emerald-500">{rupee(stats.earned)}</p><p className="text-xs text-slate-400">Earned</p></div>
        <div className="stat-card"><p className="text-sm font-bold text-brand-600">{stats.done}</p><p className="text-xs text-slate-400">Done</p></div>
        <div className="stat-card"><p className="text-sm font-bold text-amber-500">{stats.pending}</p><p className="text-xs text-slate-400">Pending</p></div>
        <div className="stat-card"><p className="text-sm font-bold text-rose-500">{stats.rejected}</p><p className="text-xs text-slate-400">Rejected</p></div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-white p-1 shadow-card dark:bg-slate-900">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === t ? 'bg-brand-500 text-white' : 'text-slate-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && <p className="py-10 text-center text-slate-400">No reviews here yet.</p>}
        {filtered.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-center gap-3">
              {r.apps?.icon_url ? (
                <img src={r.apps.icon_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-sm font-bold text-brand-600">{r.apps?.name?.[0] || '?'}</div>
              )}
              <div className="flex-1">
                <p className="font-bold">{r.apps?.name || 'App'}</p>
                <p className="text-xs text-slate-400">{formatDate(r.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-500">+{rupee(r.reward_amount)}</p>
                <span className={`badge mt-1 px-2 py-0.5 capitalize ${statusColor(r.status)}`}>{r.status}</span>
              </div>
            </div>
            {r.screenshot_url && (
              <a href={r.screenshot_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-600">
                <Eye size={15} /> View Full Screenshot
              </a>
            )}
            {r.status === 'rejected' && r.reject_reason && (
              <p className="mt-2 text-xs text-rose-500">Reason: {r.reject_reason}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
