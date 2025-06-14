import React from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router';
import { useStores } from '../State/Store';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import styles from './OverviewView.module.scss';
import ViewTitle from '../ViewTitle';

const OverviewView = observer(() => {
  const { overview } = useStores();

  React.useEffect(() => {
    overview.load()
  })

  return (
    <>
      <DesktopView>
        <div>
          <Outlet />
        </div>
      </DesktopView>

      <MobileView>
        <div className={styles.layout}>
          <ViewTitle>Bills</ViewTitle>
          <Outlet />
        </div>
      </MobileView>
    </>
  )
})

export default OverviewView;
