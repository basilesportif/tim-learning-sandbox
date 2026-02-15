import './AnswerChoices.css';

function AnswerChoices({ choices, disabled, onSelect }) {
  return (
    <div className="answer-choices" role="group" aria-label="Choose one answer">
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          className="answer-button"
          onClick={() => onSelect(choice)}
          disabled={disabled}
          aria-label={`Answer ${choice}`}
        >
          {choice}
        </button>
      ))}
    </div>
  );
}

export default AnswerChoices;
