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
          <svg className="ball-pattern" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="#333" strokeWidth="1" />
            <polygon
              points="20,5 26,12 24,20 16,20 14,12"
              fill="#333"
            />
            <polygon
              points="35,18 32,26 24,27 22,20 28,14"
              fill="#333"
            />
            <polygon
              points="30,34 22,35 16,28 18,21 26,22"
              fill="#333"
            />
            <polygon
              points="10,34 18,35 24,28 22,21 14,22"
              fill="#333"
            />
            <polygon
              points="5,18 8,26 16,27 18,20 12,14"
              fill="#333"
            />
          </svg>
        )}
        {ball.type === 'basketball' && (
          <svg className="ball-pattern" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="#333" strokeWidth="1.5" />
            <line x1="20" y1="2" x2="20" y2="38" stroke="#333" strokeWidth="1.5" />
            <line x1="2" y1="20" x2="38" y2="20" stroke="#333" strokeWidth="1.5" />
            <path d="M 8 8 Q 20 14 32 8" fill="none" stroke="#333" strokeWidth="1.5" />
            <path d="M 8 32 Q 20 26 32 32" fill="none" stroke="#333" strokeWidth="1.5" />
          </svg>
        )}
      </div>
    );
  };

  // Render bag container
  const renderBag = () => {
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
        {renderBag()}
        {renderCart()}
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
            <svg className="ball-pattern" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="#333" strokeWidth="1" />
              <polygon points="20,5 26,12 24,20 16,20 14,12" fill="#333" />
              <polygon points="35,18 32,26 24,27 22,20 28,14" fill="#333" />
              <polygon points="30,34 22,35 16,28 18,21 26,22" fill="#333" />
              <polygon points="10,34 18,35 24,28 22,21 14,22" fill="#333" />
              <polygon points="5,18 8,26 16,27 18,20 12,14" fill="#333" />
            </svg>
          )}
          {dragState.ball?.type === 'basketball' && (
            <svg className="ball-pattern" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="#333" strokeWidth="1.5" />
              <line x1="20" y1="2" x2="20" y2="38" stroke="#333" strokeWidth="1.5" />
              <line x1="2" y1="20" x2="38" y2="20" stroke="#333" strokeWidth="1.5" />
              <path d="M 8 8 Q 20 14 32 8" fill="none" stroke="#333" strokeWidth="1.5" />
              <path d="M 8 32 Q 20 26 32 32" fill="none" stroke="#333" strokeWidth="1.5" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
};

export default PlayArea;
