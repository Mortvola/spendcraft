import React from 'react'
import { Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import Statement from '../State/Statement';
import styles from './StatementView.module.scss'
import AmountInput from '../AmountInput';

type PropsType = {
  statement: Statement
}

const StatementView: React.FC<PropsType> = observer(({
  statement,
}) => {
  const handleReconcileAll = () => {
    statement.update({ reconcile: 'All' })
  }

  const handleUnreconcileAll = () => {
    statement.update({ reconcile: 'None' })
  }

  const [editEndDate, setEditEndDate] = React.useState<boolean>(false)
  const [endDateValue, setEndDateValue] = React.useState<string>('')

  const handleEditEndDateClick = () => {
    setEditEndDate(true)
    setEndDateValue(statement.endDate.toISODate() ?? '')
  }

  const handleEndDateChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setEndDateValue(event.target.value)
  }

  const handleEndDateKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.code === 'Enter') {
      setEditEndDate(false)
      statement.update({ endDate: endDateValue })
    }
  }

  const [editEndingBalance, setEditEndingBalance] = React.useState<boolean>(false)
  const [endingBalanceValue, setEndingBalanceValue] = React.useState<string>('')

  const handleEditEndingBalanceClick = () => {
    setEditEndingBalance(true)
    setEndingBalanceValue(statement.endingBalance.toString())
  }

  const handleEndingBalanceChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setEndingBalanceValue(event.target.value)
  }

  const handleEndingBalanceKeyDown: React.KeyboardEventHandler = (event) => {
    if (event.code === 'Enter') {
      setEditEndingBalance(false)
      statement.update({ endingBalance: parseFloat(endingBalanceValue) })
    }
  }

  return (
    <div className={styles.layout}>
      <div>
        <label>
          Date Range:
          <div>{statement.startDate.toISODate()}</div>
          to
          {
            editEndDate
              ? (
                <input
                  type="date"
                  value={endDateValue}
                  onChange={handleEndDateChange}
                  onKeyDown={handleEndDateKeyDown}
                />
              )
              : <div onClick={handleEditEndDateClick}>{statement.endDate.toISODate()}</div>
          }
        </label>
        <label>
          Starting Balance:
          <Amount amount={statement.startingBalance} />
        </label>
        <label>
          Credits:
          <Amount amount={statement.credits} />
        </label>
        <label>
          Debits:
          <Amount amount={statement.debits} />
        </label>
        <label>
          Ending Balance:
          <Amount
            amount={statement.startingBalance + statement.credits + statement.debits}
          />
        </label>
        <label>
          Target Ending Balance:
          {
            editEndingBalance
              ? (
                <AmountInput
                  value={endingBalanceValue}
                  onChange={handleEndingBalanceChange}
                  onKeyDown={handleEndingBalanceKeyDown}
                />
              )
              : (
                <Amount
                  amount={statement.endingBalance}
                  onClick={handleEditEndingBalanceClick}
                />
              )
          }
        </label>
        <label>
          Ending Balance Difference:
          <Amount
            amount={statement.startingBalance + statement.credits + statement.debits - statement.endingBalance}
          />
        </label>
      </div>
      <div className={styles.controls}>
        <Button onClick={handleReconcileAll}>Reconcile All</Button>
        <Button onClick={handleUnreconcileAll}>Reconcile None</Button>
      </div>
    </div>
  )
})

export default StatementView;
