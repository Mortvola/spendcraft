import { observer } from 'mobx-react-lite';
import React from 'react';
import { BaseTransactionInterface } from '../State/State';
import PendingTitles from './PendingTitles';
import SecondaryRegister from './SecondaryRegister';
import Date from '../Date';
import Transaction from './Transactions/Transaction';
import styles from './Transactions.module.scss'

type PropsType = {
  categoryView: boolean,
  pending?: BaseTransactionInterface[],
}

const PendingRegister: React.FC<PropsType> = observer(({
  categoryView,
  pending,
}) => {
  if (pending && pending.length > 0) {
    return (
      <SecondaryRegister
        title="Pending Transactions"
        titles={<PendingTitles categoryView={categoryView} />}
      >
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
      </SecondaryRegister>
    );
  }

  return null;
});

export default PendingRegister;
