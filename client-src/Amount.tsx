import React, { ReactElement } from 'react';
import PropTypes from 'prop-types';

interface Props {
  noValue: number,
  amount: number,
  className: string,
}

function Amount({
  noValue,
  amount,
  className,
}: Props): ReactElement {
  let displayedAmount = amount;
  if (displayedAmount === null) {
    if (noValue === null) {
      displayedAmount = 0;
    }
  }

  let updatedClassName = `${className} dollar-amount`;
  let amountString;

  if (displayedAmount === null) {
    amountString = noValue;
  }
  else {
    amountString = displayedAmount.toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
    if (amountString === '-0.00') {
      amountString = '0.00';
    }
    else if (displayedAmount < 0) {
      updatedClassName += ' negative';
    }
  }

  return (<div className={updatedClassName}>{amountString}</div>);
}

Amount.propTypes = {
  amount: PropTypes.number,
  className: PropTypes.string,
  noValue: PropTypes.string,
};

Amount.defaultProps = {
  amount: null,
  className: '',
  noValue: null,
};

export default Amount;
