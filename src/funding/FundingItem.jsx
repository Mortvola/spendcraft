import React, { useState } from 'react';
import PropTypes from 'prop-types';
import AmountInput from '../AmountInput';
import Amount from '../Amount';

const FundingItem = ({
    name,
    initialAmount,
    funding,
    onDeltaChange,
}) => {
    const [balance, setBalance] = useState(initialAmount + funding);

    const handleDeltaChange = (amount, delta) => {
        setBalance(initialAmount + amount);

        if (onDeltaChange) {
            onDeltaChange(amount, delta);
        }
    };

    return (
        <div className="fund-list-item">
            <div className="fund-list-cat-name">{name}</div>
            <Amount className="fund-list-amt" amount={initialAmount} />
            <AmountInput amount={funding} onDeltaChange={handleDeltaChange} />
            <Amount className="fund-list-amt" amount={balance} />
        </div>
    );
};

FundingItem.propTypes = {
    name: PropTypes.string.isRequired,
    initialAmount: PropTypes.number.isRequired,
    funding: PropTypes.number.isRequired,
    onDeltaChange: PropTypes.func,
};

FundingItem.defaultProps = {
    onDeltaChange: null,
};

export default FundingItem;
