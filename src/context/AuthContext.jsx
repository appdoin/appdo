import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getDeviceId } from '../lib/format'
import { generateFingerprint, getDeviceMetadata } from '../lib/fingerprint'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) return setProfile(null)
    let { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    // Safety net: create profile if trigger missed it
    if (!data) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || ''
        await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email,
          full_name: name,
          referral_code: user.id.replace(/-/g, '').substring(0, 8).toUpperCase(),
        }, { onConflict: 'id' })
        const res = await supabase.from('profiles').select('*').eq('id', userId).single()
        data = res.data
      }
    }
    setProfile(data ?? null)

    // If the user signed up via a referral link but isn't linked yet
    // (e.g. Google OAuth couldn't carry metadata), apply it now.
    try {
      const refCode = (localStorage.getItem('ref_code') || '').trim().toUpperCase()
      if (refCode && data && !data.referred_by) {
        const { error } = await supabase.rpc('apply_referral', { p_referral_code: refCode })
        if (!error) {
          localStorage.removeItem('ref_code')
          const res = await supabase.from('profiles').select('*').eq('id', userId).single()
          if (res.data) setProfile(res.data)
        }
      } else if (data?.referred_by) {
        localStorage.removeItem('ref_code')
      }
    } catch { /* non-blocking */ }

    // Register device fingerprint silently for fraud detection
    try {
      const fp = await generateFingerprint()
      const meta = getDeviceMetadata()
      await supabase.rpc('register_device_fingerprint', {
        p_fingerprint: fp,
        p_user_agent: meta.userAgent,
        p_screen_res: meta.screenRes,
        p_timezone: meta.timezone,
      })
    } catch { /* non-blocking */ }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      setSession(s)
      setLoading(false)
      if (s?.user?.id) loadProfile(s.user.id)
    }).catch(() => setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (s?.user?.id) {
        loadProfile(s.user.id)
        // Mark a fresh sign-in (e.g. Google OAuth) so we can prompt the
        // user to join Telegram immediately after they log in.
        if (event === 'SIGNED_IN') {
          try { sessionStorage.setItem('tg_prompt_pending', '1') } catch { /* ignore */ }
        }
      } else {
        setProfile(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [session, loadProfile],
  )

  const signUp = async ({ email, password, fullName, referralCode }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          device_id: getDeviceId(),
          referred_code: (referralCode || '').trim().toUpperCase() || null,
        },
      },
    })
    if (error) throw error
    return data
  }

  const signIn = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  // Verify the 6-digit code emailed to the user right after sign-up.
  // On success Supabase confirms the email and returns a live session.
  const verifyEmailOtp = async ({ email, token }) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: (email || '').trim(),
      token: (token || '').trim(),
      type: 'signup',
    })
    if (error) throw error
    return data
  }

  // Re-send the sign-up confirmation code.
  const resendSignupOtp = async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: (email || '').trim() })
    if (error) throw error
  }

  const signInWithGoogle = async () => {
    // Use explicit origin so Google OAuth always returns to the user panel
    // regardless of Supabase Site URL setting
    const origin = import.meta.env.VITE_APP_URL || window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origin },
    })
    if (error) throw error
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthCtx.Provider
      value={{ session, profile, loading, signUp, signIn, verifyEmailOtp, resendSignupOtp, signInWithGoogle, signOut, refreshProfile, isAdmin: profile?.role === 'admin' }}
    >
      {children}
    </AuthCtx.Provider>
  )
}
