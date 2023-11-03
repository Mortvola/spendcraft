import React from 'react';
import { observer } from 'mobx-react-lite';
import styles from './Transactions.module.scss'
import { BaseTransactionInterface } from '../State/State';
import Date from '../Date';
import Transaction from './Transactions/Transaction';

type PropsType = {
  pending?: BaseTransactionInterface[],
  categoryView?: boolean,
}

const PendingTransactions: React.FC<PropsType> = observer(({
  pending = [],
  categoryView = false,
}) => {
  let className = `${styles.pending} ${styles.transaction}`;
  if (!categoryView) {
    className += ` ${styles.acct}`
  }

  return (
    <>
      {
        pending.map((transaction) => (
          <div key={transaction.id} className={className}>
            <div />
            <Date className={styles.date} date={transaction.date} />
            <Transaction transaction={transaction} amount={transaction.amount} runningBalance={0} />
          </div>
        ))
      }
    </>
  );
});

export default PendingTransactions;
