-- =============================================================
--  Migration: Whitelist, Enhanced Referral, In-App OTP
--  Run in Supabase SQL Editor
-- =============================================================

-- =============================================================
--  1. USER WHITELIST TABLE
-- =============================================================
create table if not exists public.user_whitelist (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade unique,
  allow_multiple_reviews boolean not null default true,
  allow_multi_device    boolean not null default true,
  bypass_fraud_check    boolean not null default true,
  reason                text,
  created_at            timestamptz not null default now()
);

alter table public.user_whitelist enable row level security;

create policy "whitelist_admin_all" on public.user_whitelist
  for all using (public.is_admin());

-- =============================================================
--  2. ENHANCED REFERRAL TRACKING
-- =============================================================

-- Add referral tracking columns to profiles if not exists
alter table public.profiles
  add column if not exists total_referrals int not null default 0;
alter table public.profiles
  add column if not exists total_earnings numeric(12,2) not null default 0;

-- Referral rewards table
create table if not exists public.referral_rewards (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references public.profiles(id) on delete cascade,
  referred_id   uuid not null references public.profiles(id) on delete cascade,
  bonus_amount  numeric(10,2) not null default 10,
  status        text not null default 'pending' check (status in ('pending','credited')),
  created_at    timestamptz not null default now(),
  credited_at   timestamptz,
  unique (referrer_id, referred_id)
);

alter table public.referral_rewards enable row level security;

create policy "rr_select" on public.referral_rewards for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id or public.is_admin());
create policy "rr_insert" on public.referral_rewards for insert
  with check (public.is_admin() or auth.uid() = referrer_id);
create policy "rr_update" on public.referral_rewards for update
  using (public.is_admin());

