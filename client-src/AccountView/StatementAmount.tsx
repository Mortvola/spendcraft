import React from 'react';
import AmountInput from '../AmountInput';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { formatMoneyCents, parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';

interface PropsType {
  amount: MoneyCents,
  sign?: number,
  onUpdate: (amount: MoneyCents) => void
}

const StatementAmount: React.FC<PropsType> = ({
  amount,
  sign = 1,
  onUpdate,
}) => {
  const [editAmount, setEditAmount] = React.useState<boolean>(false)
  const [amountValue, setAmountValue] = React.useState<string>('')

  const displayed = sign === -1 ? subtractMoneyCents(parseMoneyCents('0.00'), amount) : amount;

  const handleEditAmountClick = () => {
    setEditAmount(true)
    setAmountValue(formatMoneyCents(displayed))
  }

  const handleAmountChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setAmountValue(event.target.value)
    event.currentTarget.setCustomValidity('')
  }

  const handleAmountKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.code === 'Enter') {
      let value: MoneyCents;
      try {
        if (amountValue.trim() === '') throw new Error('Missing amount');
        value = inputMoneyCents(amountValue, sign);
      }
      catch {
        event.currentTarget.setCustomValidity('Enter a valid, safe monetary amount.');
        event.currentTarget.reportValidity();
        return;
      }
      setEditAmount(false)

      if (value !== amount) {
        onUpdate(value)
      }
    }
    else if (event.code === 'Escape') {
      setEditAmount(false)
    }
  }

  return (
    editAmount
      ? (
        <AmountInput
          exactCents
          value={amountValue}
          onChange={handleAmountChange}
          onKeyDown={handleAmountKeyDown}
        />
      )
      : (
        <MoneyCentsAmount
          amount={displayed}
          onClick={handleEditAmountClick}
        />
      )
  )
}

export default StatementAmount;
