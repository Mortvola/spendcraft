import React, { ReactElement } from 'react';
import AmountInput from '../AmountInput';
import Amount from '../Amount';

type PropsType = {
  name: string,
  initialAmount: number,
  funding: number,
  onDeltaChange: ((amount: number, delta: number) => void),
}
const FundingItem = ({
  name,
  initialAmount,
  funding,
  onDeltaChange,
}: PropsType): ReactElement => {
  const balance = initialAmount + funding;

  return (
    <div className="fund-list-item">
      <div className="fund-list-cat-name">{name}</div>
      <Amount className="fund-list-amt" amount={initialAmount} />
      <AmountInput value={funding} onDeltaChange={onDeltaChange} />
      <Amount className="fund-list-amt" amount={balance} />
    </div>
  );
};

export default FundingItem;
