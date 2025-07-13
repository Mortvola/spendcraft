import React, { ReactNode } from 'react';
import styles from './MainTray.module.scss';

interface PropsType {
  className?: string,
  children?: ReactNode,
}

const MainTray: React.FC<PropsType> = ({
  className,
  children,
}) => (
  <div className={`${styles.mainTray} ${className}`}>
    {children}
  </div>
)

export default MainTray;
