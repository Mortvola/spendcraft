import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/mobxStore';
import {
  AccountInterface, CategoryInterface, TransactionContainerInterface,
} from '../State/State';
import PendingRegister from './PendingRegister';
import styles from './Transactions.module.scss';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import PostedRegister from './PostedRegister';
import TransactionTypeSelector from './TransactionTypeSelector';

type PropsType = {
  type: 'category' | 'account' | 'rebalances',
}

const Register: React.FC<PropsType> = observer(({
  type,
}) => {
  const store = useStores();
  const { uiState, categoryTree, rebalances } = store;
  const [transactionType, setTransactionType] = React.useState(false);

  const handleTypeClick = (newType: boolean) => {
    setTransactionType(newType);
  }

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

  if (!trxContainer) {
    return null;
  }

  return (
    <>
      <DesktopView>
        <div className={styles.registerWrapper}>
          <PostedRegister
            type={type}
            trxContainer={trxContainer}
            category={category}
            account={account}
            transactionClassName={transactionClassName}
          />
          <PendingRegister categoryView={type === 'category'} pending={trxContainer.pending} />
        </div>
      </DesktopView>
      <MobileView>
        <div className={styles.registerWrapper}>
          {
            trxContainer.pending && trxContainer.pending.length > 0
              ? <TransactionTypeSelector state={transactionType} onClick={handleTypeClick} />
              : null
          }
          {
            transactionType && trxContainer.pending && trxContainer.pending.length
              ? (
                <PendingRegister categoryView={type === 'category'} pending={trxContainer.pending} />
              )
              : (
                <PostedRegister
                  type={type}
                  trxContainer={trxContainer}
                  category={category}
                  account={account}
                  transactionClassName={transactionClassName}
                />
              )
          }
        </div>
      </MobileView>
    </>
  );
});

export default Register;
