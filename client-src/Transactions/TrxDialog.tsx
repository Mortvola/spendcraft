import React from 'react';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import { useFundingDialog } from '../Funding/FundingDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { useDuplicateDialog } from './DuplicateDialog';
import { isTransaction } from '../State/Transaction';
import { AccountInterface, TransactionInterface } from '../State/State';
import { TransactionType } from '../../common/ResponseTypes';
import { useStores } from '../State/mobxStore';

const useTrxDialog = (account?: AccountInterface): [
  () => JSX.Element | null,
  (transaction: TransactionInterface) => void,
] => {
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [DuplicateDialog, showDuplicateDialog] = useDuplicateDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditedTransaction] = React.useState<TransactionInterface | null>(null);
  const { uiState } = useStores();

  const TrxDialog = React.useCallback(() => {
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
          if (editedTransaction.duplicateOfTransactionId !== null) {
            return (
              <DuplicateDialog transaction={editedTransaction} onHide={handleDialogHide} />
            )
          }

          return (
            <TransactionDialog transaction={editedTransaction} onHide={handleDialogHide} account={account} />
          );
      }
    }

    return null;
  }, [
    editedTransaction,
    account,
    uiState,
    CategoryTransferDialog,
    FundingDialog,
    RebalanceDialog,
    TransactionDialog,
    DuplicateDialog,
  ]);

  const showTrxDialog = React.useCallback((transaction: TransactionInterface) => {
    setEditedTransaction(transaction);
    switch (transaction.type) {
      case TransactionType.REGULAR_TRANSACTION:
      case TransactionType.MANUAL_TRANSACTION:
      case TransactionType.STARTING_BALANCE:
        if (
          transaction.duplicateOfTransactionId !== null
          && transaction.duplicateOfTransactionId !== undefined
        ) {
          showDuplicateDialog();
        }
        else {
          showTransactionDialog();
        }

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
  }, [showCategoryTransferDialog, showDuplicateDialog, showFundingDialog, showRebalanceDialog, showTransactionDialog]);

  return [TrxDialog, showTrxDialog];
};

export default useTrxDialog;
