import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import { useStores } from '../State/mobxStore';
import { CategoryInterface, TransactionInterface } from '../State/State';
import useMediaQuery from '../MediaQuery';
import { TransactionType } from '../../common/ResponseTypes';
import styles from './Transactions.module.css'
import Date from '../Date';
import Icon from '../Icon';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
  runningBalance: number,
  category?: CategoryInterface | null,
  showTrxDialog: (transaction: TransactionInterface) => void,
}

const Transaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
  runningBalance,
  category,
  showTrxDialog,
}) => {
  const { uiState } = useStores();
  const { isMobile, addMediaClass } = useMediaQuery();

  const handleClick: React.MouseEventHandler = () => {
    uiState.selectTransaction(transaction);
    if (transaction.type !== TransactionType.STARTING_BALANCE) {
      showTrxDialog(transaction);
    }
  };

  let transactionClassName = `${styles.acct} ${styles.transaction}`;
  if (category) {
    transactionClassName = styles.transaction;
  }

  transactionClassName = addMediaClass(transactionClassName);

  const transactionDetails = () => {
    if (category) {
      if (isMobile) {
        return (
          <>
            <Amount className="transaction-field currency" amount={amount} />
            <div
              className="transaction-field"
              style={{ gridArea: 'account', fontSize: 'x-small' }}
            >
              {`${transaction.instituteName}:${transaction.accountName}`}
            </div>
          </>
        );
      }

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
        ].includes(transaction.type)
        || transaction.amount === amount) {
          return <div />;
        }

        return <Amount className="transaction-field currency" amount={transaction.amount} />
      }

      return (
        <>
          {transactionAmount()}
          <Amount className="transaction-field currency" amount={amount} />
          <Amount className="transaction-field currency" amount={runningBalance} />
          <div className="transaction-field">{transaction.instituteName}</div>
          <div className="transaction-field">{transaction.accountName}</div>
        </>
      );
    }

    if (isMobile) {
      return (
        <Amount className="transaction-field currency" amount={amount} />
      );
    }

    const handleReconcileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
      transaction.toggleReconciled();
    };

    const handleReconcileClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
      event.stopPropagation();
    };

    return (
      <>
        <Amount className="transaction-field currency" amount={amount} />
        <Amount className="transaction-field currency" amount={runningBalance} />
        <input
          type="checkbox"
          checked={transaction.reconciled}
          onChange={handleReconcileChange}
          onClick={handleReconcileClick}
        />
      </>
    )
  };

  return (
    <div className={styles.transactionWrapper}>
      <div className={transactionClassName} onClick={handleClick}>
        {
          transaction.duplicateOfTransactionId
            ? <Icon icon="arrow-right-arrow-left" iconClass="fa-solid" />
            : <div />
        }
        <Date className="transaction-field" date={transaction.date} />
        <div className="transaction-field">{transaction.name}</div>
        {
          transactionDetails()
        }
      </div>
    </div>
  );
});

export default Transaction;
