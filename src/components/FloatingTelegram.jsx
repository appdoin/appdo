import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { TELEGRAM_LINK } from './TelegramJoinModal'

/**
 * A subtle floating Telegram button pinned to the right edge, vertically
 * centered so it never covers the header, bottom nav or main actions.
 *
 * It stays visible until the particular user "joins" (i.e. taps it and opens
 * the Telegram channel). Once joined, we persist that per-user and hide the
 * icon for good so it won't disturb them again.
 */
export default function FloatingTelegram({ userId }) {
    const storageKey = userId ? `tg_joined_${userId}` : 'tg_joined'
    const [joined, setJoined] = useState(true)

    // Read the joined state for this specific user.
    useEffect(() => {
        if (!userId) {
            setJoined(true)
            return
        }
        let done = false
        try {
            done = localStorage.getItem(storageKey) === '1'
        } catch { /* ignore */ }
        setJoined(done)
    }, [userId, storageKey])

    const join = () => {
        window.open(TELEGRAM_LINK, '_blank', 'noopener,noreferrer')
        try {
            localStorage.setItem(storageKey, '1')
        } catch { /* ignore */ }
        setJoined(true)
    }

    // Hide entirely once joined (or when we have no user yet).
    if (joined) return null

    return (
        <button
            onClick={join}
            aria-label="Join our Telegram channel"
            title="Join our Telegram"
            className="group fixed right-3 top-1/2 z-40 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/40 ring-1 ring-white/30 transition hover:scale-105 active:scale-95"
        >
            {/* Gentle pulsing ring so it's noticeable but not disturbing */}
            <span className="pointer-events-none absolute inset-0 rounded-full bg-sky-400/50 motion-safe:animate-ping" />
            <Send size={20} className="relative -ml-0.5 drop-shadow" />
        </button>
    )
}
