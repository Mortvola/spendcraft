import React from 'react';
import * as PlaidApi from 'plaid';
import DateTime from '../DateTime';
import { PlaidLogInterface } from '../State/Types';
import styles from './PlaidLog.module.scss';
import TransactionsSync from './TransactionsSync';

interface PropsType {
  log: PlaidLogInterface,
  onClick: (log: PlaidLogInterface) => void,
  selected: boolean,
}

const PlaidLog: React.FC<PropsType> = ({
  log,
  onClick,
  selected,
}) => {
  const handleClick = () => {
    onClick(log);
  }

  const renderDetail = () => (
    ((log.status >= 200 && log.status < 300) || log.status === null)
    && (log.request === 'syncTransactions' || log.request === '/transactions/sync')
      ? <TransactionsSync response={log.response as PlaidApi.TransactionsSyncResponse} />
      : (
        <div className={styles.responseWrapper}>
          <div className={styles.response}>{JSON.stringify(log.response, null, 4)}</div>
        </div>
      )
  )

  return (
    <>
      <div className={styles.layout} onClick={handleClick}>
        <DateTime dateTime={log.createdAt} />
        <div className={styles.layout2}>
          <div className={styles.message}>{log.request}</div>
          <div>{log.institutionId}</div>
          <div>{log.status}</div>
        </div>
      </div>
      {
        selected
          ? renderDetail()
          : null
      }
    </>
  )
}

export default PlaidLog;
