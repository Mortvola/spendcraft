import React, { ReactElement, useContext } from 'react';
import Amount from '../Amount';
import MobxStore from '../State/mobxStore';
import { CategoryInterface, TransactionInterface } from '../State/State';
import useMediaQuery from '../MediaQuery';
import { TransactionType } from '../../common/ResponseTypes';
import styles from './Transactions.module.css'

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
  runningBalance: number,
  category?: CategoryInterface | null,
  showTrxDialog: (transaction: TransactionInterface) => void,
}

const Transaction = ({
  transaction,
  amount,
  runningBalance,
  category,
  showTrxDialog,
}: PropsType): ReactElement => {
  const { uiState } = useContext(MobxStore);
  const { isMobile } = useMediaQuery();
  const dateFormat = 'LL/dd/yy';

  const handleClick = () => {
    uiState.selectTransaction(transaction);
    if (transaction.type !== TransactionType.STARTING_BALANCE) {
      showTrxDialog(transaction);
    }
  };

  const selected = uiState.selectedTransaction === transaction;

  let transactionClassName = styles.acctTransaction;
  if (category) {
    transactionClassName = styles.transaction;
  }

  if (selected) {
    transactionClassName += ' transaction-selected'
  }

  if (isMobile) {
    if (category) {
      return (
        <div className={styles.transactionWrapper} key={transaction.id}>
          <div className={`mobile ${transactionClassName}`} onClick={handleClick}>
            <div className="transaction-field">{transaction.date.toFormat(dateFormat)}</div>
            <div className="transaction-field">{transaction.name}</div>
            <Amount className="transaction-field currency" amount={amount} />
            <div
              className="transaction-field"
              style={{ gridArea: 'account', fontSize: 'x-small' }}
            >
              {`${transaction.instituteName}:${transaction.accountName}`}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.transactionWrapper} key={transaction.id}>
        <div className={`mobile ${transactionClassName}`} onClick={handleClick}>
          <div className="transaction-field">{transaction.date.toFormat(dateFormat)}</div>
          <div className="transaction-field">{transaction.name}</div>
          <Amount className="transaction-field currency" amount={amount} />
        </div>
      </div>
    );
  }

  if (category) {
    if (category.type === 'UNASSIGNED') {
      transactionClassName += ` ${styles.unassigned}`;
    }

    const transactionAmount = () => {
      if (category.type === 'UNASSIGNED') {
        return null;
      }

      if ([
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
      ].includes(transaction.type)) {
        return <div />;
      }

      return <Amount className="transaction-field currency" amount={transaction.amount} />
    }

    return (
      <div className={styles.transactionWrapper} key={transaction.id}>
        <div className={transactionClassName} onClick={handleClick}>
          <div />
          <div className="transaction-field">{transaction.date.toFormat(dateFormat)}</div>
          <div className="transaction-field">{transaction.name}</div>
          {transactionAmount()}
          <Amount className="transaction-field currency" amount={amount} />
          <Amount className="transaction-field currency" amount={runningBalance} />
          <div className="transaction-field">{transaction.instituteName}</div>
          <div className="transaction-field">{transaction.accountName}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.transactionWrapper} key={transaction.id}>
      <div className={transactionClassName} onClick={handleClick}>
        <div />
        <div>{transaction.date.toFormat(dateFormat)}</div>
        <div className="transaction-field">{transaction.name}</div>
        <Amount className="transaction-field currency" amount={amount} />
        <Amount className="transaction-field currency" amount={runningBalance} />
      </div>
    </div>
  );
};

export default Transaction;
