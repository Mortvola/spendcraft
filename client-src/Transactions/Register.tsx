import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/mobxStore';
import {
  AccountInterface, CategoryInterface, PendingTransactionInterface, TransactionInterface,
} from '../State/State';
import PendingRegister from './PendingRegister';
import RegisterTitles from './RegisterTitles';
import RegisterTransactions from './RegisterTransactions';

type PropsType = {
  type: 'category' | 'account',
}

const Register: React.FC<PropsType> = observer(({
  type,
}) => {
  const { uiState } = useStores();

  let transactions: TransactionInterface[] | undefined;
  let pending: PendingTransactionInterface[] | undefined;
  let balance = 0;

  let category: CategoryInterface | null = null;

  if (type === 'category') {
    category = uiState.selectedCategory;

    if (category) {
      transactions = category.transactions;
      pending = category.pending;
      balance = category.balance;
    }
  }

  let account: AccountInterface | null = null;
  if (type === 'account') {
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
      <div className="register window window1">
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
});

export default Register;
