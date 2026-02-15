import './StartGate.css';

function StartGate({ onStart, isStarting }) {
  return (
    <main className="start-gate" aria-label="Start quickmath">
      <section className="start-card">
        <p className="start-chip">quickmath module</p>
        <h2 className="start-title">Fast addition and subtraction</h2>
        <p className="start-description">
          Answer quickly, beat your timer, and listen for the countdown beep while each attempt is active.
        </p>
        <p className="start-description">Designed for iPad in both portrait and landscape.</p>

        <button
          type="button"
          className="start-button"
          onClick={onStart}
          disabled={isStarting}
        >
          {isStarting ? 'Starting...' : 'Start Practice'}
        </button>
      </section>
    </main>
  );
}

export default StartGate;
