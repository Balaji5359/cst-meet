const readRuntimeEnv = (key) => {
  if (typeof window === 'undefined') return ''
  const runtimeConfig = window.RUNTIME_CONFIG || {}
  const value = runtimeConfig[key]
  return typeof value === 'string' ? value.trim() : ''
}

const readProcessEnv = (key) => {
  const processValue =
    typeof process !== 'undefined' && process?.env && typeof process.env[key] === 'string'
      ? process.env[key].trim()
      : ''

  if (processValue) return processValue

  const viteValue =
    typeof import.meta !== 'undefined' && import.meta?.env && typeof import.meta.env[key] === 'string'
      ? import.meta.env[key].trim()
      : ''

  return viteValue
}

const readEnv = (key) => readRuntimeEnv(key) || readProcessEnv(key)

export const cognitoConfig = {
  authority: readEnv('VITE_COGNITO_AUTHORITY'),
  client_id: readEnv('VITE_COGNITO_CLIENT_ID'),
  redirect_uri: readEnv('VITE_COGNITO_REDIRECT_URI'),
  response_type: 'code',
  scope: readEnv('VITE_COGNITO_SCOPE') || 'openid email profile',
}

export const cognitoDomain = readEnv('VITE_COGNITO_DOMAIN')
export const logoutUri = readEnv('VITE_COGNITO_LOGOUT_URI')

const requiredEnvKeys = [
  'VITE_COGNITO_AUTHORITY',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_COGNITO_REDIRECT_URI',
  'VITE_COGNITO_DOMAIN',
  'VITE_COGNITO_LOGOUT_URI',
]

export const cognitoConfigErrors = requiredEnvKeys.filter((key) => !readEnv(key))
export const hasCognitoConfig = cognitoConfigErrors.length === 0
