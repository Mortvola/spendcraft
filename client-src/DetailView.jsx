import React from 'react';
import PropTypes from 'prop-types';
import Register from './Register';
import BalanceHistory from './AccountView/BalanceHistory';

const DetailView = ({
  detailView,
  isMobile,
}) => {
  switch (detailView) {
    case 'Balances':
      return <BalanceHistory />;

    case 'Transactions':
      return <Register isMobile={isMobile} />;

    default:
      return <div />;
  }
};

DetailView.propTypes = {
  detailView: PropTypes.string,
  isMobile: PropTypes.bool,
};

DetailView.defaultProps = {
  detailView: null,
  isMobile: false,
};

export default DetailView;
