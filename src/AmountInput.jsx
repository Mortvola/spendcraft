import React, { useState } from 'react';
import PropTypes from 'prop-types';

function AmountInput({ amount, ...props }) {
    const [inputAmount, setInputAmount] = useState(amount.toFixed(2));
    const [initialValue, setInitialValue] = useState(amount);

    const handleChange = (event) => {
        setInputAmount(event.target.value);
    };

    const handleFocus = (event) => {
        setInitialValue(event.target.value);
    };

    const handleBlur = (event) => {
        const newAmount = Math.floor(parseFloat(event.target.value) * 100.0) / 100.0;
        const delta = newAmount - initialValue;
        props.onDeltaChange(newAmount, delta);
        setInputAmount(newAmount.toFixed(2));
    };

    return (
        <input
            className="amount-input dollar-amount"
            type="text"
            value={inputAmount}
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

AmountInput.defaultProps = {
    amount: 0,
};

export default AmountInput;
