import { useEffect, useState } from 'react'
import { Target, Award, Trophy, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316']

const GOAL_OPTIONS = [100, 250, 500, 1000, 2500, 5000]
const goalLabel = (g) => (g >= 1000 ? `₹${g / 1000}K` : `₹${g}`)

const BADGES = [
  { key: 'first', label: '1 review', emoji: '⭐', need: (s) => s.approved >= 1 },
  { key: 'a5', label: '5 approved', emoji: '🌟', need: (s) => s.approved >= 5 },
  { key: 'a10', label: '10 approved', emoji: '🏅', need: (s) => s.approved >= 10 },
  { key: 'a25', label: '25 approved', emoji: '🥇', need: (s) => s.approved >= 25 },
  { key: 'a50', label: '50 approved', emoji: '👑', need: (s) => s.approved >= 50 },
  { key: 'e100', label: 'Earn ₹100', emoji: '💰', need: (s) => s.earned >= 100 },
  { key: 'e500', label: 'Earn ₹500', emoji: '💎', need: (s) => s.earned >= 500 },
  { key: 'e1000', label: 'Earn ₹1000', emoji: '🔥', need: (s) => s.earned >= 1000 },
  { key: 'r1', label: '1 referral', emoji: '🎯', need: (s) => s.referrals >= 1 },
  { key: 'r5', label: '5 referrals', emoji: '🤝', need: (s) => s.referrals >= 5 },
]

export default function Rewards() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [segments, setSegments] = useState([1, 2, 3, 1, 2, 4, 1, 3])
  const [goal, setGoal] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [spunToday, setSpunToday] = useState(false)
  const [won, setWon] = useState(null)
  const [stats, setStats] = useState({ approved: 0, earned: 0, referrals: 0 })
  const [avgReward, setAvgReward] = useState(10)
  const [board, setBoard] = useState([])
  const [period, setPeriod] = useState('week')

  useEffect(() => {
    ;(async () => {
      const { data: s } = await supabase.from('settings').select('key,value').in('key', ['spin_rewards', 'earning_goal'])
      s?.forEach((row) => {
        if (row.key === 'spin_rewards') setSegments(row.value)
        if (row.key === 'earning_goal') {
          const saved = Number(localStorage.getItem('earning_goal_target'))
          setGoal(saved && GOAL_OPTIONS.includes(saved) ? saved : Number(row.value))
        }
      })

      const today = new Date().toISOString().slice(0, 10)
      const { data: spin } = await supabase.from('spins').select('spin_date').eq('spin_date', today).maybeSingle()
      setSpunToday(!!spin)

      const { count } = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'approved')

      const { count: refCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by', profile?.id ?? '00000000-0000-0000-0000-000000000000')

      const { data: appsData } = await supabase.from('apps').select('reward_amount').eq('active', true)
      if (appsData?.length) {
        const avg = appsData.reduce((sum, a) => sum + Number(a.reward_amount), 0) / appsData.length
        setAvgReward(avg > 0 ? avg : 10)
      }

      setStats({ approved: count ?? 0, earned: Number(profile?.total_earned ?? 0), referrals: refCount ?? 0 })
    })()
  }, [profile?.total_earned, profile?.id])

  const pickGoal = (g) => {
    setGoal(g)
    localStorage.setItem('earning_goal_target', String(g))
  }

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name,total_earned')
        .order('total_earned', { ascending: false })
        .limit(10)
      setBoard(data ?? [])
    })()
  }, [period])

  const spin = async () => {
    if (spinning || spunToday) return
    setSpinning(true)
    setWon(null)
    try {
      const { data, error } = await supabase.rpc('do_daily_spin')
      if (error) throw error
      const n = segments.length
      const seg = 360 / n
      const target = 360 * 6 + (360 - (data.index * seg + seg / 2))
      setRotation(target)
      setTimeout(() => {
        setWon(data.amount)
        setSpunToday(true)
        setSpinning(false)
        refreshProfile()
        toast.success(`You won ${rupee(data.amount)}! 🎉`)
      }, 4200)
    } catch (err) {
      setSpinning(false)
      toast.error(niceError(err))
    }
  }

  const earned = Number(profile?.total_earned ?? 0)
  const pct = Math.min(100, Math.round((earned / goal) * 100))
  const reviewsToGo = Math.max(0, Math.ceil((goal - earned) / (avgReward || 10)))
  const earnedBadges = BADGES.filter((b) => b.need(stats))
  const lockedBadges = BADGES.filter((b) => !b.need(stats))
  const n = segments.length
  const seg = 360 / n

  return (
    <div className="space-y-4">
      {/* Spin — shown first / at top */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-600 via-purple-600 to-pink-500 p-3 shadow-lg shadow-purple-500/30">
        {/* decorative blobs */}
        <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-8 left-4 h-14 w-14 rounded-full bg-white/5 blur-2xl" />
        <p className="mb-0.5 text-center text-sm font-extrabold text-white">🎰 Daily Lucky Spin</p>
        <p className="mb-2 text-center text-[10px] text-white/70">{spunToday ? 'Come back tomorrow!' : 'Spin once a day to win rewards'}</p>
        {/* wheel + pointer */}
        <div className="relative mx-auto h-40 w-40">
          {/* pointer triangle */}
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-0.5 drop-shadow-md">
            <div className="h-0 w-0 border-x-[7px] border-t-[16px] border-x-transparent border-t-amber-400" />
          </div>
          <svg
            viewBox="0 0 200 200"
            className="h-full w-full drop-shadow-xl transition-transform duration-[4000ms] ease-out"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            {segments.map((amt, i) => {
              const a0 = (i * seg - 90) * (Math.PI / 180)
              const a1 = ((i + 1) * seg - 90) * (Math.PI / 180)
              const x0 = 100 + 100 * Math.cos(a0)
              const y0 = 100 + 100 * Math.sin(a0)
              const x1 = 100 + 100 * Math.cos(a1)
              const y1 = 100 + 100 * Math.sin(a1)
              const mid = (i * seg + seg / 2 - 90) * (Math.PI / 180)
              const tx = 100 + 62 * Math.cos(mid)
              const ty = 100 + 62 * Math.sin(mid)
              return (
                <g key={i}>
                  <path d={`M100,100 L${x0},${y0} A100,100 0 0,1 ${x1},${y1} Z`} fill={COLORS[i % COLORS.length]} stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
                  <text x={tx} y={ty} fill="#fff" fontSize="12" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${i * seg + seg / 2}, ${tx}, ${ty})`}>
                    ₹{amt}
                  </text>
                </g>
              )
            })}
            {/* center hub */}
            <circle cx="100" cy="100" r="16" fill="white" />
            <circle cx="100" cy="100" r="12" fill="#6366f1" />
          </svg>
          {/* center SPIN button */}
          <button
            onClick={spin}
            disabled={spinning || spunToday}
            className="absolute left-1/2 top-1/2 z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-[9px] font-extrabold text-brand-600 shadow-md transition active:scale-95 disabled:opacity-60"
          >
            {spinning ? '…' : spunToday ? 'DONE' : 'SPIN'}
          </button>
        </div>
        {/* result / status */}
        {won != null ? (
          <p className="mt-2 text-center text-sm font-extrabold text-yellow-300">🎉 You won {rupee(won)}!</p>
        ) : spunToday ? (
          <p className="mt-2 text-center text-[10px] text-white/60">Come back tomorrow for another spin!</p>
        ) : (
          <p className="mt-2 text-center text-xs font-semibold text-white/80">Tap SPIN to try your luck!</p>
        )}
      </div>

      {/* Earnings goal */}
      <div className="card py-3">
        <div className="mb-1 flex items-center gap-1.5">
          <Target size={14} className="text-brand-500" />
          <h3 className="text-sm font-bold">Earnings Goal</h3>
        </div>
        <div className="flex items-end justify-between">
          <p className="text-xl font-extrabold text-emerald-500">{rupee(earned)}</p>
          <p className="text-xs text-slate-400">Goal: {rupee(goal)}</p>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: pct + '%' }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="text-slate-400">{pct}% complete</span>
          {earned < goal && (
            <span className="font-semibold text-brand-600">~{reviewsToGo} reviews to {rupee(goal)}</span>
          )}
        </div>
        <div className="no-scrollbar mt-3 -mx-1 flex gap-2 overflow-x-auto px-1">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => pickGoal(g)}
              className={`chip shrink-0 ${goal === g ? 'border border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10' : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              {goalLabel(g)}
            </button>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card flex flex-col items-center gap-0.5 py-3">
          <TrendingUp size={15} className="text-brand-500" />
          <p className="text-lg font-extrabold">{stats.approved}</p>
          <p className="text-[10px] text-slate-400">Approved Reviews</p>
        </div>
        <div className="card flex flex-col items-center gap-0.5 py-3">
          <Award size={15} className="text-amber-500" />
          <p className="text-lg font-extrabold">{earnedBadges.length}</p>
          <p className="text-[10px] text-slate-400">Badges Earned</p>
        </div>
      </div>

      {/* Badges */}
      <div className="card py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Award size={14} className="text-amber-500" />
          <h3 className="text-sm font-bold">Badges</h3>
          <span className="text-[10px] text-slate-400">({earnedBadges.length} earned)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {earnedBadges.map((b) => (
            <div key={b.key} className="flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 dark:bg-brand-500/10">
              <span className="text-sm">{b.emoji}</span>
              <span className="text-[10px] font-semibold">{b.label}</span>
            </div>
          ))}
        </div>
        {lockedBadges.length > 0 && (
          <>
            <p className="mb-1.5 mt-2 text-[10px] font-medium text-slate-400">Locked</p>
            <div className="grid grid-cols-3 gap-1.5">
              {lockedBadges.map((b) => (
                <div key={b.key} className="flex items-center gap-1 rounded-lg bg-slate-50 px-1.5 py-1 text-[10px] text-slate-400 opacity-60 dark:bg-slate-800">
                  <span className="grayscale">{b.emoji}</span> {b.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Leaderboard */}
      <div className="card py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Trophy size={14} className="text-amber-500" />
            <h3 className="text-sm font-bold">Leaderboard</h3>
          </div>
          <div className="flex rounded-md bg-slate-100 p-0.5 text-[10px] dark:bg-slate-800">
            {['week', 'month'].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`rounded px-2 py-0.5 font-semibold capitalize ${period === p ? 'bg-brand-500 text-white' : 'text-slate-500'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {board.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">No data yet</p>
        ) : (
          <div className="space-y-1">
            {board.map((u, i) => (
              <div key={i} className="flex items-center justify-between rounded-md px-1.5 py-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-bold dark:bg-slate-800">{i + 1}</span>
                  {u.full_name || 'User'}
                </span>
                <span className="font-semibold text-emerald-500">{rupee(u.total_earned)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
