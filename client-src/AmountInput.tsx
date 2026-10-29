import React, { useState, useRef } from 'react';
import { Overlay } from 'react-bootstrap';
import Popover from 'react-bootstrap/Popover';
import PopoverHeader from 'react-bootstrap/PopoverHeader';
import PopoverBody from 'react-bootstrap/PopoverBody';
import parseEquation, { parseEquationCents } from './EquationParser';
import styles from './AmountInput.module.scss';
import * as Console from './Console';
import { formatMoneyCents } from '../common/moneyCents';
import { inputMoneyCents } from './monetary';

interface BaseProps {
  id?: string,
  onValueChange?: (amount: string) => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  style?: React.CSSProperties,
  name?: string;
  readOnly?: boolean,
}

type PropsType = BaseProps & (
  { exactCents: true; value?: string }
  | { exactCents?: false; value?: number | string }
);

const AmountInput: React.FC<PropsType> = ({
  exactCents = false,
  id,
  value = '0.00',
  onValueChange,
  onChange,
  onBlur,
  onKeyDown,
  className = '',
  style,
  name,
  readOnly,
}) => {
  const convertExactAmount = (amount: string | number) => {
    if (typeof amount !== 'string') throw new Error('Expected monetary input text');
    try { return formatMoneyCents(inputMoneyCents(amount)); }
    catch { return String(amount); }
  };

  const convertAmount = (amount: string | number) => exactCents ? convertExactAmount(amount) : (
    typeof amount === 'string'
      ? parseFloat(amount).toFixed(2)
      : amount.toFixed(2)
  );

  const [inputAmount, setInputAmount] = useState<string>(convertAmount(value));
  const [showPopover, setShowPopover] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [equation, setEquation] = useState('');
  const [previousAmount, setPreviousAmount] = useState('0');
  const [focus, setFocus] = useState<boolean>(false);

  // React.useEffect(() => {
  //   console.log(`mounted ${name} ${value}, ${inputAmount}`);

  //   return () => console.log(`unmounted ${name} ${value} ${inputAmount}`)
  // }, [name, value, inputAmount])

  // const setInputAmount = (v: string) => {
  //   console.log(`set input value: ${v}`)
  //   setInputAmount2(v);
  // }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputAmount(event.target.value);
    onValueChange?.(event.target.value);

    if (onChange) {
      onChange(event);
    }
  };

  const handleCalcChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEquation(event.target.value);
    try {
      if (event.target.value === '') {
        setInputAmount('');
        onValueChange?.('');
      }
      else {
        const result = exactCents
          ? formatMoneyCents(parseEquationCents(event.target.value))
          : parseEquation(event.target.value).toFixed(2);
        setInputAmount(result);
        onValueChange?.(result);
      }
    }
    catch (error) {
      Console.log(error);
    }
  };

  const handleFocus = () => {
    setFocus(true);
  };

  const handleBlur = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (exactCents) {
      setInputAmount(convertExactAmount(event.target.value));
      onBlur?.(event);
      setFocus(false);
      return;
    }

    let newAmount = Math.round(parseFloat(event.target.value) * 100.0) / 100.0;

    if (Number.isNaN(newAmount)) {
      newAmount = 0;
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
    else if (onKeyDown) {
      onKeyDown(event);
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
  if (onChange !== undefined) {
    inputValue = typeof value === 'string' ? value : value.toFixed(2);
  }

  if (!focus && exactCents) {
    inputValue = convertExactAmount(inputValue);
  }
  else if (!focus) {
    let v: string | number = inputValue;
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
