import React, { ReactElement, ReactNode } from 'react';
import PendingTransaction from '../state/PendingTransaction';
import { TransactionInterface } from '../state/State';

type PropsType = {
  transaction: TransactionInterface | PendingTransaction,
  className: string,
  children: ReactNode,
}

const CategoryViewTransaction = ({
  transaction,
  className,
  children,
}: PropsType): ReactElement => (
  <div className={className}>
    {children}
    <div className="transaction-field">{transaction.instituteName}</div>
    <div className="transaction-field">{transaction.accountName}</div>
  </div>
);

export default CategoryViewTransaction;
