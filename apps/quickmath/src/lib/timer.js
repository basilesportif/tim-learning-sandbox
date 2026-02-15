export function startAttemptTimer({ onTick } = {}) {
  const startAt = performance.now();
  let stopped = false;
  let stoppedAt = null;

  const emitTick = () => {
    if (typeof onTick !== 'function') return;
    const now = stopped ? stoppedAt : performance.now();
    onTick(Math.floor((now - startAt) / 1000));
  };

  emitTick();
  const intervalId = window.setInterval(emitTick, 100);

  return {
    stop() {
      if (!stopped) {
        stopped = true;
        stoppedAt = performance.now();
        window.clearInterval(intervalId);
        emitTick();
      }
      return stoppedAt - startAt;
    },
    getElapsedMs() {
      const now = stopped ? stoppedAt : performance.now();
      return now - startAt;
    },
  };
}
