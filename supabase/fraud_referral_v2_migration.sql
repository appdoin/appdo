-- =============================================================
--  Migration v2: Referral linking on signup, bonus crediting,
--  stronger anti-fraud (phone/IP/fingerprint), install proof.
--  Run in Supabase SQL Editor AFTER whitelist_referral_migration.sql
--  Safe to re-run.
-- =============================================================

-- =============================================================
--  1. INSTALL-PROOF COLUMNS ON REVIEWS
-- =============================================================
alter table public.reviews add column if not exists opened_store boolean not null default false;
alter table public.reviews add column if not exists install_marked boolean not null default false;

-- =============================================================
--  2. REFERRAL LINKING AT SIGNUP (via user metadata)
--     Signup passes referred_code in raw_user_meta_data.
--     handle_new_user links referrer + creates a PENDING reward.
-- =============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_device text := nullif(new.raw_user_meta_data->>'device_id','');
  v_ref_code text := upper(nullif(new.raw_user_meta_data->>'referred_code',''));
  v_referrer uuid;
  v_bonus numeric := coalesce(nullif(public.get_setting_text('referral_bonus'),'')::numeric, 10);
  v_name   text := coalesce(
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'name',''),
    nullif(new.raw_user_meta_data->>'user_name',''),
    split_part(new.email,'@',1)
  );
begin
  if v_device is not null and exists (select 1 from public.devices where device_id = v_device) then
    raise exception 'DEVICE_ALREADY_REGISTERED';
  end if;

  -- Resolve referrer from code (if provided and valid)
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = v_ref_code limit 1;
  end if;

  insert into public.profiles (id, email, full_name, device_id, referral_code, referred_by)
  values (
    new.id, new.email, v_name, v_device,
    upper(substr(replace(new.id::text,'-',''),1,8)),
    v_referrer
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name,''), profiles.full_name),
    email     = coalesce(excluded.email, profiles.email),
    referred_by = coalesce(profiles.referred_by, excluded.referred_by);

  if v_device is not null then
    insert into public.devices(device_id, user_id) values (v_device, new.id)
    on conflict (device_id) do nothing;
  end if;

  -- Create a PENDING referral reward (credited on first approved review)
  if v_referrer is not null and v_referrer <> new.id then
    insert into public.referral_rewards (referrer_id, referred_id, bonus_amount, status)
    values (v_referrer, new.id, v_bonus, 'pending')
    on conflict (referrer_id, referred_id) do nothing;
  end if;

  return new;
end;
$$;

-- =============================================================
--  2b. Ensure referral_rewards has credited_at column
-- =============================================================
alter table public.referral_rewards add column if not exists credited_at timestamptz;

