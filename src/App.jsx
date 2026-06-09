import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { NotificationsProvider } from './context/NotificationsContext'

import AuthPage from './pages/auth/AuthPage'
import ResetPassword from './pages/auth/ResetPassword'
import UpdatePassword from './pages/auth/UpdatePassword'
import UserLayout from './components/UserLayout'
import Home from './pages/user/Home'
import AppDetail from './pages/user/AppDetail'
import Rewards from './pages/user/Rewards'
import History from './pages/user/History'
import Wallet from './pages/user/Wallet'
import Profile from './pages/user/Profile'
import Notifications from './pages/user/Notifications'
import Referral from './pages/user/Referral'
import HelpSupport from './pages/user/HelpSupport'
import InstallTaskDetail from './pages/user/InstallTaskDetail'

function Splash() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
    </div>
  )
}

function Protected({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <NotificationsProvider userId={session.user.id}>{children}</NotificationsProvider>
}

export default function App() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" /> : <AuthPage mode="login" />} />
      <Route path="/signup" element={session ? <Navigate to="/" /> : <AuthPage mode="signup" />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/update-password" element={<UpdatePassword />} />

      {/* User panel */}
      <Route element={<Protected><UserLayout /></Protected>}>
        <Route path="/" element={<Home />} />
        <Route path="/app/:id" element={<AppDetail />} />
        <Route path="/install-task/:id" element={<InstallTaskDetail />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/history" element={<History />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/referral" element={<Referral />} />
        <Route path="/help" element={<HelpSupport />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
