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
          uiState.selectedCategory.transactions.getData(0);
        }
        break;

      case 'account':
        if (uiState.selectedAccount) {
          if (!['Transactions', 'Uncategorized Transactions'].includes(uiState.selectedAccount.tracking)) {
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
  let pendingTrxContainer: TransactionContainerInterface | null = null;

  let transactionClassName: string | undefined;

  let className = '';

  switch (type) {
    case 'category':
      category = uiState.selectedCategory;

      if (category === null) {
        throw new Error('category not set');
      }

      trxContainer = category.transactions;
      pendingTrxContainer = category.pendingTransactions

      break;

    case 'account':
      account = uiState.selectedAccount;

      if (account === null) {
        throw new Error('category not set');
      }

      trxContainer = account.transactions;
      pendingTrxContainer = account.pendingTransactions

      if (account.type === 'loan') {
        transactionClassName = ` ${styles.loan}`;
      }

      break;

    case 'rebalances':
      trxContainer = rebalances.transactions;
      className = styles.rebalances;

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
        <div className={`${styles.registerWrapper} ${className}`}>
          <PostedRegister
            type={type}
            trxContainer={trxContainer}
            category={category}
            account={account}
            transactionClassName={transactionClassName}
          />
          <PendingRegister trxContainer={pendingTrxContainer} />
        </div>
      </DesktopView>
      <MobileView>
        <div className={styles.registerWrapper}>
          {
            (pendingTrxContainer?.transactions.length ?? 0) > 0
              ? <TransactionTypeSelector state={transactionType} onClick={handleTypeClick} />
              : null
          }
          {
            transactionType && pendingTrxContainer?.transactions.length
              ? (
                <PendingRegister trxContainer={pendingTrxContainer} />
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
