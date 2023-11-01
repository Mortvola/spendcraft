import React from 'react';
import styles from './DetailView.module.scss';

type PropsType = {
  title?: string,
  children?: React.ReactNode,
}

const DetailView: React.FC<PropsType> = ({
  title,
  children,
}) => (
  <>
    <div className={`${styles.mainTrayTitle} ellipsis`}>{title}</div>
    {children}
  </>
);

export default DetailView;
