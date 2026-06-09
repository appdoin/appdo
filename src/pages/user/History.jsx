import { useEffect, useMemo, useState } from 'react'
import { Eye, Star, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { rupee, formatDate } from '../../lib/format'

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Rejected']

export default function History() {
  const [reviews, setReviews] = useState([])
  const [installs, setInstalls] = useState([])
  const [tab, setTab] = useState('All')
  const [typeTab, setTypeTab] = useState('reviews') // 'reviews' or 'installs'

  useEffect(() => {
    supabase
      .from('reviews')
      .select('*, apps(name, icon_url)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setReviews(data ?? []))

    supabase
      .from('install_submissions')
      .select('*, apps(name, icon_url)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setInstalls(data ?? []))
  }, [])

  const activeData = typeTab === 'installs' ? installs : reviews

  const stats = useMemo(() => {
    const allItems = [...reviews, ...installs]
    const earned = allItems.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.reward_amount), 0)
    return {
      earned,
      done: allItems.length,
      pending: allItems.filter((r) => r.status === 'pending').length,
      rejected: allItems.filter((r) => r.status === 'rejected').length,
    }
  }, [reviews, installs])

  const filtered = tab === 'All' ? activeData : activeData.filter((r) => r.status === tab.toLowerCase())

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

      {/* Type Tabs — Reviews vs Install Tasks */}
      <div className="flex gap-2">
        <button
          onClick={() => { setTypeTab('reviews'); setTab('All') }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${
            typeTab === 'reviews'
              ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/40'
              : 'bg-white text-slate-500 border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
          }`}
        >
          <Star size={14} /> Reviews ({reviews.length})
        </button>
        <button
          onClick={() => { setTypeTab('installs'); setTab('All') }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${
            typeTab === 'installs'
              ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/40'
              : 'bg-white text-slate-500 border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
          }`}
        >
          <Download size={14} /> Installs ({installs.length})
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex rounded-xl bg-white p-1 shadow-card dark:bg-slate-900">
        {STATUS_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === t ? (typeTab === 'installs' ? 'bg-cyan-500 text-white' : 'bg-brand-500 text-white') : 'text-slate-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && <p className="py-10 text-center text-slate-400">No {typeTab === 'installs' ? 'install tasks' : 'reviews'} here yet.</p>}
        {filtered.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-center gap-3">
              {r.apps?.icon_url ? (
                <img src={r.apps.icon_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${typeTab === 'installs' ? 'bg-cyan-100 text-cyan-600' : 'bg-brand-100 text-brand-600'}`}>{r.apps?.name?.[0] || '?'}</div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold">{r.apps?.name || 'App'}</p>
                  {typeTab === 'installs' && <span className="rounded bg-cyan-100 px-1 py-0.5 text-[9px] font-bold text-cyan-600 dark:bg-cyan-500/15">📲 Install</span>}
                </div>
                <p className="text-xs text-slate-400">{formatDate(r.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-500">+{rupee(r.reward_amount)}</p>
                <span className={`badge mt-1 px-2 py-0.5 capitalize ${statusColor(r.status)}`}>{r.status}</span>
              </div>
            </div>

            {/* Review screenshot (review tasks) */}
            {typeTab === 'reviews' && r.screenshot_url && (
              <a href={r.screenshot_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-600">
                <Eye size={15} /> View Full Screenshot
              </a>
            )}

            {/* Install screenshot (install tasks) — single screenshot */}
            {typeTab === 'installs' && r.screenshot_inside && (
              <a href={r.screenshot_inside} target="_blank" rel="noreferrer" className="mt-3 block">
                <img src={r.screenshot_inside} alt="app screenshot" className="w-full max-w-[200px] rounded-lg bg-slate-50 object-cover ring-1 ring-slate-200 dark:ring-slate-700 dark:bg-slate-800/50" />
                <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-cyan-600"><Eye size={10} /> App Screenshot</span>
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
