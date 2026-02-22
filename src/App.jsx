import { useEffect, useMemo, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import MeetingRoom from './pages/MeetingRoom'
import {
  cognitoConfig,
  cognitoConfigErrors,
  cognitoDomain,
  hasCognitoConfig,
  logoutUri,
} from './config/cognito'

const protectedPaths = ['/dashboard', '/meeting/']

function App() {
  const auth = useAuth()
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
    if (auth.isAuthenticated && path === '/') {
      navigate('/dashboard')
    }
  }, [auth.isAuthenticated, path])

  const signInWithGoogle = () => {
    if (!hasCognitoConfig) return
    auth.signinRedirect({ extraQueryParams: { identity_provider: 'Google' } })
  }

  const signInWithEmail = () => {
    if (!hasCognitoConfig) return
    auth.signinRedirect()
  }

  const signUp = () => {
    if (!hasCognitoConfig) return
    auth.signinRedirect({ extraQueryParams: { screen_hint: 'signup' } })
  }

  const signOut = async () => {
    await auth.removeUser()

    if (!cognitoDomain || !cognitoConfig.client_id || !logoutUri) {
      navigate('/')
      return
    }

    const logoutUrl = `${cognitoDomain}/logout?client_id=${cognitoConfig.client_id}&logout_uri=${encodeURIComponent(logoutUri)}`
    window.location.href = logoutUrl
  }

  const configErrorMessage = hasCognitoConfig
    ? ''
    : `Missing Cognito config fields: ${cognitoConfigErrors.join(', ')}`

  if (auth.isLoading) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p>Loading...</p>
        </section>
      </main>
    )
  }

  if (auth.error) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Authentication Error</h1>
          <p>{auth.error.message}</p>
          {configErrorMessage ? <p>{configErrorMessage}</p> : null}
          <button type="button" className="google-btn" onClick={signInWithEmail}>
            Try Again
          </button>
        </section>
      </main>
    )
  }

  if (!auth.isAuthenticated && isProtectedRoute) {
    return (
      <Login
        onSignInWithGoogle={signInWithGoogle}
        onSignInWithEmail={signInWithEmail}
        onSignUp={signUp}
        disabled={!hasCognitoConfig}
        errorMessage={configErrorMessage}
      />
    )
  }

  if (path.startsWith('/meeting/')) {
    return <MeetingRoom onNavigate={navigate} roomPath={path} />
  }

  if (path === '/dashboard') {
    return <Dashboard onNavigate={navigate} user={auth.user?.profile} onSignOut={signOut} />
  }

  return (
    <Login
      onSignInWithGoogle={signInWithGoogle}
      onSignInWithEmail={signInWithEmail}
      onSignUp={signUp}
      disabled={!hasCognitoConfig}
      errorMessage={configErrorMessage}
    />
  )
}

export default App


