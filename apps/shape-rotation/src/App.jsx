import { useState, useCallback } from 'react';
import ShapeStage from './components/ShapeStage';
import RotationControls from './components/RotationControls';
import AngleReadout from './components/AngleReadout';
import './App.css';

// Fixed rotation step, in degrees.
const STEP_DEGREES = 30;

function App() {
  // Cumulative, unbounded angle. Never wrapped with a modulo, so the CSS
  // transition always animates the turn in the direction that was asked for.
  const [angle, setAngle] = useState(0);

  // 'cw' | 'ccw' | null - only used for the on-screen caption.
  const [lastDirection, setLastDirection] = useState(null);

  // On screen (and in SVG/CSS) a positive rotation goes clockwise.
  const turnClockwise = useCallback(() => {
    setAngle((current) => current + STEP_DEGREES);
    setLastDirection('cw');
  }, []);

  const turnCounterClockwise = useCallback(() => {
    setAngle((current) => current - STEP_DEGREES);
    setLastDirection('ccw');
  }, []);

  // Go back upright the short way instead of unwinding every single turn.
  const reset = useCallback(() => {
    setAngle((current) => Math.round(current / 360) * 360);
    setLastDirection(null);
  }, []);

  // Display only: fold the cumulative angle into 0-359.
  const displayAngle = ((angle % 360) + 360) % 360;

  return (
    <div className="app no-select">
      <header className="app-header">
        <h1 className="app-title">Which way did it turn?</h1>
        <p className="app-subtitle">Every tap turns the triangle {STEP_DEGREES}°</p>
      </header>

      <main className="app-main">
        <div className="stage-area">
          <ShapeStage angle={angle} displayAngle={displayAngle} />
        </div>

        <div className="controls-area">
          <AngleReadout displayAngle={displayAngle} lastDirection={lastDirection} />
          <RotationControls
            stepDegrees={STEP_DEGREES}
            onCounterClockwise={turnCounterClockwise}
            onClockwise={turnClockwise}
            onReset={reset}
            canReset={displayAngle !== 0}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
