import React, { ReactElement, ReactNode } from 'react';
import useMediaQuery from './MediaQuery'
import styles from './Sidebar.module.css'

type PropsType = {
  open?: boolean,
  children?: ReactNode,
  className?: string,
}

const Sidebar = ({
  open = true,
  children,
  className,
}: PropsType): ReactElement => {
  const { isMobile } = useMediaQuery();

  return (
    <>
      {
        isMobile
          ? (
            <>
              <div
                className={`mobile ${styles.sideBar} ${className}`}
                style={{ transform: `translateX(${open ? 0 : '-100%'})` }}
              >
                {children}
              </div>
            </>
          )
          : (
            <>
              <div className={`${styles.sideBar} window ${className}`}>
                {children}
              </div>
            </>
          )
      }
    </>
  );
}

export default Sidebar;
