import React from 'react';
import PropTypes from 'prop-types';

function Amount(props) {
    let { amount, className } = props;
    if (amount === undefined || amount === null) {
        amount = 0;
    }

    className += ' dollar-amount';

    let amountString = parseFloat(amount).toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
    if (amountString === '-0.00') {
        amountString = '0.00';
    }
    else if (amount < 0) {
        className += ' negative';
    }

    return (<div className={className}>{amountString}</div>);
}

Amount.propTypes = {
    amount: PropTypes.number,
    className: PropTypes.string,
};

Amount.defaultProps = {
    amount: 0,
    className: '',
};

export default Amount;
