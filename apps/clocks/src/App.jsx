import { useState, useCallback, useRef, useEffect } from 'react';
import ClockFace from './components/ClockFace';
import NumberPad from './components/NumberPad';
import QuizPrompt from './components/QuizPrompt';
import ModeSelector from './components/ModeSelector';
import TimeDisplay from './components/TimeDisplay';
import FeedbackOverlay from './components/FeedbackOverlay';
import { generateRandomTime, validateAnswer, angleToHour, angleToMinute } from './lib/timeUtils';
import './App.css';

function App() {
  // Quiz mode: 'read' | 'set' | 'hour-only' | 'minute-only'
  const [mode, setMode] = useState('read');

  // Target time (what the clock shows or what user needs to set)
  const [targetTime, setTargetTime] = useState(() => generateRandomTime());

  // User's answer (for read modes)
  const [selectedHour, setSelectedHour] = useState(null);
  const [selectedMinute, setSelectedMinute] = useState(null);

  // User's clock setting (for set mode)
  const [userClockTime, setUserClockTime] = useState({ hour: 12, minute: 0 });

  // Feedback state
  const [feedbackState, setFeedbackState] = useState(null);

  // Audio refs
  const correctAudioRef = useRef(null);
  const incorrectAudioRef = useRef(null);

  // Generate new question
  const newQuestion = useCallback(() => {
    setTargetTime(generateRandomTime());
    setSelectedHour(null);
    setSelectedMinute(null);
    setUserClockTime({ hour: 12, minute: 0 });
    setFeedbackState(null);
  }, []);

  // Handle mode change
  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    newQuestion();
  }, [newQuestion]);

  // Handle answer submission (for read modes)
  const checkAnswer = useCallback((hour, minute) => {
    const userAnswer = { hour, minute };
    const isCorrect = validateAnswer(targetTime, userAnswer, mode);

    if (isCorrect) {
      setFeedbackState('correct');
      correctAudioRef.current?.play().catch(() => {});
    } else {
      setFeedbackState('incorrect');
      incorrectAudioRef.current?.play().catch(() => {});
    }
  }, [targetTime, mode]);

  // Auto-submit when answer is complete based on mode
  useEffect(() => {
    if (feedbackState !== null) return; // Don't auto-submit if feedback is showing

    if (mode === 'hour-only' && selectedHour !== null) {
      checkAnswer(selectedHour, 0);
    } else if (mode === 'minute-only' && selectedMinute !== null) {
      checkAnswer(0, selectedMinute);
    } else if ((mode === 'read') && selectedHour !== null && selectedMinute !== null) {
      checkAnswer(selectedHour, selectedMinute);
    }
  }, [mode, selectedHour, selectedMinute, feedbackState, checkAnswer]);

  // Handle clock hand drag (for set mode)
  const handleClockTimeChange = useCallback((newTime) => {
    setUserClockTime(newTime);
  }, []);

  // Check answer in set mode
  const handleSetModeCheck = useCallback(() => {
    const isCorrect = validateAnswer(targetTime, userClockTime, 'set');

    if (isCorrect) {
      setFeedbackState('correct');
      correctAudioRef.current?.play().catch(() => {});
    } else {
      setFeedbackState('incorrect');
      incorrectAudioRef.current?.play().catch(() => {});
    }
  }, [targetTime, userClockTime]);

  // Dismiss feedback and generate new question if correct
  const handleFeedbackDismiss = useCallback(() => {
    if (feedbackState === 'correct') {
      newQuestion();
    } else {
      setFeedbackState(null);
    }
  }, [feedbackState, newQuestion]);

  // Determine what time to show on the clock
  const displayTime = mode === 'set' ? userClockTime : targetTime;

  // Determine if clock should be interactive
  const isInteractive = mode === 'set';

  // Clock feedback state (only show on clock in read modes)
  const clockFeedback = mode !== 'set' ? feedbackState : null;

  return (
    <div className="app no-select">
      {/* Hidden audio elements for sound effects */}
      <audio
        ref={correctAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3"
        preload="auto"
      />
      <audio
        ref={incorrectAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2001/2001-preview.mp3"
        preload="auto"
      />

      <header className="app-header">
        <h1 className="app-title">Clock Quiz</h1>
      </header>

      <ModeSelector selectedMode={mode} onModeChange={handleModeChange} />

      <main className="app-main">
        <div className="clock-area">
          <QuizPrompt mode={mode} targetTime={targetTime} />
          <div className="clock-section">
            <ClockFace
              hour={displayTime.hour}
              minute={displayTime.minute}
              interactive={isInteractive}
              onTimeChange={handleClockTimeChange}
              feedbackState={clockFeedback}
            />
          </div>
        </div>

        <div className="controls-area">
          {mode === 'set' ? (
            <div className="set-mode-controls">
              <TimeDisplay
                hour={userClockTime.hour}
                minute={userClockTime.minute}
                label="You set:"
              />
              <button className="check-button" onClick={handleSetModeCheck}>
                Check Answer
              </button>
              <p className="drag-hint">Drag the clock hands to set the time</p>
            </div>
          ) : (
            <div className="read-mode-controls">
              <TimeDisplay
                hour={selectedHour}
                minute={mode === 'hour-only' ? 0 : selectedMinute}
                label="Your answer:"
              />
              <NumberPad
                mode={mode}
                selectedHour={selectedHour}
                selectedMinute={selectedMinute}
                onHourSelect={setSelectedHour}
                onMinuteSelect={setSelectedMinute}
                disabled={feedbackState !== null}
              />
            </div>
          )}

          <button className="skip-button" onClick={newQuestion}>
            Skip / New Question
          </button>
        </div>
      </main>

      <FeedbackOverlay
        state={feedbackState}
        correctAnswer={feedbackState === 'incorrect' ? targetTime : null}
        mode={mode}
        onDismiss={handleFeedbackDismiss}
      />
    </div>
  );
}

export default App;
