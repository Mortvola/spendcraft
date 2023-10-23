import React from 'react';
import styles from './DetailView.module.css';

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
