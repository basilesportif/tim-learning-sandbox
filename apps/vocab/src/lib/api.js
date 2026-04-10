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
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(`${API_ROOT}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await parseBody(res);

  if (!res.ok) {
    const error = new Error((data && (data.message || data.error)) || `Request failed: ${res.status}`);
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
    getAdminDecks() {
      return request('/admin/decks', { method: 'GET' }, getToken);
    },
    getImportJob(jobId) {
      return request(`/admin/import-jobs/${encodeURIComponent(jobId)}`, { method: 'GET' }, getToken);
    },
    importBook(payload) {
      const formData = new FormData();
      formData.set('title', String(payload?.title || ''));
      formData.set('author', String(payload?.author || ''));
      formData.set('language', String(payload?.language || 'en'));
      formData.set('text', String(payload?.text || ''));
      formData.set('generate_images', payload?.generate_images ? 'true' : 'false');
      if (payload?.max_word_count !== undefined && payload?.max_word_count !== null) {
        formData.set('max_word_count', String(payload.max_word_count));
      }
      if (payload?.text_file) {
        formData.append('text_file', payload.text_file, payload.text_file.name || 'book.txt');
      }
      for (const file of payload?.ocr_files || []) {
        formData.append('ocr_files', file, file.name || 'page.png');
      }

      return request('/admin/books/import', {
        method: 'POST',
        body: formData,
      }, getToken);
    },
    publishBook(bookId) {
      return request(`/admin/books/${encodeURIComponent(bookId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      }, getToken);
    },
    createDeck(payload) {
      return request('/admin/decks/import', {
        method: 'POST',
        body: JSON.stringify(payload),
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
    updateAssignment(assignmentId, payload) {
      return request(`/admin/assignments/${encodeURIComponent(assignmentId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }, getToken);
    },
    updateChildProfile(childUserId, payload) {
      return request(`/admin/children/${encodeURIComponent(childUserId)}/profile`, {
        method: 'PATCH',
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
