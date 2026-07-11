-- =============================================================
--  Stronger phone verification: one phone number per physical device
--  Run in Supabase SQL Editor AFTER fraud_referral_v2_migration.sql
--  Safe to re-run.
--
--  Problem being fixed:
--   device_id and the full browser fingerprint both include
--   browser-engine-specific signals (userAgent, canvas, webgl,
--   language). So the SAME phone in a DIFFERENT browser produced a
--   DIFFERENT id and could verify a second phone number, defeating the
--   "one device = one phone number" rule.
--
--  Fix:
--   The client now also sends a cross-browser-stable `hardware_id`
--   (screen + dpr + timezone + cpu cores + touch + platform only).
--   We HARD BLOCK if that hardware id already verified a different
--   phone number. Whitelisted users (bypass_fraud_check) can override,
--   giving admins an escape hatch for rare false positives (two people
--   with an identical device model).
-- =============================================================

alter table public.phone_verifications
  add column if not exists hardware_id text;

create index if not exists idx_phone_verifications_hardware
  on public.phone_verifications(hardware_id) where hardware_id is not null;

-- Drop older overloads so the new 4-arg signature is unambiguous.
drop function if exists public.request_phone_otp_v2(text, text);
drop function if exists public.request_phone_otp_v2(text, text, text);
drop function if exists public.request_phone_otp_v2(text, text, text, text);

create or replace function public.request_phone_otp_v2(
  p_phone text,
  p_device_id text default null,
  p_fingerprint text default null,
  p_hardware_id text default null
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
  if p_hardware_id is not null and exists (select 1 from blacklist where kind in ('device','fingerprint') and value = p_hardware_id) then
    raise exception 'DEVICE_BLACKLISTED';
  end if;
  if v_ip is not null and exists (select 1 from blacklist where kind = 'ip' and value = v_ip) then
    raise exception 'IP_BLACKLISTED';
  end if;

  -- Whitelist bypass for the checks below (admin escape hatch)
  select coalesce(bool_or(bypass_fraud_check), false) into v_is_whitelisted
    from user_whitelist where user_id = auth.uid();

  if not v_is_whitelisted then
    -- ===== CORE RULE: one phone number per physical device =====
    -- Cross-browser stable hardware id already verified a DIFFERENT number.
    if p_hardware_id is not null and exists (
      select 1 from phone_verifications
      where hardware_id = p_hardware_id and verified = true and phone <> p_phone
    ) then
      insert into fraud_logs (user_id, flag_type, severity, detail, metadata)
      values (auth.uid(), 'same_device_multi_account', 'high',
        'Device already has a verified phone; blocked second number',
        jsonb_build_object('phone', p_phone, 'hardware_id', p_hardware_id, 'ip', v_ip));
      raise exception 'DEVICE_ALREADY_HAS_PHONE';
    end if;

    -- Same device_id already verified a DIFFERENT number (same browser).
    if p_device_id is not null and exists (
      select 1 from phone_verifications
      where device_id = p_device_id and verified = true and phone <> p_phone
    ) then
      raise exception 'DEVICE_ALREADY_HAS_PHONE';
    end if;

    -- Same fingerprint already verified a DIFFERENT number.
    if p_fingerprint is not null and exists (
      select 1 from phone_verifications
      where fingerprint = p_fingerprint and verified = true and phone <> p_phone
    ) then
      raise exception 'DEVICE_ALREADY_HAS_PHONE';
    end if;

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
        'fingerprint', p_fingerprint, 'hardware_id', p_hardware_id, 'ip', v_ip, 'flags', v_fraud_flags));
    raise exception 'FRAUD_DETECTED';
  end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');

  insert into phone_verifications (user_id, phone, code, expires_at, fraud_check_passed, device_id, fingerprint, hardware_id, ip_address)
  values (auth.uid(), p_phone, v_code, now() + (v_exp || ' minutes')::interval, true, p_device_id, p_fingerprint, p_hardware_id, v_ip)
  returning id into v_ver_id;

  return jsonb_build_object(
    'phone', p_phone, 'code', v_code, 'expires_minutes', v_exp,
    'verification_id', v_ver_id, 'fraud_passed', true
  );
end;
$$;

-- verify_phone_otp: also lock the phone->hardware binding at verify time.
create or replace function public.verify_phone_otp(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.phone_verifications;
  v_wl boolean := false;
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

  select coalesce(bool_or(bypass_fraud_check), false) into v_wl
    from user_whitelist where user_id = auth.uid();

  -- Re-check the one-number-per-device rule at verify time (race-safety).
  if not v_wl and v.hardware_id is not null and exists (
    select 1 from public.phone_verifications
    where hardware_id = v.hardware_id and verified = true and phone <> v.phone
  ) then
    raise exception 'DEVICE_ALREADY_HAS_PHONE';
  end if;

  update public.phone_verifications set verified = true where id = v.id;
  update public.profiles set phone = v.phone, phone_verified = true where id = auth.uid();
end;
$$;
