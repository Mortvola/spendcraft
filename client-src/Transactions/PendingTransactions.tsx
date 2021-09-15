import React, { ReactElement } from 'react';
import PendingTransaction from '../State/PendingTransaction';
import CategoryViewTransaction from './CategoryViewTransaction';
import PendingTransactionFields from './PendingTransactionFields';
import useMediaQuery from '../MediaQuery';
import styles from './Transactions.module.css'

type PropsType = {
  pending?: PendingTransaction[],
  categoryView?: boolean,
}

const PendingTransactions = ({
  pending = [],
  categoryView = false,
}: PropsType): ReactElement | null => {
  const { isMobile } = useMediaQuery();

  let className = styles.pendingTransaction;
  if (isMobile) {
    className += ' mobile';
  }

  if (!categoryView) {
    return (
      <>
        {
          pending.map((transaction) => (
            <div key={transaction.id} className={className}>
              <PendingTransactionFields transaction={transaction} />
            </div>
          ))
        }
      </>
    );
  }

  return (
    <>
      {
        pending.map((transaction) => (
          <CategoryViewTransaction key={transaction.id} className={className} transaction={transaction}>
            <PendingTransactionFields transaction={transaction} />
          </CategoryViewTransaction>
        ))
      }
    </>
  )
};

export default PendingTransactions;
