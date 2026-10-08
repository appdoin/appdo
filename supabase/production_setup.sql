alter table public.fraud_logs drop constraint if exists fraud_logs_flag_type_check;
alter table public.fraud_logs add constraint fraud_logs_flag_type_check check (flag_type in (
  'same_device_multi_account','same_fingerprint_multi_account','same_ip_multi_review',
  'too_fast_submission','blacklisted_device','blacklisted_fingerprint','suspicious_timing',
  'duplicate_screenshot','vpn_detected','emulator_detected','no_install_proof'
));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.apps, public.settings, public.announcements to anon, authenticated;
grant select on public.profiles, public.devices, public.reviews, public.wallet_transactions,
  public.withdrawals, public.spins, public.daily_claims, public.referral_rewards,
  public.install_submissions, public.user_whitelist to authenticated;
grant insert (id, email, full_name, referral_code) on public.profiles to authenticated;
grant update (full_name, upi_id, payout_method, account_holder_name, bank_account_number, bank_ifsc)
  on public.profiles to authenticated;
grant select, insert, update on public.app_installations, public.user_review_comments,
  public.announcement_dismissals to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check (auth.uid() = id and role = 'user' and wallet_balance = 0 and total_earned = 0 and not phone_verified);

do $$ declare function_record record;
begin
  for function_record in (
    select pg_proc.oid::regprocedure as signature from pg_proc
    join pg_namespace on pg_namespace.oid = pronamespace
    where nspname = 'public' and prosecdef
      and not exists (select 1 from pg_depend where classid = 'pg_proc'::regclass
        and objid = pg_proc.oid and deptype = 'e')
  ) loop
    execute format('revoke execute on function %s from public, anon, authenticated', function_record.signature);
    execute format('grant execute on function %s to authenticated, service_role', function_record.signature);
  end loop;
end $$;
grant execute on function public.is_admin() to anon;
revoke execute on function public.get_latest_otp(uuid) from authenticated;

insert into public.settings (key, value) values
  ('spin_rewards', '[1,2,3,1,2,4,1,3]'),
  ('daily_claim_amounts', '[1,1,2,2,3,3,5]'),
  ('min_withdrawal', '"10"'),
  ('otp_expiry_minutes', '"10"'),
  ('referral_bonus', '"5"'),
  ('referral_enabled', 'true'),
  ('earning_goal', '"100"'),
  ('app_name', '"RewardReview"')
on conflict (key) do nothing;

alter publication supabase_realtime add table public.notifications;
notify pgrst, 'reload schema';