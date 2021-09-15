import React, { ReactElement, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import MobxStore from '../State/mobxStore';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { httpPost } from '../State/Transports';
import useMediaQuery from '../MediaQuery';

type PropsType = {
  open?: boolean,
}

const AccountsToolbar = ({
  open,
}: PropsType): ReactElement => {
  const { accounts, uiState } = useContext(MobxStore);
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const { isMobile } = useMediaQuery();

  const addInstitution = () => {
    accounts.addInstitution();
  };

  const handleRefresh = async (): Promise<void> => {
    await httpPost('/api/institutions/sync');
  };

  const handleAddTransactionClick = () => {
    uiState.showAddTransaction(true);
  }

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
            <button
              type="button"
              onClick={handleAddTransactionClick}
              disabled={uiState.selectedAccount === null}
            >
              Add Transaction
            </button>
          )
          : null
      }
    </>
  )
}

export default observer(AccountsToolbar);
