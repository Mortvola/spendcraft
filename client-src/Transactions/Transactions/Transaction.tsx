import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { TransactionInterface } from '../../State/State';
import useMediaQuery from '../../MediaQuery';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
}

const Transaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <>
        <div className="transaction-field">{transaction.name}</div>
        <Amount className="transaction-field currency" amount={amount} />
        <div
          className="transaction-field"
          style={{ gridArea: 'account', fontSize: 'x-small' }}
        >
          {`${transaction.instituteName}:${transaction.accountName}`}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="transaction-field">{transaction.name}</div>
      <Amount className="transaction-field currency" amount={amount} />
      <div className="transaction-field">{transaction.instituteName}</div>
      <div className="transaction-field">{transaction.accountName}</div>
    </>
  );
});

export default Transaction;
