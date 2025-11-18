import React from 'react'
import { Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import Statement from '../State/Statement';
import styles from './StatementView.module.scss'
import StatementDate from './StatementDate';
import StatementAmount from './StatementAmount';
import { useStores } from '../State/Store';

interface PropsType {
  statement: Statement
}

const StatementView: React.FC<PropsType> = observer(({
  statement,
}) => {
  const { uiState: { selectedAccount } } = useStores()
  const accountSign = selectedAccount?.sign ?? 1;

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
    statement.update({ startingBalance: amount * accountSign })
  }

  const handleEndingBalanceUpdate = (amount: number) => {
    statement.update({ endingBalance: amount * accountSign })
  }

  const reverseClassName = (accountSign === -1 ? 'reverse' : '')

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
          <StatementAmount amount={statement.startingBalance * accountSign} onUpdate={handleStartingBalanceUpdate} />
        </label>
        <label>
          Credits:
          <Amount className={reverseClassName} amount={statement.credits * accountSign} />
        </label>
        <label>
          Debits:
          <Amount className={reverseClassName} amount={statement.debits * accountSign} />
        </label>
        <label>
          Ending Balance:
          <Amount
            className={reverseClassName}
            amount={(statement.startingBalance + statement.credits + statement.debits) * accountSign}
          />
        </label>
        <label>
          Target Ending Balance:
          <StatementAmount amount={statement.endingBalance * accountSign} onUpdate={handleEndingBalanceUpdate} />
        </label>
        <label>
          Ending Balance Difference:
          <Amount
            className={reverseClassName}
            amount={(statement.startingBalance + statement.credits + statement.debits - statement.endingBalance) * accountSign}
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
