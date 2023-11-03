import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { AccountInterface, BaseTransactionInterface } from '../../State/State';
import styles from '../Transactions.module.scss';
import TransactionAccount from '../TransactionAccount';
import { TransactionType } from '../../../common/ResponseTypes';
import AccountOwner from '../AccountOwner';
import Reconcile from '../Reconcile';

type PropsType = {
  transaction: BaseTransactionInterface,
  amount: number,
  runningBalance: number,
  account?: AccountInterface | null,
}

const Transaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
  runningBalance,
  account,
}) => {
  const transactionAmount = () => {
    if (
      [
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
      ].includes(transaction.type)
      || transaction.amount === amount
    ) {
      return <div className={styles.trxAmount} />;
    }

    return <Amount className={styles.trxAmount} amount={transaction.amount} />
  }

  const loanFields = () => (
    account?.type === 'loan'
      ? (
        <>
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
        </>
      )
      : null
  );

  return (
    <>
      <div className={styles.name}>{transaction.name}</div>
      <Amount className={styles.amount} amount={amount} />
      <Amount className={styles.runningBalance} amount={runningBalance} />
      <TransactionAccount transaction={transaction} />
      {transactionAmount()}
      { loanFields() }
      <Reconcile transaction={transaction} />
      <AccountOwner owner={transaction.accountOwner} />
    </>
  );
});

export default Transaction;
