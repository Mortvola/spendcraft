import React from 'react';
import PropTypes from 'prop-types';

function Amount(props) {
    let { amount } = props;
    if (amount === undefined || amount === null) {
        amount = 0;
    }

    let { className } = props;

    if (amount < 0) {
        className += ' negative';
    }

    amount = parseFloat(amount).toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');

    return (<div className={className}>{amount}</div>);
}

Amount.propTypes = {
    amount: PropTypes.number.isRequired,
    className: PropTypes.string.isRequired,
};

export default Amount;
