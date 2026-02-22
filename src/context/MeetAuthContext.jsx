import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from 'react-oidc-context'

const TOKEN_STORAGE_KEY = 'meetlite.auth.tokens'

const MeetAuthContext = createContext(null)

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length < 2) return null

  try {
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

function deriveDisplayName(decoded) {
  const fullName = decoded?.name || decoded?.given_name
  if (fullName) return fullName

  const preferredUsername = decoded?.preferred_username || ''
  if (preferredUsername && !preferredUsername.startsWith('google_')) {
    return preferredUsername
  }

  const email = decoded?.email || ''
  if (email) {
    const localPart = email.split('@')[0] || ''
    if (localPart) return localPart
  }

  const cognitoUsername = decoded?.['cognito:username'] || ''
  if (cognitoUsername) return cognitoUsername

  return 'User'
}

export function MeetAuthProvider({ children }) {
  const oidc = useAuth()
  const [cachedTokens, setCachedTokens] = useState(null)

  useEffect(() => {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return

    try {
      setCachedTokens(JSON.parse(raw))
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!oidc.user) {
      setCachedTokens(null)
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      return
    }

    const nextTokens = {
      idToken: oidc.user.id_token || '',
      accessToken: oidc.user.access_token || '',
      refreshToken: oidc.user.refresh_token || '',
    }

    setCachedTokens(nextTokens)
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(nextTokens))
  }, [oidc.user])

  const tokens = oidc.user
    ? {
        idToken: oidc.user.id_token || '',
        accessToken: oidc.user.access_token || '',
        refreshToken: oidc.user.refresh_token || '',
      }
    : (cachedTokens ?? { idToken: '', accessToken: '', refreshToken: '' })

  const decoded = decodeJwtPayload(tokens.idToken)

  const user = useMemo(() => {
    if (!decoded) return null

    return {
      email: decoded.email || '',
      userId: decoded.sub || '',
      name: deriveDisplayName(decoded),
    }
  }, [decoded])

  const value = useMemo(
    () => ({
      oidc,
      tokens,
      user,
      isAuthenticated: !!oidc.isAuthenticated,
      isLoading: !!oidc.isLoading,
      error: oidc.error,
    }),
    [oidc, tokens, user],
  )

  return <MeetAuthContext.Provider value={value}>{children}</MeetAuthContext.Provider>
}

export function useMeetAuth() {
  const context = useContext(MeetAuthContext)
  if (!context) {
    throw new Error('useMeetAuth must be used inside MeetAuthProvider')
  }
  return context
}
