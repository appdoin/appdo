import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

const NotificationsCtx = createContext({
  notifications: [],
  unreadCount: 0,
  loading: true,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  refreshNotifications: async () => {},
})

export const useNotifications = () => useContext(NotificationsCtx)

export function NotificationsProvider({ children, userId }) {
  const toast = useToast()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications])

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setNotifications(data || [])
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  const markAsRead = useCallback(async (id) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return

    fetchNotifications()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new
          setNotifications((prev) => [n, ...prev])
          // Show toast for new notifications
          if (n.type === 'review_approved' || n.type === 'withdrawal_completed') {
            toast.success(n.title || n.message)
          } else if (n.type === 'review_rejected' || n.type === 'withdrawal_failed') {
            toast.error(n.title || n.message)
          } else {
            toast.info?.(n.title || n.message) || toast.success(n.title || n.message)
          }
        },
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [userId, fetchNotifications, toast])

  return (
    <NotificationsCtx.Provider value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead, refreshNotifications: fetchNotifications }}>
      {children}
    </NotificationsCtx.Provider>
  )
}
