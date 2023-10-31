import React from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from '../MediaQuery';
import styles from './Transactions.module.scss'
import Amount from '../Amount';
import { PendingTransactionInterface } from '../State/State';
import Date from '../Date';
import AccountOwner from './AccountOwner';

type PropsType = {
  pending?: PendingTransactionInterface[],
  categoryView?: boolean,
}

const PendingTransactions: React.FC<PropsType> = observer(({
  pending = [],
  categoryView = false,
}) => {
  const { isMobile, addMediaClass } = useMediaQuery();

  if (isMobile) {
    if (categoryView) {
      return (
        <>
          {
            pending.map((transaction) => (
              <div key={transaction.id} className={addMediaClass(styles.transactionWrapper)}>
                <div className={`${styles.pending} ${styles.transaction}`}>
                  <div />
                  <Date className={styles.date} date={transaction.date} />
                  <div className={styles.name}>{transaction.name}</div>
                  <Amount className={styles.amount} amount={transaction.amount} />
                  <div className={styles.account}>
                    {
                      transaction.instituteName !== ''
                        ? `${transaction.instituteName}:${transaction.accountName}`
                        : null
                    }
                  </div>
                  <AccountOwner owner={transaction.accountOwner} />
                </div>
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
            <div key={transaction.id} className={addMediaClass(styles.transactionWrapper)}>
              <div className={`${styles.transaction} ${styles.pending} ${styles.acct}`}>
                <div />
                <Date className={styles.date} date={transaction.date} />
                <div className={styles.name}>{transaction.name}</div>
                <Amount className={styles.amount} amount={transaction.amount} />
                <AccountOwner owner={transaction.accountOwner} />
              </div>
            </div>
          ))
        }
      </>
    )
  }

  if (categoryView) {
    return (
      <>
        {
          pending.map((transaction) => (
            <div key={transaction.id} className={`${styles.pending} ${styles.transaction}`}>
              <div />
              <Date className={styles.date} date={transaction.date} />
              <div className={styles.name}>{transaction.name}</div>
              <Amount className={styles.amount} amount={transaction.amount} />
              <div className={styles.institution}>{transaction.instituteName}</div>
              <div className={styles.account}>{transaction.accountName}</div>
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
          <div key={transaction.id} className={`${styles.acct} ${styles.pending} ${styles.transaction}`}>
            <div />
            <Date className={styles.date} date={transaction.date} />
            <div className={styles.name}>{transaction.name}</div>
            <Amount className={styles.amount} amount={transaction.amount} />
            <AccountOwner owner={transaction.accountOwner} />
          </div>
        ))
      }
    </>
  );
});

export default PendingTransactions;
