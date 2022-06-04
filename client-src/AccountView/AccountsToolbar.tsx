import React from 'react';
import { observer } from 'mobx-react-lite';
import Http from '@mortvola/http';
import { useStores } from '../State/mobxStore';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import useMediaQuery from '../MediaQuery';
import { useTransactionDialog } from '../Transactions/TransactionDialog';
import { useBalanceDialog } from './BalanceDialog';

type PropsType = {
  open?: boolean,
}

const AccountsToolbar: React.FC<PropsType> = observer(({
  open,
}) => {
  const { accounts, uiState, balances } = useStores();
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [BalanceDialog, showBalanceDialog] = useBalanceDialog();
  const { isMobile } = useMediaQuery();

  const addInstitution = () => {
    accounts.linkInstitution();
  };

  const handleRefresh = async (): Promise<void> => {
    await Http.post('/api/institutions/sync');
  };

  const renderAccountButtons = () => (
    open || !isMobile
      ? (
        <>
          <button type="button" onClick={addInstitution}>Add Online Account</button>
          <button type="button" onClick={showOfflineAccountDialog}>Add Offline Account</button>
          <button type="button" onClick={handleRefresh}>Sync Accounts</button>
          <OfflineAccountDialog />
        </>
      )
      : null
  )

  const showDialog = () => {
    if (uiState.selectedAccount?.tracking === 'Balances') {
      showBalanceDialog();
    }
    else {
      showTransactionDialog();
    }
  }

  return (
    <>
      {renderAccountButtons()}
      {
        !open || !isMobile
          ? (
            <>
              <button
                type="button"
                onClick={showDialog}
                disabled={uiState.selectedAccount === null}
              >
                {
                  uiState.selectedAccount && uiState.selectedAccount.tracking === 'Balances'
                    ? 'Add Balance'
                    : 'Add Transaction'
                }
              </button>
              <TransactionDialog account={uiState.selectedAccount} />
              <BalanceDialog balances={balances} />
            </>
          )
          : null
      }
    </>
  )
});

export default AccountsToolbar;
