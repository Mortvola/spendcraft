import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Overlay, Popover } from 'react-bootstrap';
import parseEquation from './EquationParser';

function AmountInput({
  amount,
  onDeltaChange,
  onChange,
  className,
}) {
  const [inputAmount, setInputAmount] = useState(amount.toFixed(2));
  const [initialValue, setInitialValue] = useState(amount);
  const [showPopover, setShowPopover] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const [equation, setEquation] = useState('');
  const [previousAmount, setPreviousAmount] = useState();

  const handleChange = (event) => {
    setInputAmount(event.target.value);

    if (onChange) {
      onChange(event);
    }
  };

  const handleCalcChange = (event) => {
    setEquation(event.target.value);
    try {
      if (event.target.value === '') {
        setInputAmount('');
      }
      else {
        const val = parseEquation(event.target.value);
        setInputAmount(val);
      }
    }
    catch (error) {
      console.log(error);
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

  const handleKeyPress = (event) => {
    if (event.key === '=') {
      setShowPopover(!showPopover);
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      setShowPopover(false);
      if (event.key === 'Escape') {
        setInputAmount(previousAmount);
      }
      event.stopPropagation();
      event.preventDefault();
      ref.current.focus();
    }
  };

  const handleEnter = () => {
    inputRef.current.focus();
    setEquation(inputAmount);
    setPreviousAmount(inputAmount);
  };

  return (
    <div ref={containerRef}>
      <input
        ref={ref}
        className={`amount-input dollar-amount ${className}`}
        type="text"
        value={inputAmount}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyPress}
      />
      <Overlay
        show={showPopover}
        target={ref.current}
        placement="bottom"
        containerPadding={20}
        container={containerRef}
        onEnter={handleEnter}
      >
        <Popover>
          <Popover.Title>Enter Equation</Popover.Title>
          <Popover.Content>
            <input
              ref={inputRef}
              type="text"
              value={equation}
              onChange={handleCalcChange}
              onKeyDown={handleKeyDown}
            />
          </Popover.Content>
        </Popover>
      </Overlay>
    </div>
  );
}

AmountInput.propTypes = {
  amount: PropTypes.number,
  onDeltaChange: PropTypes.func,
  onChange: PropTypes.func,
  className: PropTypes.string,
};

AmountInput.defaultProps = {
  amount: 0,
  onDeltaChange: null,
  onChange: null,
  className: '',
};

export default AmountInput;
