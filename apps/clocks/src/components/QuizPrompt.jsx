import './QuizPrompt.css';

const QuizPrompt = ({ mode, targetTime }) => {
  const getPromptText = () => {
    switch (mode) {
      case 'read':
        return 'What time is it?';
      case 'hour-only':
        return 'What hour is it?';
      case 'minute-only':
        return 'What minute is it?';
      case 'set':
        const hour = targetTime?.hour || 12;
        const minute = (targetTime?.minute || 0).toString().padStart(2, '0');
        return `Set the clock to ${hour}:${minute}`;
      default:
        return 'What time is it?';
    }
  };

  const getHintText = () => {
    switch (mode) {
      case 'hour-only':
        return 'Look at the short red hand';
      case 'minute-only':
        return 'Look at the long blue hand';
      default:
        return null;
    }
  };

  const hint = getHintText();

  return (
    <div className="quiz-prompt">
      <h2 className="prompt-text">{getPromptText()}</h2>
      {hint && <p className="prompt-hint">{hint}</p>}
    </div>
  );
};

export default QuizPrompt;
