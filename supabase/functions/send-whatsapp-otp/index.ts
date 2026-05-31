// =============================================================
//  Supabase Edge Function: send-whatsapp-otp
//  Deploy:  supabase functions deploy send-whatsapp-otp
//
//  SECURE Flow:
//   1. Receives { phone } + user's auth token
//   2. Calls RPC request_phone_otp (generates + stores code in DB)
//      The RPC does NOT return the code — it stays in the DB only.
//   3. Retrieves code from DB using service_role key
//   4. Delivers code to WhatsApp via CallMeBot
//   5. Returns only { sent: true } — code NEVER reaches the browser
//
//  Env vars (set via Supabase Secrets):
//   WHATSAPP_PROVIDER = "callmebot" | "dev"
//   CALLMEBOT_APIKEY  — get from callmebot.com (free)
//   SUPABASE_SERVICE_ROLE_KEY — for reading OTP from DB
//
//  SECURITY:
//  - OTP code is NEVER returned to the browser
//  - Phone duplication checked server-side
//  - Rate limited to 3 requests/hour
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

    // Client with user's auth — for calling the RPC (which checks permissions)
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Service role client — for reading OTP code from DB (never exposed to browser)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get the user's ID from their token
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !user) return json({ error: 'NOT_AUTHENTICATED' }, 401)

    // Generate + store code server-side. RPC does NOT return the code.
    const { error: rpcErr } = await supabaseUser.rpc('request_phone_otp', { p_phone: phone })
    if (rpcErr) return json({ error: rpcErr.message }, 400)

    // Retrieve the code from DB using service role (bypasses RLS)
    const { data: codeData } = await supabaseAdmin.rpc('get_latest_otp', { p_user_id: user.id })
    const code = codeData as string
    if (!code) return json({ error: 'Failed to generate code. Try again.' }, 500)

    const provider = Deno.env.get('WHATSAPP_PROVIDER') ?? 'dev'
    const message = `Your RewardReview verification code is *${code}*. Valid for 10 minutes. Do NOT share with anyone.`

    if (provider === 'callmebot') {
      const apikey = Deno.env.get('CALLMEBOT_APIKEY') ?? ''
      if (!apikey) return json({ error: 'CALLMEBOT_APIKEY not configured' }, 500)

      const intlPhone = phone.replace(/^\+/, '').replace(/^0+/, '')
      const fullPhone = intlPhone.startsWith('91') ? intlPhone : `91${intlPhone}`

      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(fullPhone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`
      const r = await fetch(url)
      if (!r.ok) {
        console.error('CallMeBot error:', await r.text())
        return json({ error: 'WhatsApp delivery failed. Please try again.' }, 502)
      }
      return json({ sent: true, phone })
    }

    // Dev mode — log server-side only, return confirmation (NOT the code)
    console.log(`[DEV] OTP for +91${phone}: ${code}`)
    return json({ sent: true, phone, dev_hint: 'Check edge function logs for code' })
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
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
