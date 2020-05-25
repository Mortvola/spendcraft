import React, { useState } from 'react';
import PropTypes from 'prop-types';

function AmountInput({ amount, onDeltaChange, onChange }) {
    const [inputAmount, setInputAmount] = useState(amount.toFixed(2));
    const [initialValue, setInitialValue] = useState(amount);

    const handleChange = (event) => {
        setInputAmount(event.target.value);

        if (onChange) {
            onChange(event);
        }
    };

    const handleFocus = (event) => {
        setInitialValue(event.target.value);
    };

    const handleBlur = (event) => {
        let newAmount = Math.round(parseFloat(event.target.value) * 100.0) / 100.0;

        if (Number.isNaN(newAmount)) {
            newAmount = 0;
        }

        if (onDeltaChange) {
            const delta = newAmount - initialValue;
            onDeltaChange(newAmount, delta);
        }

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
    onDeltaChange: PropTypes.func,
    onChange: PropTypes.func,
};

AmountInput.defaultProps = {
    amount: 0,
    onDeltaChange: null,
    onChange: null,
};

export default AmountInput;
