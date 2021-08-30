import React, { ReactElement, useCallback, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { CategoryInterface, TransactionInterface } from '../state/State';
import CategoryViewTransaction from './CategoryViewTransaction';
import Transaction from './Transaction';
import TransactionFields from './TransactionFields';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import { useFundingDialog } from '../funding/FundingDialog';
import { useRebalanceDialog } from '../rebalance/RebalanceDialog';
import { isTransaction } from '../state/Transaction';
import { TransactionType } from '../../common/ResponseTypes';

type PropsType = {
  transactions?: TransactionInterface[],
  category?: CategoryInterface | null,
  isMobile?: boolean,
  fetching: boolean,
  balance: number,
}

const RegisterTransactions = ({
  transactions,
  category = null,
  isMobile = false,
  fetching,
  balance,
}: PropsType): ReactElement => {
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(null);
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditedTransaction] = useState<TransactionInterface | null>(null);

  const handleClick = (transactionId: number) => {
    setSelectedTransaction(transactionId);
  };

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
            <TransactionDialog transaction={editedTransaction} onHide={handleDialogHide} />
          );
      }
    }

    return null;
  }, [editedTransaction, TransactionDialog, RebalanceDialog, FundingDialog, CategoryTransferDialog]);

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

      const selected = selectedTransaction === transaction.id;

      let element: ReactElement;

      if (category) {
        element = (
          <CategoryViewTransaction
            key={transaction.id}
            className="transaction"
            transaction={transaction}
          >
            <TransactionFields
              transaction={transaction}
              amount={amount}
              balance={runningBalance}
              selected={selected}
              isMobile={isMobile}
              showTrxDialog={showTrxDialog}
            />
          </CategoryViewTransaction>
        );
      }
      else {
        element = (
          <Transaction
            key={transaction.id}
            className="transaction"
          >
            <TransactionFields
              transaction={transaction}
              amount={amount}
              balance={runningBalance}
              selected={selected}
              isMobile={isMobile}
              showTrxDialog={showTrxDialog}
            />
          </Transaction>
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

  return (
    <div className="transactions striped">
      {list}
      <TrxDialog />
    </div>
  );
};

export default RegisterTransactions;
