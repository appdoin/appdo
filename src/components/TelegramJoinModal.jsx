import { useEffect, useState } from 'react'
import { Send, X, Check, Users } from 'lucide-react'

export const TELEGRAM_LINK = 'https://t.me/earnbyappdo'

/**
 * A polished welcome popup that invites the user to join the Telegram channel.
 * Shown once per user after login. The user can either join or skip.
 */
export default function TelegramJoinModal({ userId }) {
    const [open, setOpen] = useState(false)

    const storageKey = userId ? `tg_join_seen_${userId}` : 'tg_join_seen'

    useEffect(() => {
        if (!userId) return
        let dismissed = false
        try {
            dismissed = localStorage.getItem(storageKey) === '1'
        } catch { /* ignore */ }
        if (!dismissed) {
            const t = setTimeout(() => setOpen(true), 900)
            return () => clearTimeout(t)
        }
    }, [userId, storageKey])

    const dismiss = () => {
        try {
            localStorage.setItem(storageKey, '1')
        } catch { /* ignore */ }
        setOpen(false)
    }

    const join = () => {
        window.open(TELEGRAM_LINK, '_blank', 'noopener,noreferrer')
        dismiss()
    }

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tg-modal-title"
        >
            {/* Backdrop */}
            <button
                aria-label="Close"
                onClick={dismiss}
                className="absolute inset-0 h-full w-full bg-slate-900/60 backdrop-blur-sm animate-[fade-in_0.25s_ease-out_both]"
            />

            {/* Card */}
            <div className="relative w-full max-w-sm animate-[rise_0.4s_ease-out_both] overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
                {/* Close (X) */}
                <button
                    onClick={dismiss}
                    aria-label="Close"
                    className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/5 text-slate-500 transition hover:bg-black/10 dark:bg-white/10 dark:text-slate-300"
                >
                    <X size={16} />
                </button>

                {/* Header with Telegram gradient */}
                <div className="relative overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600 px-6 pb-8 pt-9 text-center text-white">
                    <div className="pointer-events-none absolute -left-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                    <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/30 backdrop-blur">
                        <Send size={38} className="-ml-1 drop-shadow" />
                    </div>
                    <h2 id="tg-modal-title" className="relative mt-4 text-xl font-extrabold leading-tight">
                        Join our Telegram!
                    </h2>
                    <p className="relative mt-1 text-sm text-white/90">
                        Get instant updates, new earning tasks &amp; payout alerts.
                    </p>
                </div>

                {/* Body */}
                <div className="space-y-4 px-6 py-6">
                    <ul className="space-y-2.5 text-sm">
                        <li className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15">
                                <Check size={14} />
                            </span>
                            Be first to know about high-paying apps
                        </li>
                        <li className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15">
                                <Check size={14} />
                            </span>
                            Faster support &amp; withdrawal help
                        </li>
                        <li className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15">
                                <Check size={14} />
                            </span>
                            Exclusive bonuses &amp; giveaways
                        </li>
                    </ul>

                    <button
                        onClick={join}
                        className="btn w-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 text-white shadow-md shadow-blue-500/30 hover:from-sky-600 hover:to-blue-700"
                    >
                        <Send size={17} /> Join Telegram Channel
                    </button>

                    <button
                        onClick={dismiss}
                        className="flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                    >
                        Skip for now
                    </button>

                    <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
                        <Users size={12} /> Join thousands of earners already inside
                    </p>
                </div>
            </div>
        </div>
    )
}
