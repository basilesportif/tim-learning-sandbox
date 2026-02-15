import './TimerDisplay.css';

function TimerDisplay({ seconds, isActive }) {
  return (
    <div className={`timer-display ${isActive ? 'active' : 'paused'}`} role="timer" aria-live="off">
      <span className="timer-label">Timer</span>
      <strong className="timer-value">{seconds}s</strong>
    </div>
  );
}

export default TimerDisplay;
