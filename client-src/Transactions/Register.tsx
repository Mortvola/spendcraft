import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import {
  AccountInterface, CategoryInterface, TransactionContainerInterface,
} from '../State/Types';
import styles from './Transactions.module.scss';
import PostedRegister from './PostedRegister';
import { AccountType, TrackingType } from '../../common/ResponseTypes';

interface PropsType {
  type: 'category' | 'account' | 'rebalances',
  className?: string,
}

const Register: React.FC<PropsType> = observer(({
  type,
  className,
}) => {
  const store = useStores();
  const { uiState, categoryTree, rebalances } = store;

  React.useEffect(() => {
    switch (type) {
      case 'category':
        if (uiState.selectedCategory) {
          uiState.selectedCategory.transactions.getData(0);
        }
        break;

      case 'account':
        if (uiState.selectedAccount) {
          if (![TrackingType.Transactions, TrackingType.UncategorizedTransactions].includes(uiState.selectedAccount.tracking)) {
            throw new Error(`invalid tracking type for register: ${uiState.selectedAccount.tracking}`);
          }

          uiState.selectedAccount.transactions.getData(0);
          uiState.selectedAccount.pendingTransactions.getData(0);
        }

        break;

      case 'rebalances':
        rebalances.transactions.getData(0);
        break;

      default:
        throw new Error(`unknown type: ${type}`);
    }
  }, [categoryTree.unassignedCat, rebalances, store, type, uiState.selectedAccount, uiState.selectedCategory]);

  let category: CategoryInterface | null = null;
  let account: AccountInterface | null = null;

  let trxContainer: TransactionContainerInterface | null = null;

  let transactionClassName: string | undefined;

  let addedClasses = className;

  switch (type) {
    case 'category':
      category = uiState.selectedCategory;

      if (category === null) {
        throw new Error('category not set');
      }

      trxContainer = category.transactions;

      break;

    case 'account':
      account = uiState.selectedAccount;

      if (account === null) {
        throw new Error('category not set');
      }

      trxContainer = account.transactions;

      if (account.type === AccountType.Loan) {
        transactionClassName = ` ${styles.loan}`;
      }

      break;

    case 'rebalances':
      trxContainer = rebalances.transactions;
      addedClasses = `${addedClasses} ${styles.rebalances}`;

      break;

    default:
      throw new Error(`unkonwn type: ${type}`);
  }

  if (!trxContainer) {
    return null;
  }

  return (
    <div className={`${styles.registerWrapper} ${addedClasses}`}>
      <PostedRegister
        type={type}
        trxContainer={trxContainer}
        category={category}
        account={account}
        transactionClassName={transactionClassName}
      />
    </div>
  );
});

export default Register;
