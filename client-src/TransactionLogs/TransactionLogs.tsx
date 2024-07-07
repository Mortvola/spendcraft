import React from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import { useStores } from '../State/Store';
import DesktopView from '../DesktopView';
import styles from './TransactionLogs.module.scss';
import MobileView from '../MobileView';
import ViewTitle from '../ViewTitle';

const TransactionLogs = observer(() => {
  const { transactionLogs } = useStores();

  React.useEffect(() => {
    transactionLogs.load()
  })

  return (
    <>
      <DesktopView>
        <div className={styles.layout}>
          {/* <AutoAssigmentsToolbar /> */}
          <Outlet />
        </div>
      </DesktopView>

      <MobileView>
        <div className={styles.layout}>
          {/* <AutoAssigmentsToolbar /> */}
          <ViewTitle>Transaction Logs</ViewTitle>
          <Outlet />
        </div>
      </MobileView>
    </>
  )
})

export default TransactionLogs;
