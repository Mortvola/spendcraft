import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import PlaidLog from './PlaidLog';
import { PlaidLogInterface } from '../State/Types';

const PlaidLogs = observer(() => {
  const { plaidLogs } = useStores();
  const [selectedLog, setSelectedLog] = React.useState<PlaidLogInterface | null>(null);

  const handleClick = (log: PlaidLogInterface) => {
    setSelectedLog((prev) => (prev === log ? null : log))
  }

  return (
    <div>
      {
        plaidLogs.logs.map((log) => (
          <PlaidLog key={log.id} log={log} onClick={handleClick} selected={log === selectedLog} />
        ))
      }
    </div>
  )
})

export default PlaidLogs;
