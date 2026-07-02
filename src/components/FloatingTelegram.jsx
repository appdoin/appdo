import { Send } from 'lucide-react'
import { buildBotDeepLink, TELEGRAM_BOT_CONFIGURED, TELEGRAM_CHANNEL_LINK } from '../lib/telegram'

/**
 * A subtle floating Telegram button pinned to the right edge, vertically
 * centered so it never covers the header, bottom nav or main actions.
 *
 * This icon is ALWAYS visible (constant) — it is intentionally never hidden
 * so users always have a one-tap way to reach the channel. It's only
 * rendered on the Home screen (see UserLayout).
 */
export default function FloatingTelegram({ userId }) {
    const openTelegram = () => {
        const url = TELEGRAM_BOT_CONFIGURED && userId ? buildBotDeepLink(userId) : TELEGRAM_CHANNEL_LINK
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    return (
        <button
            onClick={openTelegram}
            aria-label="Join our Telegram channel"
            title="Join our Telegram channel"
            className="group fixed right-3 top-1/2 z-40 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/40 ring-1 ring-white/30 transition hover:scale-105 active:scale-95"
        >
            {/* Gentle pulsing ring so it's noticeable but not disturbing */}
            <span className="pointer-events-none absolute inset-0 rounded-full bg-sky-400/50 motion-safe:animate-ping" />
            <Send size={20} className="relative -ml-0.5 drop-shadow" />
        </button>
    )
}
