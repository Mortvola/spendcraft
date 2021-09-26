import React, { ReactElement } from 'react';
import Register from './Transactions/Register';
import BalanceHistory from './AccountView/BalanceHistory';
import { TrackingType } from '../common/ResponseTypes';
import styles from './DetailView.module.css';

type PropsType = {
  detailView: TrackingType,
  title?: string,
}

const DetailView = ({
  detailView,
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
          <Register />
        </>
      );

    default:
      throw new Error('Invalid tracking type');
  }

  return null;
};

export default DetailView;
