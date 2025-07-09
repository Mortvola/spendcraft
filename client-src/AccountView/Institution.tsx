import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Info, Link, Plus, RefreshCw, Trash2,
} from 'lucide-react';
import { useAccountsDialog } from './AccountsDialog';
import { useInstitutionInfoDialog } from './InstitutionInfoDialog';
import Account from './Account';
import { AccountInterface, InstitutionInterface } from '../State/Types';
import { useOfflineAccountDialog } from './OfflineAccountDialog';
import { useDeleteConfirmation } from '../DeleteConfirmation';
import styles from './Institution.module.scss';
import { useRelinkDialog } from './RelinkDialog';
import LucideButton from '../LucideButton';

type PropsType = {
  institution: InstitutionInterface,
  opened: boolean,
  onAccountSelected: (account: AccountInterface) => void,
  onAccountStateChange: (account: AccountInterface) => void,
  selectedAccount?: AccountInterface | null,
}

const Institution: React.FC<PropsType> = observer(({
  institution,
  opened,
  onAccountSelected,
  onAccountStateChange,
  selectedAccount = null,
}) => {
  const [RelinkDialog, showRelinkDialog] = useRelinkDialog();
  const [OnlineAccountsDialog, showOnlineAccountsDialog] = useAccountsDialog();
  const [InstitutionInfoDialog, showInstitutionInfoDialog] = useInstitutionInfoDialog();
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const handleRelinkClick = () => {
    institution.relink();
  };
  const [editedAccount, setEditedAccount] = useState<AccountInterface | null>(null);
  const [DeleteConfirmation, handleDeleteClick] = useDeleteConfirmation(
    'Delete Confirmation',
    'Delete',
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

  let syncDate: string | null = null;
  if (institution.syncDate) {
    syncDate = `as of ${institution.syncDate.toFormat('LL-dd-y T')}`;
  }

  const handleEditAccount = (account: AccountInterface) => {
    if (institution.offline) {
      setEditedAccount(account);
      showOfflineAccountDialog();
    }
    else {
      setEditedAccount(account);
      showOnlineAccountsDialog();
    }
  }

  const handleDialogHide = () => {
    setEditedAccount(null);
  }

  const refresh = async () => {
    const result = await institution.sync(institution.id);

    if (!result) {
      showRelinkDialog();
    }
  };

  return (
    <div className={styles.institutionCard}>
      <div className={styles.institution}>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className={styles.institutionName}>{institution.name}</div>
          <div style={{ marginLeft: '1rem' }}>{syncDate}</div>
          <div style={{ display: 'flex', alignSelf: 'flex-end' }}>
            <LucideButton
              className={styles.iconButton}
              rotate={institution.refreshing}
              onClick={refresh}
            >
              <RefreshCw size={16} strokeWidth={2.5} />
            </LucideButton>
            <RelinkDialog institution={institution} />
            <LucideButton className={styles.iconButton} onClick={handleDeleteClick}>
              <Trash2 size={16} strokeWidth={2.5} />
            </LucideButton>
            {
              institution.offline
                ? (
                    <LucideButton onClick={showOfflineAccountDialog}>
                      <Plus size={16} strokeWidth={2.5} />
                    </LucideButton>
                )
                : null
            }
            <OnlineAccountsDialog account={editedAccount} />
            <OfflineAccountDialog institution={institution} account={editedAccount} onHide={handleDialogHide} />
            <DeleteConfirmation />
            {
              !institution.offline
                ? (
                  <>
                    <LucideButton className={styles.iconButton} onClick={handleRelinkClick}>
                      <Link size={16} strokeWidth={2.5} />
                    </LucideButton>
                    <LucideButton className={styles.iconButton} onClick={showInstitutionInfoDialog}>
                      <Info size={16} strokeWidth={2.5} />
                    </LucideButton>
                    <InstitutionInfoDialog institution={institution} />
                  </>
                )
                : null
            }
          </div>
        </div>
      </div>
      <div>
        {
          institution.accounts
            .filter((account) => account.closed !== opened)
            .map((account, index) => {
              const selected = selectedAccount
                ? selectedAccount.id === account.id
                : false;

              return (
                <div key={account.id}>
                  {
                    index !== 0
                      ? <div className={styles.separator} />
                      : null
                  }
                  <Account
                    account={account}
                    onAccountSelected={onAccountSelected}
                    onAccountStateChange={onAccountStateChange}
                    selected={selected}
                    showAccountDialog={handleEditAccount}
                  />
                </div>
              );
            })
        }
      </div>
    </div>
  );
});

export default Institution;
