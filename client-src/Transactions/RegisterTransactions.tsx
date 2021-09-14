import React, {
  ReactElement, useCallback, useContext, useState,
} from 'react';
import { Spinner } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { AccountInterface, CategoryInterface, TransactionInterface } from '../State/State';
import CategoryViewTransaction from './CategoryViewTransaction';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import { useFundingDialog } from '../Funding/FundingDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { isTransaction } from '../State/Transaction';
import { TransactionType } from '../../common/ResponseTypes';
import MobxStore from '../State/mobxStore';
import Amount from '../Amount';
import useMediaQuery from '../MediaQuery';
import styles from './Transactions.module.css'

type PropsType = {
  transactions?: TransactionInterface[],
  category?: CategoryInterface | null,
  account?: AccountInterface | null,
  fetching: boolean,
  balance: number,
}

const RegisterTransactions = ({
  transactions,
  category = null,
  account = null,
  fetching,
  balance,
}: PropsType): ReactElement => {
  const { uiState } = useContext(MobxStore);
  const { isMobile, isDesktop } = useMediaQuery();
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditedTransaction] = useState<TransactionInterface | null>(null);
  const dateFormat = 'LL/dd/yy';

  const TrxDialog = useCallback(() => {
    if (isTransaction(editedTransaction)) {
      const handleDialogHide = () => {
        setEditedTransaction(null);
        uiState.selectTransaction(null);
      }

      switch (editedTransaction.type) {
        case TransactionType.TRANSFER_TRANSACTION:
          return (
            <CategoryTransferDialog transaction={editedTransaction} onHide={handleDialogHide} />
          );

        case TransactionType.FUNDING_TRANSACTION:
          return (
            <FundingDialog transaction={editedTransaction} onHide={handleDialogHide} />
          );

        case TransactionType.REBALANCE_TRANSACTION:
          return (
            <RebalanceDialog transaction={editedTransaction} onHide={handleDialogHide} />
          );

        case TransactionType.REGULAR_TRANSACTION:
        default:
          return (
            <TransactionDialog transaction={editedTransaction} onHide={handleDialogHide} account={account} />
          );
      }
    }

    return null;
  }, [editedTransaction, uiState, CategoryTransferDialog, FundingDialog, RebalanceDialog, TransactionDialog, account]);

  const showTrxDialog = (transaction: TransactionInterface) => {
    setEditedTransaction(transaction);
    switch (transaction.type) {
      case TransactionType.REGULAR_TRANSACTION:
      case TransactionType.MANUAL_TRANSACTION:
      case TransactionType.STARTING_BALANCE:
        showTransactionDialog();
        break;

      case TransactionType.TRANSFER_TRANSACTION:
        showCategoryTransferDialog();
        break;

      case TransactionType.FUNDING_TRANSACTION:
        showFundingDialog();
        break;

      case TransactionType.REBALANCE_TRANSACTION:
        showRebalanceDialog();
        break;

      default:
        throw new Error('invalid transaction type');
    }
  };

  let list: (ReactElement | null)[] | null = null;

  if (transactions) {
    let runningBalance = balance;
    list = transactions.map((transaction) => {
      let { amount } = transaction;

      if (category !== null) {
        amount = transaction.getAmountForCategory(category.id);
      }

      const handleClick = () => {
        uiState.selectTransaction(transaction);
        if (transaction.type !== TransactionType.STARTING_BALANCE) {
          showTrxDialog(transaction);
        }
      };

      const selected = uiState.selectedTransaction === transaction;
      let open = false;

      let element: ReactElement | null = null;

      let className = 'transaction-wrapper';
      let transactionClassName = 'acct-transaction';
      if (category) {
        transactionClassName = styles.transaction;
      }

      if (selected) {
        if (transaction.type === TransactionType.MANUAL_TRANSACTION
          || transaction.type === TransactionType.REGULAR_TRANSACTION
          || transaction.type === TransactionType.STARTING_BALANCE) {
          className += ' open';
          open = true;
        }

        transactionClassName += ' transaction-selected'
      }

      if (category) {
        if (isDesktop) {
          element = (
            <div className={className} key={transaction.id}>
              <CategoryViewTransaction
                className={transactionClassName}
                transaction={transaction}
                onClick={handleClick}
              >
                <div />
                <div className="transaction-field">{transaction.date.toFormat(dateFormat)}</div>
                <div className="transaction-field">{transaction.name}</div>
                <Amount className="transaction-field amount currency" amount={transaction.amount} />
                <Amount className="transaction-field amount currency" amount={amount} />
                <Amount className="transaction-field balance currency" amount={runningBalance} />
              </CategoryViewTransaction>
            </div>
          );
        }

        if (isMobile) {
          element = (
            <div className={className} key={transaction.id}>
              <div className={`mobile ${transactionClassName}`} onClick={handleClick}>
                <div className="transaction-field">{transaction.date.toFormat(dateFormat)}</div>
                <div className="transaction-field">{transaction.name}</div>
                <Amount className="transaction-field amount currency" amount={amount} />
              </div>
            </div>
          );
        }
      }
      else {
        element = (
          <div className={className} key={transaction.id}>
            <div className={transactionClassName} onClick={handleClick}>
              <div />
              <div>{transaction.date.toFormat(dateFormat)}</div>
              <div className="transaction-field">{transaction.name}</div>
              <Amount className="transaction-field amount currency" amount={amount} />
              <Amount className="transaction-field balance currency" amount={runningBalance} />
            </div>
          </div>
        );
      }

      if (runningBalance !== undefined) {
        runningBalance -= amount;
      }

      return element;
    });
  }

  if (fetching) {
    return (
      <div className="please-wait">
        <Spinner animation="border" />
      </div>
    );
  }

  let transactionFormClass = 'transaction-form';
  if (uiState.addTransaction) {
    transactionFormClass += ' open';
  }

  return (
    <div className="transactions striped">
      {list}
      <TrxDialog />
    </div>
  );
};

export default observer(RegisterTransactions);
