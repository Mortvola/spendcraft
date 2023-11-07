import React from 'react';
import { observer } from 'mobx-react-lite';
import RegisterTransactions from './RegisterTransactions';
import {
  AccountInterface, BaseTransactionInterface, CategoryInterface, TransactionContainerInterface, TransactionInterface,
} from '../State/State';
import RegisterTitles from './RegisterTitles';
import useTrxDialog from './TrxDialog';
import Transaction from './Transaction';
import { useStores } from '../State/mobxStore';
import { TransactionType } from '../../common/ResponseTypes';

type PropsType = {
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
  const [TrxDialog, showTrxDialog] = useTrxDialog(account ?? undefined);
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

    let runningBalance = (category?.balance ?? account?.balance) ?? 0;

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
      else if (account && account.type === 'loan') {
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
        runningBalance -= amount;
      }

      return element;
    });
  }

  return (
    <div className="register window window1">
      <div />
      <RegisterTransactions
        trxContainer={trxContainer}
        titles={<RegisterTitles transactionClassName={transactionClassName} />}
      >
        { renderTransactions() }
      </RegisterTransactions>
      <TrxDialog />
    </div>
  );
});

export default PostedRegister;
