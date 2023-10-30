import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../State/mobxStore';
import { TransactionInterface } from '../../State/State';
import useMediaQuery from '../../MediaQuery';
import { TransactionType } from '../../../common/ResponseTypes';
import styles from '../Transactions.module.scss'
import Date from '../../Date';
import Icon from '../../Icon';

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
  const { addMediaClass } = useMediaQuery();

  const handleClick: React.MouseEventHandler = () => {
    uiState.selectTransaction(transaction);
    if (
      transaction.type !== TransactionType.STARTING_BALANCE
      && showTrxDialog
    ) {
      showTrxDialog(transaction);
    }
  };

  let transactionClassName = `${className ?? ''} ${styles.transaction}`;

  transactionClassName = addMediaClass(transactionClassName);

  return (
    <div className={styles.transactionWrapper}>
      <div className={transactionClassName} onClick={handleClick}>
        {
          transaction.duplicateOfTransactionId
            ? <Icon icon="arrow-right-arrow-left" iconClass="fa-solid" />
            : <div />
        }
        <Date className="transaction-field" date={transaction.date} />
        { children }
      </div>
    </div>
  );
});

export default TransactionBase;
