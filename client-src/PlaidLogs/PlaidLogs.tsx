import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import PlaidLog from './PlaidLog';
import { PlaidLogInterface } from '../State/Types';
import styles from './PlaidLogs.module.scss';

const PlaidLogs = observer(() => {
  const { plaidLogs } = useStores();
  const [selectedLog, setSelectedLog] = React.useState<PlaidLogInterface | null>(null);

  const handleClick = (log: PlaidLogInterface) => {
    setSelectedLog((prev) => (prev === log ? null : log))
  }

  return (
    <div className={styles.layout}>
      <div className={styles.logs}>
        {
          plaidLogs.logs.map((log) => (
            <PlaidLog key={log.id} log={log} onClick={handleClick} selected={log === selectedLog} />
          ))
        }
      </div>
    </div>
  )
})

export default PlaidLogs;
