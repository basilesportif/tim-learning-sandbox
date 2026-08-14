import { useState, useCallback } from 'react';
import ShapeStage from './components/ShapeStage';
import RotationControls from './components/RotationControls';
import AngleReadout from './components/AngleReadout';
import ModeTabs from './components/ModeTabs';
import PatternBuilder from './components/PatternBuilder';
import { tabDomId, panelDomId } from './lib/modes';
import './App.css';

// Fixed rotation step, in degrees.
const STEP_DEGREES = 30;

// How many snapshots fit on the pattern strip before it is full.
const MAX_SNAPSHOTS = 10;

const SUBTITLES = {
  free: `Every tap turns the triangle ${STEP_DEGREES}°`,
  pattern: `Every tap adds a new triangle, turned ${STEP_DEGREES}° further`,
};

function App() {
  // 'free' | 'pattern'. Each mode keeps its own state, so flipping tabs never
  // throws away what the child already built.
  const [mode, setMode] = useState('free');

  // --- Free rotate state ---

  // Cumulative, unbounded angle. Never wrapped with a modulo, so the CSS
  // transition always animates the turn in the direction that was asked for.
  const [angle, setAngle] = useState(0);

  // 'cw' | 'ccw' | null - only used for the on-screen caption.
  const [lastDirection, setLastDirection] = useState(null);

  // --- Pattern builder state ---

  // Frozen snapshots, oldest first: { id, angle, direction }.
  const [snapshots, setSnapshots] = useState([]);

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

  // Each tap appends one more triangle, a further step around from the last
  // one (or from upright, when the strip is still empty).
  const addSnapshot = useCallback((direction) => {
    setSnapshots((current) => {
      if (current.length >= MAX_SNAPSHOTS) return current;

      const previous = current.length > 0 ? current[current.length - 1] : null;
      const step = direction === 'cw' ? STEP_DEGREES : -STEP_DEGREES;

      return [
        ...current,
        {
          id: previous ? previous.id + 1 : 1,
          angle: (previous ? previous.angle : 0) + step,
          direction,
        },
      ];
    });
  }, []);

  const addClockwise = useCallback(() => addSnapshot('cw'), [addSnapshot]);
  const addCounterClockwise = useCallback(() => addSnapshot('ccw'), [addSnapshot]);

  // Start over means an empty strip - no triangles at all.
  const resetPattern = useCallback(() => setSnapshots([]), []);

  // Display only: fold the cumulative angle into 0-359.
  const displayAngle = ((angle % 360) + 360) % 360;

  return (
    <div className="app no-select">
      <header className="app-header">
        <h1 className="app-title">Which way did it turn?</h1>
        <p className="app-subtitle">{SUBTITLES[mode]}</p>
      </header>

      <ModeTabs mode={mode} onModeChange={setMode} />

      {/* Only the selected mode is rendered; it is the tabpanel for its tab. */}
      {mode === 'free' ? (
        <main
          className="app-main"
          id={panelDomId('free')}
          role="tabpanel"
          aria-labelledby={tabDomId('free')}
        >
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
      ) : (
        <main
          className="app-main pattern-main"
          id={panelDomId('pattern')}
          role="tabpanel"
          aria-labelledby={tabDomId('pattern')}
        >
          <PatternBuilder
            stepDegrees={STEP_DEGREES}
            snapshots={snapshots}
            maxSnapshots={MAX_SNAPSHOTS}
            onCounterClockwise={addCounterClockwise}
            onClockwise={addClockwise}
            onReset={resetPattern}
          />
        </main>
      )}
    </div>
  );
}

export default App;
