# RewardReview — App Review Earning Platform

A mobile-optimized web app where users review Play Store apps, upload proof
screenshots, and earn rewards into a wallet. Includes a full **Admin Panel**
to approve proofs, manage apps/users/payouts and control the spin & daily-claim
economy. Backend powered by **Supabase**.

## ✨ Features

**User Panel**
- Browse available apps (search + categories), see balance & potential earnings
- Open app in Play Store → 40s wait timer → upload review screenshot proof
- Daily lucky spin wheel & 7-day daily-claim streak
- Earnings goal, achievement badges, leaderboard
- Review history with stats (all / pending / approved / rejected)
- Wallet: UPI id, WhatsApp verification, withdrawal requests
- Dark mode

**Admin Panel**
- Dashboard stats
- Approve / reject review proofs (auto-credits wallet)
- Apps CRUD (reward, slots, category, play url, wait time, template)
- User management (search, ban, wallet adjust)
- Withdrawals (mark paid / reject + auto refund)
- Settings: spin rewards, daily-claim amounts, min withdrawal, OTP expiry, referral bonus, earning goal

**Anti-fraud rules (enforced in DB)**
- Unique email (Supabase auth)
- Unique phone — one phone = one account
- One account per device (device fingerprint)
- One review per user per app
- Phone must be WhatsApp-verified before withdrawal

## 🚀 Setup

### 1. Install dependencies
Use Node.js 22.12 or newer (select Node.js 22 or 24 on Vercel).
```bash
npm install
```

### 2. Create a Supabase project
The current project is **APPDO** (`kkquvadzewwgqbmgdzbj`, Mumbai).
The backend has already been installed. Do not run the schema again on this project.

For a different, empty project, use the Supabase CLI:
```bash
supabase link --project-ref YOUR_PROJECT_REF
npm run supabase:check
npm run supabase:setup
```
The check runs the schema and behavior tests in a rollback-only transaction.
Setup refuses a project with existing public tables, auth users, buckets, or
storage policies. It installs the ordered migrations, RLS, production grants,
default settings, and the `proofs` bucket. It does not create sample apps or admins.

APPDO also has the OTP attempt-limit fix installed. Phone verification uses
`verify_phone_otp_v2`, which returns `{ verified, error, attempts_remaining }`.
Invalid attempts persist and five failures lock that code. The old
`verify_phone_otp` RPC is no longer accessible to browser clients.

### 3. Environment variables
```bash
cp .env.example .env
```
Fill from Supabase → Project Settings → API:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 4. Run
```bash
npm run dev
```
Open http://localhost:5173

Run the focused auth, wallet, and OTP UI regression tests:
```bash
npm test
```

### 5. Make yourself admin
Sign up normally, then promote your own verified account in the Supabase SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'YOUR_VERIFIED_EMAIL';
```
There is no automatic test-email promotion. This repository contains the user panel,
not an admin interface; use your separate admin application or the Supabase Dashboard
to manage apps and approvals.

### 6. Enable Google Sign-In
1. Supabase Dashboard → Authentication → Providers → Google → Enable
2. Create OAuth credentials in Google Cloud Console (https://console.cloud.google.com/apis/credentials)
3. Set Authorized redirect URI to: `https://kkquvadzewwgqbmgdzbj.supabase.co/auth/v1/callback`
4. Copy Client ID + Secret into Supabase Google provider settings.
5. In Supabase Authentication → URL Configuration, set Site URL to your final
   Vercel/custom-domain URL. Add that origin and its `/update-password` URL to
   Redirect URLs, plus `http://localhost:5173` and `http://localhost:5173/update-password`
   for local development.

### 7. Deploy to Vercel (from GitHub)
1. Push this code to a GitHub repo
2. Import the repo in [Vercel](https://vercel.com/new)
3. Set Environment Variables in Vercel:
   - `VITE_SUPABASE_URL` = `https://kkquvadzewwgqbmgdzbj.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the public anon key from the ignored local `.env`
   - `VITE_APP_NAME` = `RewardReview` (optional)
4. Import `appdoin/appdo`, branch `main`, root directory `./`.
5. Framework preset: **Vite**, build command `npm run build`, output directory `dist`.
6. Add the variables to Production and Preview, then deploy. Redeploy after any
   environment-variable change: Vite embeds these values during the build.
7. Configure Supabase Auth URLs as described above after the final domain is known.

Never add a service-role key, database password, Google client secret, or Groq API
key to `VITE_*` variables. They are public in the browser bundle. Current AI review
generation still uses `VITE_GROQ_API_KEY` and requires a server-side implementation
before a real Groq secret can be configured safely.

### 8. Edge Functions (optional, for admin invite + WhatsApp OTP)
`telegram-check` is deployed to APPDO and requires a signed-in user. Telegram
membership checks additionally need `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID`
in Supabase Edge Function secrets and a configured bot/webhook. The public webhook
is not deployed as part of this setup.

Other optional functions are not deployed automatically:
```bash
supabase functions deploy invite-admin --project-ref kkquvadzewwgqbmgdzbj --use-api
supabase functions deploy send-whatsapp-otp --project-ref kkquvadzewwgqbmgdzbj --use-api
```
Supabase supplies its own URL, anon key, and service-role key to deployed Edge
Functions. Do not put the service-role key into frontend configuration.

## 🛠 Tech Stack
React + Vite · Tailwind CSS · React Router · Supabase (Postgres + Auth + Storage + Edge Functions + Google OAuth) · lucide-react icons

## 📁 Structure
```
src/
├── components/   layouts, toast, phone verify
├── context/      auth provider (email + Google + admin check)
├── hooks/        theme
├── lib/          supabase client, helpers
├── pages/
│   ├── auth/     login, signup, reset-password, update-password
│   ├── user/     home, app detail, rewards, history, wallet, profile
│   └── admin/    dashboard, reviews, apps, users, withdrawals, settings, admins
supabase/
├── schema.sql    tables + RLS + functions + triggers
├── seed.sql      default settings + sample apps
└── functions/send-whatsapp-otp/   OTP delivery edge function
```
