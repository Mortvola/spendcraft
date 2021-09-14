import React, { ReactElement, ReactNode } from 'react';
import styles from './MainTray.module.css';
import useMediaQuery from './MediaQuery';

type PropsType = {
  className?: string,
  children?: ReactNode,
}

const MainTray = ({
  className,
  children,
}: PropsType): ReactElement | null => {
  const { isMobile } = useMediaQuery();

  return (
    <div className={`${isMobile ? 'mobile' : ''}  ${styles.mainTray} ${className}`}>
      {children}
    </div>
  )
};

export default MainTray;
