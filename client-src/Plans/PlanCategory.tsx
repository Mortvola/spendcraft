import React, { ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import { CategoryInterface } from '../State/State';

type PropsType = {
  category: CategoryInterface,
  amount: number,
  onDeltaChange: ((category: CategoryInterface, amount: number, delta: number) => void),
}
const PlanCategory = ({
  category,
  amount,
  onDeltaChange,
}: PropsType): ReactElement => {
  const handleDeltaChange = (newAmount: number, delta: number) => {
    if (onDeltaChange) {
      onDeltaChange(category, newAmount, delta);
    }
  };

  return (
    <div className="plan-detail-item">
      <div>{category.name}</div>
      <AmountInput value={amount} onDeltaChange={handleDeltaChange} />
      <Amount amount={amount * 12} />
    </div>
  );
};

export default observer(PlanCategory);
