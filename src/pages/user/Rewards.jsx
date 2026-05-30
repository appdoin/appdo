import { useEffect, useState } from 'react'
import { Target, Award, Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { rupee, niceError } from '../../lib/format'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316']

const BADGES = [
  { key: 'first', label: 'First Review', emoji: '⭐', need: (s) => s.approved >= 1 },
  { key: 'a5', label: '5 approved', emoji: '🌟', need: (s) => s.approved >= 5 },
  { key: 'a10', label: '10 approved', emoji: '🏅', need: (s) => s.approved >= 10 },
  { key: 'a25', label: '25 approved', emoji: '🥇', need: (s) => s.approved >= 25 },
  { key: 'a50', label: '50 approved', emoji: '👑', need: (s) => s.approved >= 50 },
  { key: 'e100', label: 'Earn ₹100', emoji: '💰', need: (s) => s.earned >= 100 },
  { key: 'e500', label: 'Earn ₹500', emoji: '💎', need: (s) => s.earned >= 500 },
  { key: 'e1000', label: 'Earn ₹1000', emoji: '🔥', need: (s) => s.earned >= 1000 },
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
  const [stats, setStats] = useState({ approved: 0, earned: 0 })
  const [board, setBoard] = useState([])
  const [period, setPeriod] = useState('week')

  useEffect(() => {
    ;(async () => {
      const { data: s } = await supabase.from('settings').select('key,value').in('key', ['spin_rewards', 'earning_goal'])
      s?.forEach((row) => {
        if (row.key === 'spin_rewards') setSegments(row.value)
        if (row.key === 'earning_goal') setGoal(Number(row.value))
      })

      const today = new Date().toISOString().slice(0, 10)
      const { data: spin } = await supabase.from('spins').select('spin_date').eq('spin_date', today).maybeSingle()
      setSpunToday(!!spin)

      const { count } = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'approved')
      setStats({ approved: count ?? 0, earned: Number(profile?.total_earned ?? 0) })
    })()
  }, [profile?.total_earned])

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
  const earnedBadges = BADGES.filter((b) => b.need(stats))
  const lockedBadges = BADGES.filter((b) => !b.need(stats))
  const n = segments.length
  const seg = 360 / n

  return (
    <div className="space-y-4">
      {/* Earnings goal */}
      <div className="card">
        <div className="mb-2 flex items-center gap-2">
          <Target size={18} className="text-brand-500" />
          <h3 className="font-bold">Earnings Goal</h3>
        </div>
        <div className="flex items-end justify-between">
          <p className="text-3xl font-extrabold text-emerald-500">{rupee(earned)}</p>
          <p className="text-sm text-slate-400">Goal: {rupee(goal)}</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: pct + '%' }} />
        </div>
        <p className="mt-1 text-xs text-slate-400">{pct}% complete</p>
      </div>

      {/* Badges */}
      <div className="card">
        <div className="mb-3 flex items-center gap-2">
          <Award size={18} className="text-amber-500" />
          <h3 className="font-bold">Achievement Badges</h3>
          <span className="text-xs text-slate-400">({earnedBadges.length} earned)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {earnedBadges.map((b) => (
            <div key={b.key} className="flex flex-col items-center gap-1 rounded-xl bg-brand-50 px-4 py-2 dark:bg-brand-500/10">
              <span className="text-2xl">{b.emoji}</span>
              <span className="text-xs font-semibold">{b.label}</span>
            </div>
          ))}
        </div>
        {lockedBadges.length > 0 && (
          <>
            <p className="mb-2 mt-3 text-xs font-medium text-slate-400">Locked Badges</p>
            <div className="grid grid-cols-3 gap-2">
              {lockedBadges.map((b) => (
                <div key={b.key} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-2 text-xs text-slate-400 opacity-60 dark:bg-slate-800">
                  <span className="grayscale">{b.emoji}</span> {b.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Spin */}
      <div className="card overflow-hidden bg-gradient-to-b from-violet-50 to-pink-50 dark:from-slate-900 dark:to-slate-900">
        <p className="mb-3 text-center text-lg font-extrabold text-brand-600">🎰 Daily Lucky Spin ✨</p>
        <div className="relative mx-auto h-64 w-64">
          {/* pointer */}
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
            <div className="h-0 w-0 border-x-8 border-t-[18px] border-x-transparent border-t-amber-400" />
          </div>
          <svg
            viewBox="0 0 200 200"
            className="h-full w-full drop-shadow-lg transition-transform duration-[4000ms] ease-out"
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
                  <path d={`M100,100 L${x0},${y0} A100,100 0 0,1 ${x1},${y1} Z`} fill={COLORS[i % COLORS.length]} />
                  <text x={tx} y={ty} fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${i * seg + seg / 2}, ${tx}, ${ty})`}>
                    ₹{amt}
                  </text>
                </g>
              )
            })}
            <circle cx="100" cy="100" r="14" fill="#fff" />
          </svg>
          <button
            onClick={spin}
            disabled={spinning || spunToday}
            className="absolute left-1/2 top-1/2 z-10 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-xs font-bold text-brand-600 shadow-md disabled:opacity-60"
          >
            {spunToday ? 'DONE' : 'SPIN'}
          </button>
        </div>
        {won != null && <p className="mt-3 text-center text-lg font-extrabold text-emerald-500">🎉 You won {rupee(won)}!</p>}
        {spunToday && won == null && <p className="mt-3 text-center text-sm text-slate-400">Come back tomorrow for another spin!</p>}
      </div>

      {/* Leaderboard */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber-500" />
            <h3 className="font-bold">Leaderboard</h3>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
            {['week', 'month'].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`rounded-md px-3 py-1 font-semibold capitalize ${period === p ? 'bg-brand-500 text-white' : 'text-slate-500'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {board.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No data yet</p>
        ) : (
          <div className="space-y-2">
            {board.map((u, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-bold dark:bg-slate-800">{i + 1}</span>
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
