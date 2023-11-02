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
        <div className={styles.name}>{transaction.name}</div>
        <Amount className={styles.amount} amount={amount} />
        <div className={styles.account}>
          {
            transaction.instituteName !== ''
              ? `${transaction.instituteName}:${transaction.accountName}`
              : null
          }
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.name}>{transaction.name}</div>
      <Amount className={styles.amount} amount={amount} />
      <div className={styles.institution}>{transaction.instituteName}</div>
      <div className={styles.account}>{transaction.accountName}</div>
    </>
  );
});

export default Transaction;
