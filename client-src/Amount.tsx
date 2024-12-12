import React, { CSSProperties } from 'react';

interface PropsType {
  id?: string,
  noValue?: number | string | null,
  amount?: number | string | null,
  className?: string,
  style?: CSSProperties,
  onClick?: () => void,
}

const Amount: React.FC<PropsType> = ({
  id,
  noValue = null,
  amount = null,
  className = '',
  style,
  onClick,
}) => {
  let displayedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
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

  return (
    <div id={id} className={updatedClassName} style={style} onClick={onClick}>
      {amountString}
    </div>
  );
}

export default Amount;
