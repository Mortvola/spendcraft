import React, { useState } from 'react';
import PropTypes from 'prop-types';
import AmountInput from '../AmountInput';
import Amount from '../Amount';

function CategoryRebalanceItem({ category, onDeltaChange }) {
  const [adjustment, setAdjustment] = useState(category.adjustment);
  const [newBalance, setNewBalance] = useState(category.balance + category.adjustment);

  const handleDeltaChange = (amount, delta) => {
    setAdjustment(amount);
    setNewBalance(category.balance + amount);

    if (onDeltaChange) {
      onDeltaChange(amount, delta);
    }
  };

  return (
    <div className="cat-rebalance-item">
      <div>{category.name}</div>
      <Amount amount={category.balance} />
      <AmountInput amount={adjustment} onDeltaChange={handleDeltaChange} />
      <Amount amount={newBalance} />
    </div>
  );
}

CategoryRebalanceItem.propTypes = {
  category: PropTypes.shape({
    balance: PropTypes.number.isRequired,
    adjustment: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  onDeltaChange: PropTypes.func,
};

CategoryRebalanceItem.defaultProps = {
  onDeltaChange: null,
};

export default CategoryRebalanceItem;
