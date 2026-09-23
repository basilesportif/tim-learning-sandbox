const BASE = import.meta.env.DEV ? 'http://localhost:3004' : ''
const APP_NAME = import.meta.env.BASE_URL.replace(/\//g, '')
const API = `${BASE}/${APP_NAME}/api`

async function readError(res, fallback) {
  try {
    const body = await res.json()
    return body?.message || fallback
  } catch {
    return fallback
  }
}

export async function listVideos() {
  const res = await fetch(`${API}/videos`, { credentials: 'same-origin' })
  if (res.status === 401) {
    window.location.reload()
    throw new Error('Locked. Reloading…')
  }
  if (!res.ok) {
    throw new Error(await readError(res, 'Could not load videos.'))
  }
  return res.json()
}

// XMLHttpRequest (not fetch) so we can report upload progress.
export function uploadVideo({ title, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('title', title)
    form.append('video', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/videos`)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response)
        return
      }
      if (xhr.status === 401) {
        reject(new Error('Locked. Reload the page and enter the password.'))
        return
      }
      reject(new Error(xhr.response?.message || `Upload failed (HTTP ${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))
    xhr.send(form)
  })
}
