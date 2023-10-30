import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { TransactionInterface } from '../../State/State';
import useMediaQuery from '../../MediaQuery';
import styles from '../Transactions.module.scss';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
}

const Transaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <>
        <div className={styles.transactionField}>{transaction.name}</div>
        <Amount className={`${styles.transactionField} currency`} amount={amount} />
        <div
          className={styles.transactionField}
          style={{ gridArea: 'account', fontSize: 'x-small' }}
        >
          {`${transaction.instituteName}:${transaction.accountName}`}
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.transactionField}>{transaction.name}</div>
      <Amount className={`${styles.transactionField} currency`} amount={amount} />
      <div className={styles.transactionField}>{transaction.instituteName}</div>
      <div className={styles.transactionField}>{transaction.accountName}</div>
    </>
  );
});

export default Transaction;
