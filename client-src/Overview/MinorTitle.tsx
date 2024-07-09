import React from 'react';
import styles from './MinorTitle.module.scss';

type PropsType = {
  children: React.ReactNode,
}

const MinorTitle: React.FC<PropsType> = ({
  children,
}) => (
  <div className={styles.title}>{children}</div>
)

export default MinorTitle;
