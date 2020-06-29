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
    detailView: PropTypes.string,
};

DetailView.defaultProps = {
    detailView: null,
};

export default DetailView;
