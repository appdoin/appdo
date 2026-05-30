import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  Supabase env vars missing. Copy .env.example to .env and fill them.')
}

export const supabase = createClient(url ?? 'http://localhost', anon ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
})