-- Apply referral function
create or replace function public.apply_referral(p_referral_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_referrer_id uuid;
  v_bonus numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Check if already has a referrer
  if exists (select 1 from profiles where id = auth.uid() and referred_by is not null) then
    raise exception 'ALREADY_HAS_REFERRER';
  end if;

  -- Find referrer
  select id into v_referrer_id from profiles where referral_code = p_referral_code and id <> auth.uid();
  if v_referrer_id is null then raise exception 'INVALID_REFERRAL_CODE'; end if;

  -- Get bonus amount from settings
  v_bonus := coalesce(nullif(public.get_setting_text('referral_bonus'),'')::numeric, 10);

  -- Link referral
  update profiles set referred_by = v_referrer_id where id = auth.uid();

  -- Create pending reward
  insert into referral_rewards (referrer_id, referred_id, bonus_amount, status)
  values (v_referrer_id, auth.uid(), v_bonus, 'pending')
  on conflict (referrer_id, referred_id) do nothing;
end;
$$;

-- Credit referral bonus (called when first review is approved)
create or replace function public.credit_referral_bonus(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reward referral_rewards;
  v_bonus numeric;
begin
  -- Find pending reward where this user was referred
  select * into v_reward from referral_rewards
    where referred_id = p_user_id and status = 'pending'
    limit 1;

  if not found then return; end if;

  v_bonus := v_reward.bonus_amount;

  -- Credit referrer
  update profiles
    set wallet_balance = wallet_balance + v_bonus,
        total_earned = total_earned + v_bonus,
        total_referrals = total_referrals + 1,
        total_earnings = total_earnings + v_bonus
    where id = v_reward.referrer_id;

  insert into wallet_transactions (user_id, amount, type, description, ref_id)
  values (v_reward.referrer_id, v_bonus, 'referral', 'Referral bonus', v_reward.id);

  -- Mark reward as credited
  update referral_rewards set status = 'credited', credited_at = now() where id = v_reward.id;
end;
$$;

-- =============================================================
--  3. ENHANCED PHONE VERIFICATION (In-App OTP Display)
-- =============================================================

-- Add fraud_check_passed column
alter table public.phone_verifications
  add column if not exists fraud_check_passed boolean default false;
alter table public.phone_verifications
  add column if not exists device_id text;
alter table public.phone_verifications
  add column if not exists ip_address text;

-- New function: Request OTP with fraud check (shows code in-app after passing)
create or replace function public.request_phone_otp_v2(p_phone text, p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_exp int := coalesce(nullif(public.get_setting_text('otp_expiry_minutes'),'')::int, 10);
  v_recent int;
  v_is_whitelisted boolean := false;
  v_fraud_flags text[] := '{}';
  v_fraud_passed boolean := true;
  v_ver_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Check if user is banned
  if exists (select 1 from profiles where id = auth.uid() and banned = true) then
    raise exception 'ACCOUNT_BANNED';
  end if;

  -- Check if phone already used by another verified user
  if exists (select 1 from profiles where phone = p_phone and id <> auth.uid() and phone_verified = true) then
    raise exception 'PHONE_ALREADY_USED';
  end if;

  -- Check blacklist
  if exists (select 1 from blacklist where kind = 'phone' and value = p_phone) then
    raise exception 'PHONE_BLACKLISTED';
  end if;

  -- Check if whitelisted
  select true into v_is_whitelisted from user_whitelist
    where user_id = auth.uid() and bypass_fraud_check = true;

  -- Fraud checks (skip for whitelisted users)
  if not coalesce(v_is_whitelisted, false) then

    -- Check device blacklist
    if p_device_id is not null and exists (select 1 from blacklist where kind = 'device' and value = p_device_id) then
      raise exception 'DEVICE_BLACKLISTED';
    end if;

    -- Check if device already has a verified account
    if p_device_id is not null and exists (
      select 1 from devices d
      join profiles p on p.id = d.user_id
      where d.device_id = p_device_id and d.user_id <> auth.uid() and p.phone_verified = true
    ) then
      v_fraud_flags := array_append(v_fraud_flags, 'DEVICE_DUPLICATE');
      v_fraud_passed := false;
    end if;

    -- Check if same device_id in phone_verifications for other users
    if p_device_id is not null and exists (
      select 1 from phone_verifications
      where device_id = p_device_id and user_id <> auth.uid() and verified = true
    ) then
      v_fraud_flags := array_append(v_fraud_flags, 'DEVICE_MULTI_VERIFY');
      v_fraud_passed := false;
    end if;

    -- Rate limit: max 3 OTP requests per hour
    select count(*) into v_recent
    from phone_verifications
    where user_id = auth.uid() and created_at > now() - interval '1 hour';

    if v_recent >= 3 then
      raise exception 'TOO_MANY_OTP_REQUESTS';
    end if;

  end if;

  -- If fraud detected, log and reject
  if not v_fraud_passed then
    -- Log fraud attempt
    insert into fraud_logs (user_id, flag, details)
    values (auth.uid(), 'PHONE_VERIFY_FRAUD', jsonb_build_object(
      'phone', p_phone,
      'device_id', p_device_id,
      'flags', v_fraud_flags
    ));
    raise exception 'FRAUD_DETECTED';
  end if;

  -- Generate code
  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');

  -- Insert verification record
  insert into phone_verifications (user_id, phone, code, expires_at, fraud_check_passed, device_id)
  values (auth.uid(), p_phone, v_code, now() + (v_exp || ' minutes')::interval, true, p_device_id)
  returning id into v_ver_id;

  -- Return code directly (since fraud check passed, no need for admin WhatsApp)
  return jsonb_build_object(
    'phone', p_phone,
    'code', v_code,
    'expires_minutes', v_exp,
    'verification_id', v_ver_id,
    'fraud_passed', true
  );
end;
$$;

-- =============================================================
--  4. FRAUD LOGS TABLE (if not exists)
-- =============================================================
create table if not exists public.fraud_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  flag       text not null,
  details    jsonb,
  created_at timestamptz not null default now()
);

alter table public.fraud_logs enable row level security;

create policy "fraud_logs_admin" on public.fraud_logs
  for select using (public.is_admin());
create policy "fraud_logs_insert" on public.fraud_logs
  for insert with check (true);

-- =============================================================
--  5. ENHANCED SUBMIT_REVIEW (Whitelist support)
-- =============================================================
create or replace function public.submit_review(
  p_app_id uuid, p_review_text text, p_screenshot_url text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app public.apps;
  v_id uuid;
  v_whitelisted boolean := false;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned = true) then
    raise exception 'ACCOUNT_BANNED';
  end if;

  select * into v_app from public.apps where id = p_app_id and active = true;
  if not found then raise exception 'APP_NOT_FOUND'; end if;
  if v_app.slots_left <= 0 then raise exception 'NO_SLOTS_LEFT'; end if;

  -- Check whitelist for multiple review permission
  select allow_multiple_reviews into v_whitelisted from user_whitelist where user_id = auth.uid();

  if not coalesce(v_whitelisted, false) then
    if exists (select 1 from public.reviews where user_id = auth.uid() and app_id = p_app_id) then
      raise exception 'ALREADY_REVIEWED';
    end if;
  end if;

  insert into public.reviews(user_id, app_id, review_text, screenshot_url, reward_amount, status)
  values (auth.uid(), p_app_id, p_review_text, p_screenshot_url, v_app.reward_amount, 'pending')
  returning id into v_id;

  update public.apps set slots_left = slots_left - 1 where id = p_app_id;
  return v_id;
end;
$$;

-- =============================================================
--  6. SETTINGS DEFAULTS FOR REFERRAL
-- =============================================================
insert into public.settings (key, value) values
  ('referral_bonus', '"10"'),
  ('referral_enabled', 'true')
on conflict (key) do nothing;

-- =============================================================
--  7. INDEXES
-- =============================================================
create index if not exists idx_whitelist_user on public.user_whitelist(user_id);
create index if not exists idx_referral_rewards_referrer on public.referral_rewards(referrer_id);
create index if not exists idx_referral_rewards_referred on public.referral_rewards(referred_id);
create index if not exists idx_fraud_logs_user on public.fraud_logs(user_id, created_at desc);
