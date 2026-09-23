import { useCallback, useEffect, useRef } from 'react'

const SKIP_SECONDS = 5

// Hotkeys stay out of the way while the user is typing or using a native
// control that needs the keys. Range inputs (the player's volume slider) are
// allowed so J/K/Space keep working after nudging the volume.
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && target.type !== 'range'
}

/**
 * Coordinates every VideoPlayer on the page:
 *  - only one plays at a time (starting one pauses the rest)
 *  - page-level hotkeys drive the "active" player: the last one interacted
 *    with or played, defaulting to the first in `ids`
 *      Space = play/pause, J = back 5s, K = forward 5s
 */
export function usePlayerGroup(ids) {
  const videos = useRef(new Map())
  const activeId = useRef(null)
  const orderedIds = useRef(ids)

  useEffect(() => {
    orderedIds.current = ids
  }, [ids])

  const register = useCallback((id, element) => {
    if (element) {
      videos.current.set(id, element)
    } else {
      videos.current.delete(id)
    }
  }, [])

  const activate = useCallback((id) => {
    activeId.current = id
  }, [])

  const handlePlay = useCallback((id) => {
    activeId.current = id
    for (const [otherId, video] of videos.current) {
      if (otherId !== id && !video.paused) video.pause()
    }
  }, [])

  useEffect(() => {
    function activeVideo() {
      const map = videos.current
      if (map.has(activeId.current)) return map.get(activeId.current)
      const firstId = orderedIds.current.find((id) => map.has(id))
      return firstId === undefined ? null : map.get(firstId)
    }

    function onKeyDown(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      const isSpace = event.key === ' ' || event.code === 'Space'
      const key = event.key.toLowerCase()
      if (!isSpace && key !== 'j' && key !== 'k') return

      // A focused button/link already activates on Space natively (e.g. the
      // player's own play button); handling it here too would double-toggle.
      if (isSpace && event.target instanceof HTMLElement && event.target.closest('button, a[href]')) return

      const video = activeVideo()
      if (!video) return
      event.preventDefault()

      if (isSpace) {
        if (video.paused || video.ended) {
          video.play().catch(() => {})
        } else {
          video.pause()
        }
        return
      }

      if (!Number.isFinite(video.duration)) return
      const delta = key === 'j' ? -SKIP_SECONDS : SKIP_SECONDS
      video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), video.duration)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { register, activate, handlePlay }
}
