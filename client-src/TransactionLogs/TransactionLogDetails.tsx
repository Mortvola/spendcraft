import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import styles from './TransactionLogDetails.module.scss';
import TransactionLog from './TransactionLog';

const TransactionLogDetails = observer(() => {
  const { transactionLogs } = useStores();

  return (
    <div className={styles.layout}>
      <div className={styles.logs}>
        {
          transactionLogs.logs.map((log) => (
            <TransactionLog key={log.id} log={log} />
          ))
        }
      </div>
    </div>
  )
})

export default TransactionLogDetails;
