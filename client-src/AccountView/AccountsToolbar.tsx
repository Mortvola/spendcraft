import React, { ReactElement, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import MobxStore from '../State/mobxStore';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { httpPost } from '../State/Transports';
import useMediaQuery from '../MediaQuery';
import { useTransactionDialog } from '../Transactions/TransactionDialog';

type PropsType = {
  open?: boolean,
}

const AccountsToolbar = ({
  open,
}: PropsType): ReactElement => {
  const { accounts, uiState } = useContext(MobxStore);
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const { isMobile } = useMediaQuery();

  const addInstitution = () => {
    accounts.addInstitution();
  };

  const handleRefresh = async (): Promise<void> => {
    await httpPost('/api/institutions/sync');
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

  return (
    <>
      {renderAccountButtons()}
      {
        !open || !isMobile
          ? (
            <>
              <button
                type="button"
                onClick={showTransactionDialog}
                disabled={uiState.selectedAccount === null}
              >
                Add Transaction
              </button>
              <TransactionDialog account={uiState.selectedAccount} />
            </>
          )
          : null
      }
    </>
  )
}

export default observer(AccountsToolbar);
