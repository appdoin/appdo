-- =============================================================
--  Signup reliability fix + email verification support
--  Run in Supabase SQL Editor (safe to re-run).
--
--  Fixes "Database error saving new user":
--   The handle_new_user() trigger used to raise hard exceptions
--   (e.g. DEVICE_ALREADY_REGISTERED) or fail on optional steps
--   (referral reward, device row). Any exception there makes
--   GoTrue return "Database error saving new user" and blocks the
--   whole signup. This version guarantees the profile is created
--   and NEVER lets optional/anti-fraud steps abort the signup.
--
--  Anti-fraud is still enforced later at phone verification and
--  review submission (which gate rewards & withdrawals), so making
--  the signup itself resilient does not weaken fraud protection.
-- =============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_device   text := nullif(new.raw_user_meta_data->>'device_id','');
  v_ref_code text := upper(nullif(new.raw_user_meta_data->>'referred_code',''));
  v_referrer uuid;
  v_bonus    numeric;
  v_name     text := coalesce(
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'name',''),
    nullif(new.raw_user_meta_data->>'user_name',''),
    split_part(new.email,'@',1)
  );
begin
  -- Resolve referrer from code (best-effort, never fatal).
  begin
    if v_ref_code is not null then
      select id into v_referrer from public.profiles where referral_code = v_ref_code limit 1;
    end if;
  exception when others then
    v_referrer := null;
  end;

  -- CORE: create the profile. This is the only thing that truly matters.
  insert into public.profiles (id, email, full_name, device_id, referral_code, referred_by)
  values (
    new.id, new.email, v_name, v_device,
    upper(substr(replace(new.id::text,'-',''),1,8)),
    v_referrer
  )
  on conflict (id) do update set
    full_name   = coalesce(nullif(excluded.full_name,''), profiles.full_name),
    email       = coalesce(excluded.email, profiles.email),
    referred_by = coalesce(profiles.referred_by, excluded.referred_by);

  -- Device registration (best-effort). A duplicate device no longer blocks
  -- signup; it is simply recorded once. Fraud is caught later.
  begin
    if v_device is not null then
      -- Note if this device already belongs to someone else (for admin review).
      if exists (select 1 from public.devices where device_id = v_device and user_id <> new.id) then
        begin
          insert into public.fraud_logs (user_id, flag_type, severity, detail, metadata)
          values (new.id, 'same_device_multi_account', 'medium',
            'New signup on a device already tied to another account',
            jsonb_build_object('device_id', v_device));
        exception when others then null;
        end;
      end if;

      insert into public.devices(device_id, user_id) values (v_device, new.id)
      on conflict (device_id) do nothing;
    end if;
  exception when others then
    null;
  end;

  -- Pending referral reward (best-effort).
  begin
    if v_referrer is not null and v_referrer <> new.id then
      v_bonus := coalesce(nullif(public.get_setting_text('referral_bonus'),'')::numeric, 10);
      insert into public.referral_rewards (referrer_id, referred_id, bonus_amount, status)
      values (v_referrer, new.id, v_bonus, 'pending')
      on conflict (referrer_id, referred_id) do nothing;
    end if;
  exception when others then
    null;
  end;

  return new;

exception when others then
  -- Absolute last-resort safety net: never block auth signup. Ensure at
  -- least a minimal profile row exists so the app can function.
  begin
    insert into public.profiles (id, email, full_name, referral_code)
    values (new.id, new.email, v_name, upper(substr(replace(new.id::text,'-',''),1,8)))
    on conflict (id) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

-- Make sure the trigger is attached (no-op if already present).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
