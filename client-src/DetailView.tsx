import React, { ReactElement } from 'react';
import Register from './Transactions/Register';
import BalanceHistory from './AccountView/BalanceHistory';
import { TrackingType } from '../common/ResponseTypes';

type PropsType = {
  detailView: TrackingType,
  isMobile?: boolean,
}

const DetailView = ({
  detailView,
  isMobile,
}: PropsType): ReactElement => {
  switch (detailView) {
    case 'Balances':
      return <BalanceHistory />;

    case 'Transactions':
    case 'Uncategorized Transactions':
      return <Register isMobile={isMobile} />;

    default:
      throw new Error('Invalid tracking type');
  }
};

DetailView.defaultProps = {
  isMobile: false,
};

export default DetailView;
