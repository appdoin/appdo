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

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s?.user?.id) loadProfile(s.user.id)
      else setProfile(null)
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

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthCtx.Provider
      value={{ session, profile, loading, signUp, signIn, signInWithGoogle, signOut, refreshProfile, isAdmin: profile?.role === 'admin' }}
    >
      {children}
    </AuthCtx.Provider>
  )
}
