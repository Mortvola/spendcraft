import React from 'react';
import AmountInput from '../AmountInput';
import Amount from '../Amount';

interface PropsType {
  amount: number,
  onUpdate: (amount: number) => void
}

const StatementAmount: React.FC<PropsType> = ({
  amount,
  onUpdate,
}) => {
  const [editAmount, setEditAmount] = React.useState<boolean>(false)
  const [amountValue, setAmountValue] = React.useState<string>('')

  const handleEditAmountClick = () => {
    setEditAmount(true)
    setAmountValue(amount.toString())
  }

  const handleAmountChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setAmountValue(event.target.value)
  }

  const handleAmountKeyDown: React.KeyboardEventHandler = (event) => {
    if (event.code === 'Enter') {
      setEditAmount(false)

      const value = parseFloat(amountValue);

      if (value !== amount) {
        onUpdate(parseFloat(amountValue))
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
        <Amount
          amount={amount}
          onClick={handleEditAmountClick}
        />
      )
  )
}

export default StatementAmount;
