import React from 'react';
import styles from './DetailView.module.scss';

type PropsType = {
  className?: string,
  title?: string,
  children?: React.ReactNode,
}

const DetailView: React.FC<PropsType> = ({
  className,
  title,
  children,
}) => (
  <div className={`${styles.layout} ${className}`}>
    <div className={`${styles.mainTrayTitle} ellipsis`}>{title}</div>
    {children}
  </div>
);

export default DetailView;
