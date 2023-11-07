import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../State/mobxStore';
import { TransactionInterface } from '../../State/State';
import { TransactionType } from '../../../common/ResponseTypes';
import styles from '../Transactions.module.scss'

type PropsType = {
  transaction: TransactionInterface,
  className?: string,
  children?: React.ReactNode,
  showTrxDialog?: (transaction: TransactionInterface) => void,
}

const TransactionBase: React.FC<PropsType> = observer(({
  transaction,
  className,
  children,
  showTrxDialog,
}) => {
  const { uiState } = useStores();

  const handleClick: React.MouseEventHandler = () => {
    uiState.selectTransaction(transaction);
    if (
      transaction.type !== TransactionType.STARTING_BALANCE
      && showTrxDialog
    ) {
      showTrxDialog(transaction);
    }
  };

  return (
    <div className={`${className ?? ''} ${styles.transaction}`} onClick={handleClick}>
      { children }
    </div>
  );
});

export default TransactionBase;
