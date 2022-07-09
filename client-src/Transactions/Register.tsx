import React from 'react';
import { observer } from 'mobx-react-lite';
import Http from '@mortvola/http';
import { useStores } from '../State/mobxStore';
import {
  AccountInterface, CategoryInterface, PendingTransactionInterface, TransactionInterface,
} from '../State/State';
import PendingRegister from './PendingRegister';
import RegisterTitles from './RegisterTitles';
import RegisterTransactions from './RegisterTransactions';
import RebalancesTitles from './RebalancesTitles';
import { TransactionProps } from '../../common/ResponseTypes';
import RebalancesTransactions from './RebalancesTransactions';
import Transaction from '../State/Transaction';

type PropsType = {
  type: 'category' | 'account' | 'rebalances',
}

const Register: React.FC<PropsType> = observer(({
  type,
}) => {
  const store = useStores();
  const { uiState, categoryTree } = store;
  const [rebalances, setRebalances] = React.useState<TransactionInterface[]>([]);

  React.useEffect(() => {
    const getRebalances = async () => {
      const response = await Http.get<TransactionProps[]>('/api/rebalances');

      if (response.ok) {
        const body = await response.body();

        setRebalances(body.map((t) => new Transaction(store, t)));
      }
    };

    switch (type) {
      case 'category':
        if (uiState.selectedCategory) {
          uiState.selectedCategory.getTransactions();

          if (uiState.selectedCategory === categoryTree.unassignedCat) {
            uiState.selectedCategory.getPendingTransactions();
          }
        }
        break;

      case 'account':
        if (uiState.selectedAccount) {
          if (!['Transactions', 'Uncategorized Transactions'].includes(uiState.selectedAccount.tracking)) {
            throw new Error(`invalid tracking type for register: ${uiState.selectedAccount.tracking}`);
          }

          uiState.selectedAccount.getTransactions();
          uiState.selectedAccount.getPendingTransactions();
        }

        break;

      case 'rebalances':
        getRebalances();
        break;

      default:
        throw new Error(`unknown type: ${type}`);
    }
  }, [categoryTree.unassignedCat, store, type, uiState.selectedAccount, uiState.selectedCategory]);

  let transactions: TransactionInterface[] = [];
  let pending: PendingTransactionInterface[] = [];
  let balance = 0;

  let category: CategoryInterface | null = null;
  let account: AccountInterface | null = null;

  switch (type) {
    case 'category':
      category = uiState.selectedCategory;

      if (category) {
        transactions = category.transactions;
        pending = category.pending;
        balance = category.balance;
      }

      break;

    case 'account':
      account = uiState.selectedAccount;

      if (account) {
        transactions = account.transactions;
        pending = account.pending;
        balance = account.balance;
      }

      break;

    case 'rebalances':
      break;

    default:
      throw new Error(`unkonwn type: ${type}`);
  }

  if (type === 'rebalances') {
    return (
      <div className="register window window1">
        <div />
        <RebalancesTitles />
        <RebalancesTransactions
          transactions={rebalances}
        />
      </div>
    );
  }

  return (
    <>
      <div className="register window window1">
        <div />
        <RegisterTitles category={category} account={account} />
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
