-- =============================================================
--  RewardReview — New Features Migration
--  Adds: notifications, announcement_dismissals, referral_rewards
--  Safe to re-run (idempotent)
-- =============================================================

-- ---------- 1. Notifications table ----------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null default 'system' check (type in ('review_approved','review_rejected','withdrawal_completed','withdrawal_failed','new_app','system')),
  title       text not null,
  message     text,
  data        jsonb default '{}',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 2. Announcement Dismissals ----------
create table if not exists public.announcement_dismissals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  unique (user_id, announcement_id)
);

alter table public.announcement_dismissals enable row level security;
drop policy if exists dismiss_own on public.announcement_dismissals;
create policy dismiss_own on public.announcement_dismissals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 3. Referral Rewards ----------
create table if not exists public.referral_rewards (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.profiles(id) on delete cascade,
  referred_id  uuid not null references public.profiles(id) on delete cascade,
  bonus_amount numeric(10,2) not null default 10,
  status       text not null default 'pending' check (status in ('pending','credited')),
  created_at   timestamptz not null default now(),
  unique (referrer_id, referred_id)
);

alter table public.referral_rewards enable row level security;
drop policy if exists ref_own on public.referral_rewards;
create policy ref_own on public.referral_rewards for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Add referral columns to profiles if missing
alter table public.profiles add column if not exists total_referrals int not null default 0;
alter table public.profiles add column if not exists total_earnings numeric(12,2) not null default 0;

-- ---------- 4. Apply Referral RPC ----------
create or replace function public.apply_referral(p_referral_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_referrer_id uuid;
begin
  if (select referred_by from profiles where id = auth.uid()) is not null then
    raise exception 'ALREADY_REFERRED';
  end if;

  select id into v_referrer_id from profiles where referral_code = p_referral_code;
  if v_referrer_id is null then
    raise exception 'INVALID_CODE';
  end if;

  if v_referrer_id = auth.uid() then
    raise exception 'CANNOT_REFER_SELF';
  end if;

  update profiles set referred_by = v_referrer_id where id = auth.uid();

  insert into referral_rewards (referrer_id, referred_id, bonus_amount, status)
  values (v_referrer_id, auth.uid(), coalesce((select (value::text)::numeric from settings where key = 'referral_bonus'), 10), 'pending')
  on conflict do nothing;
end;
$$;

-- ---------- 5. Enable Supabase Realtime on notifications ----------
-- (run this manually in Supabase Dashboard -> Database -> Replication if needed)
-- alter publication supabase_realtime add table public.notifications;

-- ---------- 6. Priority column for announcements (if missing) ----------
alter table public.announcements add column if not exists priority int not null default 0;
