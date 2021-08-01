import React, { CSSProperties, ReactElement } from 'react';

interface Props {
  id?: string,
  noValue?: number | string | null,
  amount?: number | null,
  className?: string,
  style?: CSSProperties,
}

function Amount({
  id,
  noValue = null,
  amount = null,
  className = '',
  style,
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

  return (<div id={id} className={updatedClassName} style={style}>{amountString}</div>);
}

export default Amount;
