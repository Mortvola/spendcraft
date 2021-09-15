import React, {
  ReactElement, useCallback, useContext, useState,
} from 'react';
import { Spinner } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { AccountInterface, CategoryInterface, TransactionInterface } from '../State/State';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import { useFundingDialog } from '../Funding/FundingDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { isTransaction } from '../State/Transaction';
import Transaction from './Transaction';
import { TransactionType } from '../../common/ResponseTypes';
import MobxStore from '../State/mobxStore';

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
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditedTransaction] = useState<TransactionInterface | null>(null);

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

  const renderTransactions = () => {
    if (transactions) {
      let runningBalance = balance;
      return transactions.map((transaction) => {
        let { amount } = transaction;
        if (category !== null) {
          amount = transaction.getAmountForCategory(category.id);
        }

        const element = (
          <Transaction
            transaction={transaction}
            amount={amount}
            runningBalance={runningBalance}
            category={category}
            showTrxDialog={showTrxDialog}
          />
        )

        if (runningBalance !== undefined) {
          runningBalance -= amount;
        }

        return element;
      });
    }

    return null;
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
      {renderTransactions()}
      <TrxDialog />
    </div>
  );
};

export default observer(RegisterTransactions);
