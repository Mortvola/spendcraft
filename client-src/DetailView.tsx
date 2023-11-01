import React from 'react';
import styles from './DetailView.module.scss';
import useMediaQuery from './MediaQuery';

type PropsType = {
  title?: string,
  children?: React.ReactNode,
}

const DetailView: React.FC<PropsType> = ({
  title,
  children,
}) => (
  <>
    <div className={styles.mainTrayTitle}>{title}</div>
    {children}
  </>
);

export default DetailView;
