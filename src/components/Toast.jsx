import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

const ICONS = {
  success: <CheckCircle2 size={18} className="text-emerald-500" />,
  error: <XCircle size={18} className="text-rose-500" />,
  info: <Info size={18} className="text-brand-500" />,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const toast = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-slate-100 animate-pop max-w-sm w-full dark:bg-slate-800 dark:ring-slate-700"
          >
            {ICONS[t.type]}
            <span className="text-sm font-medium">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
