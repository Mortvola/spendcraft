import React from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import { useStores } from './State/mobxStore';
import DesktopView from './DesktopView';
import styles from './TransactionLogs.module.scss';

const TransactionLogs = observer(() => {
  const { transactionLogs } = useStores();

  React.useEffect(() => {
    transactionLogs.load()
  })

  return (
    <DesktopView>
      <div className={styles.layout}>
        {/* <AutoAssigmentsToolbar /> */}
        <Outlet />
      </div>
    </DesktopView>
  )
})

export default TransactionLogs;
