import React, {
  useCallback, useRef, useState,
} from 'react';
import { observer } from 'mobx-react-lite';
import {
  TransactionInterface,
} from '../State/State';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { isTransaction } from '../State/Transaction';
import { TransactionType } from '../../common/ResponseTypes';
import { useStores } from '../State/mobxStore';
import styles from './Transactions.module.css';
import Rebalance from './Rebalance';

type PropsType = {
  transactions: TransactionInterface[],
}

const RebalancesTransactions: React.FC<PropsType> = observer(({
  transactions,
}) => {
  const { uiState } = useStores();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditedTransaction] = useState<TransactionInterface | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // const checkForNeededData = useCallback((element: HTMLDivElement | null) => {
  //   if (element !== null) {
  //     const { scrollTop, scrollHeight, clientHeight } = element;

  //     window.requestAnimationFrame(() => {
  //       const scrollBottom = scrollHeight - (scrollTop + clientHeight);
  //       const pagesLeft = scrollBottom / clientHeight;
  //       // console.log(
  //       //   `scrollHeight: ${scrollHeight}, scrollTop: ${scrollTop}, `
  //       //   + `clientHeight: ${clientHeight}, pagesLeft: ${pagesLeft}`,
  //       // );
  //       // if (transactions) {
  //       //   const pixelsPerItem = scrollHeight / transactions.length;
  //       //   const itemsPerPage = clientHeight / pixelsPerItem;
  //       //   console.log(`items per page: ${itemsPerPage}`);
  //       // }

  //       if (pagesLeft <= 0.3) {
  //         // Query for next set of records
  //         if (category) {
  //           // console.log(`transactions.length = ${transactions ? transactions.length : null}`)
  //           category.getMoreTransactions();
  //         }
  //         else if (account) {
  //           account.getMoreTransactions();
  //         }
  //       }
  //     })
  //   }
  // }, [account, category]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    // checkForNeededData(event.target as HTMLDivElement);
  }

  // useEffect(() => {
  //   checkForNeededData(ref.current);
  // }, [checkForNeededData, transactions])

  const TrxDialog = useCallback(() => {
    if (isTransaction(editedTransaction)) {
      const handleDialogHide = () => {
        setEditedTransaction(null);
        uiState.selectTransaction(null);
      }

      switch (editedTransaction.type) {
        case TransactionType.REBALANCE_TRANSACTION:
          return (
            <RebalanceDialog transaction={editedTransaction} onHide={handleDialogHide} />
          );

        case TransactionType.TRANSFER_TRANSACTION:
        case TransactionType.FUNDING_TRANSACTION:
        case TransactionType.REGULAR_TRANSACTION:
        default:
          break;
      }
    }

    return null;
  }, [editedTransaction, uiState, RebalanceDialog]);

  const showTrxDialog = useCallback((transaction: TransactionInterface) => {
    setEditedTransaction(transaction);
    switch (transaction.type) {
      case TransactionType.REBALANCE_TRANSACTION:
        showRebalanceDialog();
        break;

      case TransactionType.TRANSFER_TRANSACTION:
      case TransactionType.FUNDING_TRANSACTION:
      case TransactionType.REGULAR_TRANSACTION:
      case TransactionType.MANUAL_TRANSACTION:
      case TransactionType.STARTING_BALANCE:
      default:
        throw new Error('invalid transaction type');
    }
  }, [showRebalanceDialog]);

  const renderTransactions = () => (
    transactions.map((transaction) => {
      const amount = transaction.categories.reduce((prev, c) => {
        if (c.amount > 0) {
          return prev + c.amount;
        }

        return prev;
      }, 0);

      return (
        <Rebalance
          key={transaction.id}
          transaction={transaction}
          amount={amount}
          showTrxDialog={showTrxDialog}
        />
      );
    })
  );

  // if (
  //   transactions.length === 0
  //   && ((category && category.transactionsQuery.fetching)
  //   || (account && account.transactionsQuery.fetching))
  // ) {
  //   return <PleaseWait />;
  // }

  return (
    <>
      <div ref={ref} className={`${styles.transactions} striped`} onScroll={handleScroll}>
        {renderTransactions()}
      </div>
      <TrxDialog />
    </>
  );
});

export default RebalancesTransactions;
