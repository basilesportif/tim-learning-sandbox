import './RoundComplete.css';

// Shown once every player in the round has been seen. The "Go Again" button
// itself lives in App, next to the other primary actions.
function RoundComplete({ total }) {
  return (
    <section className="round-complete">
      <p className="round-complete-emoji" aria-hidden="true">
        ⚽️
      </p>
      <h2 className="round-complete-title">Great job!</h2>
      <p className="round-complete-note">You named all {total} teammates.</p>
    </section>
  );
}

export default RoundComplete;
