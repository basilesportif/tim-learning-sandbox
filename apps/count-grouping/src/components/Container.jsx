import { useRef } from 'react';
import { BAG_SLOTS, CART_SLOTS } from '../lib/layoutUtils';
import { BAG_CAPACITY, CART_CAPACITY } from '../lib/constants';
import Ball from './Ball';
import './Container.css';

const Container = ({
  id,
  type = 'bag',
  slots = [],
  isLocked = false,
  isComplete = false,
  isHighlighted = false,
  onDrop,
}) => {
  const containerRef = useRef(null);
  const capacity = type === 'bag' ? BAG_CAPACITY : CART_CAPACITY;
  const slotPositions = type === 'bag' ? BAG_SLOTS : CART_SLOTS;

  const handleDrop = (e) => {
    if (isLocked || !onDrop) return;
    onDrop(e, id);
  };

  // Render balls in their slot positions
  const renderBalls = () => {
    return slots.map((ball, index) => {
      if (!ball) return null;

      const slotPos = slotPositions[index];
      if (!slotPos) return null;

      return (
        <div
          key={ball.id}
          className={`container-ball-wrapper ${type === 'cart' ? 'in-cart' : ''}`}
          style={{
            left: `${slotPos.x}%`,
            top: `${slotPos.y}%`,
          }}
        >
          <Ball
            id={ball.id}
            type={ball.type}
            x={50}
            y={50}
            isDragging={false}
          />
        </div>
      );
    });
  };

  // Render empty slot indicators
  const renderSlots = () => {
    return slotPositions.map((pos, index) => {
      const hasBall = slots[index] != null;
      return (
        <div
          key={`slot-${index}`}
          className={`container-slot ${hasBall ? 'filled' : 'empty'} ${type === 'cart' ? 'cart-slot' : 'bag-slot'}`}
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
          }}
        />
      );
    });
  };

  return (
    <div
      ref={containerRef}
      className={`container container-${type} ${isLocked ? 'locked' : ''} ${isComplete ? 'complete' : ''} ${isHighlighted ? 'highlighted' : ''}`}
      data-container-id={id}
      onPointerUp={handleDrop}
    >
      {type === 'bag' ? (
        <>
          {/* Bag handle */}
          <div className="bag-handle" />

          {/* Bag body with mesh pattern */}
          <div className="bag-body">
            <div className="bag-mesh" />
            {/* Slot indicators */}
            <div className="bag-slots-container">
              {renderSlots()}
            </div>
            {/* Balls */}
            <div className="bag-balls-container">
              {renderBalls()}
            </div>
          </div>

          {/* Bag opening */}
          <div className="bag-opening" />
        </>
      ) : (
        <>
          {/* Cart frame */}
          <div className="cart-frame">
            {/* Cart handle bar */}
            <div className="cart-handle" />

            {/* Cart grid area */}
            <div className="cart-grid">
              {/* Slot indicators */}
              {renderSlots()}
              {/* Balls */}
              {renderBalls()}
            </div>

            {/* Cart bottom bar */}
            <div className="cart-bottom" />
          </div>

          {/* Cart wheels */}
          <div className="cart-wheels">
            <div className="cart-wheel left" />
            <div className="cart-wheel right" />
          </div>
        </>
      )}

      {/* Count badge */}
      <div className="container-count">
        {slots.filter(Boolean).length}/{capacity}
      </div>
    </div>
  );
};

export default Container;
