import React, { ReactElement, useContext } from 'react';
import Register from './Transactions/Register';
import BalanceHistory from './AccountView/BalanceHistory';
import { TrackingType } from '../common/ResponseTypes';
import MobxStore from './state/mobxStore';

type PropsType = {
  detailView: TrackingType,
  isMobile?: boolean,
}

const DetailView = ({
  detailView,
  isMobile,
}: PropsType): ReactElement => {
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
          <div className="main-tray-title">{title}</div>
          <BalanceHistory />
        </>
      )

    case 'Transactions':
    case 'Uncategorized Transactions': {
      return (
        <>
          <div className="main-tray-title">{title}</div>
          <Register isMobile={isMobile} />
        </>
      );
    }

    default:
      throw new Error('Invalid tracking type');
  }
};

DetailView.defaultProps = {
  isMobile: false,
};

export default DetailView;
