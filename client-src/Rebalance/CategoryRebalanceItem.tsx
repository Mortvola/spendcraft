import React from 'react';
import AmountInput from '../AmountInput';
import Amount from '../Amount';

type PropsType = {
  category: { name: string, balance: number, adjustment: number },
  onDeltaChange?: ((amunt: number, delta: number) => void),
}

const CategoryRebalanceItem: React.FC<PropsType> = ({
  category,
  onDeltaChange,
}) => (
  <div className="cat-rebalance-item">
    <div>{category.name}</div>
    <Amount amount={category.balance} />
    <AmountInput value={category.adjustment} onDeltaChange={onDeltaChange} />
    <Amount amount={category.balance + category.adjustment} />
  </div>
);

export default CategoryRebalanceItem;
