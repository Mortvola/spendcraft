import React, { ReactElement } from 'react';
import PendingTransaction from '../state/PendingTransaction';
import CategoryViewTransaction from './CategoryViewTransaction';
import PendingTransactionFields from './PendingTransactionFields';

type PropsType = {
  pending?: PendingTransaction[],
  categoryView?: boolean,
}

const PendingTransactions = ({
  pending,
  categoryView = false,
}: PropsType): ReactElement | null => {
  if (pending) {
    if (!categoryView) {
      return (
        <>
          {
            pending.map((transaction) => (
              <div key={transaction.id} className="pending-transaction">
                <PendingTransactionFields transaction={transaction} />
              </div>
            ))
          }
        </>
      )
    }

    return (
      <>
        {
          pending.map((transaction) => (
            <CategoryViewTransaction key={transaction.id} className="pending-transaction" transaction={transaction}>
              <PendingTransactionFields transaction={transaction} />
            </CategoryViewTransaction>
          ))
        }
      </>
    )
  }

  return null;
};

export default PendingTransactions;
