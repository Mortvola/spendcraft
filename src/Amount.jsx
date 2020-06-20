import React from 'react';
import PropTypes from 'prop-types';

function Amount(props) {
    const { noValue } = props;
    let { amount, className } = props;
    if (amount === null) {
        if (noValue === null) {
            amount = 0;
        }
    }

    className += ' dollar-amount';

    let amountString;

    if (amount === null) {
        amountString = noValue;
    }
    else {
        amountString = parseFloat(amount).toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
        if (amountString === '-0.00') {
            amountString = '0.00';
        }
        else if (amount < 0) {
            className += ' negative';
        }
    }

    return (<div className={className}>{amountString}</div>);
}

Amount.propTypes = {
    amount: PropTypes.number,
    className: PropTypes.string,
    noValue: PropTypes.string,
};

Amount.defaultProps = {
    amount: null,
    className: '',
    noValue: null,
};

export default Amount;
