import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import PlaidLog from './PlaidLog';
import { PlaidLogInterface, WebhookLogInterface } from '../State/Types';
import styles from './PlaidLogs.module.scss';
import { isPlaidLog } from '../State/PlaidLog';
import { isWebhookLog } from '../State/WebhookLog';
import WebhookLog from './WebhookLOg';

const PlaidLogs = observer(() => {
  const { plaidLogs } = useStores();
  const [selectedLog, setSelectedLog] = React.useState<PlaidLogInterface | WebhookLogInterface | null>(null);

  const handleClick = (log: PlaidLogInterface | WebhookLogInterface) => {
    setSelectedLog((prev) => (prev === log ? null : log))
  }

  return (
    <div className={styles.layout}>
      <div className={styles.logs}>
        {
          plaidLogs.logs.map((log) => {
            if (isPlaidLog(log)) {
              return <PlaidLog key={`R-${log.id}`} log={log} onClick={handleClick} selected={log === selectedLog} />
            }

            if (isWebhookLog(log)) {
              return <WebhookLog key={`WH-${log.id}`} log={log} onClick={handleClick} selected={log === selectedLog} />
            }
          })
            .filter((a) => a !== undefined)
        }
      </div>
    </div>
  )
})

export default PlaidLogs;
