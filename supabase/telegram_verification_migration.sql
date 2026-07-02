-- =============================================================
--  Telegram Join Verification
--  Adds real, server-verified Telegram channel membership tracking.
--  Run this in: Supabase Dashboard -> SQL Editor -> New query
-- =============================================================

alter table public.profiles
  add column if not exists telegram_id bigint unique,
  add column if not exists telegram_verified boolean not null default false,
  add column if not exists telegram_verified_at timestamptz,
  add column if not exists telegram_last_checked_at timestamptz;

comment on column public.profiles.telegram_id is
  'Telegram numeric user id, captured when the user starts our bot via the deep link.';
comment on column public.profiles.telegram_verified is
  'True only while the last check confirmed real channel membership via Bot API getChatMember. Flips back to false automatically if the user leaves.';
comment on column public.profiles.telegram_verified_at is
  'Timestamp of the last time membership was confirmed positive.';
comment on column public.profiles.telegram_last_checked_at is
  'Timestamp of the last membership check attempt (positive or negative). Used to trigger a silent recheck every ~15 days.';

-- =============================================================
--  SECURITY: prevent users from self-granting telegram_verified
-- =============================================================
-- The existing "profiles_update" policy allows a user to update their own
-- row with any column value via the client SDK — that would let anyone
-- open devtools and run:
--   supabase.from('profiles').update({ telegram_verified: true }).eq(...)
-- to fake verification. We block that by rejecting any client-side update
-- attempt that touches the telegram_* columns. Only the service-role key
-- (used exclusively inside our Edge Functions) bypasses RLS entirely and
-- can write these columns.

create or replace function public.protect_telegram_columns()
returns trigger language plpgsql as $$
begin
  -- auth.role() = 'service_role' only for service-role/Edge Function calls.
  if auth.role() <> 'service_role' then
    if new.telegram_verified is distinct from old.telegram_verified
       or new.telegram_verified_at is distinct from old.telegram_verified_at
       or new.telegram_last_checked_at is distinct from old.telegram_last_checked_at
       or new.telegram_id is distinct from old.telegram_id then
      raise exception 'TELEGRAM_FIELDS_ARE_SERVER_MANAGED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_telegram_columns_trg on public.profiles;
create trigger protect_telegram_columns_trg
  before update on public.profiles
  for each row execute function public.protect_telegram_columns();
