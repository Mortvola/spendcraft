import React from 'react';
// import * as PlaidApi from 'plaid';
import DateTime from '../DateTime';
import { WebhookLogInterface } from '../State/Types';
import styles from './PlaidLog.module.scss';
// import TransactionsSync from './TransactionsSync';

interface PropsType {
  log: WebhookLogInterface,
  onClick: (log: WebhookLogInterface) => void,
  selected: boolean,
}

const WebhookLog: React.FC<PropsType> = ({
  log,
  onClick,
  selected,
}) => {
  const handleClick = () => {
    onClick(log);
  }

  const renderDetail = () => (
    <div className={styles.responseWrapper}>
      <div className={styles.response}>{JSON.stringify(log.request, null, 4)}</div>
    </div>
  )

  return (
    <>
      <div className={styles.layout} onClick={handleClick}>
        <DateTime dateTime={log.createdAt} />
        <div className={styles.layout2}>
          <div className={styles.message}>{log.type}</div>
          <div className={styles.message}>{log.request.webhook_type}</div>
          <div className={styles.message}>{log.request.webhook_code}</div>
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

export default WebhookLog;
