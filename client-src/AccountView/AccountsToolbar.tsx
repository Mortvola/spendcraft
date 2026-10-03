import React, { ChangeEventHandler } from 'react';
import { observer } from 'mobx-react-lite';
import Http from '@mortvola/http';
import { useStores } from '../State/Store';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import useMediaQuery from '../MediaQuery';
import { useTransactionDialog } from '../Transactions/TransactionDialog';
import { useBalanceDialog } from './BalanceDialog';
import UploadFileButton from '../UploadFileButton';
import { AccountType, TrackingType } from '../../common/ResponseTypes';
import { useStatementDialog } from './StatementDialog';

interface PropsType {
  open?: boolean,
}

const AccountsToolbar: React.FC<PropsType> = observer(({
  open,
}) => {
  const { accounts, uiState, balances } = useStores();
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [BalanceDialog, showBalanceDialog] = useBalanceDialog();
  const [StatementDialog, showStatementDialog] = useStatementDialog();
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
          <button type="button" onClick={addInstitution}>Add Online Institution</button>
          <button type="button" onClick={showOfflineAccountDialog}>Add Offline Institution</button>
          <button type="button" onClick={handleRefresh}>Sync Accounts</button>
          <OfflineAccountDialog />
        </>
      )
      : null
  )

  const showDialog = () => {
    if (uiState.selectedAccount?.type === AccountType.Investment) {
      showStatementDialog();
    }
    else if (uiState.selectedAccount?.tracking === TrackingType.Balances) {
      showBalanceDialog();
    }
    else {
      showTransactionDialog();
    }
  }

  const handleUploadOfx: ChangeEventHandler<HTMLInputElement> = async (event) => {
    if (event.target.files && event.target.files[0]) {
      if (uiState.selectedAccount?.tracking !== TrackingType.Transactions) {
        throw new Error('account not selected or not tracking transactions')
      }

      await Http.fetch(
        `/api/v1/account/${uiState.selectedAccount.id}/ofx`,
        new Headers({
          Accept: 'application/json',
          'Content-Type': 'text/plain',
          Authorization: `Bearer ${Http.accessToken}`,
        }),
        {
          method: 'POST',
          body: event.target.files[0],
        },
      );
    }
  };

  const getButtonTitle = () => {
    if (uiState.selectedAccount) {
      if (uiState.selectedAccount.type === AccountType.Investment) {
        return 'Add Statement'
      }

      if (uiState.selectedAccount.tracking === TrackingType.Balances) {
        return 'Add Balance';
      }

      return 'Add Transaction';
    }
  }

  return (
    <>
      {renderAccountButtons()}
      {
        !open || !isMobile
          ? (
            <>
              {
                uiState.selectedAccount
                  ? (
                    <>
                      <button
                        type="button"
                        onClick={showDialog}
                        disabled={uiState.selectedAccount === null}
                      >
                        {
                          getButtonTitle()
                        }
                      </button>
                      <UploadFileButton
                        onFileSelection={handleUploadOfx}
                        label="Import OFX"
                        disabled={uiState.selectedAccount?.tracking !== TrackingType.Transactions}
                      />
                    </>
                  )
                  : null
              }
              <TransactionDialog account={uiState.selectedAccount} />
              <BalanceDialog balances={balances} />
              {
                uiState.selectedAccount !== null
                  ? <StatementDialog account={uiState.selectedAccount} />
                  : null
              }
            </>
          )
          : null
      }
    </>
  )
});

export default AccountsToolbar;
