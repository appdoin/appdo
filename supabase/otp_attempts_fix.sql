create or replace function public.verify_phone_otp_v2(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  verification public.phone_verifications;
  whitelist_bypass boolean := false;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and not banned) then
    raise exception 'ACCOUNT_BANNED';
  end if;

  select * into verification from public.phone_verifications
    where user_id = auth.uid() and not verified
    order by created_at desc, id desc limit 1 for update;
  if not found then raise exception 'NO_OTP_REQUESTED'; end if;
  if verification.expires_at <= now() then raise exception 'OTP_EXPIRED'; end if;
  if verification.attempts >= 5 then
    return jsonb_build_object('verified', false, 'error', 'TOO_MANY_ATTEMPTS', 'attempts_remaining', 0);
  end if;

  if p_code is null or p_code <> verification.code then
    update public.phone_verifications set attempts = attempts + 1 where id = verification.id;
    return jsonb_build_object('verified', false, 'error', 'INVALID_CODE',
      'attempts_remaining', 4 - verification.attempts);
  end if;

  if exists (select 1 from public.profiles where phone = verification.phone and id <> auth.uid()) then
    raise exception 'PHONE_ALREADY_USED';
  end if;
  select coalesce(bool_or(bypass_fraud_check), false) into whitelist_bypass
    from public.user_whitelist where user_id = auth.uid();
  if not whitelist_bypass and exists (
    select 1 from public.phone_verifications
    where verified and phone <> verification.phone and (
      (verification.hardware_id is not null and hardware_id = verification.hardware_id)
      or (verification.device_id is not null and device_id = verification.device_id)
      or (verification.fingerprint is not null and fingerprint = verification.fingerprint)
    )
  ) then raise exception 'DEVICE_ALREADY_HAS_PHONE'; end if;

  update public.phone_verifications set verified = true where id = verification.id;
  update public.profiles set phone = verification.phone, phone_verified = true where id = auth.uid();
  return jsonb_build_object('verified', true);
end;
$$;

revoke all on function public.verify_phone_otp_v2(text) from public, anon;
grant execute on function public.verify_phone_otp_v2(text) to authenticated, service_role;
revoke all on function public.verify_phone_otp(text) from public, anon, authenticated;
notify pgrst, 'reload schema';