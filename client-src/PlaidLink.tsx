import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from './State/mobxStore';
import PlaidLinkDialog from './PlaidLinkDialog';

const PlaidLink: React.FC = observer(() => {
  const { uiState } = useStores();

  if (uiState.plaid) {
    return <PlaidLinkDialog institution={uiState.plaid.institution} />;
  }

  return null;
});

export default PlaidLink;
