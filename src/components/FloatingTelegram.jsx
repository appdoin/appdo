import { Send } from 'lucide-react'
import { buildBotDeepLink, TELEGRAM_BOT_CONFIGURED, TELEGRAM_CHANNEL_LINK } from '../lib/telegram'

/**
 * A small, subtle floating Telegram button pinned to the right edge,
 * vertically centered so it never covers the header, bottom nav or main
 * actions.
 *
 * This icon is ALWAYS visible (constant) — it is intentionally never hidden
 * so users always have a one-tap way to reach the channel. It's kept small
 * and slightly faded so it stays unobtrusive.
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
            className="fixed right-2 top-1/2 z-40 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white opacity-70 shadow-md shadow-blue-500/25 ring-1 ring-white/20 transition hover:scale-105 hover:opacity-100 active:scale-95"
        >
            <Send size={15} className="-ml-0.5 drop-shadow" />
        </button>
    )
}
