-- =============================================================
--  RewardReview — Secure OTP Migration
--  Run in Supabase SQL Editor
--  Makes request_phone_otp NOT return the code to the caller.
--  The Edge Function reads from phone_verifications table directly.
-- =============================================================

-- Replace the old function with one that does NOT return the code
create or replace function public.request_phone_otp(p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_exp  int := coalesce(nullif(public.get_setting_text('otp_expiry_minutes'),'')::int, 10);
  v_recent int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Check if phone already used by someone else
  if exists (select 1 from public.profiles where phone = p_phone and id <> auth.uid()) then
    raise exception 'PHONE_ALREADY_USED';
  end if;

  -- Rate limit: max 3 OTP requests per hour
  select count(*) into v_recent
  from public.phone_verifications
  where user_id = auth.uid() and created_at > now() - interval '1 hour';
  
  if v_recent >= 3 then
    raise exception 'TOO_MANY_OTP_REQUESTS';
  end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');

  insert into public.phone_verifications(user_id, phone, code, expires_at)
  values (auth.uid(), p_phone, v_code, now() + (v_exp || ' minutes')::interval);

  -- SECURITY: Do NOT return the code. Only return confirmation.
  -- The Edge Function retrieves the code from the DB directly.
  return jsonb_build_object('phone', p_phone, 'expires_minutes', v_exp, 'sent', true);
end;
$$;

-- Internal function for Edge Function to retrieve the latest OTP code
-- This is called server-side only (service_role key)
create or replace function public.get_latest_otp(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  select code into v_code
  from public.phone_verifications
  where user_id = p_user_id and verified = false and expires_at > now()
  order by created_at desc limit 1;
  
  return v_code;
end;
$$;
