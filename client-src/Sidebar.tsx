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
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <div
        className={`mobile ${styles.sideBar} ${className}`}
        style={{ transform: `translateX(${open ? 0 : '-100%'})` }}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={`${styles.sideBar} window ${className}`}>
      {children}
    </div>
  );
}

export default Sidebar;
