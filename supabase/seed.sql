-- =============================================================
--  RewardReview — Seed Data
--  Run AFTER schema.sql in Supabase SQL Editor
-- =============================================================

-- ---------- Default settings (admin can change from panel) ----------
insert into public.settings (key, value) values
  ('spin_rewards',         '[1,2,3,1,2,4,1,3]'),
  ('daily_claim_amounts',  '[1,1,2,2,3,3,5]'),
  ('min_withdrawal',       '"10"'),
  ('otp_expiry_minutes',   '"10"'),
  ('referral_bonus',       '"5"'),
  ('earning_goal',         '"100"'),
  ('app_name',             '"RewardReview"')
on conflict (key) do update set value = excluded.value;

-- ---------- Sample apps ----------
insert into public.apps (name, description, category, reward_amount, play_store_url, slots_left, est_time_min, wait_seconds, review_template)
values
  ('Rewardnest', 'Review & earn reward', 'Other', 10, 'https://play.google.com/store/apps/details?id=com.example.rewardnest', 999, 4, 40, 'Great app, very useful and easy to use!'),
  ('Tagglo',     'Hi', 'Other', 10, 'https://play.google.com/store/apps/details?id=com.example.tagglo', 999, 4, 40, 'Awesome experience, highly recommended!')
on conflict do nothing;
