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
  }

  const handleAmountKeyDown: React.KeyboardEventHandler = (event) => {
    if (event.code === 'Enter') {
      setEditAmount(false)

      const value = inputMoneyCents(amountValue, sign);

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
