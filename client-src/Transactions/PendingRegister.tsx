import { observer } from 'mobx-react-lite';
import React from 'react';
import { BaseTransactionInterface, TransactionContainerInterface, TransactionInterface } from '../State/State';
import Transaction from './Transaction';
import styles from './PendingRegister.module.scss';
import transactionStyles from './Transactions.module.scss'
import RegisterTransactions from './RegisterTransactions';
import useMediaQuery from '../MediaQuery';
import RegisterTitles from './RegisterTitles';
import { TransactionType } from '../../common/ResponseTypes';
import useTrxDialog from './TrxDialog';
import { useStores } from '../State/mobxStore';

type PropsType = {
  trxContainer: TransactionContainerInterface | null,
}

const PendingRegister: React.FC<PropsType> = observer(({
  trxContainer,
}) => {
  const { isMobile } = useMediaQuery();
  const [TrxDialog, showTrxDialog] = useTrxDialog(); // account ?? undefined);
  const { uiState } = useStores();

  const handleClick = (transaction: BaseTransactionInterface) => {
    uiState.selectTransaction(transaction as TransactionInterface);
    if (
      transaction.type !== TransactionType.STARTING_BALANCE
      && showTrxDialog
    ) {
      showTrxDialog(transaction as TransactionInterface);
    }
  };

  if (trxContainer && trxContainer.transactions.length > 0) {
    return (
      <div className={`${styles.pending} ${transactionStyles.pending} window`}>
        {
          isMobile
            ? null
            : (
              <div className={styles.pendingRegisterTitle}>
                Pending Transactions
              </div>
            )
        }
        <RegisterTransactions trxContainer={trxContainer} titles={<RegisterTitles />}>
          {
            trxContainer.transactions.map((transaction) => (
              <Transaction
                key={transaction.id}
                transaction={transaction}
                amount={transaction.amount}
                runningBalance={0}
                onClick={handleClick}
              />
            ))
          }
        </RegisterTransactions>
        <TrxDialog />
      </div>
    );
  }

  return null;
});

export default PendingRegister;
