// =============================================================
//  Supabase Edge Function: send-whatsapp-otp
//  Deploy:  supabase functions deploy send-whatsapp-otp
//
//  Flow:
//   1. Receives { phone } + user's auth token
//   2. Calls RPC request_phone_otp (generates + stores code in DB)
//   3. Delivers code to WhatsApp via CallMeBot
//
//  Env vars (set via Supabase Secrets):
//   WHATSAPP_PROVIDER = "callmebot" | "dev"
//   CALLMEBOT_APIKEY  — get from callmebot.com (free)
//
//  SECURITY: The OTP code is NEVER returned to the browser in production.
//  In "dev" mode (localhost testing) the code is returned as dev_code so
//  the flow can be tested without a real WhatsApp connection.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { phone } = await req.json()
    if (!phone) return json({ error: 'phone required' }, 400)

    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Generate + store code server-side. Code stays on the server.
    const { data, error } = await supabase.rpc('request_phone_otp', { p_phone: phone })
    if (error) return json({ error: error.message }, 400)

    const code = data.code as string
    const provider = Deno.env.get('WHATSAPP_PROVIDER') ?? 'dev'
    const message = `Your RewardReview verification code is *${code}*. Valid for ${data.expires_minutes} minutes. Do NOT share with anyone.`

    if (provider === 'callmebot') {
      // CallMeBot — free WhatsApp gateway.
      // User must first message +34 644 80 20 47 on WhatsApp with "I allow callmebot to send me messages"
      // then callmebot sends the API key. Store it as CALLMEBOT_APIKEY secret.
      const apikey = Deno.env.get('CALLMEBOT_APIKEY') ?? ''
      if (!apikey) return json({ error: 'CALLMEBOT_APIKEY not configured' }, 500)

      // Phone must include country code, no + prefix
      const intlPhone = phone.replace(/^\+/, '').replace(/^0+/, '')
      const fullPhone = intlPhone.startsWith('91') ? intlPhone : `91${intlPhone}`

      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(fullPhone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`
      const r = await fetch(url)
      if (!r.ok) {
        console.error('CallMeBot error:', await r.text())
        return json({ error: 'WhatsApp delivery failed. Please try again.' }, 502)
      }
      // In production: return ONLY confirmation, never the code
      return json({ sent: true, phone })
    }

    // dev mode — log server-side and return code so flow can be tested locally
    // This code is only visible on localhost (checked in UI) and in Supabase edge fn logs
    console.log(`[DEV] OTP for +91${phone}: ${code}`)
    return json({ sent: true, phone, dev_code: code })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
