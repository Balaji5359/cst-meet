const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

const FRONTEND_COGNITO = {
  authority: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_7K5mcI62q',
  client_id: '3ripmnd6eslk9auf7lq9b007d1',
  redirect_uri: appOrigin,
  scope: 'email openid',
  domain: 'https://ap-south-17k5mci62q.auth.ap-south-1.amazoncognito.com',
  logout_uri: appOrigin,
}

export const cognitoConfig = {
  authority: FRONTEND_COGNITO.authority,
  client_id: FRONTEND_COGNITO.client_id,
  redirect_uri: FRONTEND_COGNITO.redirect_uri,
  response_type: 'code',
  scope: FRONTEND_COGNITO.scope,
}

export const cognitoDomain = FRONTEND_COGNITO.domain
export const logoutUri = FRONTEND_COGNITO.logout_uri

const requiredConfigKeys = ['authority', 'client_id', 'redirect_uri', 'domain', 'logout_uri']

export const cognitoConfigErrors = requiredConfigKeys.filter((key) => !FRONTEND_COGNITO[key])
export const hasCognitoConfig = cognitoConfigErrors.length === 0
