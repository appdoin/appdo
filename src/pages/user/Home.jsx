import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Flame, Check, Clock, Grid3x3, Gift, Download, Star } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'
import AnnouncementBanner from '../../components/AnnouncementBanner'

// Fixed category list — mirrors the admin panel's category options.
const ALL_CATEGORIES = ['Gaming', 'Productivity', 'Social', 'Entertainment', 'Education', 'Finance', 'Health', 'Shopping', 'Tools', 'Other']

export default function Home() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [apps, setApps] = useState([])
  const [reviewed, setReviewed] = useState({})
  const [installed, setInstalled] = useState({})
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [taskTab, setTaskTab] = useState('review') // 'review' or 'install'
  const [claim, setClaim] = useState({ claimedToday: false, day: 0 })
  const [claiming, setClaiming] = useState(false)

  // Drag-to-scroll for the category strip (works with mouse on desktop + touch on mobile).
  const catRef = useRef(null)
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false })

  const onPointerDown = (e) => {
    const el = catRef.current
    if (!el) return
    drag.current = { down: true, startX: e.pageX, startScroll: el.scrollLeft, moved: false }
  }
  const onPointerMove = (e) => {
    const el = catRef.current
    if (!el || !drag.current.down) return
    const dx = e.pageX - drag.current.startX
    if (Math.abs(dx) > 3) drag.current.moved = true
    el.scrollLeft = drag.current.startScroll - dx
  }
  const endDrag = () => {
    drag.current.down = false
  }
  // Convert vertical wheel into horizontal scroll over the strip (desktop mouse).
  const onWheel = (e) => {
    const el = catRef.current
    if (!el) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY
    }
  }

  useEffect(() => {
    ;(async () => {
      const { data: appsData } = await supabase.from('apps').select('*').eq('active', true).order('created_at', { ascending: false })
      setApps(appsData ?? [])

      const { data: revs } = await supabase.from('reviews').select('app_id,status')
      const map = {}
      ;(revs ?? []).forEach((r) => (map[r.app_id] = r.status))
      setReviewed(map)

      const { data: instSubs } = await supabase.from('install_submissions').select('app_id,status')
      const instMap = {}
      ;(instSubs ?? []).forEach((r) => (instMap[r.app_id] = r.status))
      setInstalled(instMap)

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

  const categories = useMemo(() => {
    // Full fixed list always shown (like the design), plus any custom admin categories.
    const present = new Set(apps.map((a) => a.category).filter(Boolean))
    const extras = Array.from(present).filter((c) => !ALL_CATEGORIES.includes(c))
    return ['All', ...ALL_CATEGORIES, ...extras]
  }, [apps])

  const filtered = apps.filter(
    (a) =>
      (a.task_type || 'review') === taskTab &&
      (cat === 'All' || a.category === cat) &&
      a.name.toLowerCase().includes(q.toLowerCase()),
  )

  const reviewApps = apps.filter((a) => (a.task_type || 'review') === 'review')
  const installApps = apps.filter((a) => a.task_type === 'install')

  const potential = reviewApps
    .filter((a) => !reviewed[a.id])
    .reduce((s, a) => s + Number(a.reward_amount), 0)
    + installApps
    .filter((a) => !installed[a.id])
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
    <div className="flex h-full flex-col gap-3">
      {/* ===== Fixed top section ===== */}
      <div className="shrink-0 space-y-3 animate-stagger">
      {/* Announcements */}
      <AnnouncementBanner />

      {/* Daily claim */}
      <div className="card relative overflow-hidden py-3 animate-fade-in">
        <div className="decor-leaf leaf-3" style={{ opacity: 0.08 }} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`grid h-8 w-8 place-items-center rounded-full transition-all duration-300 ${claim.claimedToday ? 'bg-emerald-100 text-emerald-600 animate-pop' : 'bg-brand-100 text-brand-600 animate-pulse-soft'}`}>
              {claim.claimedToday ? <Check size={16} /> : <Flame size={16} />}
            </div>
            <div>
              <p className="text-sm font-bold">{claim.claimedToday ? 'Claimed Today!' : 'Daily Reward'}</p>
              <p className="flex items-center gap-1 text-xs text-slate-400">
                <Flame size={10} className="text-orange-400" /> {claim.day || 0} day streak
              </p>
            </div>
          </div>
          {!claim.claimedToday && (
            <button onClick={doClaim} disabled={claiming} className="btn-soft py-1.5 text-xs">
              {claiming ? '…' : 'Claim'}
            </button>
          )}
        </div>
        <div className="mt-2 flex justify-between gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div
              key={d}
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                d <= claim.day ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Balance / potential */}
      <div className="gradient-brand relative overflow-hidden rounded-2xl p-4 text-white shadow-md shadow-brand-500/30 animate-slide-up">
        <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-white/10 blur-xl animate-pulse-soft" />
        <div className="absolute -bottom-10 left-10 h-16 w-16 rounded-full bg-white/5 blur-xl" />
        <div className="decor-leaf leaf-1" />
        <div className="decor-leaf leaf-2" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-xs text-white/80">Your Balance</p>
              <p className="mt-0.5 text-2xl font-extrabold">{rupee(profile?.wallet_balance)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/80">Potential Earnings</p>
              <p className="mt-0.5 text-xl font-bold">{rupee(potential)}</p>
              <p className="text-xs text-white/70">From {reviewApps.filter((a) => !reviewed[a.id]).length + installApps.filter((a) => !installed[a.id]).length} available tasks</p>
            </div>
        </div>
      </div>

      {/* Referral mini-banner */}
      <button
        onClick={() => nav('/referral')}
        className="flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-200 px-3 py-2.5 text-left transition active:scale-[0.98] dark:border-violet-500/20 dark:from-violet-500/5 dark:to-purple-500/5"
      >
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500 text-white">
          <Gift size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-violet-700 dark:text-violet-300">Refer & Earn Money!</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Share your code & earn on every friend's review</p>
        </div>
        <ChevronRight size={14} className="text-violet-400" />
      </button>

      {/* Task Type Tabs — Review vs Install */}
      <div className="flex gap-2">
        <button
          onClick={() => setTaskTab('review')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${
            taskTab === 'review'
              ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/40'
              : 'bg-white text-slate-500 border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
          }`}
        >
          <Star size={15} /> Review Apps
        </button>
        <button
          onClick={() => setTaskTab('install')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${
            taskTab === 'install'
              ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/40'
              : 'bg-white text-slate-500 border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400'
          }`}
        >
          <Download size={15} /> Install Apps
        </button>
      </div>

      {/* Categories — horizontally scrollable strip (drag + wheel + touch) */}
      <div
        ref={catRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onWheel={onWheel}
        className="no-scrollbar flex w-full cursor-grab gap-2 overflow-x-scroll py-1 active:cursor-grabbing"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => {
              if (drag.current.moved) return
              setCat(c)
            }}
            className={`flex shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition active:scale-95 ${
              cat === c
                ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/40'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {c === 'All' && <Grid3x3 size={13} />}
            {c}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-3.5 text-slate-400" />
        <input className="input pl-10" placeholder="Search apps…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      </div>

      {/* ===== Scrollable apps list ===== */}
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto pb-2">
        {filtered.length === 0 && <p className="py-10 text-center text-slate-400">{taskTab === 'install' ? 'No install tasks found.' : 'No apps found.'}</p>}
        {filtered.map((a, idx) => {
          const status = taskTab === 'install' ? installed[a.id] : reviewed[a.id]
          return (
            <button
              key={a.id}
              onClick={() => nav(taskTab === 'install' ? `/install-task/${a.id}` : `/app/${a.id}`)}
              disabled={!!status}
              style={{ animationDelay: `${Math.min(idx * 50, 400)}ms` }}
              className={`card-hover flex w-full animate-slide-up items-center gap-2.5 text-left disabled:opacity-60 border-l-4 ${
                taskTab === 'install' ? 'border-l-cyan-500' : 'border-l-brand-500'
              }`}
            >
              {a.icon_url ? (
                <img src={a.icon_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold ${taskTab === 'install' ? 'bg-cyan-100 text-cyan-600' : 'bg-brand-100 text-brand-600'}`}>
                  {a.name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-bold">{a.name}</p>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${taskTab === 'install' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15'}`}>
                    {taskTab === 'install' ? '📲 Install' : '⭐ Review'}
                  </span>
                </div>
                <p className="truncate text-xs text-slate-400">{a.description}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{a.slots_left} slots</span>
                  <span className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{a.category}</span>
                  <span className="flex items-center gap-0.5"><Clock size={10} /> ~{a.est_time_min}m</span>
                  {taskTab === 'review' && a.two_step && <span className="rounded bg-violet-100 px-1 py-0.5 font-semibold text-violet-600 dark:bg-violet-500/15">2-Step</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`badge px-2 py-0.5 text-xs font-bold ${taskTab === 'install' ? 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'}`}>{rupee(a.reward_amount)}</span>
                {status ? (
                  <span className={`text-xs font-semibold capitalize ${status === 'approved' ? 'text-emerald-500' : status === 'rejected' ? 'text-rose-500' : 'text-amber-500'}`}>
                    {status}
                  </span>
                ) : (
                  <ChevronRight size={15} className={taskTab === 'install' ? 'text-cyan-500' : 'text-brand-500'} />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
