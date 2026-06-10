import { useState, useEffect, useCallback } from 'react'
import { X, Info, AlertTriangle, CheckCircle, Megaphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const typeConfig = {
  info:    { icon: Info,          cls: 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',       iconCls: 'text-blue-500' },
  warning: { icon: AlertTriangle, cls: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20',   iconCls: 'text-amber-500' },
  success: { icon: CheckCircle,   cls: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20', iconCls: 'text-emerald-500' },
  promo:   { icon: Megaphone,     cls: 'bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20', iconCls: 'text-violet-500' },
}

// localStorage key storing set of dismissed announcement IDs for instant hide
const LS_KEY = 'dismissed_announcements'

function getLocalDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')) } catch { return new Set() }
}
function addLocalDismissed(id) {
  try {
    const s = getLocalDismissed()
    s.add(id)
    localStorage.setItem(LS_KEY, JSON.stringify([...s]))
  } catch {}
}

export default function AnnouncementBanner() {
  const { session } = useAuth()
  const [announcement, setAnnouncement] = useState(null) // only ONE latest
  const [visible, setVisible] = useState(false)

  const fetchLatest = useCallback(async () => {
    if (!session?.user) return

    // Fetch the single most recent active announcement
    const { data: anns } = await supabase
      .from('announcements')
      .select('id, title, body, type, priority, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!anns) return

    // Check instantly via localStorage first (survives login/logout on same device)
    const localDismissed = getLocalDismissed()
    if (localDismissed.has(anns.id)) return

    // Also check DB-persisted dismissals (cross-device support)
    const { data: dbDismissed } = await supabase
      .from('announcement_dismissals')
      .select('announcement_id')
      .eq('user_id', session.user.id)
      .eq('announcement_id', anns.id)
      .maybeSingle()

    if (dbDismissed) {
      // Save to localStorage too so next load is instant
      addLocalDismissed(anns.id)
      return
    }

    setAnnouncement(anns)
    setVisible(true)
  }, [session])

  useEffect(() => { fetchLatest() }, [fetchLatest])

  const dismiss = async () => {
    if (!announcement) return
    const id = announcement.id

    // 1. Hide immediately — no flicker
    setVisible(false)
    setTimeout(() => setAnnouncement(null), 300)

    // 2. Persist to localStorage — instant next time, even after logout/login same device
    addLocalDismissed(id)

    // 3. Persist to DB — cross-device permanent dismissal
    await supabase
      .from('announcement_dismissals')
      .upsert(
        { user_id: session.user.id, announcement_id: id },
        { onConflict: 'user_id,announcement_id' }
      )
  }

  if (!announcement || !visible) return null

  const cfg = typeConfig[announcement.type] || typeConfig.info
  const Icon = cfg.icon

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 mb-3 transition-all duration-300 ${cfg.cls} ${
        visible ? 'opacity-100 translate-y-0 animate-slide-up' : 'opacity-0 -translate-y-1'
      }`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${cfg.iconCls}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold leading-tight">{announcement.title}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{announcement.body}</p>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
