import React, { ReactElement, useState } from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import { useAccountsDialog } from './AccountsDialog';
import { useInstitutionInfoDialog } from './InstitutionInfoDialog';
import Account from './Account';
import StateInstitution from '../state/Institution';
import { AccountInterface } from '../state/State';
import { useOfflineAccountDialog } from './OfflineAccountDialog';

type PropsType = {
  institution: StateInstitution,
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
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [InstitutionInfoDialog, showInstitutionInfoDialog] = useInstitutionInfoDialog();
  const [OfflineAccountDialog, showOfflineAccountDialog] = useOfflineAccountDialog();
  const handleRelinkClick = () => {
    onRelink(institution.id);
  };
  const [editedAccount, setEditedAccount] = useState<AccountInterface | null>(null);

  const handleAddClick = () => {
    if (institution.offline) {
      showOfflineAccountDialog();
    }
    else {
      showAccountsDialog();
    }
  }

  const handleEditAccount = (account: AccountInterface) => {
    if (institution.offline) {
      setEditedAccount(account);
      showOfflineAccountDialog();
    }
    else {
      showAccountsDialog();
    }
  }
  const handleDialogHide = () => {
    setEditedAccount(null);
  }

  return (
    <div className="inst-card">
      <div className="acct-list-inst">
        <div className="institution-name">{institution.name}</div>
        <IconButton icon="plus" onClick={handleAddClick} />
        <AccountsDialog institution={institution} />
        <OfflineAccountDialog institution={institution} account={editedAccount} onHide={handleDialogHide} />
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
