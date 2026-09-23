import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VideoPlayer from './components/VideoPlayer.jsx'
import { listVideos, uploadVideo } from './lib/api.js'
import { usePlayerGroup } from './lib/usePlayerGroup.js'

const TITLE_MAX = 120
const ACCEPT = '.mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm,video/x-m4v'

function formatDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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

  return (
    <main className="page">
      <h1>Soccer Videos</h1>
      <UploadForm onUploaded={refresh} />

      <div className="videos-heading">
        <h2>Videos</h2>
        {videos !== null && videos.length > 0 && (
          <p className="hotkeys-hint">
            <kbd>Space</kbd> play/pause <span aria-hidden="true">·</span> <kbd>J</kbd> back 5s{' '}
            <span aria-hidden="true">·</span> <kbd>K</kbd> forward 5s
          </p>
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
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
