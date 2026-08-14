import { useEffect, useRef, useState } from 'react';
import RotationControls from './RotationControls';
import TriangleGlyph from './TriangleGlyph';
import './PatternBuilder.css';

const DIRECTION_ARROW = {
  cw: '↻',
  ccw: '↺',
};

const DIRECTION_WORD = {
  cw: 'clockwise',
  ccw: 'counterclockwise',
};

// Display only: fold a cumulative angle into 0-359.
const foldAngle = (angle) => ((angle % 360) + 360) % 360;

// A strip of frozen triangles: every tap adds the next snapshot instead of
// turning one shape, so the whole pattern stays on screen at once.
const PatternBuilder = ({
  stepDegrees,
  snapshots,
  maxSnapshots,
  onClockwise,
  onCounterClockwise,
  onReset,
}) => {
  const isFull = snapshots.length >= maxSnapshots;
  const isEmpty = snapshots.length === 0;

  const newestId = isEmpty ? null : snapshots[snapshots.length - 1].id;

  // Whatever was already on the strip when this component mounted has been
  // seen before - switching tabs remounts us, and the pop animation must not
  // replay for the whole strip. Only a snapshot added while we are mounted is
  // "fresh" and gets the animation.
  const [seenId, setSeenId] = useState(newestId);

  // "Start over" empties the strip, so nothing is left over from mount time and
  // ids start again from 1: everything added after that counts as fresh. This
  // is React's "adjust state during render" pattern - an effect would repaint
  // once with the stale baseline first.
  if (isEmpty && seenId !== null) setSeenId(null);

  const isNewestFresh = newestId !== null && newestId !== seenId;

  // Safety net for viewports where the strip still has to scroll: keep the
  // card that was just added in view.
  const newestCardRef = useRef(null);

  useEffect(() => {
    const card = newestCardRef.current;
    if (!card || typeof card.scrollIntoView !== 'function') return;

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    card.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [newestId]);

  return (
    <div className="pattern-builder">
      <div className="pattern-strip-area">
        <div className="pattern-strip">
          {/* "This is where we started": the same solid triangle every snapshot
              uses, left upright at 0 degrees. Only the caption and a neutral
              card border mark it as the reference rather than a turn. */}
          <div className="snapshot-card snapshot-card-start">
            <div className="snapshot-figure">
              <div className="snapshot-rotor">
                <TriangleGlyph className="snapshot-shape" />
              </div>
            </div>
            <p className="snapshot-caption snapshot-caption-start">Start</p>
          </div>

          {snapshots.map((snapshot, index) => {
            const isNewest = snapshot.id === newestId;

            return (
              <div
                key={snapshot.id}
                ref={isNewest ? newestCardRef : null}
                className={`snapshot-card snapshot-card-${snapshot.direction}${
                  isNewest && isNewestFresh ? ' snapshot-card-fresh' : ''
                }`}
              >
                <div className="snapshot-figure">
                  <div
                    className="snapshot-rotor"
                    style={{ transform: `rotate(${snapshot.angle}deg)` }}
                  >
                    <TriangleGlyph className="snapshot-shape" />
                  </div>
                </div>
                <p className={`snapshot-caption snapshot-caption-${snapshot.direction}`}>
                  <span className="snapshot-arrow" aria-hidden="true">
                    {DIRECTION_ARROW[snapshot.direction]}
                  </span>
                  <span className="snapshot-angle">{foldAngle(snapshot.angle)}°</span>
                </p>
                <span className="visually-hidden">
                  Step {index + 1}: turned {DIRECTION_WORD[snapshot.direction]} to{' '}
                  {foldAngle(snapshot.angle)} degrees.
                </span>
              </div>
            );
          })}
        </div>

        {isEmpty && (
          <p className="pattern-hint">
            Tap ↺ or ↻ to add your first triangle.
          </p>
        )}
      </div>

      <div className="pattern-controls-area">
        <p className={`pattern-status ${isFull ? 'pattern-status-full' : ''}`} aria-live="polite">
          {isFull
            ? 'Strip is full — press Start over!'
            : `${snapshots.length} of ${maxSnapshots} triangles`}
        </p>

        <RotationControls
          stepDegrees={stepDegrees}
          onCounterClockwise={onCounterClockwise}
          onClockwise={onClockwise}
          onReset={onReset}
          canTurn={!isFull}
          canReset={!isEmpty}
        />
      </div>
    </div>
  );
};

export default PatternBuilder;
