import React, {
  useContext, ReactElement,
} from 'react';
import { observer } from 'mobx-react-lite';
import MobxStore from '../State/mobxStore';
import { AccountInterface, CategoryInterface, TransactionInterface } from '../State/State';
import PendingTransaction from '../State/PendingTransaction';
import LoanTransaction from '../State/LoanTransaction';
import LoanRegister from './LoanRegister';
import PendingRegister from './PendingRegister';
import RegisterTitles from './RegisterTitles';
import RegisterTransactions from './RegisterTransactions';

const Register = (): ReactElement => {
  const { uiState } = useContext(MobxStore);

  let transactions: TransactionInterface[] | undefined;
  let pending: PendingTransaction[] | undefined;
  let loan: { balance: number, transactions: LoanTransaction[] } | undefined;
  let balance = 0;
  let fetching = false;

  let category: CategoryInterface | null = null;

  if (uiState.view === 'HOME') {
    category = uiState.selectedCategory;

    if (category) {
      transactions = category.transactions;
      pending = category.pending;
      loan = category.loan;
      balance = category.balance;
      fetching = category.fetching;
    }
  }

  let account: AccountInterface | null = null;
  if (uiState.view === 'ACCOUNTS') {
    account = uiState.selectedAccount;

    if (account) {
      transactions = account.transactions;
      pending = account.pending;
      balance = account.balance;
      fetching = account.fetching;
    }
  }

  return (
    <>
      <div className="register window">
        <div />
        <RegisterTitles category={category} />
        <RegisterTransactions
          fetching={fetching}
          transactions={transactions}
          balance={balance}
          category={category}
          account={account}
        />
      </div>
      {
        category && category.type === 'LOAN'
          ? <LoanRegister loan={loan} />
          : <PendingRegister categoryView={category !== null} pending={pending} />
      }
    </>
  );
};

export default observer(Register);
