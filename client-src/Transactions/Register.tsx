import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/mobxStore';
import {
  AccountInterface, CategoryInterface, TransactionContainerInterface, TransactionInterface,
} from '../State/State';
import PendingRegister from './PendingRegister';
import RegisterTitles from './RegisterTitles';
import RegisterTransactions from './RegisterTransactions';
import RebalancesTitles from './RebalancesTitles';
import styles from './Transactions.module.css';
import TransactionBase from './Transactions/TransactionBase';
import AccountTransaction from './Transactions/AccountTransaction';
import CategoryTransaction from './Transactions/CategoryTransaction';
import useTrxDialog from './TrxDialog';
import RebalanceTransaction from './Transactions/RebalanceTransaction';

type PropsType = {
  type: 'category' | 'account' | 'rebalances',
}

const Register: React.FC<PropsType> = observer(({
  type,
}) => {
  const store = useStores();
  const { uiState, categoryTree, rebalances } = store;

  React.useEffect(() => {
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
        rebalances.getTransactions();
        break;

      default:
        throw new Error(`unknown type: ${type}`);
    }
  }, [categoryTree.unassignedCat, rebalances, store, type, uiState.selectedAccount, uiState.selectedCategory]);

  let category: CategoryInterface | null = null;
  let account: AccountInterface | null = null;

  let trxContainer: TransactionContainerInterface | null = null;

  let transactionClassName: string | undefined;

  switch (type) {
    case 'category':
      category = uiState.selectedCategory;
      trxContainer = category;

      if (category) {
        if (category.type === 'UNASSIGNED') {
          transactionClassName = ` ${styles.unassigned}`;
        }
      }

      break;

    case 'account':
      account = uiState.selectedAccount;
      trxContainer = account;

      if (account) {
        if (account.type === 'loan') {
          transactionClassName = ` ${styles.loan}`;
        }
        else {
          transactionClassName = ` ${styles.acct}`;
        }
      }

      break;

    case 'rebalances':
      trxContainer = rebalances;

      break;

    default:
      throw new Error(`unkonwn type: ${type}`);
  }

  const [TrxDialog, showTrxDialog] = useTrxDialog(account ?? undefined);

  let titles = (
    <RegisterTitles
      category={category}
      account={account}
      transactionClassName={transactionClassName}
    />
  );

  const renderTransactionType = (
    transaction: TransactionInterface,
    amount: number,
    runningBalance: number,
  ) => {
    if (category) {
      return (
        <CategoryTransaction
          transaction={transaction}
          amount={amount}
          runningBalance={runningBalance}
          category={category}
        />
      );
    }

    if (account) {
      return (
        <AccountTransaction
          transaction={transaction}
          amount={amount}
          runningBalance={runningBalance}
          account={account}
        />
      )
    }

    return null;
  };

  let renderTransactions = () => {
    if (trxContainer === null) {
      throw new Error('trxContainer is not set');
    }

    let runningBalance = trxContainer.balance;

    return trxContainer.transactions.map((transaction) => {
      let { amount } = transaction;
      if (category !== null) {
        amount = transaction.getAmountForCategory(category.id);
      }
      else if (account && account.type === 'loan') {
        amount = transaction.principle ?? 0;
      }

      const element = (
        <TransactionBase
          key={transaction.id}
          transaction={transaction}
          showTrxDialog={showTrxDialog}
          className={transactionClassName}
        >
          { renderTransactionType(transaction, amount, runningBalance) }
        </TransactionBase>
      )

      if (runningBalance !== undefined) {
        runningBalance -= amount;
      }

      return element;
    });
  }

  if (type === 'rebalances') {
    titles = <RebalancesTitles />;

    renderTransactions = () => {
      if (trxContainer === null) {
        throw new Error('trxContainer is not set');
      }

      return trxContainer.transactions.map((transaction) => {
        const amount = transaction.categories.reduce((prev, c) => {
          if (c.amount > 0) {
            return prev + c.amount;
          }

          return prev;
        }, 0);

        return (
          <TransactionBase
            key={transaction.id}
            transaction={transaction}
            showTrxDialog={showTrxDialog}
            className={styles.rebalances}
          >
            <RebalanceTransaction
              amount={amount}
            />
          </TransactionBase>
        );
      })
    };
  }

  if (!trxContainer) {
    return null;
  }

  return (
    <>
      <div className="register window window1">
        <div />
        { titles }
        <RegisterTransactions
          trxContainer={trxContainer}
        >
          { renderTransactions() }
        </RegisterTransactions>
        <TrxDialog />
      </div>
      <PendingRegister categoryView={type === 'category'} pending={trxContainer.pending} />
    </>
  );
});

export default Register;
