// The two ways to play with the same triangle.
//
// The ids live here rather than inside ModeTabs so the tablist and the panels
// in App.jsx cannot drift apart: every tab points at its panel with
// aria-controls, and every panel points back with aria-labelledby.
export const MODES = [
  { id: 'free', label: 'Free Rotate' },
  { id: 'pattern', label: 'Pattern Builder' },
];

export const tabDomId = (modeId) => `mode-tab-${modeId}`;
export const panelDomId = (modeId) => `mode-panel-${modeId}`;
