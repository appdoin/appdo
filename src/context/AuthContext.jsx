import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getDeviceId } from '../lib/format'

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
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      loadProfile(s?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [session, loadProfile],
  )

  const signUp = async ({ email, password, fullName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, device_id: getDeviceId() } },
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
