import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from './State/mobxStore';
import { useAccountsDialog } from './AccountView/AccountsDialog';
import { InstitutionInterface } from './State/State';
import PlaidLinkDialog from './PlaidLinkDialog';

const PlaidLink: React.FC = observer(() => {
  const { uiState } = useStores();
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [institute, setInstitute] = useState<InstitutionInterface>();

  const handleShowDialog = (inst: InstitutionInterface) => {
    setInstitute(inst);
    showAccountsDialog();
  };

  if (uiState.plaid) {
    return <PlaidLinkDialog showAccountsDialog={handleShowDialog} />;
  }

  if (institute) {
    return <AccountsDialog institution={institute} />;
  }

  return null;
});

export default PlaidLink;
