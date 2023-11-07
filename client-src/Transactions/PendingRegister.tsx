import { observer } from 'mobx-react-lite';
import React from 'react';
import { TransactionContainerInterface } from '../State/State';
import Date from '../Date';
import Transaction from './Transaction';
import styles from './PendingRegister.module.scss';
import transactionStyles from './Transactions.module.scss'
import RegisterTransactions from './RegisterTransactions';
import useMediaQuery from '../MediaQuery';
import RegisterTitles from './RegisterTitles';

type PropsType = {
  trxContainer: TransactionContainerInterface | null,
}

const PendingRegister: React.FC<PropsType> = observer(({
  trxContainer,
}) => {
  const { isMobile } = useMediaQuery();

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
              />
            ))
          }
        </RegisterTransactions>
      </div>
    );
  }

  return null;
});

export default PendingRegister;
