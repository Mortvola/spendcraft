import React, { ReactElement, useState } from 'react';
// import PropTypes from 'prop-types';
import AmountInput from '../AmountInput';
import Amount from '../Amount';

interface Props {
  category: { name: string, balance: number, adjustment: number },
  onDeltaChange: null | ((amunt: number, delta: number) => void),
}

function CategoryRebalanceItem({
  category,
  onDeltaChange,
}: Props): ReactElement {
  const [adjustment, setAdjustment] = useState(category.adjustment);
  const [newBalance, setNewBalance] = useState(category.balance + category.adjustment);

  const handleDeltaChange = (amount: number, delta: number) => {
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

export default CategoryRebalanceItem;
