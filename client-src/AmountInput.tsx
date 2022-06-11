import React, { useState, useRef } from 'react';
import { Overlay } from 'react-bootstrap';
import Popover from 'react-bootstrap/Popover';
import PopoverHeader from 'react-bootstrap/PopoverHeader';
import PopoverBody from 'react-bootstrap/PopoverBody';
import parseEquation from './EquationParser';
import styles from './AmountInput.module.css';
import Console from './Console';

interface PropsType {
  id?: string,
  value?: number | string;
  onDeltaChange?: (amount: number, delta: number) => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  style?: React.CSSProperties,
  name?: string;
  readOnly?: boolean,
}

const AmountInput: React.FC<PropsType> = ({
  id,
  value = 0,
  onDeltaChange,
  onChange,
  onBlur,
  className = '',
  style,
  name,
  readOnly,
}) => {
  const convertAmount = (amount: string | number) => (
    typeof amount === 'string'
      ? parseFloat(amount).toFixed(2)
      : amount.toFixed(2)
  );

  const [inputAmount, setInputAmount] = useState<string>(convertAmount(value));
  const [initialValue, setInitialValue] = useState<string>(convertAmount(value));
  const [showPopover, setShowPopover] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [equation, setEquation] = useState('');
  const [previousAmount, setPreviousAmount] = useState('0');
  const [focus, setFocus] = useState<boolean>(false);

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
      Console.log(error);
    }
  };

  const handleFocus = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInitialValue(parseFloat(event.target.value).toFixed(2));
    setFocus(true);
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

    setFocus(false);
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

  let inputValue = inputAmount;
  if (!focus) {
    let v = value;
    if (typeof v === 'string') {
      v = (parseFloat(v) * 100.0) / 100.0;
    }

    v = Math.round(v * 100.0) / 100.0;

    if (Number.isNaN(v)) {
      v = 0;
    }

    inputValue = v.toFixed(2);
  }

  return (
    <>
      <input
        id={id}
        ref={ref}
        className={`${styles.amountInput} ${styles.dollarAmount} ${className}`}
        style={style}
        type="text"
        value={inputValue}
        name={name}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyPress}
        readOnly={readOnly}
      />
      {
        !readOnly
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
