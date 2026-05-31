-- =============================================================
--  Admin-based Phone Verification System
--  Run in Supabase SQL Editor
--
--  Flow:
--  1. User submits phone → OTP generated + stored in phone_verifications
--  2. Admin sees pending requests in admin panel
--  3. Admin clicks "Send OTP" → wa.me link opens with pre-composed message
--  4. Admin sends manually via WhatsApp
--  5. User enters code → verified
-- =============================================================

-- Add status column to phone_verifications if not exists
alter table public.phone_verifications 
  add column if not exists admin_sent boolean default false;

-- Admin function: get all pending phone verifications (with OTP code visible)
create or replace function public.get_pending_phone_verifications()
returns table(
  id uuid,
  user_id uuid,
  user_email text,
  user_name text,
  phone text,
  code text,
  admin_sent boolean,
  created_at timestamptz,
  expires_at timestamptz,
  verified boolean,
  attempts int
)
language plpgsql security definer set search_path = public as $$
begin
  -- Only admins can call this
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'ADMIN_ONLY';
  end if;

  return query
    select 
      pv.id,
      pv.user_id,
      au.email::text as user_email,
      p.full_name::text as user_name,
      pv.phone,
      pv.code,
      pv.admin_sent,
      pv.created_at,
      pv.expires_at,
      pv.verified,
      pv.attempts
    from phone_verifications pv
    join auth.users au on au.id = pv.user_id
    join profiles p on p.id = pv.user_id
    where pv.verified = false
      and pv.expires_at > now()
    order by pv.created_at desc;
end;
$$;

-- Admin marks OTP as sent (after clicking wa.me link)
create or replace function public.mark_otp_sent(p_verification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'ADMIN_ONLY';
  end if;

  update phone_verifications set admin_sent = true where id = p_verification_id;
end;
$$;

-- Check for duplicate phone + duplicate email requesting same phone
-- (already in request_phone_otp but adding explicit index)
create index if not exists idx_phone_verifications_phone 
  on phone_verifications(phone, verified) where verified = true;

create index if not exists idx_phone_verifications_pending
  on phone_verifications(user_id, created_at desc) where verified = false;
