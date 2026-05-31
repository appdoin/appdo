import { useState, useEffect, useCallback } from 'react'
import { X, Info, AlertTriangle, CheckCircle, Megaphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const typeConfig = {
  info: { icon: Info, cls: 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20' },
  warning: { icon: AlertTriangle, cls: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20' },
  success: { icon: CheckCircle, cls: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20' },
  promo: { icon: Megaphone, cls: 'bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20' },
}

const iconColor = { info: 'text-blue-500', warning: 'text-amber-500', success: 'text-emerald-500', promo: 'text-violet-500' }

export default function AnnouncementBanner() {
  const { session } = useAuth()
  const [announcements, setAnnouncements] = useState([])

  const fetchAnnouncements = useCallback(async () => {
    if (!session?.user) return
    const [{ data: anns }, { data: dismissals }] = await Promise.all([
      supabase.from('announcements').select('id, title, body, type, priority').eq('active', true).order('created_at', { ascending: false }).limit(5),
      supabase.from('announcement_dismissals').select('announcement_id').eq('user_id', session.user.id),
    ])
    const dismissed = new Set((dismissals || []).map((d) => d.announcement_id))
    setAnnouncements((anns || []).filter((a) => !dismissed.has(a.id)))
  }, [session])

  useEffect(() => { fetchAnnouncements() }, [fetchAnnouncements])

  const dismiss = async (id) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('announcement_dismissals').upsert({ user_id: session.user.id, announcement_id: id })
  }

  if (announcements.length === 0) return null

  return (
    <div className="space-y-2 mb-3">
      {announcements.map((ann) => {
        const cfg = typeConfig[ann.type] || typeConfig.info
        const Icon = cfg.icon
        return (
          <div key={ann.id} className={`flex items-start gap-2 rounded-xl border p-3 animate-slide-up ${cfg.cls}`}>
            <Icon size={16} className={`mt-0.5 shrink-0 ${iconColor[ann.type] || 'text-blue-500'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold leading-tight">{ann.title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{ann.body}</p>
            </div>
            <button onClick={() => dismiss(ann.id)} className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
