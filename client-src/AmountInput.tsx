import React, { useState, useRef, ReactElement } from 'react';
import { Overlay } from 'react-bootstrap';
import Popover from 'react-bootstrap/Popover';
import PopoverHeader from 'react-bootstrap/PopoverHeader';
import PopoverBody from 'react-bootstrap/PopoverBody';
import parseEquation from './EquationParser';

interface Props {
  id?: string,
  value?: number | string;
  onDeltaChange?: (amount: number, delta: number) => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  name?: string;
  readonly?: boolean,
}

const AmountInput = ({
  id,
  value = 0,
  onDeltaChange,
  onChange,
  onBlur,
  className = '',
  name,
  readonly,
}: Props): ReactElement => {
  const [inputAmount, setInputAmount] = useState(
    typeof value === 'string'
      ? parseFloat(value).toFixed(2)
      : value.toFixed(2),
  );
  const [initialValue, setInitialValue] = useState(
    typeof value === 'string'
      ? parseFloat(value).toFixed(2)
      : value.toFixed(2),
  );
  const [showPopover, setShowPopover] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [equation, setEquation] = useState('');
  const [previousAmount, setPreviousAmount] = useState('0');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputAmount(event.target.value);

    if (onChange) {
      onChange(event);
    }
  };

  const handleCalcChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEquation(event.target.value);
    try {
      if (event.target.value === '') {
        setInputAmount('');
      }
      else {
        const val = parseEquation(event.target.value);
        setInputAmount(val.toFixed(2));
      }
    }
    catch (error) {
      console.log(error);
    }
  };

  const handleFocus = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInitialValue(parseFloat(event.target.value).toFixed(2));
  };

  const handleBlur = (event: React.ChangeEvent<HTMLInputElement>) => {
    let newAmount = Math.round(parseFloat(event.target.value) * 100.0) / 100.0;

    if (Number.isNaN(newAmount)) {
      newAmount = 0;
    }

    const delta = newAmount - parseFloat(initialValue);
    if (onDeltaChange && delta !== 0) {
      onDeltaChange(newAmount, delta);
    }

    setInputAmount(newAmount.toFixed(2));

    if (onBlur) {
      onBlur(event);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === '=') {
      setShowPopover(!showPopover);
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      setShowPopover(false);
      if (event.key === 'Escape') {
        setInputAmount(previousAmount);
      }
      event.stopPropagation();
      event.preventDefault();
      const input = ref.current;
      if (input !== null) {
        input.focus();
      }
    }
  };

  const handleEnter = () => {
    const input = ref.current;
    if (input !== null) {
      input.focus();
    }
    setEquation(inputAmount);
    setPreviousAmount(inputAmount);
  };

  return (
    <>
      <input
        id={id}
        ref={ref}
        className={`amount-input dollar-amount ${className}`}
        type="text"
        value={inputAmount}
        name={name}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyPress}
        readOnly={readonly}
      />
      {
        !readonly
          ? (
            <Overlay
              show={showPopover}
              target={ref.current}
              placement="bottom"
              containerPadding={20}
              onEnter={handleEnter}
            >
              <Popover id="pop-over">
                <PopoverHeader>Enter Equation</PopoverHeader>
                <PopoverBody>
                  <input
                    ref={inputRef}
                    type="text"
                    value={equation}
                    onChange={handleCalcChange}
                    onKeyDown={handleKeyDown}
                  />
                </PopoverBody>
              </Popover>
            </Overlay>
          )
          : null
      }
    </>
  );
};

export default AmountInput;
