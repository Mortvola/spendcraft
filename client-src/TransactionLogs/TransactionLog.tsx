import React from 'react';
import { TransactionLogInterface } from '../State/Types';
import DateTime from '../DateTime';
import styles from './TransactionLog.module.scss';

type PropsType = {
  log: TransactionLogInterface,
}

const TransactionLog: React.FC<PropsType> = ({
  log,
}) => (
  <div key={log.id} className={styles.layout}>
    <DateTime dateTime={log.date} />
    <div className={styles.message}>{log.message}</div>
  </div>
)

export default TransactionLog;
