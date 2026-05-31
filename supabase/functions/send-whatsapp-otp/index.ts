// =============================================================
//  Supabase Edge Function: send-whatsapp-otp
//  (Admin-based manual WhatsApp OTP delivery)
//
//  SECURE Flow:
//   1. User submits phone number → this function generates + stores OTP
//   2. Admin sees request in admin panel (with OTP code visible)
//   3. Admin clicks "Send OTP" → opens wa.me link, sends manually
//   4. User enters code → verified via verify_phone_otp RPC
//
//  Code is NEVER returned to the user's browser.
//  Admin sees code only in the admin panel (protected by role check).
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

    // User-auth client — for permission-checked RPC calls
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Verify user is authenticated
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !user) return json({ error: 'NOT_AUTHENTICATED' }, 401)

    // Generate + store OTP in DB. Code stays server-side only.
    const { data, error: rpcErr } = await supabaseUser.rpc('request_phone_otp', { p_phone: phone })
    if (rpcErr) return json({ error: rpcErr.message }, 400)

    // OTP stored. Admin will manually deliver via WhatsApp.
    return json({ sent: true, phone, message: 'Verification request submitted. Admin will send the code to your WhatsApp shortly.' })
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
