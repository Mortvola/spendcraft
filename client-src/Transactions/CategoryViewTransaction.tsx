import React, { ReactElement, ReactNode } from 'react';
import PendingTransaction from '../state/PendingTransaction';
import { TransactionInterface } from '../state/State';

type PropsType = {
  transaction: TransactionInterface | PendingTransaction,
  className: string,
  selected?: boolean,
  onClick?: () => void,
  children: ReactNode,
}

const CategoryViewTransaction = ({
  transaction,
  selected = false,
  onClick,
  className,
  children,
}: PropsType): ReactElement => (
  <div className={`transaction ${selected ? 'transaction-selected' : ''} ${className}`} onClick={onClick}>
    {children}
    <div className="transaction-field">{transaction.instituteName}</div>
    <div className="transaction-field">{transaction.accountName}</div>
  </div>
);

export default CategoryViewTransaction;
