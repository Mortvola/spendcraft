import React from 'react'
import { Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import Statement from '../State/Statement';
import styles from './StatementView.module.scss'

type PropsType = {
  statement: Statement
}

const StatementView: React.FC<PropsType> = observer(({
  statement,
}) => {
  const handleReconcileAll = () => {
    statement.reconcile('All')
  }

  const handleUnreconcileAll = () => {
    statement.reconcile('None')
  }

  return (
    <div className={styles.layout}>
      <div>
        <label>
          Date Range:
          <div>{statement.startDate.toISODate()}</div>
          to
          <div>{statement.endDate.toISODate()}</div>
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
          <Amount
            amount={statement.endingBalance}
          />
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
