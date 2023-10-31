import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { AccountInterface, TransactionInterface } from '../../State/State';
import useMediaQuery from '../../MediaQuery';
import { TransactionType } from '../../../common/ResponseTypes';
import styles from '../Transactions.module.scss';
import AccountOwner from '../AccountOwner';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
  runningBalance: number,
  account: AccountInterface,
}

const AccountTransaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
  runningBalance,
  account,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <>
        <div className={`${styles.transactionField} ${styles.transactionName} mobile`}>{transaction.name}</div>
        <Amount className={`${styles.transactionField} ${styles.transactionAmount} mobile`} amount={amount} />
        <Amount className={`${styles.transactionField} ${styles.transactionRunningBalance} mobile`} amount={runningBalance} />
        <AccountOwner owner={transaction.accountOwner} />
      </>
    );
  }

  const handleReconcileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    transaction.toggleReconciled();
  };

  const handleReconcileClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
    event.stopPropagation();
  };

  const loanFields = () => (
    <>
      <Amount className={`${styles.transactionField} currency`} amount={transaction.amount} />
      {
        transaction.type !== TransactionType.STARTING_BALANCE
          ? (
            <>
              <Amount className={`${styles.transactionField} currency`} amount={transaction.amount - amount} />
              <Amount className={`${styles.transactionField} currency`} amount={amount} />
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
  );

  return (
    <>
      <div className={styles.transactionField}>{transaction.name}</div>
      {
        // eslint-disable-next-line no-nested-ternary
        account.type === 'loan'
          ? (
            loanFields()
          )
          : <Amount className={`${styles.transactionField} currency`} amount={amount} />
      }
      <Amount className={`${styles.transactionField} currency`} amount={runningBalance} />
      <input
        type="checkbox"
        checked={transaction.reconciled}
        onChange={handleReconcileChange}
        onClick={handleReconcileClick}
      />
      <AccountOwner owner={transaction.accountOwner} />
    </>
  );
});

export default AccountTransaction;
