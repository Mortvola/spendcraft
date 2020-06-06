import React from 'react';
import PropTypes from 'prop-types';
import RegisterElement from './RegisterElement';
import BalanceHistory from './BalanceHistory';

const DetailView = ({
    detailView,
}) => {
    switch (detailView) {
    case 'Balances':
        return <BalanceHistory />;

    case 'Transactions':
        return <RegisterElement />;

    default:
        return <div />;
    }
};

DetailView.propTypes = {
    detailView: PropTypes.bool.isRequired,
};

export default DetailView;
