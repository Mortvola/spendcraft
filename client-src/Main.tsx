import React, { ReactNode } from 'react';
import MainTray from './MainTray';
import Toolbar from './Toolbar';
import styles from './Main.module.css';
import Sidebar from './Sidebar';

type PropsType = {
  open?: boolean,
  toolbar?: ReactNode,
  sidebar?: ReactNode,
  children?: ReactNode,
  className?: string,
  onToggleClick: () => void,
}

const Main: React.FC<PropsType> = ({
  open = false,
  toolbar,
  sidebar,
  children,
  className,
  onToggleClick,
}) => (
  <div className={styles.main}>
    <Toolbar onToggleClick={onToggleClick}>
      {toolbar}
    </Toolbar>
    <MainTray className={className}>
      <Sidebar open={open} className={className}>
        {sidebar}
      </Sidebar>
      {children}
    </MainTray>
  </div>
)

export default Main;
