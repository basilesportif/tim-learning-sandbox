import './ProblemCard.css';

function ProblemCard({ text }) {
  return (
    <div className="problem-card" role="group" aria-label="Math problem">
      <p className="problem-label">Solve this:</p>
      <h2 className="problem-text">{text}</h2>
    </div>
  );
}

export default ProblemCard;
