import { observer } from 'mobx-react-lite';
import React from 'react';
import { BaseTransactionInterface, TransactionContainerInterface } from '../State/State';
import PendingTitles from './PendingTitles';
import SecondaryRegister from './SecondaryRegister';
import Date from '../Date';
import Transaction from './Transactions/Transaction';
import styles from './Transactions.module.scss'

type PropsType = {
  trxContainer: TransactionContainerInterface,
  categoryView: boolean,
}

const PendingRegister: React.FC<PropsType> = observer(({
  trxContainer,
  categoryView,
}) => {
  if (trxContainer.transactions.length > 0) {
    return (
      <SecondaryRegister
        trxContainer={trxContainer}
        title="Pending Transactions"
        titles={<PendingTitles categoryView={categoryView} />}
      >
        {
          trxContainer.transactions.map((transaction) => (
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
