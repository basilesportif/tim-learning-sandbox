import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HotkeysHint from './components/HotkeysHint.jsx'
import VideoPlayer from './components/VideoPlayer.jsx'
import { createShareLink, listVideos, uploadVideo } from './lib/api.js'
import { formatDate } from './lib/format.js'
import { usePlayerGroup } from './lib/usePlayerGroup.js'

const TITLE_MAX = 120
const ACCEPT = '.mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm,video/x-m4v'
const COPIED_FEEDBACK_MS = 2000

function shareUrl(token) {
  return `${window.location.origin}${import.meta.env.BASE_URL}watch/${token}`
}

// Copies a public, password-free link to this one video. The token is created
// on first use; once known it is copied straight away, which keeps the
// clipboard write inside the click for browsers (Safari) that require that.
// If the clipboard is unavailable (e.g. plain HTTP) the link is shown instead.
function ShareButton({ video, onShareToken }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [fallbackUrl, setFallbackUrl] = useState('')
  const resetTimer = useRef(null)
  const fallbackInput = useRef(null)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  useEffect(() => {
    if (fallbackUrl) fallbackInput.current?.select()
  }, [fallbackUrl])

  async function handleClick() {
    setError('')
    setFallbackUrl('')
    clearTimeout(resetTimer.current)

    let token = video.shareToken
    if (!token) {
      setStatus('working')
      try {
        token = (await createShareLink(video.id)).shareToken
        onShareToken(video.id, token)
      } catch (shareError) {
        setStatus('idle')
        setError(shareError.message || 'Could not create a share link.')
        return
      }
    }

    const url = shareUrl(token)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setStatus('copied')
      resetTimer.current = setTimeout(() => setStatus('idle'), COPIED_FEEDBACK_MS)
    } catch {
      setStatus('idle')
      setFallbackUrl(url)
    }
  }

  return (
    <div className="share">
      <button type="button" className="share-button" onClick={handleClick} disabled={status === 'working'}>
        {status === 'copied' ? 'Copied!' : status === 'working' ? 'Creating link…' : 'Copy share link'}
      </button>
      {fallbackUrl && (
        <label className="share-fallback">
          Copy this link:
          <input
            ref={fallbackInput}
            type="text"
            readOnly
            value={fallbackUrl}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function UploadForm({ onUploaded }) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const fileInput = useRef(null)
  const uploading = progress !== null

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Give the video a title.')
      return
    }
    if (!file) {
      setError('Choose a video file.')
      return
    }

    setProgress(0)
    try {
      await uploadVideo({ title: title.trim(), file, onProgress: setProgress })
      setTitle('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      onUploaded()
    } catch (uploadError) {
      setError(uploadError.message || 'Upload failed.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <form className="card upload-form" onSubmit={handleSubmit}>
      <label>
        Title
        <input
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Saturday match, second half"
          disabled={uploading}
        />
      </label>
      <label>
        Video
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          disabled={uploading}
        />
      </label>
      <button type="submit" disabled={uploading}>
        {uploading ? 'Uploading…' : 'Upload video'}
      </button>
      {uploading && (
        <>
          <progress className="progress" max="100" value={progress} />
          <p className="status">Uploading… {progress}%</p>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default function App() {
  const [videos, setVideos] = useState(null)
  const [loadError, setLoadError] = useState('')
  const videoIds = useMemo(() => (videos || []).map((video) => video.id), [videos])
  const players = usePlayerGroup(videoIds)

  const refresh = useCallback(async () => {
    try {
      setVideos(await listVideos())
      setLoadError('')
    } catch (error) {
      setLoadError(error.message || 'Could not load videos.')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  const rememberShareToken = useCallback((id, shareToken) => {
    setVideos((current) => current?.map((video) => (video.id === id ? { ...video, shareToken } : video)) ?? current)
  }, [])

  return (
    <main className="page">
      <h1>Soccer Videos</h1>
      <UploadForm onUploaded={refresh} />

      <div className="videos-heading">
        <h2>Videos</h2>
        {videos !== null && videos.length > 0 && (
          <HotkeysHint />
        )}
      </div>
      {loadError && <p className="error">{loadError}</p>}
      {videos === null && !loadError && <p className="status">Loading…</p>}
      {videos !== null && videos.length === 0 && (
        <p className="card empty">No videos yet. Upload the first one above.</p>
      )}
      {videos !== null && videos.length > 0 && (
        <ul className="video-list">
          {videos.map((video) => (
            <li key={video.id} className="card video-item">
              <h3>{video.title}</h3>
              <time dateTime={video.uploadedAt}>{formatDate(video.uploadedAt)}</time>
              <VideoPlayer
                src={video.url}
                label={video.title}
                onActivate={() => players.activate(video.id)}
                onPlay={() => players.handlePlay(video.id)}
                registerVideo={(element) => players.register(video.id, element)}
              />
              <ShareButton video={video} onShareToken={rememberShareToken} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
