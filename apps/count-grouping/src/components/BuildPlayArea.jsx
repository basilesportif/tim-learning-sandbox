import { useRef, useCallback, useEffect, useState } from 'react';
import { COLORS, Z_INDEX, BAG_CAPACITY, CART_CAPACITY } from '../lib/constants';
import './BuildPlayArea.css';

const BuildPlayArea = ({
  resources,
  answerZone,
  target,
  showRunningTotal,
  onDragToAnswer,
  onDragFromAnswer,
}) => {
  const answerZoneRef = useRef(null);

  // Internal drag state
  const [dragState, setDragState] = useState({
    dragging: false,
    itemType: null,
    item: null,
    source: null,
    position: null,
  });

  // Calculate running total from answer zone
  const runningTotal =
    (answerZone?.carts?.length || 0) * CART_CAPACITY +
    (answerZone?.bags?.length || 0) * BAG_CAPACITY +
    (answerZone?.balls?.length || 0);

  // Check if pointer is over answer zone
  const isOverAnswerZone = useCallback((clientX, clientY) => {
    if (answerZoneRef.current) {
      const rect = answerZoneRef.current.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    }
    return false;
  }, []);

  // Global event handlers for dragging using Pointer Events API
  useEffect(() => {
    if (!dragState.dragging) return;

    const handleMove = (e) => {
      e.preventDefault();
      setDragState(prev => ({ ...prev, position: { x: e.clientX, y: e.clientY } }));
    };

    const handleEnd = (e) => {
      e.preventDefault();
      const overAnswer = isOverAnswerZone(e.clientX, e.clientY);

      if (dragState.source === 'resources' && overAnswer) {
        // Dragged from resources to answer zone
        onDragToAnswer?.(dragState.item.id, dragState.itemType);
      } else if (dragState.source === 'answer' && !overAnswer) {
        // Dragged from answer zone out
        onDragFromAnswer?.(dragState.item.id, dragState.itemType);
      }

      setDragState({
        dragging: false,
        itemType: null,
        item: null,
        source: null,
        position: null,
      });
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [dragState.dragging, dragState.source, dragState.itemType, dragState.item, onDragToAnswer, onDragFromAnswer, isOverAnswerZone]);

  // Handle drag start on an item
  const handleItemPointerDown = useCallback(
    (type, item, source, e) => {
      e.preventDefault();
      e.stopPropagation();
      e.target.setPointerCapture(e.pointerId);
      setDragState({
        dragging: true,
        itemType: type,
        item,
        source,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  // Render a mini cart icon
  const renderMiniCart = (item, source) => {
    const isDragging = dragState?.dragging && dragState.itemType === 'cart' && dragState.item?.id === item.id;
    if (isDragging) return null;

    return (
      <div
        key={item.id}
        className="build-item build-cart"
        onPointerDown={(e) => handleItemPointerDown('cart', item, source, e)}
      >
        <svg viewBox="0 0 120 80" className="mini-cart-svg">
          <rect x="10" y="15" width="100" height="45" rx="5" fill={COLORS.cart} />
          <rect x="15" y="20" width="90" height="35" rx="3" fill="#5a5a5a" />
          <rect x="15" y="50" width="90" height="5" fill={COLORS.cartWheels} />
          <circle cx="25" cy="70" r="8" fill={COLORS.cartWheels} />
          <circle cx="95" cy="70" r="8" fill={COLORS.cartWheels} />
        </svg>
        <span className="item-value">10</span>
      </div>
    );
  };

  // Render a mini bag icon
  const renderMiniBag = (item, source) => {
    const isDragging = dragState?.dragging && dragState.itemType === 'bag' && dragState.item?.id === item.id;
    if (isDragging) return null;

    return (
      <div
        key={item.id}
        className="build-item build-bag"
        onPointerDown={(e) => handleItemPointerDown('bag', item, source, e)}
      >
        <svg viewBox="0 0 80 100" className="mini-bag-svg">
          <path
            d="M 15 30 Q 10 35 10 50 L 10 85 Q 10 95 20 95 L 60 95 Q 70 95 70 85 L 70 50 Q 70 35 65 30 L 15 30"
            fill={COLORS.bag}
          />
          <ellipse cx="40" cy="30" rx="27" ry="8" fill={COLORS.bagHandle} />
          <path
            d="M 25 30 Q 25 15 40 15 Q 55 15 55 30"
            fill="none"
            stroke={COLORS.bagHandle}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <span className="item-value">5</span>
      </div>
    );
  };

  // Render a loose ball
  const renderLooseBall = (item, source) => {
    const isDragging = dragState?.dragging && dragState.itemType === 'ball' && dragState.item?.id === item.id;
    if (isDragging) return null;

    return (
      <div
        key={item.id}
        className="build-item build-ball"
        onPointerDown={(e) => handleItemPointerDown('ball', item, source, e)}
      >
        <div
          className="ball-circle"
          style={{ backgroundColor: COLORS.basketball }}
        />
        <span className="item-value ball-value">1</span>
      </div>
    );
  };

  // Render the dragged item
  const renderDraggedItem = () => {
    if (!dragState?.dragging || !dragState.position) return null;

    const { itemType } = dragState;

    return (
      <div
        className="build-item dragging"
        style={{
          left: dragState.position.x,
          top: dragState.position.y,
          zIndex: Z_INDEX.draggedItem,
        }}
      >
        {itemType === 'cart' && (
          <svg viewBox="0 0 120 80" className="mini-cart-svg">
            <rect x="10" y="15" width="100" height="45" rx="5" fill={COLORS.cart} />
            <rect x="15" y="20" width="90" height="35" rx="3" fill="#5a5a5a" />
            <rect x="15" y="50" width="90" height="5" fill={COLORS.cartWheels} />
            <circle cx="25" cy="70" r="8" fill={COLORS.cartWheels} />
            <circle cx="95" cy="70" r="8" fill={COLORS.cartWheels} />
          </svg>
        )}
        {itemType === 'bag' && (
          <svg viewBox="0 0 80 100" className="mini-bag-svg">
            <path
              d="M 15 30 Q 10 35 10 50 L 10 85 Q 10 95 20 95 L 60 95 Q 70 95 70 85 L 70 50 Q 70 35 65 30 L 15 30"
              fill={COLORS.bag}
            />
            <ellipse cx="40" cy="30" rx="27" ry="8" fill={COLORS.bagHandle} />
            <path
              d="M 25 30 Q 25 15 40 15 Q 55 15 55 30"
              fill="none"
              stroke={COLORS.bagHandle}
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        )}
        {itemType === 'ball' && (
          <div
            className="ball-circle"
            style={{ backgroundColor: COLORS.basketball }}
          />
        )}
      </div>
    );
  };

  const isHighlighted = dragState?.dragging && dragState.source === 'resources';

  return (
    <div className="build-play-area">
      {/* Resources Zone - Left Side */}
      <div className="resources-zone">
        <div className="zone-label">Resources</div>
        <div className="resources-items">
          {/* Carts */}
          {resources?.carts?.length > 0 && (
            <div className="resource-group">
              <div className="resource-items-row">
                {resources.carts.map((item) => renderMiniCart(item, 'resources'))}
              </div>
            </div>
          )}

          {/* Bags */}
          {resources?.bags?.length > 0 && (
            <div className="resource-group">
              <div className="resource-items-row">
                {resources.bags.map((item) => renderMiniBag(item, 'resources'))}
              </div>
            </div>
          )}

          {/* Balls */}
          {resources?.balls?.length > 0 && (
            <div className="resource-group">
              <div className="resource-items-row balls-row">
                {resources.balls.map((item) => renderLooseBall(item, 'resources'))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Answer Zone - Right Side */}
      <div
        ref={answerZoneRef}
        className={`answer-zone ${isHighlighted ? 'highlighted' : ''}`}
      >
        <div className="target-display">
          Build: <span className="target-number">{target}</span>
        </div>

        <div className="answer-items">
          {/* Carts in answer */}
          {answerZone?.carts?.map((item) => renderMiniCart(item, 'answer'))}

          {/* Bags in answer */}
          {answerZone?.bags?.map((item) => renderMiniBag(item, 'answer'))}

          {/* Balls in answer */}
          {answerZone?.balls?.map((item) => renderLooseBall(item, 'answer'))}

          {/* Empty state */}
          {(!answerZone?.carts?.length && !answerZone?.bags?.length && !answerZone?.balls?.length) && (
            <div className="answer-placeholder">
              Drag items here
            </div>
          )}
        </div>

        {showRunningTotal && (
          <div className="running-total">
            Total: <span className={runningTotal === target ? 'correct' : ''}>{runningTotal}</span>
          </div>
        )}
      </div>

      {/* Dragged item overlay */}
      {renderDraggedItem()}
    </div>
  );
};

export default BuildPlayArea;
