import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, CheckCheck, IndianRupee, Star, AlertCircle, Gift, Trash2, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useToast } from '../../components/Toast'

const iconMap = {
  review_approved: { Icon: CheckCircle2, color: 'text-emerald-500' },
  review_rejected: { Icon: AlertCircle, color: 'text-rose-500' },
  withdrawal_completed: { Icon: IndianRupee, color: 'text-emerald-500' },
  withdrawal_failed: { Icon: AlertCircle, color: 'text-rose-500' },
  new_app: { Icon: Gift, color: 'text-brand-500' },
  system: { Icon: Star, color: 'text-amber-500' },
}

const bgMap = {
  review_approved: 'bg-emerald-50 dark:bg-emerald-500/10',
  review_rejected: 'bg-rose-50 dark:bg-rose-500/10',
  withdrawal_completed: 'bg-emerald-50 dark:bg-emerald-500/10',
  withdrawal_failed: 'bg-rose-50 dark:bg-rose-500/10',
  new_app: 'bg-brand-50 dark:bg-brand-500/10',
  system: 'bg-amber-50 dark:bg-amber-500/10',
}

export default function Notifications() {
  const { session } = useAuth()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, refreshNotifications } = useNotifications()
  const toast = useToast()
  const [markingAll, setMarkingAll] = useState(false)

  const handleMarkAll = async () => {
    setMarkingAll(true)
    await markAllAsRead()
    toast.success('All marked as read')
    setMarkingAll(false)
  }

  const deleteNotification = async (id) => {
    try {
      await supabase.from('notifications').delete().eq('id', id)
      refreshNotifications()
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up ✓'}
        </p>
        {unreadCount > 0 && (
          <button onClick={handleMarkAll} disabled={markingAll} className="btn-soft flex items-center gap-1 text-xs">
            <CheckCheck size={12} />
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="card text-center py-10">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 dark:bg-slate-800">
            <CheckCircle2 size={24} className="text-slate-400" />
          </div>
          <p className="font-bold text-sm">No notifications yet</p>
          <p className="text-xs text-slate-400 mt-1">We'll notify you when something happens</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const { Icon, color } = iconMap[n.type] || { Icon: Star, color: 'text-slate-400' }
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markAsRead(n.id)}
                className={`card flex gap-3 items-start cursor-pointer transition ${
                  n.is_read ? 'opacity-60' : bgMap[n.type] || ''
                }`}
              >
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${n.is_read ? 'bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'}`}>
                  <Icon size={18} className={color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-tight ${n.is_read ? 'font-medium' : 'font-bold'}`}>{n.title}</p>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{n.message}</p>
                  {n.data?.reward && (
                    <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/10">
                      +₹{n.data.reward}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNotification(n.id) }}
                  className="shrink-0 p-1 text-slate-300 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom back */}
      <button onClick={() => window.history.back()} className="btn-soft w-full py-2.5 text-sm">
        <ArrowLeft size={15} /> Go Back
      </button>
    </div>
  )
}
