import { useEffect } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { Home, Trophy, History, Wallet, User, Sun, Moon, Bell, HelpCircle, Gift } from 'lucide-react'
import { playClick } from '../hooks/useClickSound'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationsContext'
import { useTheme } from '../hooks/useTheme'
import { rupee } from '../lib/format'

const TITLES = {
  '/': 'Available Apps',
  '/rewards': 'Rewards',
  '/history': 'Review History',
  '/wallet': 'Wallet',
  '/profile': 'Profile',
  '/notifications': 'Notifications',
  '/referral': 'Refer & Earn',
  '/help': 'Help & Support',
}

const NAV = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/rewards', icon: Trophy, label: 'Rewards' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/profile', icon: User, label: 'Profile' },
]

export default function UserLayout() {
  const { profile } = useAuth()
  const { unreadCount } = useNotifications()
  const { dark, toggle } = useTheme()
  const { pathname } = useLocation()
  const title = TITLES[pathname] || (pathname.startsWith('/app/') ? '' : pathname.startsWith('/install-task/') ? '' : 'RewardReview')

  // Global click sound on all buttons & interactive elements
  useEffect(() => {
    const handler = (e) => {
      const el = e.target.closest('button, a, [role="button"]')
      if (el) playClick()
    }
    document.addEventListener('pointerdown', handler, { passive: true })
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const initials = (profile?.full_name || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 dark:bg-none dark:bg-[#070b14]">
      {/* Ambient light blobs (light mode) */}
      <div className="ambient-bg" />

      {/* Starry dark mode background */}
      <div className="stars-bg" />
      <div className="shooting-star" />

      {/* Floral / vine decorations (light + dark) */}
      <div className="floral-bg" />
      <span className="petal p1" />
      <span className="petal p2" />
      <span className="petal p3" />
      <span className="petal p4" />

      {/* Header — Frosted Glass */}
      <header className="glass-nav glass-shine sticky top-0 z-30 flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-sm font-bold text-white shadow-sm shadow-brand-500/30">
            {initials}
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">{title}</h1>
            <p className="text-[11px] text-slate-400">{profile?.full_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <NavLink to="/referral" className="grid h-8 w-8 place-items-center rounded-xl border border-violet-200/60 bg-violet-50/50 text-violet-500 transition hover:bg-violet-100/60 dark:border-violet-700/40 dark:bg-violet-500/10">
            <Gift size={14} />
          </NavLink>
          <NavLink to="/help" className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200/60 bg-white/40 transition hover:bg-white/60 dark:border-slate-700/40 dark:bg-slate-800/40">
            <HelpCircle size={14} />
          </NavLink>
          <button onClick={toggle} className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200/60 bg-white/40 transition hover:bg-white/60 dark:border-slate-700/40 dark:bg-slate-800/40">
            {dark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-500" />}
          </button>
          <NavLink to="/notifications" className="relative grid h-8 w-8 place-items-center rounded-xl border border-slate-200/60 bg-white/40 transition hover:bg-white/60 dark:border-slate-700/40 dark:bg-slate-800/40">
            <Bell size={14} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm shadow-rose-500/30">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/wallet"
            className="flex items-center gap-1 rounded-xl bg-emerald-50/70 px-2.5 py-1.5 text-xs font-bold text-emerald-600 border border-emerald-200/50 transition hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
          >
            <Wallet size={12} /> {rupee(profile?.wallet_balance)}
          </NavLink>
        </div>
      </header>

      {/* Page content */}
      <main className={`relative z-10 min-w-0 flex-1 px-4 ${pathname === '/' ? 'overflow-hidden pb-20 pt-3' : 'py-4 pb-24'}`}>
        <div className={pathname === '/' ? 'h-full' : 'animate-stagger'}>
          <Outlet />
        </div>
      </main>

      {/* Bottom navigation — Frosted Glass */}
      <nav className="glass-nav glass-shine fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t px-2 py-2" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-around">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`rounded-xl p-1.5 transition ${isActive ? 'bg-brand-500/10 shadow-sm shadow-brand-500/10 dark:bg-brand-500/15' : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  </span>
                  <span className={isActive ? 'font-semibold' : ''}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
