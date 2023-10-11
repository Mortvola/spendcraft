import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { useStores } from './State/mobxStore';
import { useAccountsDialog } from './AccountView/AccountsDialog';
import PlaidLinkDialog from './PlaidLinkDialog';

const PlaidLink: React.FC = observer(() => {
  const { uiState } = useStores();
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [institute, setInstitute] = useState<{
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
  }>();

  const handleShowDialog = (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    setInstitute({ publicToken, metadata });
    showAccountsDialog();
  };

  if (uiState.plaid) {
    return <PlaidLinkDialog showAccountsDialog={handleShowDialog} />;
  }

  if (institute) {
    return <AccountsDialog publicToken={institute.publicToken} metadata={institute.metadata} />;
  }

  return null;
});

export default PlaidLink;
