import React from 'react';
import { TransactionLogInterface } from '../State/Types';
import DateTime from '../DateTime';
import styles from './TransactionLog.module.scss';

interface PropsType {
  log: TransactionLogInterface,
  onClick?: (transactionId: number) => void,
}

const TransactionLog: React.FC<PropsType> = ({
  log,
  onClick,
}) => {
  const handleClick = () => {
    if (onClick) {
      onClick(log.transactionId)
    }
  }

  return (
    <div key={log.id} className={styles.layout} onClick={handleClick}>
      <DateTime dateTime={log.date} />
      <div className={styles.message}>{log.message}</div>
    </div>
  )
}

export default TransactionLog;
