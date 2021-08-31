import React, {
  useContext, ReactElement,
} from 'react';
import { observer } from 'mobx-react-lite';
import MobxStore from '../state/mobxStore';
import { AccountInterface, CategoryInterface, TransactionInterface } from '../state/State';
import PendingTransaction from '../state/PendingTransaction';
import LoanTransaction from '../state/LoanTransaction';
import LoanRegister from './LoanRegister';
import PendingRegister from './PendingRegister';
import RegisterTitles from './RegisterTitles';
import RegisterTransactions from './RegisterTransactions';

type PropsType = {
  isMobile?: boolean;
}

const Register = ({
  isMobile,
}: PropsType): ReactElement => {
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

  if (isMobile) {
    return (
      <RegisterTransactions
        fetching={fetching}
        transactions={transactions}
        balance={balance}
        isMobile={isMobile}
        category={category}
      />
    );
  }

  return (
    <div className="register-dual-pane">
      <div className="register">
        <div />
        <RegisterTitles categoryView={category !== null} />
        <RegisterTransactions
          fetching={fetching}
          transactions={transactions}
          balance={balance}
          isMobile={isMobile}
          category={category}
        />
      </div>
      {
        category && category.type === 'LOAN'
          ? <LoanRegister loan={loan} />
          : <PendingRegister categoryView={category !== null} pending={pending} />
      }
    </div>
  );
};

Register.defaultProps = {
  isMobile: false,
};

export default observer(Register);