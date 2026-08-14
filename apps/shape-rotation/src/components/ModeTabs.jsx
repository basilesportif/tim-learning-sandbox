import { useRef } from 'react';
import { MODES, tabDomId, panelDomId } from '../lib/modes';
import './ModeTabs.css';

const ModeTabs = ({ mode, onModeChange }) => {
  // One entry per tab button, so the keyboard handler can move focus.
  const tabRefs = useRef([]);

  // Standard tablist keys: arrows walk the list (wrapping at the ends), Home
  // and End jump to the first and last tab. Focus and selection move together.
  const handleKeyDown = (event, index) => {
    const lastIndex = MODES.length - 1;
    let nextIndex = null;

    if (event.key === 'ArrowRight') {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    onModeChange(MODES[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="mode-tabs" role="tablist" aria-label="Choose a mode">
      {MODES.map((entry, index) => {
        const isActive = entry.id === mode;

        return (
          <button
            key={entry.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tabDomId(entry.id)}
            aria-selected={isActive}
            aria-controls={panelDomId(entry.id)}
            // Roving tabindex: the whole tablist is one stop in the Tab order,
            // and the arrow keys move between the tabs inside it.
            tabIndex={isActive ? 0 : -1}
            className={`mode-tab ${isActive ? 'mode-tab-active' : ''}`}
            onClick={() => onModeChange(entry.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
};

export default ModeTabs;
