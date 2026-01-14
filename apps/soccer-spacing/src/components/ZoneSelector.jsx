import React, { useState, useRef, useEffect } from 'react';
import './ZoneSelector.css';

const ZONES = [
  { id: 'left', label: 'Left Wing' },
  { id: 'middle', label: 'Middle' },
  { id: 'right', label: 'Right Wing' },
];

const ZoneSelector = ({ selectedZone, onZoneChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selectedLabel = ZONES.find((z) => z.id === selectedZone)?.label || 'Select Zone';

  const handleSelect = (zoneId) => {
    onZoneChange(zoneId);
    setIsOpen(false);
  };

  return (
    <div className="zone-selector" ref={dropdownRef}>
      <button
        className={`zone-selector-button ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="zone-selector-label">Zone:</span>
        <span className="zone-selector-value">{selectedLabel}</span>
        <span className={`zone-selector-arrow ${isOpen ? 'open' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="zone-selector-dropdown" role="listbox">
          {ZONES.map((zone) => (
            <button
              key={zone.id}
              className={`zone-option ${selectedZone === zone.id ? 'selected' : ''}`}
              onClick={() => handleSelect(zone.id)}
              role="option"
              aria-selected={selectedZone === zone.id}
            >
              <span className={`zone-indicator zone-${zone.id}`} />
              {zone.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ZoneSelector;
