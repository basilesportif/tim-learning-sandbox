const BASE = import.meta.env.DEV ? 'http://localhost:3004' : '';
const APP_NAME = import.meta.env.BASE_URL.replace(/\//g, '') || 'vocab';
const API_ROOT = `${BASE}/${APP_NAME}/api`;

async function parseBody(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

async function request(path, options = {}, getToken) {
  const token = typeof getToken === 'function' ? await getToken() : null;
  const res = await fetch(`${API_ROOT}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export function createApiClient(getToken) {
  return {
    getMe() {
      return request('/me', { method: 'GET' }, getToken);
    },
    getAdminBooks() {
      return request('/admin/books', { method: 'GET' }, getToken);
    },
    importBook(payload) {
      return request('/admin/books/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, getToken);
    },
    publishBook(bookId) {
      return request(`/admin/books/${encodeURIComponent(bookId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      }, getToken);
    },
    getChildren() {
      return request('/admin/children', { method: 'GET' }, getToken);
    },
    createAssignment(payload) {
      return request('/admin/assignments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, getToken);
    },
    getAssignments() {
      return request('/assignments/current', { method: 'GET' }, getToken);
    },
    startSession(payload) {
      return request('/sessions/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, getToken);
    },
    answerSession(sessionId, payload) {
      return request(`/sessions/${encodeURIComponent(sessionId)}/answer`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, getToken);
    },
    completeSession(sessionId, payload = {}) {
      return request(`/sessions/${encodeURIComponent(sessionId)}/complete`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, getToken);
    },
    getWordImage(wordId) {
      return `${API_ROOT}/word-images/${encodeURIComponent(wordId)}`;
    },
  };
}
