import { useState, useCallback } from 'react';
import { COLORS, BAG_CAPACITY, CART_CAPACITY } from '../lib/constants';
import './Shelf.css';

const Shelf = ({
  bags = 0,
  carts = 0,
  tradingEnabled = false,
  onCombine,
  onSkipCount,
}) => {
  const [pulsingBundle, setPulsingBundle] = useState(null);

  // Check if combine is available (2+ bags)
  const canCombine = tradingEnabled && bags >= 2;

  // Handle bundle tap for skip counting
  const handleBundleTap = useCallback(
    (bundle, index) => {
      // Trigger visual pulse
      setPulsingBundle(index);
      setTimeout(() => setPulsingBundle(null), 600);

      // Call skip count callback
      onSkipCount?.(bundle);
    },
    [onSkipCount]
  );

  // Handle combine button click
  const handleCombine = useCallback(() => {
    if (canCombine) {
      onCombine?.();
    }
  }, [canCombine, onCombine]);

  // Render bag icon
  const renderBagIcon = (key, isPulsing = false) => (
    <svg
      key={key}
      className={`bundle-icon bag-icon ${isPulsing ? 'pulsing' : ''}`}
      viewBox="0 0 40 50"
    >
      {/* Mesh pattern */}
      <defs>
        <pattern id="meshSmall" patternUnits="userSpaceOnUse" width="4" height="4">
          <path d="M 0 2 L 2 0 M 2 4 L 4 2" stroke="#6b4423" strokeWidth="0.3" fill="none" />
          <path d="M 0 2 L 2 4 M 2 0 L 4 2" stroke="#6b4423" strokeWidth="0.3" fill="none" />
        </pattern>
      </defs>
      {/* Bag body */}
      <path
        d="M 8 15 Q 5 17 5 25 L 5 42 Q 5 47 10 47 L 30 47 Q 35 47 35 42 L 35 25 Q 35 17 32 15 L 8 15"
        fill={COLORS.bag}
      />
      <path
        d="M 8 15 Q 5 17 5 25 L 5 42 Q 5 47 10 47 L 30 47 Q 35 47 35 42 L 35 25 Q 35 17 32 15 L 8 15"
        fill="url(#meshSmall)"
      />
      {/* Bag opening */}
      <ellipse cx="20" cy="15" rx="13" ry="4" fill={COLORS.bagHandle} />
      <ellipse cx="20" cy="15" rx="10" ry="2.5" fill="#2a1a0a" />
      {/* Handle */}
      <path
        d="M 12 15 Q 12 7 20 7 Q 28 7 28 15"
        fill="none"
        stroke={COLORS.bagHandle}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Count indicator */}
      <circle cx="32" cy="8" r="7" fill={COLORS.success} />
      <text
        x="32"
        y="11"
        textAnchor="middle"
        fontSize="8"
        fontWeight="bold"
        fill="white"
      >
        {BAG_CAPACITY}
      </text>
    </svg>
  );

  // Render cart icon
  const renderCartIcon = (key, isPulsing = false) => (
    <svg
      key={key}
      className={`bundle-icon cart-icon ${isPulsing ? 'pulsing' : ''}`}
      viewBox="0 0 60 45"
    >
      {/* Rack pattern */}
      <defs>
        <pattern id="rackSmall" patternUnits="userSpaceOnUse" width="6" height="6">
          <line x1="3" y1="0" x2="3" y2="6" stroke="#3a3a3a" strokeWidth="1" />
          <line x1="0" y1="3" x2="6" y2="3" stroke="#3a3a3a" strokeWidth="1" />
        </pattern>
      </defs>
      {/* Cart frame */}
      <rect x="5" y="8" width="50" height="24" rx="3" fill={COLORS.cart} />
      <rect x="8" y="11" width="44" height="18" rx="2" fill="url(#rackSmall)" />
      {/* Cart bottom */}
      <rect x="8" y="27" width="44" height="3" fill={COLORS.cartWheels} />
      {/* Wheels */}
      <circle cx="15" cy="38" r="5" fill={COLORS.cartWheels} />
      <circle cx="15" cy="38" r="2" fill="#5a5a5a" />
      <circle cx="50" cy="38" r="5" fill={COLORS.cartWheels} />
      <circle cx="50" cy="38" r="2" fill="#5a5a5a" />
      {/* Handle */}
      <rect x="52" y="3" width="3" height="28" rx="1" fill={COLORS.cart} />
      {/* Count indicator */}
      <circle cx="52" cy="6" r="7" fill={COLORS.info} />
      <text
        x="52"
        y="9"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fill="white"
      >
        {CART_CAPACITY}
      </text>
    </svg>
  );

  return (
    <div className="shelf">
      {/* Completed bundles section */}
      <div className="bundles-section">
        {/* Bag bundles */}
        {bags > 0 && (
          <div className="bundle-group">
            <div
              className="bundle-item"
              onClick={() => handleBundleTap({ type: 'bag', value: BAG_CAPACITY }, 'bag')}
            >
              {renderBagIcon('bag-display', pulsingBundle === 'bag')}
              {bags > 1 && <span className="bundle-count">x{bags}</span>}
            </div>
            {pulsingBundle === 'bag' && (
              <div className="skip-count-popup">{BAG_CAPACITY}</div>
            )}
          </div>
        )}

        {/* Cart bundles */}
        {carts > 0 && (
          <div className="bundle-group">
            <div
              className="bundle-item"
              onClick={() => handleBundleTap({ type: 'cart', value: CART_CAPACITY }, 'cart')}
            >
              {renderCartIcon('cart-display', pulsingBundle === 'cart')}
              {carts > 1 && <span className="bundle-count">x{carts}</span>}
            </div>
            {pulsingBundle === 'cart' && (
              <div className="skip-count-popup">{CART_CAPACITY}</div>
            )}
          </div>
        )}

      </div>

      {/* Combine button */}
      {tradingEnabled && (
        <button
          className={`combine-button ${canCombine ? 'available' : 'disabled'}`}
          onClick={handleCombine}
          disabled={!canCombine}
        >
          Combine Bags
        </button>
      )}
    </div>
  );
};

export default Shelf;
