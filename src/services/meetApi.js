const API_BASE_URL = 'https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev'

function tryParseJson(rawText) {
  if (!rawText) return null
  try {
    return JSON.parse(rawText)
  } catch {
    return null
  }
}

function normalizeResponse(httpStatus, parsed, rawText) {
  if (parsed && typeof parsed === 'object' && typeof parsed.statusCode === 'number') {
    const nestedStatus = parsed.statusCode
    const nestedBody =
      typeof parsed.body === 'string' ? tryParseJson(parsed.body) ?? parsed.body : parsed.body

    return {
      ok: nestedStatus >= 200 && nestedStatus < 300,
      status: nestedStatus,
      data: nestedBody,
      rawText: typeof parsed.body === 'string' ? parsed.body : rawText,
    }
  }

  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    data: parsed,
    rawText,
  }
}

async function rawRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const rawText = await response.text()
  const parsed = tryParseJson(rawText)
  return normalizeResponse(response.status, parsed, rawText)
}

async function request(path, options = {}) {
  try {
    return await rawRequest(path, options)
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { error: error.message || 'Network error' },
      rawText: '',
    }
  }
}

function postJson(path, payload) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: JSON.stringify(payload),
    }),
  })
}

function get(path) {
  return request(path, { method: 'GET' })
}

export async function createMeeting(userId) {
  return postJson('/meeting/create', { userId })
}

export async function joinMeeting(meetingId, userEmail) {
  return postJson('/meeting/join', { meetingId, userEmail })
}

export async function leaveMeeting(meetingId, userEmail) {
  const primary = await postJson('/meeting/leave', { meetingId, userEmail })
  if (primary.ok || primary.status !== 403) return primary
  return get(`/meeting/leave?meetingId=${encodeURIComponent(meetingId)}`)
}

export async function getMeetingStatus(meetingId) {
  return postJson('/meeting/getid', { meetingId })
}

export function extractErrorMessage(response) {
  const data = response?.data
  if (!data) return 'Unexpected server response'
  if (typeof data === 'string') return data
  return data.error || data.message || `Request failed with status ${response?.status ?? 'unknown'}`
}
