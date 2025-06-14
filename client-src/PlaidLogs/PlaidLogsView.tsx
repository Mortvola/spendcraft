import React from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router';
import { useStores } from '../State/Store';
import DesktopView from '../DesktopView';
import styles from './PlaidLogsView.module.scss';
import MobileView from '../MobileView';
import ViewTitle from '../ViewTitle';

const PlaidLogsView = observer(() => {
  const { plaidLogs } = useStores();

  React.useEffect(() => {
    plaidLogs.load()
  })

  return (
    <>
      <DesktopView>
        <div className={styles.layout}>
          <Outlet />
        </div>
      </DesktopView>

      <MobileView>
        <div className={styles.layout}>
          <ViewTitle>Plaid Logs</ViewTitle>
          <Outlet />
        </div>
      </MobileView>
    </>
  )
})

export default PlaidLogsView;
