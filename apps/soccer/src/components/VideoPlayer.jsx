import { useCallback, useEffect, useRef, useState } from 'react'
import { fullscreenElement, toggleFullscreen as toggleFullscreenFor } from '../lib/fullscreen.js'
import './VideoPlayer.css'

const HIDE_CONTROLS_AFTER_MS = 2500
const KEYBOARD_SEEK_SECONDS = 5

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// End of the buffered range that contains the playhead (or the furthest one
// before it), so the bar shows what can play without stalling.
function bufferedEnd(video) {
  const { buffered, currentTime } = video
  let end = 0
  for (let i = 0; i < buffered.length; i += 1) {
    if (buffered.start(i) <= currentTime + 0.5) end = Math.max(end, buffered.end(i))
  }
  return end
}

const Icon = {
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />,
  volume: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15 8.6a4.5 4.5 0 0 1 0 6.8l-1-1.1a3 3 0 0 0 0-4.6zM17.2 6.3a7.6 7.6 0 0 1 0 11.4l-1-1.1a6.1 6.1 0 0 0 0-9.2z" />,
  muted: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.3 9.4l1.1-1.1 2.1 2.1 2.1-2.1 1.1 1.1-2.1 2.1 2.1 2.1-1.1 1.1-2.1-2.1-2.1 2.1-1.1-1.1 2.1-2.1z" />,
  enterFullscreen: <path d="M5 5h5v2H7v3H5zM14 5h5v5h-2V7h-3zM5 14h2v3h3v2H5zM17 14h2v5h-5v-2h3z" />,
  exitFullscreen: <path d="M8 5h2v5H5V8h3zM14 5h2v3h3v2h-5zM5 14h5v5H8v-3H5zM14 14h5v2h-3v3h-2z" />,
}

function SvgIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      {Icon[name]}
    </svg>
  )
}

/**
 * Custom <video> player. Videos are served as-is (no transcoding), so we use a
 * plain src and let the browser sniff the container/codec; a <source type>
 * with a codecs= string can make Safari refuse HEVC files outright.
 *
 * Props:
 *  - src, label: video URL and accessible name
 *  - onActivate(): the user interacted with this player (hotkey target)
 *  - onPlay(): playback started (parent pauses the other players)
 *  - registerVideo(el | null): hands the <video> element to the parent so
 *    page-level hotkeys can drive it
 */
