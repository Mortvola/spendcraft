import React, { useState, useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import DetailView from '../DetailView';
import AccountView from './AccountView';
import MobxStore from '../state/mobxStore';
import { useTransactionDialog } from '../Transactions/TransactionDialog';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { httpPost } from '../state/Transports';

const Accounts = () => {
  const {
    accounts, balances, uiState: { selectedAccount },
  } = useContext(MobxStore);
  const [refreshing, setRefreshing] = useState(false);
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();

  useEffect(() => {
    if (selectedAccount) {
      switch (selectedAccount.tracking) {
        case 'Transactions':
          selectedAccount.getTransactions();
          break;

        case 'Balances':
          balances.load(selectedAccount);
          break;

        default:
          throw new Error('Invalid tracking type');
      }
    }
  }, [balances, selectedAccount]);

  const handleClick = () => {
    accounts.addInstitution();
  };

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);

    await httpPost('/api/institutions/sync');

    setRefreshing(false);
  };

  const handleAddTransactionClick = () => {
    showTransactionDialog();
  }

  let rotate = false;
  if (refreshing) {
    rotate = true;
  }

  return (
    <>
      <div className="side-bar">
        <div className="accounts">
          <div className="account-bar">
            <div>Institutions</div>
            <IconButton icon="plus" onClick={handleClick} />
            <IconButton icon="minus" onClick={showOfflineAccountDialog} />
            <IconButton icon="sync-alt" rotate={rotate} onClick={handleRefresh} />
          </div>
          <OfflineAccountDialog />
          <AccountView />
        </div>
      </div>
      {
        selectedAccount
          ? (
            <div
              style={{
                display: 'grid',
                gridTemplateRows: 'max-content minmax(0,1fr)',
              }}
            >
              <div>
                <IconButton icon="plus" onClick={handleAddTransactionClick} />
                <TransactionDialog account={selectedAccount} />
              </div>
              <DetailView detailView={selectedAccount.tracking} />
            </div>
          )
          : null
      }
    </>
  );
};

export default observer(Accounts);
