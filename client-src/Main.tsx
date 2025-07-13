import React, { ReactNode } from 'react';
import MainTray from './MainTray';
import Toolbar from './Toolbar';
import styles from './Main.module.scss';

interface PropsType {
  toolbar?: ReactNode,
  sidebar?: ReactNode,
  children?: ReactNode,
  className?: string,
  onToggleClick?: () => void,
}

const Main: React.FC<PropsType> = ({
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
      <div className={`${styles.sideBar} window ${className}`}>
        {sidebar}
      </div>
      {children}
    </MainTray>
  </div>
)

export default Main;
