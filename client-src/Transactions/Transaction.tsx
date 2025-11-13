import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import { AccountInterface, BaseTransactionInterface } from '../State/Types';
import styles from './Transactions.module.scss';
import TransactionAccount from './TransactionAccount';
import { TransactionType } from '../../common/ResponseTypes';
import AccountOwner from './AccountOwner';
import Reconcile from './Reconcile';
import Date from '../Date';
import { ArrowRightLeft } from 'lucide-react';

interface PropsType {
  transaction: BaseTransactionInterface,
  className?: string,
  amount: number,
  runningBalance: number,
  account?: AccountInterface | null,
  onClick?: (transaction: BaseTransactionInterface) => void,
}

const Transaction: React.FC<PropsType> = observer(({
  transaction,
  className,
  amount,
  runningBalance,
  account,
  onClick,
}) => {
  const handleClick: React.MouseEventHandler = () => {
    if (onClick) {
      onClick(transaction);
    }
  };

  const transactionAmount = () => {
    if (
      [
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
      ].includes(transaction.type)
      || transaction.amount === amount
    ) {
      return <div className={`${styles.trxAmount} currency`} />;
    }

    return <Amount className={`${styles.trxAmount} currency`} amount={transaction.amount} />
  }

  const loanFields = () => (
    account?.type === 'loan'
      ? (
        <div className={`${className ?? ''} ${styles.transaction}`} onClick={handleClick}>
          <Amount className="currency" amount={transaction.amount} />
          {
            transaction.type !== TransactionType.STARTING_BALANCE
              ? (
                <>
                  <Amount className="currency" amount={transaction.amount - amount} />
                  <Amount className="currency" amount={amount} />
                </>
              )
              : (
                <>
                  <div />
                  <div />
                </>
              )
          }
        </div>
      )
      : null
  );

  return (
    <div className={`${className ?? ''} ${styles.transaction} ${transaction.pending ? styles.pendingTrx : ''}`} onClick={handleClick}>
      {
        transaction.duplicateOfTransactionId
          ? <ArrowRightLeft />
          : <div />
      }
      <Date className={styles.date} date={transaction.date} />
      <div className={styles.name}>{transaction.name}</div>
      <Amount className={`${styles.amount} currency`} amount={amount * (account?.type === 'credit' ? -1 : 1)} />
      <Amount className={`${styles.runningBalance} currency`} amount={runningBalance} />
      <TransactionAccount transaction={transaction} />
      {transactionAmount()}
      { loanFields() }
      <Reconcile transaction={transaction} />
      <div className={styles.pendingFlag}>Pending</div>
      <AccountOwner owner={transaction.accountOwner} />
    </div>
  );
});

export default Transaction;
