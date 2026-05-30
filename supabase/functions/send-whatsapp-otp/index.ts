// =============================================================
//  Supabase Edge Function: send-whatsapp-otp
//  Deploy:  supabase functions deploy send-whatsapp-otp
//
//  Flow:
//   1. Receives { phone } + user's auth token
//   2. Calls RPC request_phone_otp (generates + stores code in DB)
//   3. Delivers code to WhatsApp (provider configurable below)
//
//  WhatsApp delivery options (set via env / Supabase secrets):
//   - WHATSAPP_PROVIDER = "callmebot" | "dev"
//   - CALLMEBOT_APIKEY  (free, no formal API signup — get from callmebot.com)
//   For "dev" the code is returned in the response so you can test
//   the whole flow without any external service.
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

    // Generates + stores the code in DB (runs as the logged-in user)
    const { data, error } = await supabase.rpc('request_phone_otp', { p_phone: phone })
    if (error) return json({ error: error.message }, 400)

    const code = data.code as string
    const provider = Deno.env.get('WHATSAPP_PROVIDER') ?? 'dev'
    const message = `Your RewardReview verification code is ${code}. It expires in ${data.expires_minutes} minutes.`

    if (provider === 'callmebot') {
      // CallMeBot — free WhatsApp gateway, no formal API account needed.
      const apikey = Deno.env.get('CALLMEBOT_APIKEY') ?? ''
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${apikey}`
      const r = await fetch(url)
      if (!r.ok) return json({ error: 'WhatsApp send failed' }, 502)
      return json({ sent: true })
    }

    // dev mode — return code so flow can be tested without WhatsApp
    return json({ sent: true, dev_code: code })
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
