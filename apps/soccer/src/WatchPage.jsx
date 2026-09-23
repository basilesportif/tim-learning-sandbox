import { useEffect, useMemo, useState } from 'react'
import HotkeysHint from './components/HotkeysHint.jsx'
import VideoPlayer from './components/VideoPlayer.jsx'
import { getSharedVideo } from './lib/api.js'
import { formatDate } from './lib/format.js'
import { usePlayerGroup } from './lib/usePlayerGroup.js'

const PLAYER_ID = 'shared'

// Public single-video view for /soccer/watch/<token>. Deliberately nothing
// else: no upload form, no list, no link back to the (password-gated) index.
export default function WatchPage({ token }) {
  const [video, setVideo] = useState(null)
  const [state, setState] = useState('loading')
  const ids = useMemo(() => [PLAYER_ID], [])
  const players = usePlayerGroup(ids)

  useEffect(() => {
    let cancelled = false
    getSharedVideo(token)
      .then((result) => {
        if (cancelled) return
        setVideo(result)
        setState(result ? 'ready' : 'not-found')
        if (result?.title) document.title = result.title
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <main className="page">
      {state === 'loading' && <p className="status">Loading…</p>}
      {state === 'not-found' && (
        <div className="card empty">
          <h1>Video not found</h1>
          <p>This link is invalid or the video has been removed.</p>
        </div>
      )}
      {state === 'error' && <p className="error">Could not load the video. Try reloading the page.</p>}
      {state === 'ready' && video && (
        <article className="card video-item">
          <h3>{video.title}</h3>
          {video.uploadedAt && <time dateTime={video.uploadedAt}>{formatDate(video.uploadedAt)}</time>}
          <VideoPlayer
            src={video.url}
            label={video.title}
            onActivate={() => players.activate(PLAYER_ID)}
            onPlay={() => players.handlePlay(PLAYER_ID)}
            registerVideo={(element) => players.register(PLAYER_ID, element)}
          />
          <div className="watch-hint">
            <HotkeysHint />
          </div>
        </article>
      )}
    </main>
  )
}
