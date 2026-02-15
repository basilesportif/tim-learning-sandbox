import { useCallback, useEffect, useRef, useState } from 'react';
import AnswerChoices from './components/AnswerChoices';
import FeedbackBanner from './components/FeedbackBanner';
import ProblemCard from './components/ProblemCard';
import StartGate from './components/StartGate';
import TimerDisplay from './components/TimerDisplay';
import { initAudioContext, startCountdownBeeps, stopCountdownBeeps } from './lib/beepAudio';
import { formatProblem, generateChoices, generateProblem } from './lib/quickmathEngine';
import { startAttemptTimer } from './lib/timer';
import './App.css';

const CORRECT_DELAY_MS = 1200;
const WRONG_RETRY_DELAY_MS = 900;

function toAttemptSeconds(elapsedMs) {
  return Math.max(1, Math.ceil(elapsedMs / 1000));
}

function App() {
  const [phase, setPhase] = useState('idle');
  const [problem, setProblem] = useState(null);
  const [choices, setChoices] = useState([]);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [isStarting, setIsStarting] = useState(false);

  const timerControllerRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const nextTimeoutRef = useRef(null);

  const clearPendingTransitions = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (nextTimeoutRef.current !== null) {
      window.clearTimeout(nextTimeoutRef.current);
      nextTimeoutRef.current = null;
    }
  }, []);

  const stopActiveAttempt = useCallback(() => {
    stopCountdownBeeps();

    const timerController = timerControllerRef.current;
    timerControllerRef.current = null;

    if (!timerController) {
      return 0;
    }

    return timerController.stop();
  }, []);

  const startActiveAttempt = useCallback(() => {
    stopActiveAttempt();
    setTimerSeconds(0);
    timerControllerRef.current = startAttemptTimer({ onTick: setTimerSeconds });
    startCountdownBeeps();
    setPhase('active');
  }, [stopActiveAttempt]);

  const loadNewProblem = useCallback(() => {
    clearPendingTransitions();

    const nextProblem = generateProblem();
    const nextChoices = generateChoices(nextProblem.answer);

    setProblem(nextProblem);
    setChoices(nextChoices);
    setFeedback(null);
    startActiveAttempt();
  }, [clearPendingTransitions, startActiveAttempt]);

  const handleStart = useCallback(async () => {
    if (phase !== 'idle' || isStarting) {
      return;
    }

    setIsStarting(true);

    try {
      await initAudioContext();
    } catch {
      // Keep practice usable even if audio initialization is blocked.
    } finally {
      setIsStarting(false);
      loadNewProblem();
    }
  }, [phase, isStarting, loadNewProblem]);

  const handleChoice = useCallback((selectedChoice) => {
    if (phase !== 'active' || !problem) {
      return;
    }

    clearPendingTransitions();

    const elapsedMs = stopActiveAttempt();
    const attemptSeconds = toAttemptSeconds(elapsedMs);
    setTimerSeconds(attemptSeconds);

    if (selectedChoice === problem.answer) {
      setFeedback({ message: 'Great job!', tone: 'success', seconds: attemptSeconds });
      setPhase('feedback-correct');

      nextTimeoutRef.current = window.setTimeout(() => {
        loadNewProblem();
      }, CORRECT_DELAY_MS);
      return;
    }

    setFeedback({ message: 'Try again!', tone: 'error', seconds: attemptSeconds });
    setPhase('feedback-wrong');

    retryTimeoutRef.current = window.setTimeout(() => {
      setFeedback(null);
      startActiveAttempt();
    }, WRONG_RETRY_DELAY_MS);
  }, [clearPendingTransitions, loadNewProblem, phase, problem, startActiveAttempt, stopActiveAttempt]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopCountdownBeeps();
        return;
      }

      if (phase === 'active') {
        startCountdownBeeps();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [phase]);

  useEffect(() => {
    return () => {
      clearPendingTransitions();
      stopActiveAttempt();
    };
  }, [clearPendingTransitions, stopActiveAttempt]);

  const isActive = phase === 'active';
  const problemText = formatProblem(problem);

  return (
    <div className="app-shell">
      <header className="quickmath-header">
        <h1 className="quickmath-title">quickmath</h1>
        <p className="quickmath-subtitle">Rapid-fire addition and subtraction</p>
      </header>

      {phase === 'idle' ? (
        <StartGate onStart={handleStart} isStarting={isStarting} />
      ) : (
        <main className="practice-layout">
          <section className="problem-panel" aria-label="Current problem and timer">
            <TimerDisplay seconds={timerSeconds} isActive={isActive} />
            <ProblemCard text={problemText} />
            <p className="practice-help">Pick the correct answer from the three choices.</p>

            <div className="feedback-slot">
              {feedback ? (
                <FeedbackBanner
                  message={feedback.message}
                  seconds={feedback.seconds}
                  tone={feedback.tone}
                />
              ) : (
                <p className="feedback-placeholder">Timer starts with each attempt.</p>
              )}
            </div>
          </section>

          <section className="choices-panel" aria-label="Answer options">
            <AnswerChoices
              choices={choices}
              disabled={!isActive}
              onSelect={handleChoice}
            />
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
