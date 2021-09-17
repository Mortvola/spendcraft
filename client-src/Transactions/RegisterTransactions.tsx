import React, {
  ReactElement, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { Spinner } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import {
  AccountInterface, CategoryInterface, TransactionContainerInterface, TransactionInterface,
} from '../State/State';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import { useFundingDialog } from '../Funding/FundingDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { isTransaction } from '../State/Transaction';
import Transaction from './Transaction';
import { TransactionType } from '../../common/ResponseTypes';
import MobxStore from '../State/mobxStore';

type PropsType = {
  transactions: TransactionContainerInterface<TransactionInterface>,
  category?: CategoryInterface | null,
  account?: AccountInterface | null,
  balance: number,
}

const RegisterTransactions = ({
  transactions,
  category = null,
  account = null,
  balance,
}: PropsType): ReactElement => {
  const { uiState } = useContext(MobxStore);
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
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
        console.log(`scrollHeight: ${scrollHeight}, scrollTop: ${scrollTop}, clientHeight: ${clientHeight}, pagesLeft: ${pagesLeft}`);
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
  }, [checkForNeededData, transactions.transactions])

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

  const showTrxDialog = useCallback((transaction: TransactionInterface) => {
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
  }, [showCategoryTransferDialog, showFundingDialog, showRebalanceDialog, showTransactionDialog]);

  const renderTransactions = () => {
    let runningBalance = balance;
    return transactions.transactions.map((transaction) => {
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

  if (transactions.fetching && transactions.transactions.length === 0) {
    return (
      <div className="please-wait">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <>
      <div ref={ref} className="transactions striped" onScroll={handleScroll}>
        {renderTransactions()}
      </div>
      <TrxDialog />
    </>
  );
};

export default observer(RegisterTransactions);
