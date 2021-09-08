import React, {
  ReactElement, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { Spinner } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { AccountInterface, CategoryInterface, TransactionInterface } from '../state/State';
import CategoryViewTransaction from './CategoryViewTransaction';
import TransactionFields from './TransactionFields';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import { useFundingDialog } from '../funding/FundingDialog';
import { useRebalanceDialog } from '../rebalance/RebalanceDialog';
import { isTransaction } from '../state/Transaction';
import { TransactionType } from '../../common/ResponseTypes';
import MobxStore from '../state/mobxStore';
import TransactionForm from './TransactionForm';

type PropsType = {
  transactions?: TransactionInterface[],
  category?: CategoryInterface | null,
  account?: AccountInterface | null,
  isMobile?: boolean,
  fetching: boolean,
  balance: number,
}

const RegisterTransactions = ({
  transactions,
  category = null,
  account = null,
  isMobile = false,
  fetching,
  balance,
}: PropsType): ReactElement => {
  const { uiState } = useContext(MobxStore);
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditedTransaction] = useState<TransactionInterface | null>(null);

  const TrxDialog = useCallback(() => {
    if (isTransaction(editedTransaction)) {
      const handleDialogHide = () => {
        setEditedTransaction(null);
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
  }, [editedTransaction, CategoryTransferDialog, FundingDialog, RebalanceDialog, TransactionDialog, account]);

  const showTrxDialog = (transaction: TransactionInterface) => {
    setEditedTransaction(transaction);
    switch (transaction.type) {
      case 0:
      case 5:
        showTransactionDialog();
        break;

      case 1:
        showCategoryTransferDialog();
        break;

      case 2:
        showFundingDialog();
        break;

      case 3:
        showRebalanceDialog();
        break;

      default:
        throw new Error('invalid transaction type');
    }
  };

  let list: ReactElement[] | null = null;

  if (transactions) {
    let runningBalance = balance;
    list = transactions.map((transaction) => {
      let { amount } = transaction;

      if (category !== null) {
        amount = transaction.getAmountForCategory(category.id);
      }

      const handleClick = () => {
        if (uiState.selectedTransaction === transaction) {
          uiState.selectTransaction(null);
        }
        else {
          uiState.selectTransaction(transaction);
        }
      };

      const selected = uiState.selectedTransaction === transaction;

      let element: ReactElement;

      let className = 'transaction-wrapper';
      let transactionClassName = 'transaction';
      if (selected) {
        className += ' open';
        transactionClassName += ' transaction-selected'
      }

      if (category) {
        element = (
          <div className={className} key={transaction.id}>
            <CategoryViewTransaction
              className={transactionClassName}
              transaction={transaction}
              onClick={handleClick}
            >
              <TransactionFields
                transaction={transaction}
                amount={amount}
                balance={runningBalance}
              />
            </CategoryViewTransaction>
            <div className="transaction-form">
              {
                selected
                  ? <TransactionForm transaction={transaction} account={account} />
                  : null
              }
            </div>
          </div>
        );
      }
      else {
        element = (
          <div className={className} key={transaction.id}>
            <div className={transactionClassName} onClick={handleClick}>
              <TransactionFields
                transaction={transaction}
                amount={amount}
                balance={runningBalance}
                account={account}
              />
            </div>
            <div className="transaction-form">
              {
                selected
                  ? <TransactionForm transaction={transaction} account={account} />
                  : null
              }
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
      <div className={transactionFormClass}>
        {
          uiState.addTransaction
            ? <TransactionForm account={account} />
            : null
        }
      </div>
      {list}
      <TrxDialog />
    </div>
  );
};

export default observer(RegisterTransactions);
