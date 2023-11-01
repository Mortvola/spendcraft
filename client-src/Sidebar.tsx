import React, { ReactNode } from 'react';
import useMediaQuery from './MediaQuery'
import styles from './Sidebar.module.scss'

type PropsType = {
  open?: boolean,
  children?: ReactNode,
  className?: string,
}

const Sidebar: React.FC<PropsType> = ({
  open = true,
  children,
  className,
}) => (
  <div className={`${styles.sideBar} window ${className}`}>
    {children}
  </div>
);

export default Sidebar;
