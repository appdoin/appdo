import { supabase } from './supabase'

// Bot username set up via @BotFather. The deep link starts a chat with the
// bot carrying the app's user id, so the telegram-webhook Edge Function can
// link the Telegram account and immediately verify real channel membership
// through the Bot API. We never rely on the plain channel link for
// verification — a click there proves nothing server-side.
export const TELEGRAM_BOT_USERNAME = 'earnbyappdo_bot'
export const TELEGRAM_CHANNEL_LINK = 'https://t.me/earnbyappdo'

// Re-verify membership at most this often automatically, so that if a
// verified user later leaves the channel we notice within ~15 days even if
// the real-time leave webhook is ever missed.
export const RECHECK_INTERVAL_DAYS = 15

export function buildBotDeepLink(userId) {
    return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${userId}`
}

export function daysSince(isoDate) {
    if (!isoDate) return Infinity
    const ms = Date.now() - new Date(isoDate).getTime()
    return ms / (1000 * 60 * 60 * 24)
}

/**
 * Asks the backend to re-check real Telegram channel membership for the
 * signed-in user (via Bot API getChatMember) and persist the result.
 * Returns { verified: boolean, reason?: string } or throws on error.
 */
export async function checkTelegramMembership() {
    const { data, error } = await supabase.functions.invoke('telegram-check')
    if (error) throw error
    return data
}
