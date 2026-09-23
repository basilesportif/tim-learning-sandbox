export function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

/**
 * Toggles fullscreen for a player: exits if anything is fullscreen, otherwise
 * fullscreens the player container (so the custom controls stay visible).
 * iPhone Safari has no element fullscreen, so fall back to the native
 * <video> fullscreen there.
 */
export function toggleFullscreen(container, video) {
  if (fullscreenElement()) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen
    exit?.call(document)?.catch?.(() => {})
    return
  }
  if (video?.webkitDisplayingFullscreen) {
    video.webkitExitFullscreen?.()
    return
  }

  const request = container && (container.requestFullscreen || container.webkitRequestFullscreen)
  if (request) {
    request.call(container)?.catch?.(() => {})
  } else if (video?.webkitEnterFullscreen) {
    video.webkitEnterFullscreen()
  }
}
