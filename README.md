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
```bash
npm install
```

### 2. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → New project.
2. Open **SQL Editor** → run `supabase/schema.sql` (creates tables, RLS, functions, storage bucket).
3. Run `supabase/seed.sql` (default settings + sample apps).

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

### 5. Make yourself admin
Sign up with **test@gmail.com** — it auto-promotes to admin (trigger in seed.sql).
Or manually:
```sql
update public.profiles set role = 'admin' where email = 'test@gmail.com';
```
Reload → "Open Admin Panel" button appears on the Profile page (route `/admin`).

After that, you can add more admins from **Admin Panel → Admins** tab. Each added admin gets a password reset email so they can set their password and login.

### 6. Enable Google Sign-In
1. Supabase Dashboard → Authentication → Providers → Google → Enable
2. Create OAuth credentials in Google Cloud Console (https://console.cloud.google.com/apis/credentials)
3. Set Authorized redirect URI to: `https://jmgzpjvsswymronrgboh.supabase.co/auth/v1/callback`
4. Copy Client ID + Secret into Supabase Google provider settings.

### 7. Deploy to Vercel (from GitHub)
1. Push this code to a GitHub repo
2. Import the repo in [Vercel](https://vercel.com/new)
3. Set Environment Variables in Vercel:
   - `VITE_SUPABASE_URL` = `https://jmgzpjvsswymronrgboh.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Framework preset: **Vite** (auto-detected)
5. Deploy! The `vercel.json` handles SPA routing.

### 8. Edge Functions (optional, for admin invite + WhatsApp OTP)
```bash
supabase functions deploy invite-admin
supabase functions deploy send-whatsapp-otp
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set WHATSAPP_PROVIDER=callmebot CALLMEBOT_APIKEY=your_key
```

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
