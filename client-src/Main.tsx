import React, { ReactElement, ReactNode } from 'react';
import MainTray from './MainTray';
import Toolbar from './Toolbar';
import styles from './Main.module.css';

type PropsType = {
  toolbar: ReactNode,
  children?: ReactNode,
  className?: string,
}

const Main = ({
  toolbar,
  children,
  className,
}: PropsType): ReactElement => (
  <div className={styles.main}>
    <Toolbar>
      {toolbar}
    </Toolbar>
    <MainTray className={className}>
      {children}
    </MainTray>
  </div>
)

export default Main;
