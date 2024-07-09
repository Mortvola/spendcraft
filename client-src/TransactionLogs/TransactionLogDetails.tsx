import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import styles from './TransactionLogDetails.module.scss';
import TransactionLog from './TransactionLog';
import useTrxDialog from '../Transactions/TrxDialog';
import { BaseTransactionInterface, TransactionInterface } from '../State/Types';
import { TransactionType } from '../../common/ResponseTypes';

const TransactionLogDetails = observer(() => {
  const { transactionLogs } = useStores();

  const handleReload = () => {
    // showNotification()
    // trxContainer.getData(0)
  }

  const [TrxDialog, showTrxDialog] = useTrxDialog(undefined, handleReload);
  const { uiState } = useStores();

  const handleClick = (transactionId: number) => {
    // uiState.selectTransaction(transaction as TransactionInterface);
    // if (
    //   transaction.type !== TransactionType.STARTING_BALANCE
    //   && showTrxDialog
    // ) {
    //   showTrxDialog(transaction as TransactionInterface);
    // }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.logs}>
        {
          transactionLogs.logs.map((log) => (
            <TransactionLog key={log.id} log={log} onClick={handleClick} />
          ))
        }
      </div>
      <TrxDialog />
    </div>
  )
})

export default TransactionLogDetails;
