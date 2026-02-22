import { useEffect, useMemo, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import MeetingRoom from './pages/MeetingRoom'
import { cognitoConfig, cognitoDomain, hasCognitoConfig, logoutUri } from './config/cognito'
import { useMeetAuth } from './context/MeetAuthContext'

const protectedPaths = ['/dashboard', '/meeting/']

function App() {
  const { oidc, user, isAuthenticated, isLoading, error } = useMeetAuth()
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (to) => {
    if (to === window.location.pathname) return
    window.history.pushState({}, '', to)
    setPath(to)
  }

  const isProtectedRoute = useMemo(
    () => protectedPaths.some((basePath) => path.startsWith(basePath)),
    [path],
  )

  useEffect(() => {
    if (isAuthenticated && path === '/') {
      navigate('/dashboard')
    }
  }, [isAuthenticated, path])

  const signInWithCognito = () => {
    if (!hasCognitoConfig) return
    oidc.signinRedirect()
  }

  const signOut = async () => {
    await oidc.removeUser()

    if (!cognitoDomain || !cognitoConfig.client_id || !logoutUri) {
      navigate('/')
      return
    }

    const logoutUrl = `${cognitoDomain}/logout?client_id=${cognitoConfig.client_id}&logout_uri=${encodeURIComponent(logoutUri)}`
    window.location.href = logoutUrl
  }

  if (isLoading) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p>Loading...</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Authentication Error</h1>
          <p>{error.message}</p>
          <button type="button" className="google-btn" onClick={signInWithCognito}>
            Login with Cognito
          </button>
        </section>
      </main>
    )
  }

  if (!isAuthenticated && isProtectedRoute) {
    return <Login onLogin={signInWithCognito} disabled={!hasCognitoConfig} />
  }

  if (path.startsWith('/meeting/')) {
    return <MeetingRoom onNavigate={navigate} roomPath={path} user={user} />
  }

  if (path === '/dashboard') {
    return <Dashboard onNavigate={navigate} user={user} onSignOut={signOut} />
  }

  return <Login onLogin={signInWithCognito} disabled={!hasCognitoConfig} />
}

export default App
