import React from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import { useStores } from '../State/mobxStore';
import DesktopView from '../DesktopView';
import styles from './PlaidLogsView.module.scss';

const PlaidLogsView = observer(() => {
  const { plaidLogs } = useStores();

  React.useEffect(() => {
    plaidLogs.load()
  })

  return (
    <DesktopView>
      <div className={styles.layout}>
        <Outlet />
      </div>
    </DesktopView>
  )
})

export default PlaidLogsView;
