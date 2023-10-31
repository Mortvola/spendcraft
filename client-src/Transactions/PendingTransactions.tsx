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
                <div className={`mobile ${styles.pending} ${styles.transaction}`}>
                  <div />
                  <Date className={`${styles.transactionField} ${styles.transactionDate} mobile`} date={transaction.date} />
                  <div className={`${styles.transactionField} ${styles.transactionName} mobile`}>{transaction.name}</div>
                  <Amount className={`${styles.transactionField} ${styles.transactionAmount} mobile`} amount={transaction.amount} />
                  <div
                    className={`${styles.transactionField} ${styles.transactionAccount} mobile`}
                  >
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
              <div className={`mobile ${styles.transaction} ${styles.pending} ${styles.acct}`}>
                <div />
                <Date className={`${styles.transactionField} ${styles.transactionDate} mobile`} date={transaction.date} />
                <div className={`${styles.transactionField} ${styles.transactionName} mobile`}>{transaction.name}</div>
                <Amount className={`${styles.transactionField} ${styles.transactionAmount} mobile`} amount={transaction.amount} />
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
              <Date className={styles.transactionField} date={transaction.date} />
              <div className={styles.transactionField}>{transaction.name}</div>
              <Amount className={`${styles.transactionField} currency`} amount={transaction.amount} />
              <div className={styles.transactionField}>{transaction.instituteName}</div>
              <div className={styles.transactionField}>{transaction.accountName}</div>
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
            <Date className={styles.transactionField} date={transaction.date} />
            <div className={styles.transactionField}>{transaction.name}</div>
            <Amount className={`${styles.transactionField} currency`} amount={transaction.amount} />
            <AccountOwner owner={transaction.accountOwner} />
          </div>
        ))
      }
    </>
  );
});

export default PendingTransactions;
