-- =============================================================
--  RewardReview — Fraud Detection System
--  Run in Supabase SQL Editor AFTER admin_features.sql
--  Safe to re-run (idempotent)
-- =============================================================

-- ---------- 1. Device Fingerprints Table ----------
-- Tracks advanced browser fingerprints per user (survives logout/login)
create table if not exists public.device_fingerprints (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  fingerprint    text not null,
  user_agent     text,
  screen_res     text,
  timezone       `p text,
  ip_address     text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

-- Unique constraint: one fingerprint per user (upsert on login)
create unique index if not exists idx_device_fp_user_fp
  on public.device_fingerprints(user_id, fingerprint);

-- Index for cross-user fingerprint lookups
create index if not exists idx_device_fp_fingerprint
  on public.device_fingerprints(fingerprint);

-- ---------- 2. Fraud Logs Table ----------
create table if not exists public.fraud_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  review_id   uuid references public.reviews(id) on delete set null,
  flag_type   text not null check (flag_type in (
    'same_device_multi_account',
    'same_fingerprint_multi_account',
    'same_ip_multi_review',
    'too_fast_submission',
    'blacklisted_device',
    'blacklisted_fingerprint',
    'suspicious_timing',
    'duplicate_screenshot',
    'vpn_detected',
    'emulator_detected'
  )),
  severity    text not null default 'medium' check (severity in ('low','medium','high','critical')),
  detail      text,
  metadata    jsonb default '{}',
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_fraud_logs_user on public.fraud_logs(user_id);
create index if not exists idx_fraud_logs_review on public.fraud_logs(review_id);
create index if not exists idx_fraud_logs_type on public.fraud_logs(flag_type);

-- ---------- 3. Add columns to reviews for fraud tracking ----------
alter table public.reviews add column if not exists device_fingerprint text;
alter table public.reviews add column if not exists ip_address text;
alter table public.reviews add column if not exists time_spent_seconds int;
alter table public.reviews add column if not exists fraud_score int not null default 0;
alter table public.reviews add column if not exists fraud_flags text[] default '{}';

-- ---------- 4. Enhanced submit_review with fraud checks ----------
create or replace function public.submit_review(
  p_app_id uuid,
  p_review_text text,
  p_screenshot_url text,
  p_device_fingerprint text default null,
  p_ip_address text default null,
  p_time_spent_seconds int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app public.apps;
  v_id uuid;
  v_fraud_score int := 0;
  v_fraud_flags text[] := '{}';
  v_other_users int;
  v_same_ip_reviews int;
  v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.banned then raise exception 'ACCOUNT_BANNED'; end if;

  select * into v_app from public.apps where id = p_app_id and active = true;
  if not found then raise exception 'APP_NOT_FOUND'; end if;
  if v_app.slots_left <= 0 then raise exception 'NO_SLOTS_LEFT'; end if;

  if exists (select 1 from public.reviews where user_id = auth.uid() and app_id = p_app_id) then
    raise exception 'ALREADY_REVIEWED';
  end if;

  -- ========== FRAUD CHECKS ==========

  -- Check 1: Same fingerprint used by other accounts
  if p_device_fingerprint is not null and p_device_fingerprint <> '' then
    select count(distinct user_id) into v_other_users
    from public.device_fingerprints
    where fingerprint = p_device_fingerprint and user_id <> auth.uid();

    if v_other_users > 0 then
      v_fraud_score := v_fraud_score + 40;
      v_fraud_flags := array_append(v_fraud_flags, 'same_fingerprint_multi_account');
    end if;

    -- Check blacklisted fingerprint
    if exists (select 1 from public.blacklist where kind = 'device' and value = p_device_fingerprint) then
      v_fraud_score := v_fraud_score + 80;
      v_fraud_flags := array_append(v_fraud_flags, 'blacklisted_fingerprint');
    end if;
  end if;

  -- Check 2: Same device_id on profile used by other accounts
  if v_profile.device_id is not null then
    if exists (
      select 1 from public.profiles
      where device_id = v_profile.device_id and id <> auth.uid()
    ) then
      v_fraud_score := v_fraud_score + 50;
      v_fraud_flags := array_append(v_fraud_flags, 'same_device_multi_account');
    end if;

    -- Check blacklisted device
    if exists (select 1 from public.blacklist where kind = 'device' and value = v_profile.device_id) then
      v_fraud_score := v_fraud_score + 80;
      v_fraud_flags := array_append(v_fraud_flags, 'blacklisted_device');
    end if;
  end if;

  -- Check 3: Too fast submission (less than 30 seconds = suspicious)
  if p_time_spent_seconds is not null and p_time_spent_seconds < 30 then
    v_fraud_score := v_fraud_score + 30;
    v_fraud_flags := array_append(v_fraud_flags, 'too_fast_submission');
  end if;

  -- Check 4: Same IP submitted multiple reviews in last hour
  if p_ip_address is not null and p_ip_address <> '' then
    select count(*) into v_same_ip_reviews
    from public.reviews
    where ip_address = p_ip_address
      and user_id <> auth.uid()
      and created_at > now() - interval '1 hour';

    if v_same_ip_reviews >= 2 then
      v_fraud_score := v_fraud_score + 25;
      v_fraud_flags := array_append(v_fraud_flags, 'same_ip_multi_review');
    end if;
  end if;

  -- Check 5: Suspicious timing pattern (review within 2 min of account creation)
  if v_profile.created_at > now() - interval '2 minutes' then
    v_fraud_score := v_fraud_score + 20;
    v_fraud_flags := array_append(v_fraud_flags, 'suspicious_timing');
  end if;

  -- BLOCK if fraud score is critical (80+)
  if v_fraud_score >= 80 then
    -- Log and block
    insert into public.fraud_logs(user_id, flag_type, severity, detail, metadata)
    values (auth.uid(), 'blacklisted_device', 'critical',
      'Review blocked: fraud score ' || v_fraud_score,
      jsonb_build_object('flags', v_fraud_flags, 'app_id', p_app_id, 'fingerprint', p_device_fingerprint));
    raise exception 'REVIEW_BLOCKED_FRAUD';
  end if;

  -- INSERT the review
  insert into public.reviews(
    user_id, app_id, review_text, screenshot_url, reward_amount, status,
    device_fingerprint, ip_address, time_spent_seconds, fraud_score, fraud_flags
  )
  values (
    auth.uid(), p_app_id, p_review_text, p_screenshot_url,
    coalesce(public.get_app_reward(p_app_id), v_app.reward_amount),
    'pending',
    p_device_fingerprint, p_ip_address, p_time_spent_seconds,
    v_fraud_score, v_fraud_flags
  )
  returning id into v_id;

  update public.apps set slots_left = slots_left - 1 where id = p_app_id;

  -- Log any fraud flags (even non-blocking ones)
  if array_length(v_fraud_flags, 1) > 0 then
    for i in 1..array_length(v_fraud_flags, 1) loop
      insert into public.fraud_logs(user_id, review_id, flag_type, severity, detail, metadata)
      values (
        auth.uid(), v_id, v_fraud_flags[i],
        case when v_fraud_score >= 50 then 'high' when v_fraud_score >= 25 then 'medium' else 'low' end,
        'Auto-detected during review submission',
        jsonb_build_object('fraud_score', v_fraud_score, 'fingerprint', p_device_fingerprint, 'ip', p_ip_address, 'time_spent', p_time_spent_seconds)
      );
    end loop;
  end if;

  return v_id;
end;
$$;

-- ---------- 5. Register device fingerprint function ----------
-- Called on login/signup to track fingerprints per user
create or replace function public.register_device_fingerprint(
  p_fingerprint text,
  p_user_agent text default null,
  p_screen_res text default null,
  p_timezone text default null,
  p_ip_address text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_other_users int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_fingerprint is null or p_fingerprint = '' then return; end if;

  -- Upsert fingerprint record
  insert into public.device_fingerprints(user_id, fingerprint, user_agent, screen_res, timezone, ip_address)
  values (auth.uid(), p_fingerprint, p_user_agent, p_screen_res, p_timezone, p_ip_address)
  on conflict (user_id, fingerprint)
  do update set
    last_seen_at = now(),
    user_agent = coalesce(excluded.user_agent, device_fingerprints.user_agent),
    ip_address = coalesce(excluded.ip_address, device_fingerprints.ip_address);

  -- Check if this fingerprint is used by other accounts
  select count(distinct user_id) into v_other_users
  from public.device_fingerprints
  where fingerprint = p_fingerprint and user_id <> auth.uid();

  if v_other_users > 0 then
    -- Log fraud event
    insert into public.fraud_logs(user_id, flag_type, severity, detail, metadata)
    values (
      auth.uid(), 'same_fingerprint_multi_account', 'high',
      'Device fingerprint shared with ' || v_other_users || ' other account(s)',
      jsonb_build_object(
        'fingerprint', p_fingerprint,
        'other_user_count', v_other_users,
        'ip', p_ip_address
      )
    );
  end if;
end;
$$;

-- ---------- 6. Admin: get fraud summary for a user ----------
create or replace function public.get_user_fraud_info(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
  v_shared_devices int;
  v_fraud_count int;
  v_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select * into v_profile from public.profiles where id = p_user_id;

  -- Count shared fingerprints
  select count(distinct df2.user_id) into v_shared_devices
  from public.device_fingerprints df1
  join public.device_fingerprints df2 on df1.fingerprint = df2.fingerprint and df2.user_id <> p_user_id
  where df1.user_id = p_user_id;

  -- Count fraud logs
  select count(*) into v_fraud_count from public.fraud_logs where user_id = p_user_id;

  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'device_id', v_profile.device_id,
    'shared_device_accounts', v_shared_devices,
    'fraud_log_count', v_fraud_count,
    'is_banned', v_profile.banned
  );

  return v_result;
end;
$$;

-- ---------- 7. RLS for new tables ----------
alter table public.device_fingerprints enable row level security;
alter table public.fraud_logs enable row level security;

drop policy if exists dfp_own on public.device_fingerprints;
drop policy if exists dfp_admin on public.device_fingerprints;
create policy dfp_own on public.device_fingerprints for insert with check (auth.uid() = user_id);
create policy dfp_admin on public.device_fingerprints for select using (public.is_admin() or auth.uid() = user_id);

drop policy if exists fl_admin on public.fraud_logs;
create policy fl_admin on public.fraud_logs for all using (public.is_admin()) with check (public.is_admin());
-- Allow insert from the function (security definer bypasses RLS anyway)

-- ---------- 8. Updated blacklist to include fingerprint kind ----------
alter table public.blacklist drop constraint if exists blacklist_kind_check;
alter table public.blacklist
  add constraint blacklist_kind_check
  check (kind in ('email','phone','device','upi','fingerprint','ip'));