-- =============================================================
--  3. CREDIT REFERRAL ON FIRST APPROVED REVIEW
--     approve_review now also credits any pending referral bonus.
-- =============================================================
create or replace function public.approve_review(p_review_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_r public.reviews;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_r from public.reviews where id = p_review_id for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_r.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.reviews set status='approved', reviewed_at=now() where id = p_review_id;
  update public.profiles
    set wallet_balance = wallet_balance + v_r.reward_amount,
        total_earned   = total_earned + v_r.reward_amount
    where id = v_r.user_id;
  insert into public.wallet_transactions(user_id, amount, type, description, ref_id)
  values (v_r.user_id, v_r.reward_amount, 'review', 'Review approved', v_r.id);

  -- Credit referral bonus to the referrer (first approved review only)
  perform public.credit_referral_bonus(v_r.user_id);
end;
$$;

-- Make credit_referral_bonus idempotent + only on first approved review
create or replace function public.credit_referral_bonus(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reward referral_rewards;
  v_bonus numeric;
  v_approved_count int;
begin
  -- Only credit once the user has at least one approved review
  select count(*) into v_approved_count
  from reviews where user_id = p_user_id and status = 'approved';
  if v_approved_count < 1 then return; end if;

  -- Find pending reward where this user was the referred party
  select * into v_reward from referral_rewards
    where referred_id = p_user_id and status = 'pending'
    limit 1;
  if not found then return; end if;

  v_bonus := v_reward.bonus_amount;

  update profiles
    set wallet_balance = wallet_balance + v_bonus,
        total_earned = total_earned + v_bonus,
        total_referrals = total_referrals + 1,
        total_earnings = total_earnings + v_bonus
    where id = v_reward.referrer_id;

  insert into wallet_transactions (user_id, amount, type, description, ref_id)
  values (v_reward.referrer_id, v_bonus, 'referral', 'Referral bonus', v_reward.id);

  update referral_rewards set status = 'credited', credited_at = now() where id = v_reward.id;
end;
$$;

-- One-time backfill: credit any pending referrals whose referred user already
-- has an approved review (fixes the "earned but still pending" bug).
do $$
declare r record;
begin
  for r in (
    select rr.referred_id
    from referral_rewards rr
    where rr.status = 'pending'
      and exists (select 1 from reviews rv where rv.user_id = rr.referred_id and rv.status = 'approved')
  ) loop
    perform public.credit_referral_bonus(r.referred_id);
  end loop;
end $$;

-- =============================================================
--  4. STRONGER PHONE VERIFICATION (in-app OTP, no external API)
--     Combines: phone-reuse block, device/fingerprint duplicate,
--     IP heuristics (server-side via request headers), blacklist.
-- =============================================================
alter table public.phone_verifications
  add column if not exists fingerprint text;

-- Drop the older 2-arg overload so the 3-arg version below is unambiguous.
drop function if exists public.request_phone_otp_v2(text, text);

create or replace function public.request_phone_otp_v2(
  p_phone text,
  p_device_id text default null,
  p_fingerprint text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_exp int := coalesce(nullif(public.get_setting_text('otp_expiry_minutes'),'')::int, 10);
  v_recent int;
  v_is_whitelisted boolean := false;
  v_fraud_flags text[] := '{}';
  v_fraud_passed boolean := true;
  v_ver_id uuid;
  v_ip text;
  v_ip_accounts int := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Server-side client IP (no external API; from Supabase request headers)
  begin
    v_ip := split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',', 1
    );
  exception when others then v_ip := null; end;
  v_ip := nullif(trim(v_ip), '');

  -- Banned account
  if exists (select 1 from profiles where id = auth.uid() and banned = true) then
    raise exception 'ACCOUNT_BANNED';
  end if;

  -- HARD BLOCK: phone already used by ANY other account (verified or not)
  if exists (select 1 from profiles where phone = p_phone and id <> auth.uid()) then
    raise exception 'PHONE_ALREADY_USED';
  end if;
  -- HARD BLOCK: phone previously verified by a different user
  if exists (
    select 1 from phone_verifications
    where phone = p_phone and verified = true and user_id <> auth.uid()
  ) then
    raise exception 'PHONE_ALREADY_USED';
  end if;

  -- Blacklist checks (always enforced)
  if exists (select 1 from blacklist where kind = 'phone' and value = p_phone) then
    raise exception 'PHONE_BLACKLISTED';
  end if;
  if p_device_id is not null and exists (select 1 from blacklist where kind = 'device' and value = p_device_id) then
    raise exception 'DEVICE_BLACKLISTED';
  end if;
  if p_fingerprint is not null and exists (select 1 from blacklist where kind in ('device','fingerprint') and value = p_fingerprint) then
    raise exception 'DEVICE_BLACKLISTED';
  end if;
  if v_ip is not null and exists (select 1 from blacklist where kind = 'ip' and value = v_ip) then
    raise exception 'IP_BLACKLISTED';
  end if;

  -- Whitelist bypass for the soft fraud checks below
  select coalesce(bool_or(bypass_fraud_check), false) into v_is_whitelisted
    from user_whitelist where user_id = auth.uid();

  if not v_is_whitelisted then
    -- Device already tied to another VERIFIED account
    if p_device_id is not null and exists (
      select 1 from devices d join profiles p on p.id = d.user_id
      where d.device_id = p_device_id and d.user_id <> auth.uid() and p.phone_verified = true
    ) then
      v_fraud_flags := array_append(v_fraud_flags, 'DEVICE_DUPLICATE');
      v_fraud_passed := false;
    end if;

    -- Same browser fingerprint verified on another account
    if p_fingerprint is not null and exists (
      select 1 from phone_verifications
      where fingerprint = p_fingerprint and verified = true and user_id <> auth.uid()
    ) then
      v_fraud_flags := array_append(v_fraud_flags, 'FINGERPRINT_DUPLICATE');
      v_fraud_passed := false;
    end if;
    if p_fingerprint is not null and exists (
      select 1 from device_fingerprints df join profiles p on p.id = df.user_id
      where df.fingerprint = p_fingerprint and df.user_id <> auth.uid() and p.phone_verified = true
    ) then
      v_fraud_flags := array_append(v_fraud_flags, 'FINGERPRINT_DUPLICATE');
      v_fraud_passed := false;
    end if;

    -- Same device fingerprint stored on phone_verifications for another user (survives data clear less, but adds a layer)
    if p_device_id is not null and exists (
      select 1 from phone_verifications
      where device_id = p_device_id and verified = true and user_id <> auth.uid()
    ) then
      v_fraud_flags := array_append(v_fraud_flags, 'DEVICE_MULTI_VERIFY');
      v_fraud_passed := false;
    end if;

    -- IP heuristic: too many verified accounts already from this IP (>=3 → block)
    if v_ip is not null then
      select count(distinct pv.user_id) into v_ip_accounts
      from phone_verifications pv
      where pv.ip_address = v_ip and pv.verified = true and pv.user_id <> auth.uid();
      if v_ip_accounts >= 3 then
        v_fraud_flags := array_append(v_fraud_flags, 'IP_TOO_MANY_ACCOUNTS');
        v_fraud_passed := false;
      end if;
    end if;

    -- Rate limit: max 3 OTP requests per hour per user
    select count(*) into v_recent from phone_verifications
    where user_id = auth.uid() and created_at > now() - interval '1 hour';
    if v_recent >= 3 then raise exception 'TOO_MANY_OTP_REQUESTS'; end if;
  end if;

  -- Fraud → log + reject (do not reveal code)
  if not v_fraud_passed then
    insert into fraud_logs (user_id, flag_type, severity, detail, metadata)
    values (auth.uid(), 'same_device_multi_account', 'high',
      'Phone verification blocked by anti-fraud',
      jsonb_build_object('phone', p_phone, 'device_id', p_device_id,
        'fingerprint', p_fingerprint, 'ip', v_ip, 'flags', v_fraud_flags));
    raise exception 'FRAUD_DETECTED';
  end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');

  insert into phone_verifications (user_id, phone, code, expires_at, fraud_check_passed, device_id, fingerprint, ip_address)
  values (auth.uid(), p_phone, v_code, now() + (v_exp || ' minutes')::interval, true, p_device_id, p_fingerprint, v_ip)
  returning id into v_ver_id;

  return jsonb_build_object(
    'phone', p_phone, 'code', v_code, 'expires_minutes', v_exp,
    'verification_id', v_ver_id, 'fraud_passed', true
  );
end;
$$;

-- verify_phone_otp: also block reuse at verify time + persist fingerprint device
create or replace function public.verify_phone_otp(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.phone_verifications;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v from public.phone_verifications
   where user_id = auth.uid() and verified = false
   order by created_at desc limit 1;

  if not found then raise exception 'NO_OTP_REQUESTED'; end if;
  if v.expires_at < now() then raise exception 'OTP_EXPIRED'; end if;
  if v.attempts >= 5 then raise exception 'TOO_MANY_ATTEMPTS'; end if;

  if v.code <> p_code then
    update public.phone_verifications set attempts = attempts + 1 where id = v.id;
    raise exception 'INVALID_CODE';
  end if;

  -- Re-check reuse at the moment of verification (race-safety)
  if exists (select 1 from public.profiles where phone = v.phone and id <> auth.uid()) then
    raise exception 'PHONE_ALREADY_USED';
  end if;

  update public.phone_verifications set verified = true where id = v.id;
  update public.profiles set phone = v.phone, phone_verified = true where id = auth.uid();
end;
$$;

-- =============================================================
--  5. INSTALL-PROOF: submit_review records store/install signals
--     Consolidated 7-arg signature; drops old 3-arg overload.
-- =============================================================
drop function if exists public.submit_review(uuid, text, text);
drop function if exists public.submit_review(uuid, text, text, text, text, int);

create or replace function public.submit_review(
  p_app_id uuid,
  p_review_text text,
  p_screenshot_url text,
  p_device_fingerprint text default null,
  p_ip_address text default null,
  p_time_spent_seconds int default null,
  p_opened_store boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app public.apps;
  v_id uuid;
  v_fraud_score int := 0;
  v_fraud_flags text[] := '{}';
  v_other_users int;
  v_profile public.profiles;
  v_whitelisted boolean := false;
  v_install_marked boolean := false;
  v_ip text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.banned then raise exception 'ACCOUNT_BANNED'; end if;

  select * into v_app from public.apps where id = p_app_id and active = true;
  if not found then raise exception 'APP_NOT_FOUND'; end if;
  if v_app.slots_left <= 0 then raise exception 'NO_SLOTS_LEFT'; end if;

  -- Server-side IP (overrides any client-supplied value when available)
  begin
    v_ip := nullif(trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), '');
  exception when others then v_ip := null; end;
  v_ip := coalesce(v_ip, nullif(p_ip_address, ''));

  -- Whitelist: allows repeat reviews of the same app
  select coalesce(bool_or(allow_multiple_reviews), false) into v_whitelisted
    from user_whitelist where user_id = auth.uid();

  if not v_whitelisted then
    if exists (select 1 from public.reviews where user_id = auth.uid() and app_id = p_app_id) then
      raise exception 'ALREADY_REVIEWED';
    end if;
  end if;

  -- Did the user mark install (two-step) for this app?
  select exists (
    select 1 from public.app_installations where user_id = auth.uid() and app_id = p_app_id
  ) into v_install_marked;

  -- ===== Fraud scoring (skipped for whitelisted users) =====
  if not v_whitelisted then
    if p_device_fingerprint is not null and p_device_fingerprint <> '' then
      select count(distinct user_id) into v_other_users
      from public.device_fingerprints
      where fingerprint = p_device_fingerprint and user_id <> auth.uid();
      if v_other_users > 0 then
        v_fraud_score := v_fraud_score + 40;
        v_fraud_flags := array_append(v_fraud_flags, 'same_fingerprint_multi_account');
      end if;
      if exists (select 1 from public.blacklist where kind in ('device','fingerprint') and value = p_device_fingerprint) then
        v_fraud_score := v_fraud_score + 80;
        v_fraud_flags := array_append(v_fraud_flags, 'blacklisted_fingerprint');
      end if;
    end if;

    if v_profile.device_id is not null then
      if exists (select 1 from public.profiles where device_id = v_profile.device_id and id <> auth.uid()) then
        v_fraud_score := v_fraud_score + 50;
        v_fraud_flags := array_append(v_fraud_flags, 'same_device_multi_account');
      end if;
      if exists (select 1 from public.blacklist where kind = 'device' and value = v_profile.device_id) then
        v_fraud_score := v_fraud_score + 80;
        v_fraud_flags := array_append(v_fraud_flags, 'blacklisted_device');
      end if;
    end if;

    -- Did NOT open the Play Store → strong "no install proof" signal
    if not coalesce(p_opened_store, false) and not v_install_marked then
      v_fraud_score := v_fraud_score + 35;
      v_fraud_flags := array_append(v_fraud_flags, 'no_install_proof');
    end if;

    if p_time_spent_seconds is not null and p_time_spent_seconds < 30 then
      v_fraud_score := v_fraud_score + 30;
      v_fraud_flags := array_append(v_fraud_flags, 'too_fast_submission');
    end if;

    if v_ip is not null and v_ip <> '' then
      if (select count(*) from public.reviews
          where ip_address = v_ip and user_id <> auth.uid()
            and created_at > now() - interval '1 hour') >= 2 then
        v_fraud_score := v_fraud_score + 25;
        v_fraud_flags := array_append(v_fraud_flags, 'same_ip_multi_review');
      end if;
    end if;

    if v_profile.created_at > now() - interval '2 minutes' then
      v_fraud_score := v_fraud_score + 20;
      v_fraud_flags := array_append(v_fraud_flags, 'suspicious_timing');
    end if;

    if v_fraud_score >= 80 then
      insert into public.fraud_logs(user_id, flag_type, severity, detail, metadata)
      values (auth.uid(), 'blacklisted_device', 'critical',
        'Review blocked: fraud score ' || v_fraud_score,
        jsonb_build_object('flags', v_fraud_flags, 'app_id', p_app_id, 'fingerprint', p_device_fingerprint));
      raise exception 'REVIEW_BLOCKED_FRAUD';
    end if;
  end if;

  insert into public.reviews(
    user_id, app_id, review_text, screenshot_url, reward_amount, status,
    device_fingerprint, ip_address, time_spent_seconds, fraud_score, fraud_flags,
    opened_store, install_marked
  )
  values (
    auth.uid(), p_app_id, p_review_text, p_screenshot_url, v_app.reward_amount, 'pending',
    p_device_fingerprint, v_ip, p_time_spent_seconds, v_fraud_score, v_fraud_flags,
    coalesce(p_opened_store, false), v_install_marked
  )
  returning id into v_id;

  update public.apps set slots_left = slots_left - 1 where id = p_app_id;

  if array_length(v_fraud_flags, 1) > 0 then
    for i in 1..array_length(v_fraud_flags, 1) loop
      insert into public.fraud_logs(user_id, review_id, flag_type, severity, detail, metadata)
      values (auth.uid(), v_id, v_fraud_flags[i],
        case when v_fraud_score >= 50 then 'high' when v_fraud_score >= 25 then 'medium' else 'low' end,
        'Auto-detected during review submission',
        jsonb_build_object('fraud_score', v_fraud_score, 'fingerprint', p_device_fingerprint, 'ip', v_ip, 'time_spent', p_time_spent_seconds, 'opened_store', p_opened_store));
    end loop;
  end if;

  return v_id;
end;
$$;

-- register_device_fingerprint: also capture server-side IP
create or replace function public.register_device_fingerprint(
  p_fingerprint text,
  p_user_agent text default null,
  p_screen_res text default null,
  p_timezone text default null,
  p_ip_address text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_other_users int;
  v_ip text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_fingerprint is null or p_fingerprint = '' then return; end if;

  begin
    v_ip := nullif(trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), '');
  exception when others then v_ip := null; end;
  v_ip := coalesce(v_ip, nullif(p_ip_address, ''));

  insert into public.device_fingerprints(user_id, fingerprint, user_agent, screen_res, timezone, ip_address)
  values (auth.uid(), p_fingerprint, p_user_agent, p_screen_res, p_timezone, v_ip)
  on conflict (user_id, fingerprint)
  do update set
    last_seen_at = now(),
    user_agent = coalesce(excluded.user_agent, device_fingerprints.user_agent),
    ip_address = coalesce(excluded.ip_address, device_fingerprints.ip_address);

  select count(distinct user_id) into v_other_users
  from public.device_fingerprints
  where fingerprint = p_fingerprint and user_id <> auth.uid();

  if v_other_users > 0 then
    insert into public.fraud_logs(user_id, flag_type, severity, detail, metadata)
    values (auth.uid(), 'same_fingerprint_multi_account', 'high',
      'Device fingerprint shared with ' || v_other_users || ' other account(s)',
      jsonb_build_object('fingerprint', p_fingerprint, 'other_user_count', v_other_users, 'ip', v_ip));
  end if;
end;
$$;
