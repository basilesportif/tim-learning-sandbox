import './CountingDisplay.css';

const CountingDisplay = ({
  carts = 0,
  bags = 0,
  singles = 0,
  total = 0,
  visible = true,
}) => {
  if (!visible) {
    return (
      <div className="counting-display counting-display-hidden">
        <span className="placeholder-text">Tap Check to see totals</span>
      </div>
    );
  }

  const cartValue = carts * 10;
  const bagValue = bags * 5;

  // Build the equation parts
  const parts = [];
  if (carts > 0) {
    parts.push({ icon: '🛒', count: carts, value: cartValue });
  }
  if (bags > 0) {
    parts.push({ icon: '🎒', count: bags, value: bagValue });
  }
  if (singles > 0) {
    parts.push({ icon: '⚽', count: singles, value: singles, isLoose: true });
  }

  return (
    <div className="counting-display">
      <div className="count-breakdown">
        {parts.map((part, index) => (
          <span key={index} className="count-part">
            {index > 0 && <span className="count-operator">+</span>}
            <span className="count-item">
              <span className="count-icon">{part.icon}</span>
              <span className="count-multiplier">
                {part.isLoose ? (
                  <span className="count-number">{part.count}</span>
                ) : (
                  <>
                    <span className="count-times">x</span>
                    <span className="count-number">{part.count}</span>
                    <span className="count-value">({part.value})</span>
                  </>
                )}
              </span>
            </span>
          </span>
        ))}
      </div>

      <div className="count-total">
        <span className="total-equals">=</span>
        <span className="total-number">{total}</span>
        <span className="total-label">total</span>
      </div>
    </div>
  );
};

export default CountingDisplay;
