import React, { ReactElement, useContext } from 'react';
import Register from './Transactions/Register';
import BalanceHistory from './AccountView/BalanceHistory';
import { TrackingType } from '../common/ResponseTypes';
import MobxStore from './State/mobxStore';
import styles from './DetailView.module.css';

type PropsType = {
  detailView: TrackingType,
}

const DetailView = ({
  detailView,
}: PropsType): ReactElement | null => {
  const { uiState } = useContext(MobxStore);

  let title;
  if (uiState.view === 'HOME') {
    const category = uiState.selectedCategory;
    if (category !== null) {
      const group = category.getGroup();
      title = category.name;
      if (group.type === 'REGULAR') {
        title = `${group.name}: ${title}`;
      }
    }
  }
  else if (uiState.view === 'ACCOUNTS') {
    const account = uiState.selectedAccount;
    if (account) {
      title = `${account.institution.name}: ${account.name}`;
    }
  }

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
