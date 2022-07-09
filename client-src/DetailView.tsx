import React from 'react';
import Register from './Transactions/Register';
import BalanceHistory from './AccountView/BalanceHistory';
import { TrackingType } from '../common/ResponseTypes';
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
