import React from 'react';
import styles from './DetailView.module.css';
import useMediaQuery from './MediaQuery';

type PropsType = {
  title?: string,
  children?: React.ReactNode,
}

const DetailView: React.FC<PropsType> = ({
  title,
  children,
}) => {
  const { isMobile } = useMediaQuery();

  return (
    <>
      <div className={`${styles.mainTrayTitle} ${isMobile ? 'mobile' : ''}`}>{title}</div>
      {children}
    </>
  );
}

export default DetailView;
