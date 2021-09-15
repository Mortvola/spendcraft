import React, { ReactElement, ReactNode } from 'react';
import MainTray from './MainTray';
import Toolbar from './Toolbar';
import styles from './Main.module.css';

type PropsType = {
  toolbar: ReactNode,
  children?: ReactNode,
  className?: string,
  onToggleClick: () => void,
}

const Main = ({
  toolbar,
  children,
  className,
  onToggleClick,
}: PropsType): ReactElement => (
  <div className={styles.main}>
    <Toolbar onToggleClick={onToggleClick}>
      {toolbar}
    </Toolbar>
    <MainTray className={className}>
      {children}
    </MainTray>
  </div>
)

export default Main;
