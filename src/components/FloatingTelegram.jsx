import { useEffect, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
    buildBotDeepLink,
    checkTelegramMembership,
    TELEGRAM_BOT_CONFIGURED,
    TELEGRAM_CHANNEL_LINK,
} from '../lib/telegram'
import { useAuth } from '../context/AuthContext'

/**
 * A subtle floating Telegram button pinned to the right edge, vertically
 * centered so it never covers the header, bottom nav or main actions.
 *
 * When a verification bot IS configured (see src/lib/telegram.js), this icon
 * only disappears once our backend (Telegram Bot API `getChatMember`)
 * confirms real channel membership and sets `profiles.telegram_verified`.
 *
 * When NO bot is configured yet, real membership can't be verified from the
 * browser, so we fall back to an honor-based flow: tapping the icon opens
 * the channel and hides the icon locally for that user.
 */
export default function FloatingTelegram({ userId, verified }) {
    const { refreshProfile } = useAuth()
    const localKey = userId ? `tg_joined_local_${userId}` : 'tg_joined_local'

    const readInitial = () => {
        if (TELEGRAM_BOT_CONFIGURED) return !!verified
        try {
            return localStorage.getItem(localKey) === '1'
        } catch {
            return false
        }
    }

    const [isVerified, setIsVerified] = useState(readInitial)
    const [checking, setChecking] = useState(false)

    // Keep in sync with the profile prop (source of truth is the DB) when a
    // real bot is configured.
    useEffect(() => {
        if (TELEGRAM_BOT_CONFIGURED) setIsVerified(!!verified)
    }, [verified])

    // Live updates: if the user runs /verify in Telegram, or leaves the
    // channel, while the app is still open, reflect it immediately.
    useEffect(() => {
        if (!userId || !TELEGRAM_BOT_CONFIGURED) return
        const channel = supabase
            .channel(`tg-verify:${userId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
                (payload) => {
                    if (typeof payload.new?.telegram_verified === 'boolean') {
                        setIsVerified(payload.new.telegram_verified)
                    }
                },
            )
            .subscribe()

        return () => channel.unsubscribe()
    }, [userId])

    const handleClick = async () => {
        // Honor-based fallback when no verification bot exists yet.
        if (!TELEGRAM_BOT_CONFIGURED) {
            window.open(TELEGRAM_CHANNEL_LINK, '_blank', 'noopener,noreferrer')
            try { localStorage.setItem(localKey, '1') } catch { /* ignore */ }
            setIsVerified(true)
            return
        }

        setChecking(true)
        try {
            // Silently re-check first, in case they already joined & linked
            // earlier (e.g. via the welcome popup) and just haven't refreshed.
            const res = await checkTelegramMembership()
            if (res?.verified) {
                setIsVerified(true)
                refreshProfile()
                return
            }
        } catch { /* non-blocking */ } finally {
            setChecking(false)
        }
        // Not verified yet — open the bot deep link so the webhook can link
        // this Telegram account and verify membership as soon as they join.
        window.open(buildBotDeepLink(userId), '_blank', 'noopener,noreferrer')
    }

    // Only hide once verified (real) or joined (honor-based fallback).
    if (!userId || isVerified) return null

    return (
        <button
            onClick={handleClick}
            disabled={checking}
            aria-label="Join our Telegram channel"
            title="Join our Telegram channel"
            className="group fixed right-3 top-1/2 z-40 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/40 ring-1 ring-white/30 transition hover:scale-105 active:scale-95 disabled:opacity-80"
        >
            {/* Gentle pulsing ring so it's noticeable but not disturbing */}
            <span className="pointer-events-none absolute inset-0 rounded-full bg-sky-400/50 motion-safe:animate-ping" />
            {checking ? (
                <Loader2 size={20} className="relative animate-spin drop-shadow" />
            ) : (
                <Send size={20} className="relative -ml-0.5 drop-shadow" />
            )}
        </button>
    )
}
