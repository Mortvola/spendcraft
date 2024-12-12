import React from 'react'
import { Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import Statement from '../State/Statement';
import styles from './StatementView.module.scss'
import AmountInput from '../AmountInput';
import StatementDate from './StatementDate';
import StatementAmount from './StatementAmount';

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

  const handleStartDateUpdate = (date: string) => {
    statement.update({ startDate: date })
  }

  const handleEndDateUpdate = (date: string) => {
    statement.update({ endDate: date })
  }

  const handleStartingBalanceUpdate = (amount: number) => {
    statement.update({ startingBalance: amount })
  }

  const handleEndingBalanceUpdate = (amount: number) => {
    statement.update({ endingBalance: amount })
  }

  return (
    <div className={styles.layout}>
      <div>
        <label>
          Date Range:
          <StatementDate date={statement.startDate} onUpdate={handleStartDateUpdate} />
          to
          <StatementDate date={statement.endDate} onUpdate={handleEndDateUpdate} />
        </label>
        <label>
          Starting Balance:
          <StatementAmount amount={statement.startingBalance} onUpdate={handleStartingBalanceUpdate} />
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
          <StatementAmount amount={statement.endingBalance} onUpdate={handleEndingBalanceUpdate} />
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
