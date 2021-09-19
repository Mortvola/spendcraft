import React, { ReactElement, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import { useAccountsDialog } from './AccountsDialog';
import { useInstitutionInfoDialog } from './InstitutionInfoDialog';
import Account from './Account';
import { AccountInterface, InstitutionInterface } from '../State/State';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { useDeleteConfirmation } from '../DeleteConfirmation';
import styles from './Institution.module.css';

type PropsType = {
  institution: InstitutionInterface,
  onAccountSelected: ((account: AccountInterface) => void),
  selectedAccount?: AccountInterface | null,
  onRelink: ((id: number) => void),
}

function Institution({
  institution,
  onAccountSelected,
  selectedAccount = null,
  onRelink,
}: PropsType): ReactElement {
  const [OnlineAccountsDialog, showOnlineAccountsDialog] = useAccountsDialog();
  const [InstitutionInfoDialog, showInstitutionInfoDialog] = useInstitutionInfoDialog();
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const handleRelinkClick = () => {
    onRelink(institution.id);
  };
  const [editedAccount, setEditedAccount] = useState<AccountInterface | null>(null);
  const [DeleteConfirmation, handleDeleteClick] = useDeleteConfirmation(
    (
      <>
        <div>
          Are you sure you want to delete this institution?
        </div>
        <div style={{ marginTop: '1rem' }}>
          All accounts within the instution and their transactions will be deleted. This cannot be undone.
        </div>
      </>
    ),
    () => {
      institution.delete();
    },
  );

  const handleAddClick = () => {
    if (institution.offline) {
      showOfflineAccountDialog();
    }
    else {
      showOnlineAccountsDialog();
    }
  }

  const handleEditAccount = (account: AccountInterface) => {
    if (institution.offline) {
      setEditedAccount(account);
      showOfflineAccountDialog();
    }
    else {
      showOnlineAccountsDialog();
    }
  }
  const handleDialogHide = () => {
    setEditedAccount(null);
  }

  return (
    <div className="inst-card">
      <div className={styles.institution}>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="institution-name">{institution.name}</div>
          <div style={{ display: 'flex', alignSelf: 'flex-end' }}>
            <IconButton icon="trash-alt" onClick={handleDeleteClick} />
            <IconButton icon="plus" onClick={handleAddClick} />
            <OnlineAccountsDialog institution={institution} />
            <OfflineAccountDialog institution={institution} account={editedAccount} onHide={handleDialogHide} />
            <DeleteConfirmation />
            {
              !institution.offline
                ? (
                  <>
                    <IconButton icon="link" onClick={handleRelinkClick} />
                    <IconButton icon="info-circle" onClick={showInstitutionInfoDialog} />
                    <InstitutionInfoDialog institution={institution} />
                  </>
                )
                : null
            }
          </div>
        </div>
      </div>
      <div className="acct-list-accounts">
        {
          institution.accounts.map((account) => {
            const selected = selectedAccount
              ? selectedAccount.id === account.id
              : false;

            return (
              <Account
                key={account.id}
                institution={institution}
                account={account}
                onAccountSelected={onAccountSelected}
                selected={selected}
                showAccountDialog={handleEditAccount}
              />
            );
          })
        }
      </div>
    </div>
  );
}

export default observer(Institution);
