import React, { ReactElement } from 'react';
import Amount from '../Amount';
import PendingTransaction from '../state/PendingTransaction';

type PropsType = {
  transaction: PendingTransaction,
}

const PendingTransactionFields = ({
  transaction,
}: PropsType): ReactElement => (
  <>
    <div />
    <div>{transaction.date}</div>
    <div className="transaction-field">{transaction.name}</div>
    <Amount amount={transaction.amount} />
  </>
);

export default PendingTransactionFields;
