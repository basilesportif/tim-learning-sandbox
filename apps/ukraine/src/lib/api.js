const BASE = import.meta.env.DEV ? 'http://localhost:3004' : '';
const APP_NAME = import.meta.env.BASE_URL.replace(/\//g, '') || 'ukraine';
const API_ROOT = `${BASE}/${APP_NAME}/api`;

async function parseBody(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

async function request(path, options = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await parseBody(res);

  if (!res.ok) {
    const error = new Error((data && data.error) || `Request failed: ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function getAuthStatus() {
  return request('/auth/status', { method: 'GET' });
}

export function unlockApp(password) {
  return request('/auth/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function logoutApp() {
  return request('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
}

export function getParentAuthStatus() {
  return request('/parent/auth/status', { method: 'GET' });
}

export function loginParent(pin) {
  return request('/parent/auth/login', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export function logoutParent() {
  return request('/parent/auth/logout', { method: 'POST', body: JSON.stringify({}) });
}

export function fetchChildSettings() {
  return request('/child/settings', { method: 'GET' });
}

export function updateChildSettings(payload) {
  return request('/child/settings', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function fetchTexts(language, options = {}) {
  const params = new URLSearchParams();
  params.set('language', language);

  if (options.min !== undefined && options.min !== null) {
    params.set('min', String(options.min));
  }
  if (options.max !== undefined && options.max !== null) {
    params.set('max', String(options.max));
  }
  if (options.limit !== undefined && options.limit !== null) {
    params.set('limit', String(options.limit));
  }

  return request(`/texts?${params.toString()}`, { method: 'GET' });
}

export function fetchTextById(textId) {
  return request(`/texts/${encodeURIComponent(textId)}`, { method: 'GET' });
}

export function startSession(payload) {
  return request('/sessions/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendSessionEvents(sessionId, events) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/events/batch`, {
    method: 'POST',
    body: JSON.stringify({ events }),
  });
}

export function endSession(sessionId, payload) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchProfile(language) {
  return request(`/profile?language=${encodeURIComponent(language)}`, { method: 'GET' });
}

export function fetchRecommendations(language) {
  return request(`/recommendations?language=${encodeURIComponent(language)}`, { method: 'GET' });
}

export function createDiagnosticLink(payload = {}) {
  return request('/diagnostics/links', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resolveDiagnosticToken(token) {
  return request(`/diagnostics/resolve?token=${encodeURIComponent(token)}`, { method: 'GET' });
}

export function fetchDiagnosticTexts(token, language, options = {}) {
  const params = new URLSearchParams();
  params.set('token', token);
  params.set('language', language);

  if (options.min !== undefined && options.min !== null) {
    params.set('min', String(options.min));
  }
  if (options.max !== undefined && options.max !== null) {
    params.set('max', String(options.max));
  }
  if (options.limit !== undefined && options.limit !== null) {
    params.set('limit', String(options.limit));
  }

  return request(`/diagnostics/texts?${params.toString()}`, { method: 'GET' });
}

export function startDiagnosticRun(token) {
  return request('/diagnostics/runs/start', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function completeDiagnosticRun(runId, token, perLanguageResults) {
  return request(`/diagnostics/runs/${encodeURIComponent(runId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      token,
      per_language_results: perLanguageResults,
    }),
  });
}

export function saveDiagnosticAdultObservation(runId, payload) {
  return request(`/diagnostics/runs/${encodeURIComponent(runId)}/adult-observations`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function fetchSourceAdminStatus() {
  return request('/admin/sources/status', { method: 'GET' });
}

export function fetchSourceReviewQueue(options = {}) {
  const params = new URLSearchParams();
  if (options.status) {
    params.set('status', String(options.status));
  }
  if (options.language) {
    params.set('language', String(options.language));
  }
  if (options.limit !== undefined && options.limit !== null) {
    params.set('limit', String(options.limit));
  }

  const query = params.toString();
  return request(`/admin/sources/review-queue${query ? `?${query}` : ''}`, { method: 'GET' });
}

export function syncSourceCandidates(payload = {}) {
  return request('/admin/sources/sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function reviewSourceCandidate(reviewId, payload = {}) {
  return request(`/admin/sources/review-queue/${encodeURIComponent(reviewId)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function downloadProfileExport() {
  const res = await fetch(`${API_ROOT}/export/profile.json`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    const maybeJson = await parseBody(res);
    const error = new Error((maybeJson && maybeJson.error) || `Export failed: ${res.status}`);
    error.status = res.status;
    error.data = maybeJson;
    throw error;
  }

  return res.blob();
}
