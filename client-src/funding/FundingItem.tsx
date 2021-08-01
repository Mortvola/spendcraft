import React, { ReactElement, useState } from 'react';
import PropTypes from 'prop-types';
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
      <AmountInput amount={funding} onDeltaChange={onDeltaChange} />
      <Amount className="fund-list-amt" amount={balance} />
    </div>
  );
};

FundingItem.propTypes = {
  name: PropTypes.string.isRequired,
  initialAmount: PropTypes.number.isRequired,
  funding: PropTypes.number.isRequired,
  onDeltaChange: PropTypes.func,
};

FundingItem.defaultProps = {
  onDeltaChange: null,
};

export default FundingItem;