export default function VideoPlayer({ src, label, onActivate, onPlay, registerVideo }) {
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const seekBarRef = useRef(null)
  const hideTimer = useRef(null)
  const lastPointerType = useRef('mouse')

  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  // Only true while the browser is actively stalled (waiting/seeking). Not
  // true initially: iOS may not fetch anything until the first tap.
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scrubTime, setScrubTime] = useState(null)
  const [controlsVisible, setControlsVisible] = useState(true)

  useEffect(() => {
    registerVideo?.(videoRef.current)
    return () => registerVideo?.(null)
  }, [registerVideo])

  useEffect(() => {
    const onChange = () => setIsFullscreen(fullscreenElement() === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  // Controls stay up while paused or scrubbing; while playing they fade out
  // after a short idle period and come back on any pointer/keyboard activity.
  const revealControls = useCallback(() => {
    setControlsVisible(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_AFTER_MS)
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused || video.ended) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [])

  const seekTo = useCallback((time) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    video.currentTime = Math.min(Math.max(time, 0), video.duration)
    setCurrentTime(video.currentTime)
  }, [])

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    if (video.muted || video.volume === 0) {
      video.muted = false
      if (video.volume === 0) video.volume = 1
    } else {
      video.muted = true
    }
  }

  function changeVolume(event) {
    const video = videoRef.current
    if (!video) return
    const next = Number(event.target.value)
    video.volume = next
    video.muted = next === 0
  }

  function toggleFullscreen() {
    toggleFullscreenFor(containerRef.current, videoRef.current)
  }

  // Seek bar scrubbing via pointer events (mouse, pen and touch alike).
  function timeFromPointer(event) {
    const rect = seekBarRef.current.getBoundingClientRect()
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    return fraction * (duration || 0)
  }

  function handleSeekPointerDown(event) {
    if (!duration || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const time = timeFromPointer(event)
    setScrubTime(time)
    seekTo(time)
  }

  function handleSeekPointerMove(event) {
    if (scrubTime === null) return
    const time = timeFromPointer(event)
    setScrubTime(time)
    seekTo(time)
  }

  function handleSeekPointerEnd() {
    if (scrubTime === null) return
    setScrubTime(null)
    revealControls()
  }

  function handleSeekKeyDown(event) {
    const video = videoRef.current
    if (!video) return
    const step = { ArrowLeft: -KEYBOARD_SEEK_SECONDS, ArrowRight: KEYBOARD_SEEK_SECONDS }[event.key]
    if (step) {
      event.preventDefault()
      seekTo(video.currentTime + step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      seekTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      seekTo(video.duration)
    }
  }

  const shownTime = scrubTime ?? currentTime
  const playedPct = duration ? (shownTime / duration) * 100 : 0
  const bufferedPct = duration ? Math.min((buffered / duration) * 100, 100) : 0
  const showControls = !playing || scrubTime !== null || controlsVisible
  const volumeLevel = muted ? 0 : volume

  // On touch, the first tap on a playing video with hidden controls only
  // brings the controls back; otherwise clicking the video toggles playback.
  function handleVideoClick() {
    if (lastPointerType.current === 'touch' && !showControls) {
      revealControls()
      return
    }
    togglePlay()
  }

  const syncTime = (event) => {
    setCurrentTime(event.currentTarget.currentTime)
    setBuffered(bufferedEnd(event.currentTarget))
  }

  return (
    <div
      ref={containerRef}
      className={[
        'vp',
        showControls ? 'vp--controls' : '',
        isFullscreen ? 'vp--fullscreen' : '',
      ].join(' ')}
      onPointerDown={onActivate}
      onPointerMove={revealControls}
      onFocus={() => {
        onActivate?.()
        revealControls()
      }}
    >
      <video
        ref={videoRef}
        className="vp-video"
        src={src}
        preload="metadata"
        playsInline
        aria-label={label}
        onPointerDown={(event) => {
          lastPointerType.current = event.pointerType
        }}
        onClick={handleVideoClick}
        onPlay={(event) => {
          setPlaying(true)
          setStarted(true)
          onPlay?.()
          revealControls()
          setBuffered(bufferedEnd(event.currentTarget))
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={syncTime}
        onProgress={syncTime}
        onSeeking={(event) => {
          syncTime(event)
          revealControls()
        }}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration)
          setLoading(false)
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => setLoading(false)}
        onSeeked={() => setLoading(false)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume)
          setMuted(event.currentTarget.muted)
        }}
        onError={() => {
          setError(true)
          setLoading(false)
        }}
      />

      {loading && !error && <div className="vp-spinner" role="status" aria-label="Loading" />}

      {error && (
        <div className="vp-error" role="alert">
          <p>This video can’t be played in this browser.</p>
          <p className="vp-error-hint">
            It may use HEVC (H.265), which needs Safari or a device with HEVC support.{' '}
            <a href={src} download>Download it</a> instead.
          </p>
        </div>
      )}

      {!playing && !error && !loading && (
        <button
          type="button"
          className={`vp-big-play${started ? ' vp-big-play--subtle' : ''}`}
          onClick={togglePlay}
          aria-label="Play"
        >
          <SvgIcon name="play" />
        </button>
      )}

      {!error && (
        <div className="vp-controls">
          <div
            ref={seekBarRef}
            className={`vp-seek${scrubTime !== null ? ' vp-seek--active' : ''}`}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration) || 0}
            aria-valuenow={Math.round(shownTime)}
            aria-valuetext={`${formatTime(shownTime)} of ${formatTime(duration)}`}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerEnd}
            onPointerCancel={handleSeekPointerEnd}
            onKeyDown={handleSeekKeyDown}
          >
            <div className="vp-seek-track">
              <div className="vp-seek-buffered" style={{ width: `${bufferedPct}%` }} />
              <div className="vp-seek-played" style={{ width: `${playedPct}%` }} />
            </div>
            <div className="vp-seek-thumb" style={{ left: `${playedPct}%` }} />
          </div>

          <div className="vp-bar">
            <button type="button" className="vp-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              <SvgIcon name={playing ? 'pause' : 'play'} />
            </button>

            <div className="vp-volume">
              <button
                type="button"
                className="vp-btn"
                onClick={toggleMute}
                aria-label={volumeLevel === 0 ? 'Unmute' : 'Mute'}
              >
                <SvgIcon name={volumeLevel === 0 ? 'muted' : 'volume'} />
              </button>
              <input
                type="range"
                className="vp-volume-slider"
                min="0"
                max="1"
                step="0.05"
                value={volumeLevel}
                onChange={changeVolume}
                aria-label="Volume"
                style={{ '--vp-fill': `${volumeLevel * 100}%` }}
              />
            </div>

            <span className="vp-time">
              {formatTime(shownTime)} <span className="vp-time-sep">/</span> {formatTime(duration)}
            </span>

            <button
              type="button"
              className="vp-btn vp-btn--end"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <SvgIcon name={isFullscreen ? 'exitFullscreen' : 'enterFullscreen'} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
