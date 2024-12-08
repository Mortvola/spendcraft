import React from 'react';
import { observer } from 'mobx-react-lite';
import styles from './Statements.module.scss'
import Register from '../Transactions/Register';
import { useStatementDialog } from './StatementDialog';
import { AccountInterface } from '../State/Types';
import { useStores } from '../State/Store';
import Statement from '../State/Statement';

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

  return (
    <>
      <div className={styles.layout}>
        <div className="window window1">
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
        <Register type="account" />
      </div>
      <StatementDialog account={account} />
    </>
  )
})

export default Statements;
