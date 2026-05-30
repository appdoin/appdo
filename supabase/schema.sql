-- =============================================================
--  RewardReview — Full Database Schema (Supabase / Postgres)
--  Run this in: Supabase Dashboard -> SQL Editor -> New query
--  Safe to re-run (uses IF NOT EXISTS / OR REPLACE / drops old policies)
-- =============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- =============================================================
--  TABLES
-- =============================================================

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text unique,
  phone         text unique,
  upi_id        text,
  wallet_balance numeric(12,2) not null default 0,
  total_earned   numeric(12,2) not null default 0,
  phone_verified boolean not null default false,
  device_id      text,
  role           text not null default 'user' check (role in ('user','admin')),
  referral_code  text unique,
  referred_by    uuid references public.profiles(id),
  banned         boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.devices (
  device_id  text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

create table if not exists public.apps (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  icon_url      text,
  category      text default 'Other',
  reward_amount numeric(10,2) not null default 10,
  play_store_url text,
  slots_left    int not null default 999,
  est_time_min  int not null default 4,
  wait_seconds  int not null default 40,
  review_template text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  app_id        uuid not null references public.apps(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_text   text,
  screenshot_url text,
  reward_amount numeric(10,2) not null default 0,
  reject_reason text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  unique (user_id, app_id)
);

create table if not exists public.wallet_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(12,2) not null,
  type        text not null check (type in ('review','spin','daily','referral','withdrawal','adjustment')),
  description text,
  ref_id      uuid,
  created_at  timestamptz not null default now()
);

create table if not exists public.withdrawals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(12,2) not null,
  upi_id      text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  phone       text not null,
  code        text not null,
  verified    boolean not null default false,
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.spins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     numeric(10,2) not null,
  spin_date  date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, spin_date)
);

create table if not exists public.daily_claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  claim_date  date not null default current_date,
  day_number  int not null default 1,
  amount      numeric(10,2) not null,
  created_at  timestamptz not null default now(),
  unique (user_id, claim_date)
);

-- =============================================================
--  HELPER FUNCTIONS
-- =============================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.get_setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.settings where key = p_key;
$$;

