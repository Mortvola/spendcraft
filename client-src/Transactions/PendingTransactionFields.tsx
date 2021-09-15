import React, { ReactElement } from 'react';
import Amount from '../Amount';
import PendingTransaction from '../State/PendingTransaction';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  transaction: PendingTransaction,
}

const PendingTransactionFields = ({
  transaction,
}: PropsType): ReactElement => {
  const { isMobile } = useMediaQuery();
  const dateFormat = 'LL/dd/yy';

  if (isMobile) {
    return (
      <>
        <div>{transaction.date.toFormat(dateFormat)}</div>
        <div className="transaction-field">{transaction.name}</div>
        <Amount amount={transaction.amount} />
      </>
    );
  }

  return (
    <>
      <div />
      <div>{transaction.date.toFormat(dateFormat)}</div>
      <div className="transaction-field">{transaction.name}</div>
      <Amount amount={transaction.amount} />
    </>
  );
}

export default PendingTransactionFields;
