import React from 'react';
import PropTypes from 'prop-types';
import Register from './Register';
import BalanceHistory from './BalanceHistory';

const DetailView = ({
  detailView,
}) => {
  switch (detailView) {
    case 'Balances':
      return <BalanceHistory />;

    case 'Transactions':
      return <Register />;

    default:
      return <div />;
  }
};

DetailView.propTypes = {
  detailView: PropTypes.string,
};

DetailView.defaultProps = {
  detailView: null,
};

export default DetailView;
