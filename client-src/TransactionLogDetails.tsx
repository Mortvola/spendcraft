import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from './State/Store';
import DateTime from './DateTime';
import styles from './TransactionLog.module.scss';

const TransactionLogDetails = observer(() => {
  const { transactionLogs } = useStores();

  return (
    <div>
      {
        transactionLogs.logs.map((log) => (
          <div key={log.id} className={styles.layout}>
            <DateTime dateTime={log.date} />
            <div className={styles.message}>{log.message}</div>
          </div>
        ))
      }
    </div>
  )
})

export default TransactionLogDetails;
