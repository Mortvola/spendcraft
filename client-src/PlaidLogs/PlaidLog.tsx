import React from 'react';
import * as PlaidApi from 'plaid';
import DateTime from '../DateTime';
import { PlaidLogInterface } from '../State/State';
import styles from './PlaidLog.module.scss';
import TransactionsSync from './TransactionsSync';

type PropsType = {
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

  return (
    <>
      <div className={styles.layout} onClick={handleClick}>
        <DateTime dateTime={log.createdAt} />
        <div className={styles.message}>{log.request}</div>
      </div>
      {
        selected && log.request === 'syncTransactions'
          ? <TransactionsSync response={log.response as PlaidApi.TransactionsSyncResponse} />
          : null
      }
    </>
  )
}

export default PlaidLog;
