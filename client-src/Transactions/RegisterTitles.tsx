import React from 'react';
import TitleStub from './TitleStub';
import styles from './Transactions.module.scss';

interface PropsType {
  transactionClassName?: string,
}

const RegisterTitles: React.FC<PropsType> = ({
  transactionClassName,
}) => (
  <div className={`${styles.registerTitle} ${styles.transaction} ${transactionClassName ?? ''}`}>
    <div />
    <div className={styles.date}>Date</div>
    <div className={styles.name}>Name</div>
    <div className={`${styles.trxAmount} currency`}>Trx Amount</div>
    <div className={`${styles.amount} currency`}>Amount</div>
    <div className={`${styles.interest} currency`}>Interest</div>
    <div className={`${styles.principle} currency`}>Principle</div>
    <div className={`${styles.runningBalance} currency`}>Balance</div>
    <div className={styles.reconcile}>C</div>
    <div className={styles.owner}>Owner</div>
    <div className={styles.account}>Account</div>
    <TitleStub />
  </div>
);

export default RegisterTitles;
