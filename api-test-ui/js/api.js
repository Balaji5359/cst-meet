const API_BASE_URL = 'https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev';

async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, options);
    const rawText = await response.text();

    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      rawText
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: error.message || 'Network error' },
      rawText: ''
    };
  }
}

async function apiLambdaPost(path, payload) {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: JSON.stringify(payload)
    })
  });
}

function showSuccess(element, text) {
  element.className = 'message success';
  element.textContent = text;
}

function showError(element, text) {
  element.className = 'message error';
  element.textContent = text;
}

function formatHttpError(status, data) {
  if (status === 400) return `HTTP 400: ${extractMessage(data)}`;
  if (status === 404) return `HTTP 404: ${extractMessage(data)}`;
  if (status === 200) return `HTTP 200: Unexpected response`;
  if (status === 0) return `Network error: ${extractMessage(data)}`;
  return `HTTP ${status}: ${extractMessage(data)}`;
}

function extractMessage(data) {
  if (!data) return 'Unknown error';
  if (typeof data === 'string') return data;
  return data.message || data.error || JSON.stringify(data);
}

function formatRaw(rawText, data) {
  if (data) return JSON.stringify(data, null, 2);
  if (rawText) return rawText;
  return 'No response body';
}
