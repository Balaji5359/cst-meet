const API_BASE_URL = 'https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev';

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeLambdaEnvelope(data, rawText, fallbackStatus) {
  if (!data || typeof data !== 'object' || typeof data.statusCode !== 'number') {
    return {
      status: fallbackStatus,
      payload: data,
      rawText,
    };
  }

  const nestedStatus = data.statusCode;
  const nestedBody = typeof data.body === 'string' ? tryParseJson(data.body) ?? data.body : data.body;

  return {
    status: nestedStatus,
    payload: nestedBody,
    rawText: typeof data.body === 'string' ? data.body : rawText,
  };
}

async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, options);
    const rawText = await response.text();
    const parsed = tryParseJson(rawText);

    const normalized = normalizeLambdaEnvelope(parsed, rawText, response.status);

    return {
      ok: normalized.status >= 200 && normalized.status < 300,
      status: normalized.status,
      data: normalized.payload,
      rawText: normalized.rawText,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { error: error.message || 'Network error' },
      rawText: '',
    };
  }
}

function apiPost(path, payload) {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: JSON.stringify(payload),
    }),
  });
}

function apiGet(path) {
  return apiRequest(path, { method: 'GET' });
}

function showSuccess(element, text) {
  element.className = 'message success';
  element.textContent = text;
}

function showError(element, text) {
  element.className = 'message error';
  element.textContent = text;
}

function extractMessage(data) {
  if (!data) return 'Unknown error';
  if (typeof data === 'string') return data;
  return data.error || data.message || JSON.stringify(data);
}

function formatHttpError(status, data) {
  if (status === 0) return `Network error: ${extractMessage(data)}`;
  return `HTTP ${status}: ${extractMessage(data)}`;
}

function formatRaw(rawText, data) {
  if (data) return JSON.stringify(data, null, 2);
  if (rawText) return rawText;
  return 'No response body';
}
