// =============================================================
//  Supabase Edge Function: telegram-webhook
//  Real, server-side verification of Telegram channel membership.
//
//  Flow:
//   1. User taps the floating icon in the app → opens
//      https://t.me/<BOT_USERNAME>?start=<user_id>  (deep link, NOT the
//      channel link). This starts a chat with our bot.
//   2. Telegram calls this webhook with the /start payload containing
//      the app's user_id and the sender's Telegram numeric id.
//   3. We call the Telegram Bot API `getChatMember` against our channel
//      to check if that Telegram id is actually a member.
//   4. If yes -> profiles.telegram_verified = true (service-role write,
//      cannot be spoofed by the client). If no -> we ask them to join
//      and send /verify afterwards, which re-checks membership.
//
//  Required secrets (set via `supabase secrets set`):
//   TELEGRAM_BOT_TOKEN   - token from @BotFather
//   TELEGRAM_CHANNEL_ID  - e.g. @earnbyappdo or the numeric channel id
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - already available to
//     edge functions by default in most setups; set explicitly if not.
//
//  Setup requirements:
//   1. Add the bot as an ADMIN of the channel (any permission is enough,
//      it just needs to be an admin to receive membership events and to
//      reliably call getChatMember on a channel).
//   2. Register the webhook with chat_member updates enabled, e.g.:
//      curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTION_URL>&allowed_updates=%5B%22message%22%2C%22chat_member%22%5D"
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CHANNEL_ID = Deno.env.get('TELEGRAM_CHANNEL_ID')!
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('ok')

    let update: any
    try {
        update = await req.json()
    } catch {
        return new Response('ok')
    }

    // Real-time leave/kick detection: Telegram sends a `chat_member` update
    // whenever a member's status changes in a chat our bot administers
    // (requires the bot to be added as an ADMIN of the channel with
    // "Add Members" or similar permission so it receives these events).
    // This catches a user leaving the channel immediately, without
    // waiting for the periodic recheck.
    const chatMemberUpdate = update?.chat_member
    if (chatMemberUpdate) {
        try {
            const newStatus = chatMemberUpdate.new_chat_member?.status
            const leftTelegramId = chatMemberUpdate.new_chat_member?.user?.id
            const stillMember = ['creator', 'administrator', 'member', 'restricted'].includes(newStatus)

            if (leftTelegramId) {
                await supabaseAdmin
                    .from('profiles')
                    .update({
                        telegram_verified: stillMember,
                        telegram_verified_at: stillMember ? new Date().toISOString() : null,
                        telegram_last_checked_at: new Date().toISOString(),
                    })
                    .eq('telegram_id', leftTelegramId)
            }
        } catch (e) {
            console.error(e)
        }
        return new Response('ok')
    }

    const msg = update?.message
    if (!msg) return new Response('ok')

    const chatId = msg.chat?.id
    const telegramId = msg.from?.id
    const text: string = msg.text || ''

    try {
        if (text.startsWith('/start')) {
            const parts = text.split(' ')
            const appUserId = parts[1] // our profiles.id, passed via deep link
            if (appUserId) {
                // Link this Telegram id to the app user (pending verification).
                await supabaseAdmin
                    .from('profiles')
                    .update({ telegram_id: telegramId })
                    .eq('id', appUserId)
            }
            await checkAndReply(chatId, telegramId, appUserId)
        } else if (text.startsWith('/verify')) {
            // Look up which app user this Telegram id belongs to.
            const { data } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('telegram_id', telegramId)
                .maybeSingle()
            await checkAndReply(chatId, telegramId, data?.id)
        } else {
            await sendMessage(chatId, 'Send /verify after joining the channel to confirm your membership.')
        }
    } catch (e) {
        console.error(e)
    }

    return new Response('ok')
})

async function checkAndReply(chatId: number, telegramId: number, appUserId?: string) {
    const isMember = await isChannelMember(telegramId)

    if (appUserId) {
        await supabaseAdmin
            .from('profiles')
            .update({
                telegram_verified: isMember,
                telegram_verified_at: isMember ? new Date().toISOString() : null,
                telegram_last_checked_at: new Date().toISOString(),
            })
            .eq('id', appUserId)
    }

    if (isMember && appUserId) {
        await sendMessage(chatId, '✅ Verified! You are a member of our channel. The join reminder is now removed from the app.')
    } else if (isMember) {
        await sendMessage(chatId, '✅ You are a channel member, but we could not link this to your account. Please open the app again and tap the Telegram icon.')
    } else {
        await sendMessage(
            chatId,
            `🚫 You have not joined our channel yet.\n\n1. Join: https://t.me/${CHANNEL_ID.replace('@', '')}\n2. Then come back and send /verify`,
        )
    }
}

async function isChannelMember(telegramId: number): Promise<boolean> {
    const res = await fetch(
        `${TG_API}/getChatMember?chat_id=${encodeURIComponent(CHANNEL_ID)}&user_id=${telegramId}`,
    )
    const data = await res.json()
    if (!data.ok) return false
    const status = data.result?.status
    // Telegram statuses: creator, administrator, member, restricted, left, kicked
    return ['creator', 'administrator', 'member', 'restricted'].includes(status)
}

async function sendMessage(chatId: number, text: string) {
    await fetch(`${TG_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    })
}
