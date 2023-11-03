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
}) => (
  <>
    {
      pending.map((transaction) => (
        <div key={transaction.id} className={styles.transactionWrapper}>
          <div className={styles.transaction}>
            <div />
            <Date className={styles.date} date={transaction.date} />
            <Transaction transaction={transaction} amount={transaction.amount} runningBalance={0} />
          </div>
        </div>
      ))
    }
  </>
));

export default PendingTransactions;
