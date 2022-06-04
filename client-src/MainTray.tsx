import React, { ReactNode } from 'react';
import styles from './MainTray.module.css';
import useMediaQuery from './MediaQuery';

type PropsType = {
  className?: string,
  children?: ReactNode,
}

const MainTray: React.FC<PropsType> = ({
  className,
  children,
}) => {
  const { isMobile } = useMediaQuery();

  return (
    <div className={`${isMobile ? 'mobile' : ''}  ${styles.mainTray} ${className}`}>
      {children}
    </div>
  )
};

export default MainTray;
