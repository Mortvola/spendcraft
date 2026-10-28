import React from 'react'
import { Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import MoneyCentsAmount from '../MoneyCentsAmount';
import Statement from '../State/Statement';
import styles from './StatementView.module.scss'
import StatementDate from './StatementDate';
import StatementAmount from './StatementAmount';
import { useStores } from '../State/Store';
import type { MoneyCents } from '../../common/moneyCents';

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

  const handleStartingBalanceUpdate = (amount: MoneyCents) => {
    statement.update({ startingBalanceCents: amount })
  }

  const handleEndingBalanceUpdate = (amount: MoneyCents) => {
    statement.update({ endingBalanceCents: amount })
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
          <StatementAmount amount={statement.startingBalanceCents} sign={accountSign} onUpdate={handleStartingBalanceUpdate} />
        </label>
        <label>
          Credits:
          <MoneyCentsAmount amount={statement.creditsCents} sign={accountSign} />
        </label>
        <label>
          Debits:
          <MoneyCentsAmount amount={statement.debitsCents} sign={accountSign} />
        </label>
        <label>
          Ending Balance:
          <MoneyCentsAmount amount={statement.calculatedEndingBalanceCents} sign={accountSign} />
        </label>
        <label>
          Target Ending Balance:
          <StatementAmount amount={statement.endingBalanceCents} sign={accountSign} onUpdate={handleEndingBalanceUpdate} />
        </label>
        <label>
          Ending Balance Difference:
          <MoneyCentsAmount amount={statement.reconciliationDifferenceCents} sign={accountSign} />
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
