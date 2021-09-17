import React, { ReactElement } from 'react';
import useMediaQuery from '../MediaQuery';
import styles from './Transactions.module.css'
import Amount from '../Amount';
import { PendingTransactionInterface } from '../State/State';
import { observer } from 'mobx-react-lite';

type PropsType = {
  pending?: PendingTransactionInterface[],
  categoryView?: boolean,
}

const PendingTransactions = ({
  pending = [],
  categoryView = false,
}: PropsType): ReactElement | null => {
  const { isMobile } = useMediaQuery();
  const dateFormat = 'LL/dd/yy';

  if (isMobile) {
    if (categoryView) {
      return (
        <>
          {
            pending.map((transaction) => (
              <div key={transaction.id} className={`mobile ${styles.pendingTransaction}`}>
                <div className="tranaction-field">{transaction.date.toFormat(dateFormat)}</div>
                <div className="transaction-field">{transaction.name}</div>
                <Amount className="transaction-field currency" amount={transaction.amount} />
                <div
                  className="transaction-field"
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
            <div key={transaction.id} className={`mobile ${styles.acctPendingTransaction}`}>
              <div className="tranaction-field">{transaction.date.toFormat(dateFormat)}</div>
              <div className="transaction-field">{transaction.name}</div>
              <Amount className="transaction-field currency" amount={transaction.amount} />
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
            <div key={transaction.id} className={styles.pendingTransaction}>
              <div />
              <div className="tranaction-field">{transaction.date.toFormat(dateFormat)}</div>
              <div className="transaction-field">{transaction.name}</div>
              <Amount className="transaction-field currency" amount={transaction.amount} />
              <div className="transaction-field">{transaction.instituteName}</div>
              <div className="transaction-field">{transaction.accountName}</div>
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
          <div key={transaction.id} className={styles.acctPendingTransaction}>
            <div />
            <div className="tranaction-field">{transaction.date.toFormat(dateFormat)}</div>
            <div className="transaction-field">{transaction.name}</div>
            <Amount className="transaction-field currency" amount={transaction.amount} />
          </div>
        ))
      }
    </>
  );
};

export default observer(PendingTransactions);
