import React, { ReactElement } from 'react';
import Register from './Register';
import BalanceHistory from './AccountView/BalanceHistory';

type PropsType = {
  detailView: unknown,
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
      return <Register isMobile={isMobile} />;

    default:
      return <div />;
  }
};

DetailView.defaultProps = {
  isMobile: false,
};

export default DetailView;
