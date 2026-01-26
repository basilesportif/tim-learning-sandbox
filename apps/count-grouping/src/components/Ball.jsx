import './Ball.css';

const Ball = ({
  id,
  type = 'soccer',
  x,
  y,
  isDragging = false,
  isRejected = false,
  onPointerDown,
}) => {
  const handlePointerDown = (e) => {
    if (onPointerDown) {
      e.preventDefault();
      onPointerDown(e, id);
    }
  };

  return (
    <div
      className={`ball ball-${type} ${isDragging ? 'dragging' : ''} ${isRejected ? 'rejected' : ''}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
      onPointerDown={handlePointerDown}
      data-ball-id={id}
    >
      {type === 'soccer' ? (
        <svg viewBox="0 0 60 60" className="ball-svg">
          {/* Base circle */}
          <circle cx="30" cy="30" r="28" className="ball-base" />

          {/* Pentagon pattern for soccer ball */}
          <path
            className="ball-pentagon"
            d="M30 8 L42 20 L38 35 L22 35 L18 20 Z"
          />
          <path
            className="ball-pentagon"
            d="M8 28 L14 15 L22 22 L18 35 L8 35 Z"
          />
          <path
            className="ball-pentagon"
            d="M52 28 L52 35 L42 35 L38 22 L46 15 Z"
          />
          <path
            className="ball-pentagon"
            d="M15 45 L22 38 L38 38 L45 45 L38 55 L22 55 Z"
          />

          {/* Connecting lines */}
          <path
            className="ball-lines"
            d="M30 8 L30 2 M18 20 L10 14 M42 20 L50 14 M18 35 L8 38 M42 35 L52 38 M22 55 L18 58 M38 55 L42 58"
          />

          {/* Highlight */}
          <ellipse cx="20" cy="18" rx="6" ry="4" className="ball-highlight" />
        </svg>
      ) : (
        <svg viewBox="0 0 60 60" className="ball-svg">
          {/* Base circle with gradient */}
          <defs>
            <radialGradient id={`basketball-gradient-${id}`} cx="35%" cy="35%" r="60%">
              <stop offset="0%" stopColor="#ff8533" />
              <stop offset="70%" stopColor="#e87025" />
              <stop offset="100%" stopColor="#c45d1d" />
            </radialGradient>
          </defs>

          <circle cx="30" cy="30" r="28" fill={`url(#basketball-gradient-${id})`} className="ball-base-basketball" />

          {/* Basketball lines */}
          <path
            className="ball-basketball-lines"
            d="M30 2 L30 58"
          />
          <path
            className="ball-basketball-lines"
            d="M2 30 L58 30"
          />
          <path
            className="ball-basketball-curve"
            d="M10 10 Q30 25 10 50"
          />
          <path
            className="ball-basketball-curve"
            d="M50 10 Q30 25 50 50"
          />

          {/* Highlight */}
          <ellipse cx="20" cy="18" rx="6" ry="4" className="ball-highlight-basketball" />
        </svg>
      )}
    </div>
  );
};

export default Ball;
