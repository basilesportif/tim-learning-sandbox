import './ModeToggle.css';

// The mode switch floats in the top-right corner instead of sitting in the
// column with everything else: the whole point of the layout is that the photo
// and the big button fit on one screen, so this control is not allowed to eat
// any vertical space.
function ModeToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`mode-toggle${checked ? ' mode-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="mode-toggle-text">Multiple Choice</span>
      <span className="mode-toggle-track" aria-hidden="true">
        <span className="mode-toggle-knob" />
      </span>
    </button>
  );
}

export default ModeToggle;
