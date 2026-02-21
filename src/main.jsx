import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import App from './App.jsx'
import { cognitoConfig } from './config/cognito'
import './styles/global.css'
import './styles/meeting.css'

const onSigninCallback = () => {
  window.history.replaceState({}, document.title, window.location.pathname)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider {...cognitoConfig} onSigninCallback={onSigninCallback}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
