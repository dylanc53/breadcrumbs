import { useState } from 'react'
import { supabase } from './supabase'

// Login / signup screen. Signup either creates a new team (first user,
// becomes manager) or joins an existing one with its 6-character code.
// `needsProfile` handles a signed-in user whose org step didn't finish.
export default function Auth({ initialMode, needsProfile, onProfileReady }) {
  const [mode, setMode] = useState(
    needsProfile ? 'signup' : (initialMode ?? 'login')
  )
  const [orgMode, setOrgMode] = useState('join') // 'join' | 'create'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        return
      }

      if (!needsProfile) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          throw new Error(
            'Signup needs email confirmation, which this app does not use. ' +
              'Ask your admin to disable "Confirm email" in Supabase auth settings, then try again.'
          )
        }
      }

      const rpc =
        orgMode === 'create'
          ? supabase.rpc('create_org_and_join', {
              org_name: orgName.trim(),
              user_name: name.trim(),
            })
          : supabase.rpc('join_org_with_code', {
              code: joinCode.trim(),
              user_name: name.trim(),
            })
      const { error } = await rpc
      if (error) throw error
      onProfileReady()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-logo">🍞 Breadcrumbs</h1>
        <p className="auth-tag">Door-to-door canvassing, mapped.</p>

        {mode === 'signup' && (
          <input
            className="auth-input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}

        {!needsProfile && (
          <>
            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </>
        )}

        {mode === 'signup' && (
          <>
            <div className="seg-row">
              <button
                type="button"
                className={`seg ${orgMode === 'join' ? 'active' : ''}`}
                onClick={() => setOrgMode('join')}
              >
                Join a team
              </button>
              <button
                type="button"
                className={`seg ${orgMode === 'create' ? 'active' : ''}`}
                onClick={() => setOrgMode('create')}
              >
                Start a team
              </button>
            </div>
            {orgMode === 'join' ? (
              <input
                className="auth-input"
                placeholder="Team join code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                required
              />
            ) : (
              <input
                className="auth-input"
                placeholder="Team name (e.g. Custom Remodeling)"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            )}
          </>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="btn save auth-submit" disabled={busy}>
          {busy
            ? 'Working…'
            : mode === 'login'
              ? 'Log in'
              : needsProfile
                ? 'Finish setup'
                : 'Sign up'}
        </button>

        {!needsProfile && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
            }}
          >
            {mode === 'login'
              ? 'New here? Create an account'
              : 'Already have an account? Log in'}
          </button>
        )}
      </form>
    </div>
  )
}
