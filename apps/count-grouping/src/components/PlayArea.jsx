import { useRef, useCallback, useEffect } from 'react';
import { COLORS, Z_INDEX, PLAY_AREA, BAG_CAPACITY, CART_CAPACITY } from '../lib/constants';
import './PlayArea.css';

const PlayArea = ({
  balls,
  containers,
  dragState,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDrop,
}) => {
  const playAreaRef = useRef(null);
  const bagRef = useRef(null);
  const cartRef = useRef(null);

  // Get loose balls (not in containers)
  const looseBalls = balls.filter((b) => b.status === 'loose');

  // Get bag and cart from containers prop
  const bag = containers?.bag || { balls: [] };
  const cart = containers?.cart || { balls: [] };

  // Check if pointer is over a container
  const getDropTarget = useCallback((clientX, clientY) => {
    if (bagRef.current) {
      const bagRect = bagRef.current.getBoundingClientRect();
      if (
        clientX >= bagRect.left &&
        clientX <= bagRect.right &&
        clientY >= bagRect.top &&
        clientY <= bagRect.bottom
      ) {
        return 'bag';
      }
    }
    if (cartRef.current) {
      const cartRect = cartRef.current.getBoundingClientRect();
      if (
        clientX >= cartRect.left &&
        clientX <= cartRect.right &&
        clientY >= cartRect.top &&
        clientY <= cartRect.bottom
      ) {
        return 'cart';
      }
    }
    return null;
  }, []);

  // Handle pointer move
  const handlePointerMove = useCallback(
    (e) => {
      if (!dragState?.dragging) return;
      e.preventDefault();
      const clientX = e.touches?.[0]?.clientX ?? e.clientX;
      const clientY = e.touches?.[0]?.clientY ?? e.clientY;
      onDragMove?.({ x: clientX, y: clientY });
    },
    [dragState, onDragMove]
  );

  // Handle pointer up
  const handlePointerUp = useCallback(
    (e) => {
      if (!dragState?.dragging) return;
      e.preventDefault();
      const clientX = e.changedTouches?.[0]?.clientX ?? e.clientX;
      const clientY = e.changedTouches?.[0]?.clientY ?? e.clientY;
      const dropTarget = getDropTarget(clientX, clientY);
      onDrop?.(dropTarget);
      onDragEnd?.();
    },
    [dragState, getDropTarget, onDrop, onDragEnd]
  );

  // Add global event listeners for drag
  useEffect(() => {
    if (!dragState?.dragging) return;

    const handleMove = (e) => handlePointerMove(e);
    const handleEnd = (e) => handlePointerUp(e);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [dragState, handlePointerMove, handlePointerUp]);

  // Handle drag start on a ball
  const handleBallDragStart = useCallback(
    (ball) => (e) => {
      e.preventDefault();
      const clientX = e.touches?.[0]?.clientX ?? e.clientX;
      const clientY = e.touches?.[0]?.clientY ?? e.clientY;
      onDragStart?.(ball, { x: clientX, y: clientY });
    },
    [onDragStart]
  );

  // Render a single ball
  const renderBall = (ball, index) => {
    const isDragging = dragState?.dragging && dragState.ball?.id === ball.id;
    if (isDragging) return null; // Dragging ball is rendered separately

    return (
      <div
        key={ball.id}
        className="ball"
        style={{
          left: `${ball.x}%`,
          top: `${ball.y}%`,
          backgroundColor: ball.type === 'basketball' ? COLORS.basketball : COLORS.soccer,
        }}
        onMouseDown={handleBallDragStart(ball)}
        onTouchStart={handleBallDragStart(ball)}
      >
        {ball.type === 'soccer' && (
          <svg className="ball-pattern" viewBox="0 0 100 100">
            <defs>
              <radialGradient id={`soccer-gradient-${ball.id}`} cx="30%" cy="30%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#e0e0e0" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill={`url(#soccer-gradient-${ball.id})`} stroke="#333" strokeWidth="2" />
            {/* Center pentagon */}
            <polygon points="50,25 61,40 57,55 43,55 39,40" fill="#333" />
            {/* Top pentagon */}
            <polygon points="50,5 58,15 50,22 42,15" fill="#333" />
            {/* Right pentagons */}
            <polygon points="75,35 82,48 75,58 65,52 65,42" fill="#333" />
            <polygon points="68,72 75,82 65,90 55,85 58,75" fill="#333" />
            {/* Left pentagons */}
            <polygon points="25,35 35,42 35,52 25,58 18,48" fill="#333" />
            <polygon points="32,72 42,75 45,85 35,90 25,82" fill="#333" />
          </svg>
        )}
        {ball.type === 'basketball' && (
          <svg className="ball-pattern" viewBox="0 0 100 100">
            <defs>
              <radialGradient id={`basketball-gradient-${ball.id}`} cx="35%" cy="35%">
                <stop offset="0%" stopColor="#f5a623" />
                <stop offset="100%" stopColor="#d4841c" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill={`url(#basketball-gradient-${ball.id})`} stroke="#8B4513" strokeWidth="2" />
            <path d="M 50 2 L 50 98" stroke="#333" strokeWidth="2" fill="none" />
            <path d="M 2 50 L 98 50" stroke="#333" strokeWidth="2" fill="none" />
            <path d="M 15 15 Q 50 35 85 15" stroke="#333" strokeWidth="2" fill="none" />
            <path d="M 15 85 Q 50 65 85 85" stroke="#333" strokeWidth="2" fill="none" />
          </svg>
        )}
      </div>
    );
  };

  // Render bag container
  const renderBag = () => {
    if (bag.isLocked) return null;

    const bagBalls = bag.balls || [];
    const isFull = bagBalls.length >= BAG_CAPACITY;
    const isHighlighted = dragState?.dragging && !isFull;

    return (
      <div
        ref={bagRef}
        className={`container bag ${isHighlighted ? 'highlighted' : ''} ${isFull ? 'full' : ''}`}
      >
        <div className="container-label">
          Bag ({bagBalls.length}/{BAG_CAPACITY})
        </div>
        <svg className="bag-svg" viewBox="0 0 80 100">
          {/* Bag body with mesh texture */}
          <defs>
            <pattern id="meshPattern" patternUnits="userSpaceOnUse" width="8" height="8">
              <path d="M 0 4 L 4 0 M 4 8 L 8 4" stroke="#6b4423" strokeWidth="0.5" fill="none" />
              <path d="M 0 4 L 4 8 M 4 0 L 8 4" stroke="#6b4423" strokeWidth="0.5" fill="none" />
            </pattern>
          </defs>
          {/* Bag shape */}
          <path
            d="M 15 30 Q 10 35 10 50 L 10 85 Q 10 95 20 95 L 60 95 Q 70 95 70 85 L 70 50 Q 70 35 65 30 L 15 30"
            fill={COLORS.bag}
          />
          <path
            d="M 15 30 Q 10 35 10 50 L 10 85 Q 10 95 20 95 L 60 95 Q 70 95 70 85 L 70 50 Q 70 35 65 30 L 15 30"
            fill="url(#meshPattern)"
          />
          {/* Bag opening */}
          <ellipse cx="40" cy="30" rx="27" ry="8" fill={COLORS.bagHandle} />
          <ellipse cx="40" cy="30" rx="22" ry="5" fill="#2a1a0a" />
          {/* Handles */}
          <path
            d="M 25 30 Q 25 15 40 15 Q 55 15 55 30"
            fill="none"
            stroke={COLORS.bagHandle}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <div className="container-balls">
          {bagBalls.map((ball, i) => (
            <div
              key={ball.id}
              className="mini-ball"
              style={{
                backgroundColor: ball.type === 'basketball' ? COLORS.basketball : COLORS.soccer,
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  // Render cart container
  const renderCart = () => {
    if (cart.isLocked) return null;

    const cartBalls = cart.balls || [];
    const isFull = cartBalls.length >= CART_CAPACITY;
    const isHighlighted = dragState?.dragging && !isFull;

    return (
      <div
        ref={cartRef}
        className={`container cart ${isHighlighted ? 'highlighted' : ''} ${isFull ? 'full' : ''}`}
      >
        <div className="container-label">
          Cart ({cartBalls.length}/{CART_CAPACITY})
        </div>
        <svg className="cart-svg" viewBox="0 0 120 80">
          {/* Cart body - rack style */}
          <defs>
            <pattern id="rackPattern" patternUnits="userSpaceOnUse" width="12" height="12">
              <line x1="6" y1="0" x2="6" y2="12" stroke="#3a3a3a" strokeWidth="2" />
              <line x1="0" y1="6" x2="12" y2="6" stroke="#3a3a3a" strokeWidth="2" />
            </pattern>
          </defs>
          {/* Cart frame */}
          <rect x="10" y="15" width="100" height="45" rx="5" fill={COLORS.cart} />
          <rect x="15" y="20" width="90" height="35" rx="3" fill="url(#rackPattern)" />
          {/* Cart bottom */}
          <rect x="15" y="50" width="90" height="5" fill={COLORS.cartWheels} />
          {/* Wheels */}
          <circle cx="25" cy="70" r="8" fill={COLORS.cartWheels} />
          <circle cx="25" cy="70" r="3" fill="#5a5a5a" />
          <circle cx="95" cy="70" r="8" fill={COLORS.cartWheels} />
          <circle cx="95" cy="70" r="3" fill="#5a5a5a" />
          {/* Handle */}
          <rect x="105" y="5" width="5" height="55" rx="2" fill={COLORS.cart} />
          <rect x="100" y="5" width="15" height="5" rx="2" fill={COLORS.cart} />
        </svg>
        <div className="container-balls cart-balls">
          {cartBalls.map((ball, i) => (
            <div
              key={ball.id}
              className="mini-ball"
              style={{
                backgroundColor: ball.type === 'basketball' ? COLORS.basketball : COLORS.soccer,
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div ref={playAreaRef} className="play-area">
      {/* Loose balls on left side */}
      <div className="balls-zone">
        {looseBalls.map(renderBall)}
      </div>

      {/* Containers on right side */}
      <div className="containers-zone">
        {!bag.isLocked && renderBag()}
        {!cart.isLocked && renderCart()}
      </div>

      {/* Dragging ball overlay */}
      {dragState?.dragging && dragState.position && (
        <div
          className="ball dragging"
          style={{
            left: dragState.position.x,
            top: dragState.position.y,
            backgroundColor:
              dragState.ball?.type === 'basketball' ? COLORS.basketball : COLORS.soccer,
            zIndex: Z_INDEX.draggedItem,
          }}
        >
          {dragState.ball?.type === 'soccer' && (
            <svg className="ball-pattern" viewBox="0 0 100 100">
              <defs>
                <radialGradient id={`soccer-gradient-${dragState.ball.id}`} cx="30%" cy="30%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#e0e0e0" />
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="48" fill={`url(#soccer-gradient-${dragState.ball.id})`} stroke="#333" strokeWidth="2" />
              {/* Center pentagon */}
              <polygon points="50,25 61,40 57,55 43,55 39,40" fill="#333" />
              {/* Top pentagon */}
              <polygon points="50,5 58,15 50,22 42,15" fill="#333" />
              {/* Right pentagons */}
              <polygon points="75,35 82,48 75,58 65,52 65,42" fill="#333" />
              <polygon points="68,72 75,82 65,90 55,85 58,75" fill="#333" />
              {/* Left pentagons */}
              <polygon points="25,35 35,42 35,52 25,58 18,48" fill="#333" />
              <polygon points="32,72 42,75 45,85 35,90 25,82" fill="#333" />
            </svg>
          )}
          {dragState.ball?.type === 'basketball' && (
            <svg className="ball-pattern" viewBox="0 0 100 100">
              <defs>
                <radialGradient id={`basketball-gradient-${dragState.ball.id}`} cx="35%" cy="35%">
                  <stop offset="0%" stopColor="#f5a623" />
                  <stop offset="100%" stopColor="#d4841c" />
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="48" fill={`url(#basketball-gradient-${dragState.ball.id})`} stroke="#8B4513" strokeWidth="2" />
              <path d="M 50 2 L 50 98" stroke="#333" strokeWidth="2" fill="none" />
              <path d="M 2 50 L 98 50" stroke="#333" strokeWidth="2" fill="none" />
              <path d="M 15 15 Q 50 35 85 15" stroke="#333" strokeWidth="2" fill="none" />
              <path d="M 15 85 Q 50 65 85 85" stroke="#333" strokeWidth="2" fill="none" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
};

export default PlayArea;
