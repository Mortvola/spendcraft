import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { observer } from 'mobx-react-lite';
import {
  AccountInterface, CategoryInterface, TransactionInterface,
} from '../State/State';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import { useFundingDialog } from '../Funding/FundingDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { isTransaction } from '../State/Transaction';
import Transaction from './Transaction';
import { TransactionType } from '../../common/ResponseTypes';
import { useStores } from '../State/mobxStore';
import { useDuplicateDialog } from './DuplicateDialog';
import PleaseWait from '../PleaseWait';
import styles from './Transactions.module.css';

type PropsType = {
  transactions: TransactionInterface[],
  category?: CategoryInterface | null,
  account?: AccountInterface | null,
  balance: number,
}

const RegisterTransactions: React.FC<PropsType> = observer(({
  transactions,
  category = null,
  account = null,
  balance,
}) => {
  const { uiState } = useStores();
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [DuplicateDialog, showDuplicateDialog] = useDuplicateDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditedTransaction] = useState<TransactionInterface | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const checkForNeededData = useCallback((element: HTMLDivElement | null) => {
    if (element !== null) {
      const { scrollTop, scrollHeight, clientHeight } = element;

      window.requestAnimationFrame(() => {
        const scrollBottom = scrollHeight - (scrollTop + clientHeight);
        const pagesLeft = scrollBottom / clientHeight;
        // console.log(
        //   `scrollHeight: ${scrollHeight}, scrollTop: ${scrollTop}, `
        //   + `clientHeight: ${clientHeight}, pagesLeft: ${pagesLeft}`,
        // );
        // if (transactions) {
        //   const pixelsPerItem = scrollHeight / transactions.length;
        //   const itemsPerPage = clientHeight / pixelsPerItem;
        //   console.log(`items per page: ${itemsPerPage}`);
        // }

        if (pagesLeft <= 0.3) {
          // Query for next set of records
          if (category) {
            // console.log(`transactions.length = ${transactions ? transactions.length : null}`)
            category.getMoreTransactions();
          }
          else if (account) {
            account.getMoreTransactions();
          }
        }
      })
    }
  }, [account, category]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    checkForNeededData(event.target as HTMLDivElement);
  }

  useEffect(() => {
    checkForNeededData(ref.current);
  }, [checkForNeededData, transactions])

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

  const showTrxDialog = useCallback((transaction: TransactionInterface) => {
    setEditedTransaction(transaction);
    switch (transaction.type) {
      case TransactionType.REGULAR_TRANSACTION:
      case TransactionType.MANUAL_TRANSACTION:
      case TransactionType.STARTING_BALANCE:
        if (transaction.duplicateOfTransactionId !== null) {
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

  const renderTransactions = () => {
    let runningBalance = balance;
    return transactions.map((transaction) => {
      let { amount } = transaction;
      if (category !== null) {
        amount = transaction.getAmountForCategory(category.id);
      }

      const element = (
        <Transaction
          key={transaction.id}
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

  if (
    transactions.length === 0
    && ((category && category.transactionsQuery.fetching)
    || (account && account.transactionsQuery.fetching))
  ) {
    return <PleaseWait />;
  }

  return (
    <>
      <div ref={ref} className={`${styles.transactions} striped`} onScroll={handleScroll}>
        {renderTransactions()}
      </div>
      <TrxDialog />
    </>
  );
});

export default RegisterTransactions;
