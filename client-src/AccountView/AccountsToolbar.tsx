import React, { ReactElement, useContext } from 'react';
import MobxStore from '../state/mobxStore';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { httpPost } from '../state/Transports';
import { useTransactionDialog } from '../Transactions/TransactionDialog';

const AccountsToolbar = (): ReactElement => {
  const {
    uiState: { selectedAccount },
  } = useContext(MobxStore);
  const { accounts } = useContext(MobxStore);
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();

  const addInstitution = () => {
    accounts.addInstitution();
  };

  const handleRefresh = async (): Promise<void> => {
    await httpPost('/api/institutions/sync');
  };

  return (
    <>
      <button type="button" onClick={addInstitution}>Add Online Account</button>
      <button type="button" onClick={showOfflineAccountDialog}>Add Offline Account</button>
      <button type="button" onClick={handleRefresh}>Sync Accounts</button>
      <button type="button" onClick={showTransactionDialog}>Add Transaction</button>
      <OfflineAccountDialog />
      <TransactionDialog account={selectedAccount} />
    </>
  )
}

export default AccountsToolbar;
