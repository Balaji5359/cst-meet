import { useEffect, useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MeetingRoom from './pages/MeetingRoom'

function App() {
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

  if (path === '/dashboard') {
    return <Dashboard onNavigate={navigate} />
  }

  if (path.startsWith('/meeting/')) {
    return <MeetingRoom onNavigate={navigate} roomPath={path} />
  }

  return <Login onNavigate={navigate} />
}

export default App
