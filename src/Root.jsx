import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Auth from './Auth.jsx'
import App from './App.jsx'

export default function Root() {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [profile, setProfile] = useState(undefined)
  const [org, setOrg] = useState(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Right after signup the profile row is created a beat later than the
  // session, so a missing profile is retried before concluding it's absent
  useEffect(() => {
    if (!session) {
      setProfile(undefined)
      setOrg(null)
      return
    }
    let cancelled = false
    let attempts = 0
    async function tryLoad() {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (prof) {
        setProfile(prof)
        const { data: orgRow } = await supabase
          .from('orgs')
          .select('*')
          .eq('id', prof.org_id)
          .maybeSingle()
        if (!cancelled) setOrg(orgRow)
        return
      }
      attempts += 1
      if (attempts < 6) {
        setTimeout(() => cancelled || tryLoad(), 1000)
      } else {
        setProfile(null)
      }
    }
    tryLoad()
    return () => {
      cancelled = true
    }
  }, [session, reloadNonce])

  const loadProfile = () => setReloadNonce((n) => n + 1)

  if (!supabase) {
    return (
      <div className="token-notice">
        <h1>Breadcrumbs</h1>
        <p>
          Missing Supabase config. Open <code>.env</code> and fill in{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          from your Supabase project (Settings → API), then restart the dev
          server.
        </p>
      </div>
    )
  }

  if (session === undefined) return <div className="auth-screen" />

  if (!session) return <Auth needsProfile={false} onProfileReady={loadProfile} />

  if (profile === undefined) return <div className="auth-screen" />

  // Signed in but the org step never finished (e.g. closed mid-signup)
  if (!profile) return <Auth needsProfile onProfileReady={loadProfile} />

  return (
    <App
      profile={profile}
      org={org}
      onSignOut={() => supabase.auth.signOut()}
    />
  )
}