-- Extract raw text from jsonb setting (for casting to numeric/int)
create or replace function public.get_setting_text(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select value #>> '{}' from public.settings where key = p_key;
$$;

-- =============================================================
--  NEW USER TRIGGER (creates profile on signup/OAuth)
-- =============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_device text := nullif(new.raw_user_meta_data->>'device_id','');
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

  insert into public.profiles (id, email, full_name, device_id, referral_code)
  values (new.id, new.email, v_name, v_device, upper(substr(replace(new.id::text,'-',''),1,8)))
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name,''), profiles.full_name),
    email     = coalesce(excluded.email, profiles.email);

  if v_device is not null then
    insert into public.devices(device_id, user_id) values (v_device, new.id)
    on conflict (device_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
--  AUTO-PROMOTE test@gmail.com to admin
-- =============================================================
create or replace function public.auto_promote_test_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email = 'test@gmail.com' then
    new.role := 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists promote_test_admin on public.profiles;
create trigger promote_test_admin
  before insert on public.profiles
  for each row execute function public.auto_promote_test_admin();

-- =============================================================
--  REVIEW SUBMISSION
-- =============================================================
create or replace function public.submit_review(
  p_app_id uuid, p_review_text text, p_screenshot_url text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app public.apps;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned = true) then
    raise exception 'ACCOUNT_BANNED';
  end if;

  select * into v_app from public.apps where id = p_app_id and active = true;
  if not found then raise exception 'APP_NOT_FOUND'; end if;
  if v_app.slots_left <= 0 then raise exception 'NO_SLOTS_LEFT'; end if;

  if exists (select 1 from public.reviews where user_id = auth.uid() and app_id = p_app_id) then
    raise exception 'ALREADY_REVIEWED';
  end if;

  insert into public.reviews(user_id, app_id, review_text, screenshot_url, reward_amount, status)
  values (auth.uid(), p_app_id, p_review_text, p_screenshot_url, v_app.reward_amount, 'pending')
  returning id into v_id;

  update public.apps set slots_left = slots_left - 1 where id = p_app_id;
  return v_id;
end;
$$;

-- =============================================================
--  ADMIN: APPROVE / REJECT REVIEW
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
end;
$$;

create or replace function public.reject_review(p_review_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_r public.reviews;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_r from public.reviews where id = p_review_id for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_r.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.reviews set status='rejected', reject_reason=p_reason, reviewed_at=now()
    where id = p_review_id;
  update public.apps set slots_left = slots_left + 1 where id = v_r.app_id;
end;
$$;

-- =============================================================
--  WHATSAPP OTP
-- =============================================================
create or replace function public.request_phone_otp(p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_exp  int := coalesce(nullif(public.get_setting_text('otp_expiry_minutes'),'')::int, 10);
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if exists (select 1 from public.profiles where phone = p_phone and id <> auth.uid()) then
    raise exception 'PHONE_ALREADY_USED';
  end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');

  insert into public.phone_verifications(user_id, phone, code, expires_at)
  values (auth.uid(), p_phone, v_code, now() + (v_exp || ' minutes')::interval);

  return jsonb_build_object('phone', p_phone, 'code', v_code, 'expires_minutes', v_exp);
end;
$$;

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

  if exists (select 1 from public.profiles where phone = v.phone and id <> auth.uid()) then
    raise exception 'PHONE_ALREADY_USED';
  end if;

  update public.phone_verifications set verified = true where id = v.id;
  update public.profiles set phone = v.phone, phone_verified = true where id = auth.uid();
end;
$$;

-- =============================================================
--  DAILY SPIN
-- =============================================================
create or replace function public.do_daily_spin()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rewards jsonb := coalesce(public.get_setting('spin_rewards'), '[1,2,3,1,2,4,1,3]'::jsonb);
  v_len int;
  v_idx int;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.spins where user_id = auth.uid() and spin_date = current_date) then
    raise exception 'ALREADY_SPUN_TODAY';
  end if;

  v_len := jsonb_array_length(v_rewards);
  v_idx := floor(random() * v_len)::int;
  v_amount := (v_rewards->>v_idx)::numeric;

  insert into public.spins(user_id, amount) values (auth.uid(), v_amount);

  update public.profiles
    set wallet_balance = wallet_balance + v_amount,
        total_earned   = total_earned + v_amount
    where id = auth.uid();

  insert into public.wallet_transactions(user_id, amount, type, description)
  values (auth.uid(), v_amount, 'spin', 'Daily lucky spin');

  return jsonb_build_object('index', v_idx, 'amount', v_amount, 'segments', v_rewards);
end;
$$;

-- =============================================================
--  DAILY CLAIM (7-day streak)
-- =============================================================
create or replace function public.claim_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_amounts jsonb := coalesce(public.get_setting('daily_claim_amounts'), '[1,1,2,2,3,3,5]'::jsonb);
  v_last public.daily_claims;
  v_day int := 1;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.daily_claims where user_id = auth.uid() and claim_date = current_date) then
    raise exception 'ALREADY_CLAIMED_TODAY';
  end if;

  select * into v_last from public.daily_claims
   where user_id = auth.uid() order by claim_date desc limit 1;

  if found and v_last.claim_date = current_date - 1 then
    v_day := (v_last.day_number % jsonb_array_length(v_amounts)) + 1;
  else
    v_day := 1;
  end if;

  v_amount := (v_amounts->>(v_day-1))::numeric;

  insert into public.daily_claims(user_id, day_number, amount) values (auth.uid(), v_day, v_amount);

  update public.profiles
    set wallet_balance = wallet_balance + v_amount,
        total_earned   = total_earned + v_amount
    where id = auth.uid();

  insert into public.wallet_transactions(user_id, amount, type, description)
  values (auth.uid(), v_amount, 'daily', 'Daily claim day ' || v_day);

  return jsonb_build_object('day', v_day, 'amount', v_amount);
end;
$$;

-- =============================================================
--  WITHDRAWAL
-- =============================================================
create or replace function public.request_withdrawal(p_amount numeric, p_upi text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_min numeric := coalesce(nullif(public.get_setting_text('min_withdrawal'),'')::numeric, 10);
  v_prof public.profiles;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_prof from public.profiles where id = auth.uid() for update;

  if v_prof.banned then raise exception 'ACCOUNT_BANNED'; end if;
  if not v_prof.phone_verified then raise exception 'PHONE_NOT_VERIFIED'; end if;
  if p_amount < v_min then raise exception 'BELOW_MIN_WITHDRAWAL'; end if;
  if p_amount > v_prof.wallet_balance then raise exception 'INSUFFICIENT_BALANCE'; end if;
  if coalesce(nullif(p_upi,''), v_prof.upi_id) is null then raise exception 'UPI_REQUIRED'; end if;

  update public.profiles
    set wallet_balance = wallet_balance - p_amount,
        upi_id = coalesce(nullif(p_upi,''), upi_id)
    where id = auth.uid();

  insert into public.withdrawals(user_id, amount, upi_id, status)
  values (auth.uid(), p_amount, coalesce(nullif(p_upi,''), v_prof.upi_id), 'pending')
  returning id into v_id;

  insert into public.wallet_transactions(user_id, amount, type, description, ref_id)
  values (auth.uid(), -p_amount, 'withdrawal', 'Withdrawal requested', v_id);

  return v_id;
end;
$$;

create or replace function public.process_withdrawal(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('approved','rejected') then raise exception 'INVALID_STATUS'; end if;

  select * into v_w from public.withdrawals where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_w.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.withdrawals set status = p_status, note = p_note, processed_at = now() where id = p_id;

  if p_status = 'rejected' then
    update public.profiles set wallet_balance = wallet_balance + v_w.amount where id = v_w.user_id;
    insert into public.wallet_transactions(user_id, amount, type, description, ref_id)
    values (v_w.user_id, v_w.amount, 'adjustment', 'Withdrawal rejected — refund', v_w.id);
  end if;
end;
$$;

-- =============================================================
--  ROW LEVEL SECURITY
-- =============================================================
alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.reviews enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.phone_verifications enable row level security;
alter table public.spins enable row level security;
alter table public.daily_claims enable row level security;
alter table public.settings enable row level security;
alter table public.devices enable row level security;

-- Drop ALL existing policies in public schema for clean slate
do $$ declare r record;
begin
  for r in (select policyname, tablename from pg_policies where schemaname = 'public') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---- profiles ----
create policy "profiles_select" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
create policy "profiles_update" on public.profiles for update
  using (auth.uid() = id or public.is_admin());
create policy "profiles_insert" on public.profiles for insert
  with check (true);

-- ---- apps ----
create policy "apps_select" on public.apps for select
  using (active = true or public.is_admin());
create policy "apps_insert" on public.apps for insert
  with check (public.is_admin());
create policy "apps_update" on public.apps for update
  using (public.is_admin());
create policy "apps_delete" on public.apps for delete
  using (public.is_admin());

-- ---- reviews ----
create policy "reviews_select" on public.reviews for select
  using (auth.uid() = user_id or public.is_admin());
create policy "reviews_insert" on public.reviews for insert
  with check (auth.uid() = user_id);
create policy "reviews_update" on public.reviews for update
  using (public.is_admin());

-- ---- wallet_transactions ----
create policy "wtx_select" on public.wallet_transactions for select
  using (auth.uid() = user_id or public.is_admin());
create policy "wtx_insert" on public.wallet_transactions for insert
  with check (auth.uid() = user_id or public.is_admin());

-- ---- withdrawals ----
create policy "wd_select" on public.withdrawals for select
  using (auth.uid() = user_id or public.is_admin());
create policy "wd_insert" on public.withdrawals for insert
  with check (auth.uid() = user_id);
create policy "wd_update" on public.withdrawals for update
  using (public.is_admin());

-- ---- phone_verifications ----
create policy "pv_select" on public.phone_verifications for select
  using (auth.uid() = user_id);
create policy "pv_insert" on public.phone_verifications for insert
  with check (auth.uid() = user_id);

-- ---- spins ----
create policy "spins_select" on public.spins for select
  using (auth.uid() = user_id or public.is_admin());
create policy "spins_insert" on public.spins for insert
  with check (auth.uid() = user_id);

-- ---- daily_claims ----
create policy "daily_select" on public.daily_claims for select
  using (auth.uid() = user_id or public.is_admin());
create policy "daily_insert" on public.daily_claims for insert
  with check (auth.uid() = user_id);

-- ---- settings ----
create policy "settings_select" on public.settings for select
  using (true);
create policy "settings_insert" on public.settings for insert
  with check (public.is_admin());
create policy "settings_update" on public.settings for update
  using (public.is_admin());
create policy "settings_delete" on public.settings for delete
  using (public.is_admin());

-- ---- devices ----
create policy "devices_select" on public.devices for select
  using (public.is_admin() or auth.uid() = user_id);
create policy "devices_insert" on public.devices for insert
  with check (true);

-- =============================================================
--  STORAGE bucket for screenshots
-- =============================================================
insert into storage.buckets (id, name, public) values ('proofs','proofs', true)
  on conflict (id) do nothing;

-- Drop existing storage policies
do $$ declare r record;
begin
  for r in (select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects') loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "proofs_upload" on storage.objects for insert
  with check (bucket_id = 'proofs' and auth.role() = 'authenticated');
create policy "proofs_read" on storage.objects for select
  using (bucket_id = 'proofs');
create policy "proofs_delete" on storage.objects for delete
  using (bucket_id = 'proofs' and public.is_admin());
