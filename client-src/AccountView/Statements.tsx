import React from 'react';
import { observer } from 'mobx-react-lite';
import styles from './Statements.module.scss'
import Register from '../Transactions/Register';
import { useStatementDialog } from './StatementDialog';
import { AccountInterface } from '../State/Types';
import { useStores } from '../State/Store';
import Statement from '../State/Statement';
import Amount from '../Amount';

type PropsType = {
  account: AccountInterface
}

const Statements: React.FC<PropsType> = observer(({
  account,
}) => {
  const {
    uiState,
  } = useStores();
  const { selectedStatement } = uiState;

  const [StatementDialog, showStatementDialog] = useStatementDialog();

  React.useEffect(() => {
    account.getStatements()
  }, [account])

  const handleStatementClick = (statement: Statement) => {
    uiState.selectStatement(statement)
  }

  const renderStatement = (statement: Statement | null) => {
    if (statement === null) {
      return null;
    }

    return (
      <>
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
      </>
    )
  }

  return (
    <>
      <div className={styles.layout}>
        <div className={`${styles.statements} window window1`}>
          Statements
          <button type="button" onClick={showStatementDialog}>Add</button>
          <div className={styles.items}>
            {
              account.statements.map((statement) => (
                <div
                  className={statement === selectedStatement ? styles.selected : ''}
                  key={statement.id}
                  onClick={() => {
                    handleStatementClick(statement)
                  }}
                >
                  {
                    statement.endDate.toISODate()
                  }
                </div>
              ))
            }
          </div>
        </div>
        <Register className={styles.transactions} type="account" />
        <div className={`${styles.totals} window window1`}>
          {
            renderStatement(selectedStatement)
          }
        </div>
      </div>
      <StatementDialog account={account} />
    </>
  )
})

export default Statements;
