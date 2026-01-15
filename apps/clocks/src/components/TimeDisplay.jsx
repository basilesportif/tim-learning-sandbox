import './TimeDisplay.css';

const TimeDisplay = ({ hour, minute, label = 'Your answer:' }) => {
  const hourStr = hour !== null ? hour : '--';
  const minuteStr = minute !== null ? minute.toString().padStart(2, '0') : '--';

  return (
    <div className="time-display">
      <span className="time-label">{label}</span>
      <span className="time-value">
        <span className={`time-part ${hour !== null ? 'filled' : ''}`}>{hourStr}</span>
        <span className="time-colon">:</span>
        <span className={`time-part ${minute !== null ? 'filled' : ''}`}>{minuteStr}</span>
      </span>
    </div>
  );
};

export default TimeDisplay;
