import React from 'react'
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import { Outlet } from 'react-router';
import ViewTitle from '../ViewTitle';
import styles from './UsersView.module.scss';
import { useStores } from '../State/Store';

const UsersView: React.FC = () => {
  const { users } = useStores();

  React.useEffect(() => {
    users.load()
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
          <ViewTitle>Users</ViewTitle>
          <Outlet />
        </div>
      </MobileView>
    </>
  )
}

export default UsersView;
