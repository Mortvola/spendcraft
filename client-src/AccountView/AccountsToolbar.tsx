import React, { ReactElement, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import MobxStore from '../state/mobxStore';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { httpPost } from '../state/Transports';

const AccountsToolbar = (): ReactElement => {
  const { accounts, uiState } = useContext(MobxStore);
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();

  const addInstitution = () => {
    accounts.addInstitution();
  };

  const handleRefresh = async (): Promise<void> => {
    await httpPost('/api/institutions/sync');
  };

  const handleAddTransactionClick = () => {
    uiState.showAddTransaction(true);
  }

  return (
    <>
      <button type="button" onClick={addInstitution}>Add Online Account</button>
      <button type="button" onClick={showOfflineAccountDialog}>Add Offline Account</button>
      <button type="button" onClick={handleRefresh}>Sync Accounts</button>
      <button type="button" onClick={handleAddTransactionClick} disabled={uiState.selectedAccount === null}>Add Transaction</button>
      <OfflineAccountDialog />
    </>
  )
}

export default observer(AccountsToolbar);
