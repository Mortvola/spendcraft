import React, {
  useContext, ReactElement,
} from 'react';
import { observer } from 'mobx-react-lite';
import MobxStore from '../State/mobxStore';
import {
  AccountInterface, CategoryInterface, PendingTransactionInterface, TransactionContainerInterface, TransactionInterface,
} from '../State/State';
import PendingRegister from './PendingRegister';
import RegisterTitles from './RegisterTitles';
import RegisterTransactions from './RegisterTransactions';

const Register = (): ReactElement => {
  const { uiState } = useContext(MobxStore);

  let transactions: TransactionContainerInterface<TransactionInterface> | undefined;
  let pending: TransactionContainerInterface<PendingTransactionInterface> | undefined;
  let balance = 0;

  let category: CategoryInterface | null = null;

  if (uiState.view === 'HOME') {
    category = uiState.selectedCategory;

    if (category) {
      transactions = category.transactions;
      pending = category.pending;
      balance = category.balance;
    }
  }

  let account: AccountInterface | null = null;
  if (uiState.view === 'ACCOUNTS') {
    account = uiState.selectedAccount;

    if (account) {
      transactions = account.transactions;
      pending = account.pending;
      balance = account.balance;
    }
  }

  if (!transactions) {
    throw new Error('transactions is null');
  }

  return (
    <>
      <div className="register window">
        <div />
        <RegisterTitles category={category} />
        <RegisterTransactions
          transactions={transactions}
          balance={balance}
          category={category}
          account={account}
        />
      </div>
      <PendingRegister categoryView={category !== null} pending={pending} />
    </>
  );
};

export default observer(Register);
