import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { CategoryInterface, TransactionInterface } from '../../State/State';
import { TransactionType } from '../../../common/ResponseTypes';
import styles from '../Transactions.module.scss';
import DesktopView from '../../DesktopView';
import MobileView from '../../MobileView';
import AccountOwner from '../AccountOwner';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
  runningBalance: number,
  category: CategoryInterface,
}

const CategoryTransaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
  runningBalance,
  category,
}) => {
  const transactionAmount = () => {
    if (category.type === 'UNASSIGNED') {
      return null;
    }

    if (
      [
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
      ].includes(transaction.type)
      || transaction.amount === amount
    ) {
      return <div />;
    }

    return <Amount className={styles.trxAmount} amount={transaction.amount} />
  }

  return (
    <>
      <DesktopView>
        <div className={`${styles.name}`}>{transaction.name}</div>
        {transactionAmount()}
        <Amount className={`${styles.amount}`} amount={amount} />
        <Amount className={`${styles.runningBalance}`} amount={runningBalance} />
        <div className={styles.institution}>{transaction.instituteName}</div>
        <div className={styles.account}>{transaction.accountName}</div>
      </DesktopView>
      <MobileView>
        <div className={`${styles.name}`}>{transaction.name}</div>
        <Amount className={`${styles.amount}`} amount={amount} />
        <div className={`${styles.account}`}>
          {
            transaction.instituteName !== ''
              ? `${transaction.instituteName}:${transaction.accountName}`
              : null
          }
        </div>
        <Amount className={`${styles.runningBalance}`} amount={runningBalance} />
        <AccountOwner owner={transaction.accountOwner} />
      </MobileView>
    </>
  );
});

export default CategoryTransaction;
