import { useEffect, useMemo, useState } from 'react'
import ChatWidget from './components/ChatWidget'
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

  let page = <Login onLogin={signInWithCognito} disabled={!hasCognitoConfig} />

  if (isLoading) {
    page = (
      <main className="auth-page">
        <section className="auth-card">
          <p>Loading...</p>
        </section>
      </main>
    )
  } else if (error) {
    page = (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Authentication Error</h1>
          <p>{error.message}</p>
          <button type="button" className="google-btn" onClick={signInWithCognito}>
            Get Started to MeetLite
          </button>
        </section>
      </main>
    )
  } else if (!isAuthenticated && isProtectedRoute) {
    page = <Login onLogin={signInWithCognito} disabled={!hasCognitoConfig} />
  } else if (path.startsWith('/meeting/')) {
    page = <MeetingRoom onNavigate={navigate} roomPath={path} user={user} />
  } else if (path === '/dashboard') {
    page = <Dashboard onNavigate={navigate} user={user} onSignOut={signOut} />
  }

  return (
    <>
      {page}
      <ChatWidget isAuthenticated={isAuthenticated} onNavigate={navigate} isMeetingPage={path.startsWith('/meeting/')} />
    </>
  )
}

export default App
