// =============================================================
//  Supabase Edge Function: invite-admin
//  Allows existing admins to add new admins by email.
//  Creates the user (if new) with invite, sets role = 'admin',
//  and sends a password reset email so the invited admin can
//  set their password and access the admin panel.
//
//  Deploy:  supabase functions deploy invite-admin
//  Secret:  SUPABASE_SERVICE_ROLE_KEY (set via supabase secrets set)
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
    const { email, redirectTo } = await req.json()
    if (!email) return json({ error: 'email required' }, 400)

    // Verify calling user is admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller } } = await anonClient.auth.getUser()
    if (!caller) return json({ error: 'NOT_AUTHENTICATED' }, 401)

    const { data: callerProfile } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()
    if (callerProfile?.role !== 'admin') return json({ error: 'NOT_ADMIN' }, 403)

    // Use service role to create/invite user
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Check if user already exists
    const { data: existingUsers } = await serviceClient.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find((u: any) => u.email === email)

    let userId: string
    if (existingUser) {
      userId = existingUser.id
    } else {
      // Create user via invite (sends magic link / sets up account)
      const { data: invited, error: invErr } = await serviceClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectTo || undefined,
      })
      if (invErr) return json({ error: invErr.message }, 400)
      userId = invited.user.id
    }

    // Set role to admin in profiles
    // If profile doesn't exist yet (new invite), create it
    const { data: prof } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (prof) {
      await serviceClient.from('profiles').update({ role: 'admin' }).eq('id', userId)
    } else {
      await serviceClient.from('profiles').insert({
        id: userId,
        email,
        full_name: email.split('@')[0],
        role: 'admin',
        referral_code: userId.replace(/-/g, '').slice(0, 8).toUpperCase(),
      })
    }

    // Also send password reset so new admin can set password
    await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: redirectTo || undefined },
    })

    return json({ success: true, userId })
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
