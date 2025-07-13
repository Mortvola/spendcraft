import React from 'react';
import { observer } from 'mobx-react-lite';
import { BaseTransactionInterface } from '../State/Types';
import styles from './Transactions.module.scss';
import { useStores } from '../State/Store';

interface PropsType {
  transaction: BaseTransactionInterface,
}

const Reconcile: React.FC<PropsType> = observer(({
  transaction,
}) => {
  const { uiState: { selectedStatement } } = useStores()

  const handleReconcileChange: React.ChangeEventHandler<HTMLInputElement> = () => {
    if (
      selectedStatement !== null
      && (transaction.statementId === selectedStatement.id || transaction.statementId === null)
    ) {
      transaction.toggleReconciled(selectedStatement.id);
    }
  };

  const handleReconcileClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
    event.stopPropagation();
  };

  return (
    <input
      type="checkbox"
      className={styles.reconcile}
      checked={transaction.statementId !== null}
      onChange={handleReconcileChange}
      onClick={handleReconcileClick}
      disabled={
        selectedStatement === null
        || (transaction.statementId !== null && transaction.statementId !== selectedStatement.id)
      }
    />
  );
})

export default Reconcile;
