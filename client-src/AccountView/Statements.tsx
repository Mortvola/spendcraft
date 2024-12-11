import React from 'react';
import { observer } from 'mobx-react-lite';
import styles from './Statements.module.scss'
import trxStyles from '../Transactions/Transactions.module.scss'
import Register from '../Transactions/Register';
import { useStatementDialog } from './StatementDialog';
import { AccountInterface } from '../State/Types';
import { useStores } from '../State/Store';
import Statement from '../State/Statement';
import StatementView from './StatementView';

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
        <Register className={`${trxStyles.statement} ${styles.transactions}`} type="account" />
        <div className={`${styles.statement} window window1`}>
          {
            selectedStatement
              ? <StatementView statement={selectedStatement} />
              : null
          }
        </div>
      </div>
      <StatementDialog account={account} />
    </>
  )
})

export default Statements;
