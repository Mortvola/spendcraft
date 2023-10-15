import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { useStores } from './State/mobxStore';
import { useAccountsDialog } from './AccountView/AccountsDialog';
import PlaidLinkDialog from './PlaidLinkDialog';
import { InstitutionInterface } from './State/State';

const PlaidLink: React.FC = observer(() => {
  const { uiState } = useStores();
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [info, setInfo] = useState<{
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
    institution?: InstitutionInterface,
  }>();

  const handleShowDialog = (
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
    institution?: InstitutionInterface,
  ) => {
    setInfo({ publicToken, metadata, institution });
    showAccountsDialog();
  };

  if (uiState.plaid) {
    return <PlaidLinkDialog showAccountsDialog={handleShowDialog} />;
  }

  if (info) {
    return <AccountsDialog publicToken={info.publicToken} metadata={info.metadata} institution={info.institution} />;
  }

  return null;
});

export default PlaidLink;
