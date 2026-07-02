// =============================================================
//  Supabase Edge Function: telegram-check
//  Callable, authenticated re-check of Telegram channel membership.
//
//  Used for:
//   - The "I already joined" button in the welcome popup / floating icon.
//   - A silent periodic recheck (every ~15 days) so that if a verified
//     user later LEAVES the channel, we detect it and show the
//     reminder again.
//
//  This never trusts the client's word — it always calls the real
//  Telegram Bot API `getChatMember` using the bot token (server secret)
//  and writes the result with the service-role key, which is the only
//  way `profiles.telegram_verified` can change (enforced by the
//  protect_telegram_columns_trg trigger in the DB).
//
//  Required secrets (same as telegram-webhook):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CHANNEL_ID = Deno.env.get('TELEGRAM_CHANNEL_ID')!
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

    try {
        const authHeader = req.headers.get('Authorization') ?? ''

        const supabaseUser = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } },
        )

        const { data: { user }, error: userErr } = await supabaseUser.auth.getUser()
        if (userErr || !user) return json({ error: 'NOT_AUTHENTICATED' }, 401)

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('telegram_id')
            .eq('id', user.id)
            .single()

        if (!profile?.telegram_id) {
            // They've never opened the bot deep link yet — nothing to check.
            return json({ verified: false, reason: 'NOT_LINKED' })
        }

        const isMember = await isChannelMember(profile.telegram_id)

        await supabaseAdmin
            .from('profiles')
            .update({
                telegram_verified: isMember,
                telegram_verified_at: isMember ? new Date().toISOString() : null,
                telegram_last_checked_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        return json({ verified: isMember })
    } catch (e) {
        return json({ error: String(e) }, 500)
    }
})

async function isChannelMember(telegramId: number): Promise<boolean> {
    const res = await fetch(
        `${TG_API}/getChatMember?chat_id=${encodeURIComponent(CHANNEL_ID)}&user_id=${telegramId}`,
    )
    const data = await res.json()
    if (!data.ok) return false
    const status = data.result?.status
    return ['creator', 'administrator', 'member', 'restricted'].includes(status)
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    })
}
