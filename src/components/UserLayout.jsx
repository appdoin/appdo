import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { Home, Trophy, History, Wallet, User, Sun, Moon, Bell } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../hooks/useTheme'
import { rupee } from '../lib/format'

const TITLES = {
  '/': 'Available Apps',
  '/rewards': 'Rewards',
  '/history': 'Review History',
  '/wallet': 'Wallet',
  '/profile': 'Profile',
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
  const { dark, toggle } = useTheme()
  const { pathname } = useLocation()
  const title = TITLES[pathname] || (pathname.startsWith('/app/') ? '' : 'RewardReview')

  const initials = (profile?.full_name || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 font-bold text-white">
            {initials}
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            <p className="text-xs text-slate-400">{profile?.full_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 dark:border-slate-700">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 dark:border-slate-700">
            <Bell size={16} />
          </button>
          <NavLink
            to="/wallet"
            className="badge bg-emerald-50 text-emerald-600 px-3 py-2 dark:bg-emerald-500/10 dark:text-emerald-400"
          >
            <Wallet size={14} /> {rupee(profile?.wallet_balance)}
          </NavLink>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 py-4 pb-24 animate-fade-in">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center justify-around">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'
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
