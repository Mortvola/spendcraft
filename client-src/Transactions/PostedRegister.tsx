import React from 'react';
import { observer } from 'mobx-react-lite';
import RegisterTransactions from './RegisterTransactions';
import {
  AccountInterface, BaseTransactionInterface, CategoryInterface, TransactionContainerInterface, TransactionInterface,
} from '../State/Types';
import RegisterTitles from './RegisterTitles';
import useTrxDialog from './TrxDialog';
import Transaction from './Transaction';
import { useStores } from '../State/Store';
import { AccountType, TransactionType } from '../../common/ResponseTypes';
import styles from './Transactions.module.scss';
import { useNotification } from '../Notification';

interface PropsType {
  type: 'category' | 'account' | 'rebalances',
  trxContainer: TransactionContainerInterface,
  category: CategoryInterface | null,
  account: AccountInterface | null,
  transactionClassName?: string,
}

const PostedRegister: React.FC<PropsType> = observer(({
  type,
  trxContainer,
  category,
  account,
  transactionClassName,
}) => {
  const [Notification, showNotification] = useNotification(
    'Changed Transaction',
    (
      <div>
        The transaction was changed by the system or another user.
      </div>
    ),
  );

  const handleReload = () => {
    showNotification()
    trxContainer.getData(0)
  }

  const [TrxDialog, showTrxDialog] = useTrxDialog(account ?? undefined, handleReload);
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

  const renderTransactions = () => {
    if (trxContainer === null) {
      throw new Error('trxContainer is not set');
    }

    if (trxContainer.transactions.length === 0 && trxContainer.isComplete()) {
      return (
        <div className={styles.noTransactions}>
          <div>There are no transactions in this view</div>
        </div>
      )
    }

    const accountSign = account?.sign ?? 1
    let runningBalance = category?.balance ?? (account?.balance ?? 0) * accountSign;

    return trxContainer.transactions.map((transaction) => {
      let { amount } = transaction;

      if (type === 'rebalances') {
        amount = transaction.categories.reduce((prev, c) => {
          if (c.amount > 0) {
            return prev + c.amount;
          }

          return prev;
        }, 0);
      }
      else if (category !== null) {
        amount = transaction.getAmountForCategory(category.id);
      }
      else if (account && account.type === AccountType.Loan) {
        amount = transaction.principle ?? 0;
      }

      const element = (
        <Transaction
          key={transaction.id}
          transaction={transaction}
          className={transactionClassName}
          amount={amount}
          runningBalance={runningBalance}
          account={account}
          onClick={handleClick}
        />
      )

      if (runningBalance !== undefined) {
        runningBalance -= amount * accountSign;
      }

      return element;
    });
  }

  return (
    <div className="register window window1">
      <RegisterTransactions
        trxContainer={trxContainer}
        titles={<RegisterTitles transactionClassName={transactionClassName} />}
      >
        { renderTransactions() }
      </RegisterTransactions>
      <TrxDialog />
      <Notification />
    </div>
  );
});

export default PostedRegister;
