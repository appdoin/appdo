insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', 'test@gmail.com', '{"full_name":"Setup validation"}');

do $$ begin
  if not exists (select 1 from public.profiles
    where id = '00000000-0000-0000-0000-000000000001' and role = 'user') then
    raise exception 'Signup must create a non-admin profile';
  end if;
end $$;

insert into public.apps (id, name, task_type, slots_left, reward_amount)
values ('00000000-0000-0000-0000-000000000002', 'Setup validation', 'install', 1, 10);
update public.profiles set wallet_balance = 100, phone_verified = true, payout_method = 'bank',
  account_holder_name = 'Setup validation', bank_account_number = '1234567890', bank_ifsc = 'TEST0000001'
where id = '00000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  begin
    update public.profiles set wallet_balance = 9999 where id = auth.uid();
    raise exception 'Wallet mutation was not blocked';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'Admin promotion was not blocked';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set full_name = 'Updated validation' where id = auth.uid();
  perform public.submit_install_task('00000000-0000-0000-0000-000000000002', 'https://example.invalid/proof.png', 'https://example.invalid/proof.png');
  if not exists (select 1 from public.install_submissions where user_id = auth.uid() and status = 'pending' and reward_amount = 10) then
    raise exception 'Install submission failed';
  end if;
  if (select slots_left from public.apps where id = '00000000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'Install slots were not reserved';
  end if;
  perform public.request_withdrawal(10, null);
  if not exists (select 1 from public.withdrawals where user_id = auth.uid() and payout_method = 'bank' and amount = 10) then
    raise exception 'Bank withdrawal failed';
  end if;
  if (select wallet_balance from public.profiles where id = auth.uid()) <> 90 then
    raise exception 'Withdrawal balance mismatch';
  end if;
  begin
    perform public.request_withdrawal(-10, null);
    raise exception 'Negative withdrawal was accepted';
  exception when raise_exception then
    if sqlerrm <> 'BELOW_MIN_WITHDRAWAL' then raise; end if;
  end;
end $$;
reset role;

insert into public.phone_verifications (user_id, phone, code, expires_at)
values ('00000000-0000-0000-0000-000000000001', '9876543210', '123456', now() + interval '10 minutes');
set local role authenticated;
do $$ declare result jsonb;
begin
  result := public.verify_phone_otp_v2('000000');
  if result->>'error' <> 'INVALID_CODE' or (result->>'verified')::boolean then
    raise exception 'Incorrect OTP was accepted';
  end if;
end $$;
reset role;
do $$ begin
  if (select attempts from public.phone_verifications
    where user_id = '00000000-0000-0000-0000-000000000001' and not verified) <> 1 then
    raise exception 'Incorrect OTP attempt was rolled back';
  end if;
end $$;

set local role authenticated;
do $$ declare attempt_number int; result jsonb;
begin
  for attempt_number in 2..5 loop
    result := public.verify_phone_otp_v2('000000');
    if result->>'error' <> 'INVALID_CODE' then raise exception 'Invalid OTP response'; end if;
  end loop;
  result := public.verify_phone_otp_v2('123456');
  if result->>'error' <> 'TOO_MANY_ATTEMPTS' or (result->>'verified')::boolean then
    raise exception 'OTP attempt limit was bypassed';
  end if;
  begin
    perform public.verify_phone_otp('123456');
    raise exception 'Legacy OTP endpoint remains accessible';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

update public.phone_verifications set attempts = 0
where user_id = '00000000-0000-0000-0000-000000000001' and not verified;
set local role authenticated;
do $$ declare result jsonb;
begin
  result := public.verify_phone_otp_v2('123456');
  if result->>'verified' <> 'true' then raise exception 'Valid OTP was rejected'; end if;
end $$;
reset role;

set local role anon;
do $$ begin
  perform count(*) from public.apps;
  perform count(*) from public.settings;
  perform count(*) from public.announcements;
  begin
    perform count(*) from public.profiles;
    raise exception 'Anonymous profile access was not blocked';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;