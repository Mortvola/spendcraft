import React, { ReactElement } from 'react';
import AmountInput from '../AmountInput';
import Amount from '../Amount';

interface Props {
  category: { name: string, balance: number, adjustment: number },
  onDeltaChange?: ((amunt: number, delta: number) => void),
}

const CategoryRebalanceItem = ({
  category,
  onDeltaChange,
}: Props): ReactElement => (
  <div className="cat-rebalance-item">
    <div>{category.name}</div>
    <Amount amount={category.balance} />
    <AmountInput value={category.adjustment} onDeltaChange={onDeltaChange} />
    <Amount amount={category.balance + category.adjustment} />
  </div>
);

export default CategoryRebalanceItem;
