import React from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from '../MediaQuery';
import styles from './Transactions.module.scss'
import Amount from '../Amount';
import { PendingTransactionInterface } from '../State/State';
import Date from '../Date';

type PropsType = {
  pending?: PendingTransactionInterface[],
  categoryView?: boolean,
}

const PendingTransactions: React.FC<PropsType> = observer(({
  pending = [],
  categoryView = false,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    if (categoryView) {
      return (
        <>
          {
            pending.map((transaction) => (
              <div key={transaction.id} className={`mobile ${styles.pending} ${styles.transaction}`}>
                <div />
                <Date className={styles.transactionField} date={transaction.date} />
                <div className={styles.transactionField}>{transaction.name}</div>
                <Amount className={`${styles.transactionField} currency`} amount={transaction.amount} />
                <div
                  className={styles.transactionField}
                  style={{ gridArea: 'account', fontSize: 'x-small' }}
                >
                  {`${transaction.instituteName}:${transaction.accountName}`}
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
            <div key={transaction.id} className={`mobile ${styles.transaction}`}>
              <div />
              <Date className={styles.transactionField} date={transaction.date} />
              <div className={styles.transactionField}>{transaction.name}</div>
              <Amount className={`${styles.transactionField} currency`} amount={transaction.amount} />
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
            <div
              className={styles.transactionField}
              style={{ textTransform: 'capitalize' }}
            >
              {transaction.accountOwner?.toLocaleLowerCase()}
            </div>
          </div>
        ))
      }
    </>
  );
});

export default PendingTransactions;
