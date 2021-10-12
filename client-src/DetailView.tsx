import React, { ReactElement } from 'react';
import Register from './Transactions/Register';
import BalanceHistory from './AccountView/BalanceHistory';
import { TrackingType } from '../common/ResponseTypes';
import styles from './DetailView.module.css';

type PropsType = {
  detailView: TrackingType,
  type: 'category' | 'account',
  title?: string,
}

const DetailView = ({
  detailView,
  type,
  title,
}: PropsType): ReactElement | null => {
  switch (detailView) {
    case 'Balances':
      return (
        <>
          <div className={styles.mainTrayTitle}>{title}</div>
          <BalanceHistory />
        </>
      )

    case 'Transactions':
    case 'Uncategorized Transactions':
      return (
        <>
          <div className={styles.mainTrayTitle}>{title}</div>
          <Register type={type} />
        </>
      );

    default:
      throw new Error('Invalid tracking type');
  }

  return null;
};

export default DetailView;
