import React, { ReactElement, ReactNode } from 'react';
import PendingTransaction from '../State/PendingTransaction';
import { TransactionInterface } from '../State/State';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  transaction: TransactionInterface | PendingTransaction,
  className: string,
  children: ReactNode,
  onClick?: () => void,
}

const CategoryViewTransaction = ({
  transaction,
  className,
  children,
  onClick,
}: PropsType): ReactElement => {
  const { isMobile } = useMediaQuery();

  return (
    <div className={className} onClick={onClick}>
      {children}
      {
        !isMobile
          ? (
            <>
              <div className="transaction-field">{transaction.instituteName}</div>
              <div className="transaction-field">{transaction.accountName}</div>
            </>
          )
          : null
      }
    </div>
  );
}

export default CategoryViewTransaction;
