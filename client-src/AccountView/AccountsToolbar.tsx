import React, { ChangeEventHandler } from 'react';
import { observer } from 'mobx-react-lite';
import Http from '@mortvola/http';
import { useStores } from '../State/mobxStore';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import useMediaQuery from '../MediaQuery';
import { useTransactionDialog } from '../Transactions/TransactionDialog';
import { useBalanceDialog } from './BalanceDialog';
import UploadFileButton from '../UploadFileButton';

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
    await Http.post('/api/v1/institutions/sync');
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

  const handleUploadOfx: ChangeEventHandler<HTMLInputElement> = async (event) => {
    if (event.target.files && event.target.files[0]) {
      if (uiState.selectedAccount?.tracking !== 'Transactions') {
        throw new Error('account not selected or not tracking transactions')
      }

      await fetch(`/api/v1/account/${uiState.selectedAccount.id}/ofx`, {
        method: 'POST',
        headers: new Headers({
          Accept: 'application/json',
          'Content-Type': 'text/plain',
          Authorization: `Bearer ${Http.accessToken}`,
        }),
        body: event.target.files[0],
      });
    }
  };

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
              <UploadFileButton
                onFileSelection={handleUploadOfx}
                label="Upload OFX"
                disabled={uiState.selectedAccount?.tracking !== 'Transactions'}
              />
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
