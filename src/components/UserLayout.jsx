import { useEffect, useRef } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { Home, Trophy, History, Wallet, User, Sun, Moon, Bell, HelpCircle, Gift } from 'lucide-react'
import { playClick } from '../hooks/useClickSound'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationsContext'
import { useTheme } from '../hooks/useTheme'
import { rupee } from '../lib/format'
import { checkTelegramMembership, daysSince, RECHECK_INTERVAL_DAYS } from '../lib/telegram'
import TelegramJoinModal from './TelegramJoinModal'
import FloatingTelegram from './FloatingTelegram'

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
  const { profile, refreshProfile } = useAuth()
  const { unreadCount } = useNotifications()
  const { dark, toggle } = useTheme()
  const { pathname } = useLocation()
  const title = TITLES[pathname] || (pathname.startsWith('/app/') ? '' : pathname.startsWith('/install-task/') ? '' : 'RewardReview')

  // Silent periodic re-check: if a previously-verified user has since left
  // the Telegram channel, our backend (Bot API getChatMember) will flip
  // telegram_verified back to false so the reminder reappears. This is a
  // safety net in case the real-time leave webhook was ever missed, run at
  // most once per ~15 days per user.
  const recheckRanRef = useRef(false)
  useEffect(() => {
    if (!profile?.id || !profile?.telegram_verified || recheckRanRef.current) return
    const staleFor = daysSince(profile.telegram_last_checked_at)
    if (staleFor < RECHECK_INTERVAL_DAYS) return
    recheckRanRef.current = true
    checkTelegramMembership()
      .then((res) => {
        if (res && res.verified !== profile.telegram_verified) refreshProfile()
      })
      .catch(() => { /* non-blocking */ })
  }, [profile?.id, profile?.telegram_verified, profile?.telegram_last_checked_at, refreshProfile])

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
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 dark:bg-[#0a0e1a]">
      {/* Telegram join popup (shown once after login) */}
      <TelegramJoinModal userId={profile?.id} />

      {/* Persistent floating Telegram icon until the backend verifies the join */}
      <FloatingTelegram userId={profile?.id} verified={profile?.telegram_verified} />

      {/* Starry dark mode background */}
      <div className="stars-bg" />
      <div className="shooting-star" />

      {/* Floral / vine decorations (light + dark) */}
      <div className="floral-bg" />
      <span className="petal p1" />
      <span className="petal p2" />
      <span className="petal p3" />
      <span className="petal p4" />

      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200/30 bg-white/70 px-3 py-2 backdrop-blur-md dark:border-white/5 dark:bg-[#0a0e1a]/60">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            {initials}
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">{title}</h1>
            <p className="text-xs text-slate-400">{profile?.full_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <NavLink to="/referral" className="grid h-7 w-7 place-items-center rounded-full border border-violet-200 text-violet-500 dark:border-violet-700">
            <Gift size={13} />
          </NavLink>
          <NavLink to="/help" className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 dark:border-slate-700">
            <HelpCircle size={13} />
          </NavLink>
          <button onClick={toggle} className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 dark:border-slate-700">
            {dark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <NavLink to="/notifications" className="relative grid h-7 w-7 place-items-center rounded-full border border-slate-200 dark:border-slate-700">
            <Bell size={13} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/wallet"
            className="badge bg-emerald-50 text-emerald-600 px-2 py-1 text-xs dark:bg-emerald-500/10 dark:text-emerald-400"
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

      {/* Bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-slate-200/30 bg-white/75 px-2 py-2 backdrop-blur-md dark:border-white/5 dark:bg-[#0a0e1a]/65">
        <div className="flex items-center justify-around">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'rounded-full bg-brand-50 p-1.5 dark:bg-brand-500/10' : 'p-1.5'}>
                    <Icon size={20} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
