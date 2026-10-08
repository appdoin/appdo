create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  type text not null default 'info' check (type in ('info','warning','success','promo')),
  active boolean not null default true,
  priority int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.blacklist (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('phone','device','fingerprint','ip','email')),
  value text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

alter table public.apps
  add column if not exists task_type text not null default 'review' check (task_type in ('review','install')),
  add column if not exists required_stars int not null default 5 check (required_stars between 1 and 5),
  add column if not exists review_language text not null default 'hinglish',
  add column if not exists comment_length text not null default 'short',
  add column if not exists two_step boolean not null default false;

alter table public.profiles
  add column if not exists payout_method text not null default 'upi' check (payout_method in ('upi','bank')),
  add column if not exists account_holder_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text;

alter table public.withdrawals
  alter column upi_id drop not null,
  add column if not exists payout_method text not null default 'upi' check (payout_method in ('upi','bank')),
  add column if not exists account_holder_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text;

create table if not exists public.app_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid not null references public.apps(id) on delete cascade,
  installed_at timestamptz not null default now(),
  unique (user_id, app_id)
);

create table if not exists public.user_review_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid not null references public.apps(id) on delete cascade,
  comment text not null,
  stars int not null default 5 check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, app_id)
);

create table if not exists public.install_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid not null references public.apps(id) on delete cascade,
  screenshot_inside text not null,
  screenshot_outside text not null,
  reward_amount numeric(10,2) not null check (reward_amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, app_id)
);

alter table public.announcements enable row level security;
alter table public.blacklist enable row level security;
alter table public.app_installations enable row level security;
alter table public.user_review_comments enable row level security;
alter table public.install_submissions enable row level security;

create policy announcements_read on public.announcements for select
  using (active or public.is_admin());
create policy announcements_admin on public.announcements for all
  using (public.is_admin()) with check (public.is_admin());
create policy blacklist_admin on public.blacklist for all
  using (public.is_admin()) with check (public.is_admin());
create policy installations_own on public.app_installations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy comments_own on public.user_review_comments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy install_submissions_read on public.install_submissions for select
  using (auth.uid() = user_id or public.is_admin());
create policy install_submissions_admin on public.install_submissions for update
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.submit_install_task(
  p_app_id uuid, p_screenshot_inside text, p_screenshot_outside text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  selected_app public.apps;
  submission_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and not banned) then
    raise exception 'ACCOUNT_BANNED';
  end if;
  if nullif(trim(p_screenshot_inside), '') is null or nullif(trim(p_screenshot_outside), '') is null then
    raise exception 'SCREENSHOT_REQUIRED';
  end if;
  select * into selected_app from public.apps
    where id = p_app_id and active and task_type = 'install' for update;
  if not found then raise exception 'APP_NOT_FOUND'; end if;
  if selected_app.slots_left <= 0 then raise exception 'NO_SLOTS_LEFT'; end if;
  if exists (select 1 from public.install_submissions where user_id = auth.uid() and app_id = p_app_id) then
    raise exception 'ALREADY_SUBMITTED';
  end if;
  insert into public.install_submissions (
    user_id, app_id, screenshot_inside, screenshot_outside, reward_amount
  ) values (auth.uid(), p_app_id, p_screenshot_inside, p_screenshot_outside, selected_app.reward_amount)
  returning id into submission_id;
  update public.apps set slots_left = slots_left - 1 where id = p_app_id;
  return submission_id;
end;
$$;

create or replace function public.request_withdrawal(p_amount numeric, p_upi text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  minimum_amount numeric := coalesce(nullif(public.get_setting_text('min_withdrawal'),'')::numeric, 10);
  selected_profile public.profiles;
  withdrawal_id uuid;
  selected_upi text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into selected_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if selected_profile.banned then raise exception 'ACCOUNT_BANNED'; end if;
  if not selected_profile.phone_verified then raise exception 'PHONE_NOT_VERIFIED'; end if;
  if p_amount is null or p_amount <= 0 or p_amount < minimum_amount then raise exception 'BELOW_MIN_WITHDRAWAL'; end if;
  if p_amount > selected_profile.wallet_balance then raise exception 'INSUFFICIENT_BALANCE'; end if;
  selected_upi := coalesce(nullif(trim(p_upi),''), nullif(trim(selected_profile.upi_id),''));
  if selected_profile.payout_method = 'upi' and selected_upi is null then raise exception 'UPI_REQUIRED'; end if;
  if selected_profile.payout_method = 'bank' and (
    nullif(trim(selected_profile.account_holder_name),'') is null
    or nullif(trim(selected_profile.bank_account_number),'') is null
    or nullif(trim(selected_profile.bank_ifsc),'') is null
  ) then raise exception 'BANK_DETAILS_REQUIRED'; end if;
  update public.profiles set wallet_balance = wallet_balance - p_amount,
    upi_id = coalesce(selected_upi, upi_id) where id = auth.uid();
  insert into public.withdrawals (
    user_id, amount, upi_id, payout_method, account_holder_name, bank_account_number, bank_ifsc
  ) values (
    auth.uid(), p_amount, selected_upi, selected_profile.payout_method,
    selected_profile.account_holder_name, selected_profile.bank_account_number, selected_profile.bank_ifsc
  ) returning id into withdrawal_id;
  insert into public.wallet_transactions(user_id, amount, type, description, ref_id)
    values (auth.uid(), -p_amount, 'withdrawal', 'Withdrawal requested', withdrawal_id);
  return withdrawal_id;
end;
$$;