import { useEffect, useState } from 'react'
import { Send, Check, Users, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
    buildBotDeepLink,
    checkTelegramMembership,
    TELEGRAM_BOT_CONFIGURED,
    TELEGRAM_CHANNEL_LINK,
} from '../lib/telegram'

// Kept for backwards compatibility with other pages that import this.
export const TELEGRAM_LINK = TELEGRAM_CHANNEL_LINK

/**
 * A polished welcome popup that invites the user to join the Telegram
 * channel. Shown once per user after login, and again later if our backend
 * detects they left the channel (see FloatingTelegram's periodic recheck).
 *
 * Membership is never assumed from a click — "Join Telegram Channel" opens
 * the bot deep link (which lets our webhook link + verify instantly), and
 * "I already joined" triggers an explicit server-side recheck via the
 * telegram-check Edge Function (real Bot API getChatMember call).
 */
export default function TelegramJoinModal({ userId }) {
    const { profile, refreshProfile } = useAuth()
    const [open, setOpen] = useState(false)
    const [checking, setChecking] = useState(false)
    const [notYet, setNotYet] = useState(false)

    const storageKey = userId ? `tg_join_seen_${userId}` : 'tg_join_seen'

    useEffect(() => {
        if (!userId) return

        // Honor-based fallback (no verification bot configured yet): hide once
        // the user has locally marked themselves as joined.
        if (!TELEGRAM_BOT_CONFIGURED) {
            let joinedLocal = false
            try { joinedLocal = localStorage.getItem(`tg_joined_local_${userId}`) === '1' } catch { /* ignore */ }
            if (joinedLocal) { setOpen(false); return }
            let seen = false
            let pending = false
            try {
                seen = localStorage.getItem(storageKey) === '1'
                pending = sessionStorage.getItem('tg_prompt_pending') === '1'
            } catch { /* ignore */ }
            if (pending || !seen) {
                const t = setTimeout(() => setOpen(true), 800)
                return () => clearTimeout(t)
            }
            return
        }

        const lastKnownKey = `tg_last_verified_${userId}`
        let lastKnownVerified = null
        try {
            lastKnownVerified = localStorage.getItem(lastKnownKey)
        } catch { /* ignore */ }

        // Already server-verified — nothing to show, just remember the state.
        if (profile?.telegram_verified) {
            try { localStorage.setItem(lastKnownKey, '1') } catch { /* ignore */ }
            setOpen(false)
            return
        }

        // If the user was previously verified and now isn't, our backend
        // detected they left the channel — clear the "seen" dismissal so
        // the reminder comes back, and reset the remembered state.
        if (lastKnownVerified === '1') {
            try {
                localStorage.removeItem(storageKey)
                localStorage.setItem(lastKnownKey, '0')
            } catch { /* ignore */ }
        }

        let pending = false
        let seen = false
        try {
            pending = sessionStorage.getItem('tg_prompt_pending') === '1'
            seen = localStorage.getItem(storageKey) === '1'
        } catch { /* ignore */ }
        // Show right after a fresh sign-in, the first time we ever see this
        // user, or right after we detected they left the channel.
        if (pending || !seen) {
            const t = setTimeout(() => setOpen(true), 800)
            return () => clearTimeout(t)
        }
    }, [userId, storageKey, profile?.telegram_verified])

    const dismiss = () => {
        try {
            localStorage.setItem(storageKey, '1')
            sessionStorage.removeItem('tg_prompt_pending')
        } catch { /* ignore */ }
        setOpen(false)
        setNotYet(false)
    }

    const join = () => {
        // Open Telegram. The popup intentionally stays open — it only closes
        // when the user confirms via "I already joined".
        window.open(buildBotDeepLink(userId), '_blank', 'noopener,noreferrer')
    }

    const alreadyJoined = async () => {
        // Honor-based fallback: no bot to verify against, so trust the tap.
        if (!TELEGRAM_BOT_CONFIGURED) {
            try { localStorage.setItem(`tg_joined_local_${userId}`, '1') } catch { /* ignore */ }
            dismiss()
            return
        }

        setChecking(true)
        setNotYet(false)
        try {
            const result = await checkTelegramMembership()
            if (result?.verified) {
                await refreshProfile()
                dismiss()
            } else if (result?.reason === 'NOT_LINKED') {
                // We don't know their Telegram id yet — send them through the bot first.
                setNotYet(true)
            } else {
                setNotYet(true)
            }
        } catch {
            setNotYet(true)
        } finally {
            setChecking(false)
        }
    }

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tg-modal-title"
        >
            {/* Backdrop — non-dismissable; the popup only closes via "I already joined" */}
            <div
                className="absolute inset-0 h-full w-full bg-slate-900/60 backdrop-blur-sm animate-[fade-in_0.25s_ease-out_both]"
            />

            {/* Card */}
            <div className="relative w-full max-w-sm animate-[rise_0.4s_ease-out_both] overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
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

                    {notYet && (
                        <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                            We couldn't confirm your membership yet. Tap "Join Telegram Channel" below first, then come back and try again.
                        </div>
                    )}

                    <button
                        onClick={join}
                        className="btn w-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 text-white shadow-md shadow-blue-500/30 hover:from-sky-600 hover:to-blue-700"
                    >
                        <Send size={17} /> Join Telegram Channel
                    </button>

                    <button
                        onClick={alreadyJoined}
                        disabled={checking}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        {checking ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        {checking ? 'Checking…' : 'I already joined'}
                    </button>

                    <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
                        <Users size={12} /> Join thousands of earners already inside
                    </p>
                </div>
            </div>
        </div>
    )
}
