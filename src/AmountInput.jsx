import React, { useState } from 'react';
import PropTypes from 'prop-types';

function AmountInput(props) {
    const [amount, setAmount] = useState(props.amount.toFixed(2));
    const [initialValue, setInitialValue] = useState(props.amount);

    const handleChange = (event) => {
        setAmount(event.target.value);
    };

    const handleFocus = (event) => {
        setInitialValue(event.target.value);
    };

    const handleBlur = (event) => {
        const amount = Math.floor(parseFloat(event.target.value) * 100.0) / 100.0;
        const delta = amount - initialValue;
        props.onDeltaChange(amount, delta);
        setAmount(amount.toFixed(2));
    };

    return (
        <input
            className="amount-input dollar-amount"
            type="text"
            value={amount}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
      />
    );
}

AmountInput.propTypes = {
    amount: PropTypes.number,
    onDeltaChange: PropTypes.func.isRequired,
};

export default AmountInput;
