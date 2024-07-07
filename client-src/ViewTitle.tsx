import React from 'react';
import styles from './ViewTitle.module.scss';

type PropsType = {
  children: React.ReactNode,
}

const ViewTitle: React.FC<PropsType> = ({
  children,
}) => (
  <div className={styles.title}>{children}</div>
)

export default ViewTitle;
